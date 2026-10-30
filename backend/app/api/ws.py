"""
WebSocket endpoint for real-time WORD prediction.

The browser sends compact landmarks per frame (NOT video frames):
    {"hands": [{"handedness": "Right", "handedness_score": 0.98,
                "landmarks": [[x, y, z] x21]}]}

Each connection keeps its own sliding-window session. The response is a
prediction dict; sign is null while the window is filling or the hand is
down. Send {"type": "reset"} to clear the current window.

Performance: PyTorch inference is offloaded to a thread pool so the event
loop never blocks on CPU-bound model forward passes. JSON is serialized
with compact separators to reduce payload size.
"""

from __future__ import annotations

import asyncio
import json
import logging
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger("isl-app")

router = APIRouter()

#: Shared thread pool for torch inference. PyTorch releases the GIL during
#: forward passes, so a few workers suffice and the event loop stays responsive.
_inference_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="inference")


def _dumps(obj) -> str:
    """Compact JSON serialiser — smaller payloads, less memory churn."""
    return json.dumps(obj, separators=(",", ":"))


@router.websocket("/ws/predict")
async def ws_predict(websocket: WebSocket) -> None:
    await websocket.accept()
    recognizer = getattr(websocket.app.state, "recognizer", None)

    if recognizer is None or not recognizer.available:
        await websocket.send_text(_dumps({
            "error": "model_not_loaded",
            "message": "No trained word model found. Run scripts/train_lstm.py first.",
        }))
        await websocket.close(code=1011)
        return

    session = recognizer.create_session()

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_text(_dumps({"error": "bad_json"}))
                continue

            if data.get("type") == "ping":
                await websocket.send_text(_dumps({"type": "pong"}))
                continue
            if data.get("type") == "reset":
                session.reset()
                await websocket.send_text(_dumps({"type": "reset_ok"}))
                continue

            hands = data.get("hands") or []
            try:
                # Offload the feature extraction + GRU forward pass to a thread
                # pool. Without this, the first inference (~10-50 ms) blocks
                # every other WebSocket and the FastAPI event loop.
                result = await asyncio.get_running_loop().run_in_executor(
                    _inference_pool, session.feed, hands,
                )
            except Exception as exc:
                logger.exception("prediction failed")
                result = {"sign": None, "confidence": 0.0,
                          "accepted": False, "error": str(exc)}
            await websocket.send_text(_dumps(result))

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as exc:
        logger.warning("WebSocket error: %s", exc)
