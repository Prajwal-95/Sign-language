"""
Local offline speech service for the ISL-to-Speech frontend.

The browser speaks English through the Web Speech API. For Hindi and Kannada it
falls back to this service, which synthesises the audio on the same machine and
returns WAV bytes. Nothing is uploaded, no account is required and no API key is
used. Once the models are downloaded the service works with the network cable
unplugged.

Endpoints
---------
GET  /health   -> { ok, engines: {en,hi,kn}, version }
POST /speak    -> audio/wav   body: { text, lang, tag?, rate?, pitch? }

Security posture
----------------
* Binds to 127.0.0.1 only, so it is unreachable from the local network.
* Refuses any browser origin that is not a loopback address (or an explicitly
  allow-listed production origin), so a random website cannot drive it.
* Accepts no credentials and never reads cookies.
* Caps request size.

Run with:  python service.py        (or run.bat on Windows)
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
import threading
import time
import wave
from contextlib import asynccontextmanager
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402
from fastapi import FastAPI, Request  # noqa: E402
from fastapi.responses import JSONResponse, Response  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from tts_engines import (  # noqa: E402
    SUPPORTED_LANGUAGES,
    EngineError,
    EngineRegistry,
    MmsEngine,
)

VERSION = "1.0.0"
HOST = os.environ.get("TTS_HOST", "127.0.0.1")
PORT = int(os.environ.get("TTS_PORT", "8765"))

#: Guards against a runaway client and keeps memory use predictable.
MAX_TEXT_CHARS = 2000
#: 16 kHz mono 16-bit PCM is ~32 kB per second, so this allows ~2 minutes.
MAX_BODY_BYTES = 4 * 1024 * 1024
#: Hard stop on synthesis length, independent of the text cap.
MAX_AUDIO_SECONDS = 90

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("tts.service")

registry = EngineRegistry()

#: CPU-bound synthesis must not run on the event loop, or /health would stall
#: while a request is being synthesised.
executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="tts-synth")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Start-up MUST NOT block on loading models. Binding the socket first means
    # the frontend gets an immediate, truthful /health answer instead of a
    # connection-refused for the ~25 s that warming three checkpoints takes.
    capabilities = registry.capabilities()
    log.info("ISL local speech service %s on http://%s:%d", VERSION, HOST, PORT)
    log.info("engines ready: %s", capabilities)
    missing = [lang for lang, engine in capabilities.items() if not engine]
    if missing:
        log.warning(
            "no voice model for: %s - run install.bat (internet needed once)",
            ", ".join(missing),
        )

    if os.environ.get("TTS_WARMUP", "1") == "1":
        # Background thread: /speak still works, it just loads on first use.
        threading.Thread(
            target=_warm_up, name="tts-warmup", daemon=True
        ).start()

    yield


def _warm_up() -> None:
    """Load every model in the background, logging each one separately."""
    try:
        log.info("pre-loading models (disable with TTS_WARMUP=0)...")
        for engine in registry.engines:
            if not isinstance(engine, MmsEngine):
                continue
            for language in engine.languages:
                if engine.loaded(language):
                    continue
                started = time.time()
                try:
                    engine._load(language)
                    log.info("  %s ready in %.1fs", language, time.time() - started)
                except Exception as exc:  # noqa: BLE001
                    log.error("  %s FAILED to load: %s", language, exc)
    except Exception as exc:  # noqa: BLE001
        log.error("warm-up aborted: %s", exc)



app = FastAPI(
    title="ISL local speech service",
    version=VERSION,
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan,
)


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TEXT_CHARS)
    lang: str
    tag: str | None = None
    rate: float = Field(default=1.0, ge=0.5, le=2.0)
    pitch: float = Field(default=1.0, ge=0.5, le=2.0)


def _origin_allowed(origin: str | None) -> bool:
    """Only loopback pages (and an explicit allow-list) may call this service."""
    if origin is None:
        # No Origin header: native clients, curl, health checks. The service is
        # loopback-only anyway, so this cannot be driven from a web page.
        return True
    if origin in ("null", "file://"):
        return True
    if origin.startswith("http://localhost") or origin.startswith("http://127.0.0.1"):
        return True
    allowed = os.environ.get("TTS_ALLOWED_ORIGINS", "")
    return bool(allowed) and origin in {o.strip() for o in allowed.split(",") if o.strip()}


@app.middleware("http")
async def guard(request: Request, call_next):
    origin = request.headers.get("origin")
    if not _origin_allowed(origin):
        log.warning("rejected cross-origin request from %s", origin)
        return JSONResponse({"ok": False, "error": "origin not allowed"}, status_code=403)

    if request.method == "OPTIONS":
        response = Response(status_code=204)
    else:
        response = await call_next(request)

    response.headers["Access-Control-Allow-Origin"] = origin or "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Max-Age"] = "600"
    # Never let a proxy cache speech output.
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/health")
async def health():
    engines = registry.capabilities()
    return {
        "ok": True,
        "engines": engines,
        "loaded": registry.loaded(),
        "version": VERSION,
        "offline": True,
        "note": "All synthesis runs on this machine. No account or API key is used.",
    }


@app.get("/")
async def root():
    return {
        "service": "ISL local speech service",
        "version": VERSION,
        "endpoints": ["/health", "/speak"],
        "languages": list(SUPPORTED_LANGUAGES),
    }


def _to_wav_bytes(samples: np.ndarray, sample_rate: int) -> bytes:
    import io

    clipped = np.clip(samples, -1.0, 1.0)
    pcm = (clipped * 32767.0).astype(np.int16)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(pcm.tobytes())
    return buffer.getvalue()


@app.post("/speak")
async def speak(payload: SpeakRequest, request: Request):
    lang = (payload.lang or "").strip().lower()
    if lang not in SUPPORTED_LANGUAGES:
        return JSONResponse(
            {"ok": False, "error": f"unsupported language: {lang}"},
            status_code=404,
        )

    text = payload.text.strip()
    if not text:
        return JSONResponse({"ok": False, "error": "empty text"}, status_code=400)
    log.info("speak %s len=%d first20=%r", lang, len(text), text[:20])

    capabilities = registry.capabilities()
    if not capabilities.get(lang):
        log.warning("no engine for %s", lang)
        return JSONResponse(
            {"ok": False, "error": f"no engine installed for {lang}"},
            status_code=404,
        )

    try:
        result = await asyncio.get_running_loop().run_in_executor(
            executor, registry.synth, lang, text, payload.rate
        )
    except EngineError as exc:
        # Script mismatch or empty-after-filtering: these are client-side
        # problems (wrong language tag, untranslated text), so 400 is more
        # honest than 503. The frontend surfaces `error` verbatim.
        msg = str(exc)
        lower = msg.lower()
        if "does not appear to be" in lower or "script" in lower:
            status = 400
        elif "nothing to synthesise" in lower:
            status = 400
        else:
            status = 503
        log.warning("engine refused %s: %s", lang, msg)
        return JSONResponse({"ok": False, "error": msg}, status_code=status)
    except Exception as exc:  # noqa: BLE001
        log.exception("synthesis failed for %s", lang)
        return JSONResponse(
            {"ok": False, "error": f"synthesis failed: {exc}", "detail": type(exc).__name__},
            status_code=500,
        )

    audio = _to_wav_bytes(result.samples, result.sample_rate)
    if len(audio) > MAX_BODY_BYTES:
        return JSONResponse({"ok": False, "error": "audio too large"}, status_code=413)
    seconds = len(result.samples) / max(1, result.sample_rate)
    if seconds > MAX_AUDIO_SECONDS:
        return JSONResponse(
            {"ok": False, "error": f"audio too long ({seconds:.0f}s)"},
            status_code=413,
        )

    return Response(
        content=audio,
        media_type="audio/wav",
        headers={
            "X-TTS-Engine": result.engine,
            "X-TTS-Sample-Rate": str(result.sample_rate),
            # `pitch` is accepted for interface parity with the browser engine;
            # VITS and formant engines have no pitch control, so it is ignored.
            "X-TTS-Pitch": "ignored",
        },
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=HOST, port=PORT, log_level="info")