"""
scripts/train_lstm.py — train the temporal (GRU) classifier for WORD signs.

Loads landmark sequences from dataset/seq, splits at sequence level
(stratified, no leakage), trains a GRU (input 64-d per frame -> GRU hidden
128 -> FC -> words), evaluates on the held-out TEST set, and saves:

    models/word_model.pt           PyTorch state_dict + metadata
    models/word_classes.json       class labels
    models/word_metrics.json       test metrics (accuracy, F1, per-class)
    models/word_confusion_matrix.png

Usage:
    python scripts\\train_lstm.py
    python scripts\\train_lstm.py --epochs 60 --hidden 128 --seq-len 32
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import torch  # noqa: E402
import torch.nn as nn  # noqa: E402

from ml.custom_vocab import full_vocab  # noqa: E402
from ml.dataset_seq import load_sequences, split_sequences  # noqa: E402
from ml.sequences import augment_sequence  # noqa: E402

SEQ_DIR = PROJECT_ROOT / "dataset" / "seq"
MODELS_DIR = PROJECT_ROOT / "models"


class SignGRU(nn.Module):
    """GRU over per-frame landmark features -> word classes."""

    def __init__(self, input_size: int, hidden: int, n_classes: int, layers: int = 2, dropout: float = 0.3):
        super().__init__()
        self.gru = nn.GRU(input_size, hidden, num_layers=layers,
                          batch_first=True, dropout=dropout if layers > 1 else 0.0)
        self.classifier = nn.Sequential(
            nn.Linear(hidden, hidden),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden, n_classes),
        )

    def forward(self, x):
        out, _ = self.gru(x)          # (B, L, hidden)
        out = out[:, -1, :]           # last timestep
        return self.classifier(out)


def train_one_epoch(model, loader, criterion, optimizer, device):
    model.train()
    total, correct, loss_sum = 0, 0, 0.0
    for xb, yb in loader:
        xb, yb = xb.to(device), yb.to(device)
        optimizer.zero_grad()
        logits = model(xb)
        loss = criterion(logits, yb)
        loss.backward()
        optimizer.step()
        loss_sum += loss.item() * xb.size(0)
        correct += (logits.argmax(1) == yb).sum().item()
        total += xb.size(0)
    return loss_sum / max(total, 1), correct / max(total, 1)


@torch.no_grad()
def evaluate(model, loader, device):
    model.eval()
    total, correct = 0, 0
    for xb, yb in loader:
        xb, yb = xb.to(device), yb.to(device)
        preds = model(xb).argmax(1)
        correct += (preds == yb).sum().item()
        total += xb.size(0)
    return correct / max(total, 1)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--epochs", type=int, default=60)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--hidden", type=int, default=128)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--val-size", type=float, default=0.15)
    parser.add_argument("--test-size", type=float, default=0.15)
    parser.add_argument("--patience", type=int, default=15)
    parser.add_argument("--augment", action="store_true",
                        help="apply on-the-fly sequence augmentation to training data")
    args = parser.parse_args()

    if not SEQ_DIR.is_dir():
        print(f"ERROR: sequences folder not found: {SEQ_DIR}")
        print("Run scripts/prepare_word_dataset.py first.")
        return 1

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    print("Loading sequences...")
    X, y, labels, seq_len = load_sequences(SEQ_DIR, vocab=full_vocab())
    print(f"Loaded {len(X)} sequences, {len(labels)} classes, "
          f"sequence length {seq_len}, feature dim {X.shape[2]}")

    X_train, X_val, X_test, y_train, y_val, y_test = split_sequences(
        X, y, val_size=args.val_size, test_size=args.test_size,
    )
    print(f"Train: {len(X_train)}  Val: {len(X_val)}  Test: {len(X_test)}")
    counts = np.bincount(y_train, minlength=len(labels))
    print("Class counts (train):", dict(zip(labels, counts.tolist())))

    class AugmentedDataset(torch.utils.data.Dataset):
        """Wraps train arrays; augments each sample on-the-fly every epoch."""
        def __init__(self, X, y, rng_seed=0):
            self.X = torch.from_numpy(X)
            self.y = torch.from_numpy(y).long()
            self.rng = np.random.default_rng(rng_seed)
        def __len__(self):
            return len(self.y)
        def __getitem__(self, i):
            x = augment_sequence(self.X[i].numpy(), rng=self.rng)
            return torch.from_numpy(x), self.y[i]

    def loader(Xs, ys, augment=False):
        if augment:
            ds = AugmentedDataset(Xs, ys)
        else:
            ds = torch.utils.data.TensorDataset(
                torch.from_numpy(Xs), torch.from_numpy(ys).long()
            )
        return torch.utils.data.DataLoader(ds, batch_size=args.batch, shuffle=True)

    train_loader = loader(X_train, y_train, augment=args.augment)
    val_loader = loader(X_val, y_val)
    test_loader = loader(X_test, y_test)

    input_size = int(X.shape[2])  # 64 single-hand, 128 two-hand
    model = SignGRU(input_size, args.hidden, len(labels)).to(device)

    # Inverse-frequency class weights: STILL has ~4x more samples than words,
    # which biases the model; weighting balances it.
    # Use labels (actual classes present) not ISL_VOCAB (full 20) so the
    # weight tensor matches the model's n_classes.
    counts = np.bincount(y_train, minlength=len(labels)).astype(np.float64)
    # Guard against zero-count classes (would produce inf/nan weights).
    counts = np.where(counts > 0, counts, 1.0)
    weights = counts.sum() / (len(labels) * counts)
    weights = weights / weights.mean()  # normalize around 1.0
    criterion = nn.CrossEntropyLoss(
        weight=torch.from_numpy(weights).float().to(device))
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr)

    best_val, best_state = 0.0, None
    epochs_no_improve = 0
    t0 = time.time()
    for epoch in range(1, args.epochs + 1):
        tr_loss, tr_acc = train_one_epoch(model, train_loader, criterion, optimizer, device)
        val_acc = evaluate(model, val_loader, device)
        if epoch % 5 == 0 or epoch == 1:
            print(f"  epoch {epoch:3d} | train acc {tr_acc:.4f} | val acc {val_acc:.4f} | "
                  f"{time.time() - t0:.0f}s")
        if val_acc > best_val:
            best_val = val_acc
            best_state = {k: v.clone() for k, v in model.state_dict().items()}
            epochs_no_improve = 0
        else:
            epochs_no_improve += 1
            if epochs_no_improve >= args.patience:
                print(f"  early stop at epoch {epoch}")
                break

    if best_state is None:
        best_state = {k: v.clone() for k, v in model.state_dict().items()}
    model.load_state_dict(best_state)

    # ---- Test evaluation ----
    from sklearn.metrics import (accuracy_score, classification_report,
                                 confusion_matrix, f1_score, precision_score,
                                 recall_score)

    model.eval()
    all_preds, all_true = [], []
    with torch.no_grad():
        for xb, yb in test_loader:
            xb = xb.to(device)
            all_preds.extend(model(xb).argmax(1).cpu().tolist())
            all_true.extend(yb.tolist())
    y_pred = np.array(all_preds)
    y_true = np.array(all_true)

    acc = accuracy_score(y_true, y_pred)
    prec = precision_score(y_true, y_pred, average="macro", zero_division=0)
    rec = recall_score(y_true, y_pred, average="macro", zero_division=0)
    f1 = f1_score(y_true, y_pred, average="macro", zero_division=0)

    metrics = {
        "accuracy": float(acc), "precision": float(prec),
        "recall": float(rec), "f1": float(f1),
        "n_classes": len(labels), "seq_len": int(seq_len),
        "hidden": args.hidden, "best_val_acc": float(best_val),
        "classification_report": classification_report(
            y_true, y_pred, target_names=labels, zero_division=0),
        "per_class_accuracy": {
            labels[i]: float((y_pred[y_true == i] == i).mean()) if (y_true == i).sum() else None
            for i in range(len(labels))
        },
    }

    # ---- Save ----
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    torch.save({
        "state_dict": best_state,
        "classes": labels,
        "seq_len": int(seq_len),
        "input_size": input_size,
        "hidden": args.hidden,
        "n_classes": len(labels),
    }, MODELS_DIR / "word_model.pt")

    (MODELS_DIR / "word_classes.json").write_text(
        json.dumps({"classes": labels, "seq_len": int(seq_len)}, indent=2),
        encoding="utf-8",
    )
    (MODELS_DIR / "word_metrics.json").write_text(
        json.dumps(metrics, indent=2), encoding="utf-8")

    # Confusion matrix PNG
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from sklearn.metrics import ConfusionMatrixDisplay

        disp = ConfusionMatrixDisplay(confusion_matrix(y_true, y_pred, labels=list(range(len(labels)))))
        fig, ax = plt.subplots(figsize=(max(8, len(labels) * 0.7), max(8, len(labels) * 0.7)))
        disp.plot(ax=ax, cmap="Blues", colorbar=True, values_format="d")
        ax.set_title("ISL word classifier — confusion matrix (GRU)")
        fig.tight_layout()
        fig.savefig(MODELS_DIR / "word_confusion_matrix.png", dpi=120)
        plt.close(fig)
        print("Confusion matrix saved: models/word_confusion_matrix.png")
    except Exception as exc:
        print(f"(Warning: confusion matrix failed: {exc})")

    print("\n" + "=" * 56)
    print(f"TEST accuracy : {acc:.4f}")
    print(f"TEST precision: {prec:.4f}")
    print(f"TEST recall   : {rec:.4f}")
    print(f"TEST F1       : {f1:.4f}")
    print(f"Saved model   : {MODELS_DIR / 'word_model.pt'}")
    print("=" * 56)
    print(metrics["classification_report"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
