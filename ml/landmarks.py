"""
Hand-landmark extraction layer (Phase 2).

Single source of truth for MediaPipe hand landmark extraction across the
whole project: dataset collection, model training, and live inference all
use this module, so the feature format stays identical everywhere.

One detected hand is represented as::

    {
        "handedness": "Right",              # MediaPipe label ("Left"/"Right")
        "handedness_score": 0.98,            #how sure MediaPipe is
        "landmarks": [[x, y, z], x21],      # normalized to image size, z ~ depth
    }

``extract()`` returns a dict with ``hands`` (list), ``num_hands`` and the
frame size — exactly what feature extraction (Phase 5) will consume.
"""

from __future__ import annotations

from typing import Any

import cv2
import mediapipe as mp

NUM_LANDMARKS = 21
LANDMARK_DIMS = 3  # x, y, z

# The 21 hand landmarks as named by MediaPipe (index order matters).
LANDMARK_NAMES: list[str] = [
    "wrist",
    "thumb_cmc", "thumb_mcp", "thumb_ip", "thumb_tip",
    "index_mcp", "index_pip", "index_dip", "index_tip",
    "middle_mcp", "middle_pip", "middle_dip", "middle_tip",
    "ring_mcp", "ring_pip", "ring_dip", "ring_tip",
    "pinky_mcp", "pinky_pip", "pinky_dip", "pinky_tip",
]


class LandmarkExtractor:
    """Wraps MediaPipe Hands and returns clean, serializable landmark data."""

    def __init__(
        self,
        max_num_hands: int = 2,
        min_detection_confidence: float = 0.5,
        min_tracking_confidence: float = 0.5,
    ) -> None:
        self._hands = mp.solutions.hands.Hands(
            static_image_mode=False,  # tracking mode (video)
            max_num_hands=max_num_hands,
            min_detection_confidence=min_detection_confidence,
            min_tracking_confidence=min_tracking_confidence,
        )
        self._last_results = None  # raw MediaPipe results, used for drawing

    # ------------------------------------------------------------------ #
    def extract(self, frame_bgr: Any) -> dict[str, Any]:
        """
        Run hand detection on one BGR frame.

        Args:
            frame_bgr: OpenCV (BGR) image, a numpy array.

        Returns:
            dict with keys:
              - "num_hands": int
              - "hands": list of per-hand dicts (see module docstring)
              - "frame_w", "frame_h": int frame dimensions
        """
        h, w = frame_bgr.shape[:2]

        # MediaPipe expects RGB.
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        self._last_results = self._hands.process(rgb)
        results = self._last_results

        hands: list[dict[str, Any]] = []
        if results.multi_hand_landmarks:
            for lm_list, handedness in zip(
                results.multi_hand_landmarks, results.multi_handedness
            ):
                label = handedness.classification[0].label  # "Left" / "Right"
                score = float(handedness.classification[0].score)
                points = [
                    [float(p.x), float(p.y), float(p.z)]
                    for p in lm_list.landmark
                ]
                hands.append(
                    {
                        "handedness": label,
                        "handedness_score": score,
                        "landmarks": points,
                    }
                )

        return {
            "num_hands": len(hands),
            "hands": hands,
            "frame_w": w,
            "frame_h": h,
        }

    # ------------------------------------------------------------------ #
    def draw_skeleton(self, frame_bgr: Any) -> Any:
        """
        Overlay the hand skeleton from the most recent `eextract()`` call.
        Returns a copy of the frame (or the original if no hand was seen),
        ready for cv2.imshow / saving.
        """
        if self._last_results is None or not self._last_results.multi_hand_landmarks:
            return frame_bgr

        annotated = frame_bgr.copy()
        for lm_list in self._last_results.multi_hand_landmarks:
            mp.solutions.drawing_utils.draw_landmarks(
                annotated,
                lm_list,
                mp.solutions.hands.HAND_CONNECTIONS,
                mp.solutions.drawing_styles.get_default_hand_landmarks_style(),
                mp.solutions.drawing_styles.get_default_hand_connections_style(),
            )
        return annotated

    # ------------------------------------------------------------------ #
    def close(self) -> None:
        """Release MediaPipe resources (call when done)."""
        self._hands.close()
