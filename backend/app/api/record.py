"""
API endpoints to add the USER's own webcam landmark samples to the training
data (calibration). This fixes domain shift: the model learns YOUR hand in
YOUR camera setup, so live recognition works reliably.

  GET  /api/vocab            -> list of signs in the current vocabulary
  POST /api/record-sample    -> save one user-recorded sequence for a sign

Request body for POST /api/record-sample:
  {
    "sign": "JUMP",
    "frames": [                       # per-frame hand data, ~30-60 frames
      { "hands": [ {"handedness": "Right", "handedness_score": 0.98,
                    "landmarks": [[x,y,z] x21] } ] },
      ...
    ]
  }

The backend builds the SAME 128-d two-hand feature sequence used in training
(via ml.features.extract_two_hand_features) and saves it to
dataset/seq/<SIGN>/user_<n>.npz. Re-run scripts/train_lstm.py to retrain
with your samples included.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ml.custom_vocab import full_vocab  # noqa: E402
from ml.features import extract_two_hand_features  # noqa: E402
from ml.sequences import resample_features  # noqa: E402

router = APIRouter()

SEQ_DIR = PROJECT_ROOT / "dataset" / "seq"
SEQ_LEN = 32
MIN_HAND_FRAMES = 12

#: The live vocabulary: the 20 shipped signs plus anything the user added
#: through the Sample Collector. Kept as a module-level list so a sign added
#: mid-session is accepted without a restart.
ISL_VOCAB = full_vocab()


class HandIn(BaseModel):
    handedness: str = "Right"
    handedness_score: float = 1.0
    landmarks: list[list[float]]


class FrameIn(BaseModel):
    hands: list[HandIn] = []


class RecordSampleIn(BaseModel):
    sign: str
    frames: list[FrameIn]


@router.get("/api/vocab")
def get_vocab():
    return {"vocab": ISL_VOCAB}


class AddVocabIn(BaseModel):
    sign: str


@router.post("/api/add-vocab")
def add_vocab(body: AddVocabIn):
    """Register a user-defined sign so samples can be recorded for it.

    The sign is appended to `custom_vocab.txt` and is picked up by every
    subsequent `/api/vocab` call without a restart. New signs are appended
    (never inserted) so a previously trained checkpoint keeps working.
    """
    from ml.custom_vocab import add_custom_vocab  # noqa: E402

    token = add_custom_vocab(body.sign)
    # Refresh the module-level list so this process serves the new sign
    # immediately.
    ISL_VOCAB.clear()
    ISL_VOCAB.extend(full_vocab())
    return {"sign": token, "vocab": list(ISL_VOCAB)}


@router.post("/api/record-sample")
def record_sample(body: RecordSampleIn):
    sign = body.sign.strip().upper()
    if sign not in ISL_VOCAB:
        raise HTTPException(status_code=400,
                            detail=f"Sign '{sign}' not in vocabulary")

    # Build per-frame 128-d two-hand features from the frames that have a hand.
    features: list[np.ndarray] = []
    for frame in body.frames:
        if not frame.hands:
            continue
        hands = [
            {
                "handedness": h.handedness,
                "handedness_score": h.handedness_score,
                "landmarks": h.landmarks,
            }
            for h in frame.hands
        ]
        if any(h["handedness_score"] >= 0.5 for h in hands):
            features.append(extract_two_hand_features(hands))

    if len(features) < MIN_HAND_FRAMES:
        raise HTTPException(
            status_code=400,
            detail=f"Only {len(features)} usable frames (need >= {MIN_HAND_FRAMES}). "
                   "Keep your hand visible and steady while recording.",
        )

    seq = resample_features(np.stack(features), SEQ_LEN)

    out_dir = SEQ_DIR / sign
    out_dir.mkdir(parents=True, exist_ok=True)
    n = len(list(out_dir.glob("user_*.npz")))
    path = out_dir / f"user_{n:05d}.npz"
    np.savez_compressed(path, seq=seq, source="user", timestamp=time.time())

    return {
        "saved": str(path),
        "sign": sign,
        "sample_index": n,
        "frames_used": len(features),
    }


@router.get("/api/sample-counts")
def sample_counts():
    """Return how many USER-recorded samples exist per sign (user_*.npz)."""
    counts: dict[str, int] = {}
    for sign in ISL_VOCAB:
        d = SEQ_DIR / sign
        counts[sign] = len(list(d.glob("user_*.npz"))) if d.is_dir() else 0
    return {"counts": counts}
