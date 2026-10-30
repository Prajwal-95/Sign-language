"""
ml/dataset.py — load landmark samples and build train/val/test arrays.

Each .npz in dataset/raw/<SIGN>/ (produced by either the webcam collector or
scripts/prepare_dataset.py) holds raw MediaPipe landmarks. This module:
  1. loads every sample for every sign in ISL_VOCAB,
  2. converts landmarks to normalized feature vectors (ml/features.py),
  3. returns stratified, shuffled TRAIN / VALIDATION / TEST splits
     (default 80 / 10 / 10) with a fixed random state so runs are
     reproducible and there is no leakage between splits.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ml.features import extract_features, feature_dim  # noqa: E402
from ml.vocabulary import ISL_VOCAB  # noqa: E402


def load_dataset(
    raw_dir: Path,
    vocab: list[str] | None = None,
    shuffle_rng: np.random.Generator | None = None,
) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """
    Load all samples for the given vocabulary.

    Returns:
        X      (n_samples, feature_dim) float32 feature matrix
        y      (n_samples,) int32 label indices (aligned with `labels`)
        labels ordered list of class names (subset of vocab present in raw_dir)
    """
    vocab = vocab or ISL_VOCAB
    rng = shuffle_rng or np.random.default_rng(42)

    X_parts: list[np.ndarray] = []
    y_parts: list[np.ndarray] = []
    labels: list[str] = []

    for label_idx, sign in enumerate(vocab):
        sign_dir = raw_dir / sign
        if not sign_dir.is_dir():
            continue
        files = sorted(sign_dir.glob("*.npz"))
        if not files:
            continue

        vecs: list[np.ndarray] = []
        for f in files:
            try:
                with np.load(f) as d:
                    hand = {
                        "handedness": str(d["handedness_label"]),
                        "handedness_score": float(d["handedness_score"]),
                        "landmarks": d["landmarks"].tolist(),
                    }
                    vecs.append(extract_features(hand))
            except Exception:
                continue  # skip corrupt files, keep going

        if vecs:
            X_parts.append(np.stack(vecs))
            y_parts.append(np.full(len(vecs), label_idx, dtype=np.int32))
            labels.append(sign)

    if not X_parts:
        raise FileNotFoundError(
            f"No samples found under {raw_dir}. Run the dataset collector or "
            "prepare_dataset.py first."
        )

    X = np.concatenate(X_parts).astype(np.float32)
    y = np.concatenate(y_parts).astype(np.int32)

    # Shuffle samples (keeps class proportions since y is aligned).
    perm = rng.permutation(len(y))
    return X[perm], y[perm], labels


def train_val_test_split(
    X: np.ndarray,
    y: np.ndarray,
    val_size: float = 0.10,
    test_size: float = 0.10,
    random_state: int = 42,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Stratified split into train/validation/test.

    Stratification keeps the same class balance in every split, and because
    samples are shuffled first, there is no ordering leakage. Reproducible
    via random_state.
    """
    from sklearn.model_selection import train_test_split

    # First carve out the test set.
    X_train_val, X_test, y_train_val, y_test = train_test_split(
        X, y, test_size=test_size, stratify=y, random_state=random_state
    )
    # Then carve the validation set out of the remainder.
    val_frac = val_size / (1.0 - test_size)
    X_train, X_val, y_train, y_val = train_test_split(
        X_train_val, y_train_val, test_size=val_frac, stratify=y_train_val,
        random_state=random_state + 1,
    )
    return X_train, X_val, X_test, y_train, y_val, y_test


def class_distribution(y: np.ndarray, labels: list[str]) -> dict[str, int]:
    """Count samples per class for a label array."""
    counts = np.bincount(y, minlength=len(labels))
    return {labels[i]: int(counts[i]) for i in range(len(labels))}
