"""
Sequence extraction for word-level (dynamic) signs.

A sign is a short video: (T frames). For each frame we keep the normalized
feature vector of the primary hand (ml.features.extract_features, 64-d),
then trim to the frames where a hand is visible and evenly sample L frames
so every sequence has the same shape (L, 64) for the temporal model.

Handling of short sequences: if fewer than L hand-frames are available, the
sequence is padded by repeating the edges (keeps the motion, no zeros that
would confuse the model).
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ml.features import (  # noqa: E402
    extract_features,
    extract_two_hand_features,
    select_primary_hand,
)


def video_to_sequence(
    extractor,
    video_path: Path,
    seq_len: int = 32,
    min_confidence: float = 0.5,
    min_hand_frames: int = 10,
    frame_step: int = 1,
    two_hand: bool = True,
) -> np.ndarray | None:
    """
    Extract a (seq_len, feature_dim) feature sequence from a video file.

    With two_hand=True (default) each frame contributes BOTH hands
    (Left+Right halves -> 128-d), capturing two-handed signs. With
    two_hand=False it uses the single primary hand (64-d).

    Returns None if the video cannot be opened or too few frames have a
    confidently detected hand.
    """
    import cv2

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return None

    features: list[np.ndarray] = []
    idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if idx % frame_step != 0:
            idx += 1
            continue
        idx += 1

        data = extractor.extract(frame)
        if data["num_hands"] < 1:
            continue
        confident = [h for h in data["hands"] if h["handedness_score"] >= min_confidence]
        if not confident:
            continue
        if two_hand:
            features.append(extract_two_hand_features(confident))
        else:
            hand = select_primary_hand(confident)
            features.append(extract_features(hand))
    cap.release()

    if len(features) < min_hand_frames:
        return None

    feat = np.stack(features).astype(np.float32)  # (T, 64)

    # Evenly sample seq_len frames across the sign.
    if len(feat) > seq_len:
        idxs = np.linspace(0, len(feat) - 1, seq_len).astype(int)
        return feat[idxs]

    # Pad by repeating edges to reach seq_len.
    pad_total = seq_len - len(feat)
    pad_left = pad_total // 2
    pad_right = pad_total - pad_left
    left = np.repeat(feat[:1], pad_left, axis=0) if pad_left else np.empty((0, feat.shape[1]), np.float32)
    right = np.repeat(feat[-1:], pad_right, axis=0) if pad_right else np.empty((0, feat.shape[1]), np.float32)
    return np.concatenate([left, feat, right], axis=0).astype(np.float32)


def augment_sequence(seq: np.ndarray, rng: np.random.Generator | None = None,
                     jitter: float = 0.02, max_shift: int = 3) -> np.ndarray:
    """
    On-the-fly augmentation for one (L, 64) landmark sequence.
      - Gaussian jitter on the normalized features (small; they are already
        scale-normalized, so tiny noise mimics tracking jitter).
      - Time shift by up to max_shift frames (pad by edge-repeat).
      - With 50% chance, mirror the hand: flip x-coordinates (landmarks
        0..20, x at even indices 0,2,4,...) and flip the handedness bit.
    Returns a new (L, 64) float32 array. Used only during training.
    """
    rng = rng or np.random.default_rng()
    out = seq.astype(np.float32).copy()

    # Time shift (edge-repeat padding)
    if max_shift > 0:
        s = int(rng.integers(-max_shift, max_shift + 1))
        if s != 0:
            if s > 0:
                out = np.concatenate([np.repeat(out[:1], s, axis=0), out[:-s]], axis=0)
            else:
                out = np.concatenate([out[-s:], np.repeat(out[-1:], -s, axis=0)], axis=0)

    # Gaussian jitter
    if jitter > 0:
        out += rng.normal(0.0, jitter, size=out.shape).astype(np.float32)

    # Random temporal window crop: pick a sub-window and resample to L frames.
    # Teaches the model to recognize the sign even if the start/end are cut.
    L = seq.shape[0]
    if L >= 12:
        crop_len = int(L * rng.uniform(0.7, 1.0))
        start = int(rng.integers(0, L - crop_len + 1))
        crop = out[start:start + crop_len]
        idxs = np.linspace(0, len(crop) - 1, L).astype(int)
        out = crop[idxs].astype(np.float32)

    # Mirror (flip x of 21 landmarks; x is columns 0,2,4,...,40)
    if rng.random() < 0.5:
        out[:, 0:41:2] = -out[:, 0:41:2]
        out[:, -1] = 1.0 - out[:, -1]  # flip handedness bit

    return out
def resample_features(feat: np.ndarray, seq_len: int = 32) -> np.ndarray:
    """
    Resample a (T, F) feature array to exactly (seq_len, F):
    - if T > seq_len: evenly sample seq_len frames
    - if T < seq_len: pad by repeating the edges
    Returns (seq_len, F) float32.
    """
    feat = feat.astype(np.float32)
    if len(feat) >= seq_len:
        idxs = np.linspace(0, len(feat) - 1, seq_len).astype(int)
        return feat[idxs]
    pad_total = seq_len - len(feat)
    pad_left = pad_total // 2
    pad_right = pad_total - pad_left
    left = np.repeat(feat[:1], pad_left, axis=0) if pad_left else np.empty((0, feat.shape[1]), np.float32)
    right = np.repeat(feat[-1:], pad_right, axis=0) if pad_right else np.empty((0, feat.shape[1]), np.float32)
    return np.concatenate([left, feat, right], axis=0).astype(np.float32)

