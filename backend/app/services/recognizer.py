"""
Word-sign recognition service (temporal model).

Loads models/word_model.pt (a GRU trained by scripts/train_lstm.py) and
predicts a word from a SLIDING WINDOW of hand-landmark feature vectors.

A PredictSession keeps the last `seq_len` frame features for ONE WebSocket
connection. The signer raises their hand and performs the sign; once the
window is full the GRU predicts. When the hand is lowered (no hand seen),
the session resets — that is the natural word boundary, so repeated frames
of the same held sign do not produce duplicate words.
"""

from __future__ import annotations

import json
import sys
from collections import deque
from pathlib import Path

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ml.features import extract_two_hand_features  # noqa: E402
from ml.sequences import resample_features  # noqa: E402


class WordRecognizer:
    """Loads the GRU model once; creates per-connection PredictSessions."""

    def __init__(
        self,
        model_path: Path,
        classes_path: Path | None = None,
        confidence_threshold: float = 0.5,
    ) -> None:
        self.model_path = Path(model_path)
        self.classes_path = (
            Path(classes_path)
            if classes_path
            else self.model_path.parent / "word_classes.json"
        )
        self.confidence_threshold = confidence_threshold
        self._model = None
        self._labels: list[str] = []
        self._seq_len = 32

    # ------------------------------------------------------------------ #
    @property
    def available(self) -> bool:
        return self.model_path.is_file() and self.classes_path.is_file()

    @property
    def loaded(self) -> bool:
        return self._model is not None

    @property
    def labels(self) -> list[str]:
        return self._labels

    @property
    def seq_len(self) -> int:
        return self._seq_len

    def load(self) -> None:
        import torch

        if not self.available:
            raise FileNotFoundError(
                f"Word model not found: {self.model_path} or {self.classes_path}.\n"
                "Run scripts/train_lstm.py first."
            )
        data = json.loads(self.classes_path.read_text(encoding="utf-8"))
        self._labels = list(data.get("classes", []))
        self._seq_len = int(data.get("seq_len", 32))

        ckpt = torch.load(self.model_path, map_location="cpu", weights_only=False)
        hidden = int(ckpt.get("hidden", 128))
        n_classes = int(ckpt.get("n_classes", len(self._labels)))
        seq_len = int(ckpt.get("seq_len", self._seq_len))
        input_size = int(ckpt.get("input_size", 64))
        self._seq_len = seq_len

        # Rebuild the same architecture as scripts/train_lstm.py
        from scripts.train_lstm import SignGRU

        model = SignGRU(input_size, hidden, n_classes)
        model.load_state_dict(ckpt["state_dict"])
        model.eval()
        self._model = model

    # ------------------------------------------------------------------ #
    def create_session(self) -> "PredictSession":
        return PredictSession(self)

    def _predict_seq(self, features: np.ndarray) -> dict:
        """features: (seq_len, 64) float32. Returns prediction dict."""
        import torch

        if not self.loaded:
            try:
                self.load()
            except Exception as exc:
                return {"sign": None, "confidence": 0.0, "accepted": False,
                        "error": str(exc)}
        if self._model is None:
            return {"sign": None, "confidence": 0.0, "accepted": False}

        try:
            x = torch.from_numpy(features).unsqueeze(0)  # (1, L, 64)
            with torch.no_grad():
                logits = self._model(x)[0]
                probs = torch.softmax(logits, dim=0)
            proba = probs.numpy()
            idx = int(np.argmax(proba))
            conf = float(proba[idx])
            sign = self._labels[idx] if 0 <= idx < len(self._labels) else None
            # STILL = "no sign" -> never emit it.
            if sign == "STILL":
                sign = None
                conf = 0.0
            return {
                "sign": sign,
                "confidence": round(conf, 4),
                "accepted": conf >= self.confidence_threshold and sign is not None,
            }
        except Exception as exc:
            return {"sign": None, "confidence": 0.0, "accepted": False,
                    "error": str(exc)}


class PredictSession:
    """
    Segment-based predictor (matches how training data is structured).

    While the hand is UP, frames are accumulated (128-d two-hand features).
    When the hand is LOWERED (end of the sign), the collected frames are
    resampled to seq_len and the model predicts ONCE. This avoids predicting
    mid-sign or during hand raise/lower transitions — a major cause of
    wrong live output.
    """

    def __init__(self, recognizer: "WordRecognizer") -> None:
        self._rec = recognizer
        self._buffer: list[np.ndarray] = []
        self._no_hand_frames = 0
        self._max_frames = 90   # safety cap (~3s at 30fps)
        self._min_frames = 12   # need at least ~0.4s of hand

    def reset(self) -> None:
        self._buffer = []
        self._no_hand_frames = 0

    def feed(self, hands: list[dict]) -> dict:
        num_hands = len(hands) if hands else 0

        if num_hands == 0:
            self._no_hand_frames += 1
            if self._no_hand_frames >= 6 and self._buffer:
                # Sign finished: predict on everything collected.
                result = self._predict_buffer()
                self.reset()
                result["num_hands"] = 0
                result["ready"] = True
                return result
            if self._no_hand_frames >= 6:
                self.reset()
            return {"sign": None, "confidence": 0.0, "accepted": False,
                    "num_hands": 0, "ready": False, "progress": 0.0}

        self._no_hand_frames = 0
        vec = extract_two_hand_features(hands)
        self._buffer.append(vec)
        if len(self._buffer) > self._max_frames:
            self._buffer = self._buffer[-self._max_frames:]

        progress = min(1.0, len(self._buffer) / self._rec.seq_len)
        return {"sign": None, "confidence": 0.0, "accepted": False,
                "num_hands": num_hands, "ready": False, "progress": progress}

    def _predict_buffer(self) -> dict:
        if len(self._buffer) < self._min_frames:
            return {"sign": None, "confidence": 0.0, "accepted": False,
                    "ready": False}
        feat = np.stack(self._buffer).astype(np.float32)
        seq = resample_features(feat, self._rec.seq_len)
        result = self._rec._predict_seq(seq)
        result["ready"] = True
        return result
