"""
ml/dataset_seq.py — load landmark SEQUENCES and split into train/val/test.

Each dataset/seq/<WORD>/seq_*.npz holds one (SEQ_LEN, 64) feature sequence
produced from a single source video. Splitting is done at the SEQUENCE
(video) level with stratification and a fixed seed, so there is no leakage
between splits.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ml.vocabulary import ISL_VOCAB  # noqa: E402


def load_sequences(
    seq_dir: Path,
    vocab: list[str] | None = None,
) -> tuple[np.ndarray, np.ndarray, list[str], int]:
    """
    Returns:
        X      (n, L, 64) float32
        y      (n,) int32 label indices aligned with `labels`
        labels ordered class names present in seq_dir
        seq_len L (from the data)
    """
    vocab = vocab or ISL_VOCAB
    Xs: list[np.ndarray] = []
    ys: list[np.ndarray] = []
    labels: list[str] = []
    seq_len = 0

    # First pass: collect words that actually have data, in vocab order.
    present = []
    for word in vocab:
        d = seq_dir / word
        if not d.is_dir():
            continue
        files = sorted(d.glob("*.npz"))
        if not files:
            continue
        arrs = []
        for f in files:
            try:
                with np.load(f) as z:
                    seq = z["seq"]
                    if seq.shape[1] < 64 or seq.dtype != np.float32:
                        continue
                    arrs.append(seq)
            except Exception:
                continue
        if arrs:
            present.append((word, arrs))

    # Remap to contiguous indices 0..len(present)-1 so the label space
    # matches the model's n_classes (avoids gaps when a vocab word has
    # zero samples, e.g. STILL).
    for new_idx, (word, arrs) in enumerate(present):
        Xs.append(np.stack(arrs))
        ys.append(np.full(len(arrs), new_idx, dtype=np.int32))
        labels.append(word)
        seq_len = max(seq_len, arrs[0].shape[0])

    if not Xs:
        raise FileNotFoundError(
            f"No sequences found under {seq_dir}. Run "
            "scripts/prepare_word_dataset.py first."
        )
    X = np.concatenate(Xs).astype(np.float32)
    y = np.concatenate(ys).astype(np.int32)

    # Shuffle (keeps class balance since y is aligned).
    rng = np.random.default_rng(42)
    perm = rng.permutation(len(y))
    return X[perm], y[perm], labels, seq_len


def split_sequences(
    X: np.ndarray,
    y: np.ndarray,
    val_size: float = 0.15,
    test_size: float = 0.15,
    random_state: int = 42,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Stratified split at the sequence level."""
    from sklearn.model_selection import train_test_split

    X_train_val, X_test, y_train_val, y_test = train_test_split(
        X, y, test_size=test_size, stratify=y, random_state=random_state,
    )
    val_frac = val_size / (1.0 - test_size)
    X_train, X_val, y_train, y_val = train_test_split(
        X_train_val, y_train_val, test_size=val_frac, stratify=y_train_val,
        random_state=random_state + 1,
    )
    return X_train, X_val, X_test, y_train, y_val, y_test
