"""
Feature extraction from hand landmarks — used for BOTH training and inference.

Normalization strategy (makes the model less sensitive to camera distance,
hand position and scale):
  1. If two hands are visible, select one primary hand (prefer the hand
     MediaPipe labels "Right" — the dominant hand for most people — else the
     most confident one).
  2. Translate: subtract the wrist (landmark 0) from all landmarks.
  3. Scale: divide by hand size = distance wrist -> middle MCP
     (fallback: mean distance to wrist).
  4. Keep depth z relative to the wrist, scaled by hand size.
  5. Append handedness as one binary feature (1 = Right, 0 = Left).

Output: flat float32 vector of length 64 (21 landmarks x 3 + 1).
"""

from __future__ import annotations

from typing import Any

import numpy as np

WRIST_IDX = 0
MIDDLE_MCP_IDX = 9


def select_primary_hand(hands: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Pick one hand for a single-hand sign from the detector output."""
    if not hands:
        return None
    if len(hands) == 1:
        return hands[0]
    for hand in hands:
        if hand["handedness"] == "Right":
            return hand
    return max(hands, key=lambda h: h["handedness_score"])


def normalize_landmarks(landmarks: list[list[float]]) -> np.ndarray:
    """Return a (21, 3) array centered on the wrist and scaled by hand size."""
    pts = np.asarray(landmarks, dtype=np.float32)  # (21, 3), x/y in [0,1], z depth
    wrist = pts[WRIST_IDX].copy()
    centered = pts - wrist

    size = float(np.linalg.norm(centered[MIDDLE_MCP_IDX]))
    if size < 1e-6:
        size = float(np.mean(np.linalg.norm(centered, axis=1))) + 1e-6

    return centered / size


def extract_features(hand: dict[str, Any]) -> np.ndarray:
    """
    Convert one hand dict (as produced by ml.landmarks.LandmarkExtractor)
    into a (64,) float32 feature vector.
    """
    normalized = normalize_landmarks(hand["landmarks"])
    handedness_bit = 1.0 if hand["handedness"] == "Right" else 0.0
    flat = normalized.reshape(-1)  # 63 values
    return np.concatenate([flat, [handedness_bit]]).astype(np.float32)


def feature_dim() -> int:
    """Dimension of the feature vector (21 landmarks x 3 + handedness)."""
    return 21 * 3 + 1


def extract_two_hand_features(hands: list[dict]) -> np.ndarray:
    """
    Build a (128,) feature vector from BOTH hands (Left half + Right half).

    Each half is the 64-d single-hand feature (normalized landmarks +
    handedness bit). A missing hand contributes an all-zero half, which the
    model learns to interpret as "hand not present". This captures the full
    signal of two-handed signs (HUG, THANK_YOU, DRINK, ...).

    Hands are split by MediaPipe's handedness label; if only one hand is
    seen, the other half stays zero.
    """
    left = None
    right = None
    for h in hands:
        if h.get("handedness") == "Left":
            left = h
        else:
            right = h

    left_vec = extract_features(left) if left is not None else np.zeros(64, dtype=np.float32)
    right_vec = extract_features(right) if right is not None else np.zeros(64, dtype=np.float32)
    return np.concatenate([left_vec, right_vec]).astype(np.float32)


def two_hand_feature_dim() -> int:
    """Dimension of the two-hand feature vector (2 x 64)."""
    return 2 * feature_dim()
