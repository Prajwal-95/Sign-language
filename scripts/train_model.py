"""
scripts/train_model.py — train the ISL sign classifier (Phase 6).

Loads landmark samples from dataset/raw, splits them into
train/validation/test (stratified, no leakage), trains several candidate
classifiers on the 64-d normalized landmark features, reports
accuracy / precision / recall / F1 on the held-out TEST set, saves the
best model plus its metadata to models/, and writes a confusion matrix.

Usage:
    python scripts\\train_model.py                 # train all, keep best
    python scripts\\train_model.py --model rf      # just Random Forest
    python scripts\\train_model.py --model svm     # just SVM (sampled)
    python scripts\\train_model.py --model mlp     # just MLP
    python scripts\\train_model.py --max-per-class 1500 --test-size 0.15

Outputs (in models/):
    model.pkl          best model (joblib)
    classes.json       ordered class labels matching model output
    metrics.json       per-model and best-model metrics on the test set
    confusion_matrix.png   normalized confusion matrix
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

from ml.dataset import (  # noqa: E402
    class_distribution,
    load_dataset,
    train_val_test_split,
)
from ml.vocabulary import ISL_VOCAB  # noqa: E402
from ml.features import feature_dim  # noqa: E402

RAW_DIR = PROJECT_ROOT / "dataset" / "raw"
MODELS_DIR = PROJECT_ROOT / "models"


def build_models():
    """Candidate classifiers. All are fast, CPU-friendly and small."""
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.neural_network import MLPClassifier
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    models = {
        "rf": RandomForestClassifier(
            n_estimators=300,
            max_depth=None,
            min_samples_leaf=1,
            n_jobs=-1,
            random_state=42,
        ),
        "mlp": make_pipeline(
            StandardScaler(),
            MLPClassifier(
                hidden_layer_sizes=(256, 128),
                activation="relu",
                max_iter=300,
                early_stopping=True,
                n_iter_no_change=20,
                validation_fraction=0.15,
                random_state=42,
            ),
        ),
        # SVC is O(n^2)-ish; we sample the training set so it stays fast.
        "svm": make_pipeline(
            StandardScaler(),
            __import__("sklearn.svm", fromlist=["SVC"]).SVC(
                C=10.0, kernel="rbf", gamma="scale",
                probability=False, random_state=42,
            ),
        ),
    }
    return models


def evaluate(y_true: np.ndarray, y_pred: np.ndarray, labels: list[str]):
    from sklearn.metrics import (
        accuracy_score,
        classification_report,
        f1_score,
        precision_score,
        recall_score,
    )

    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, average="macro", zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, average="macro", zero_division=0)),
        "f1": float(f1_score(y_true, y_pred, average="macro", zero_division=0)),
        "classification_report": classification_report(y_true, y_pred, target_names=labels, zero_division=0),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", choices=["rf", "svm", "mlp", "all"], default="all")
    parser.add_argument("--val-size", type=float, default=0.10)
    parser.add_argument("--test-size", type=float, default=0.10)
    parser.add_argument("--random-state", type=int, default=42)
    parser.add_argument("--max-per-class", type=int, default=0,
                        help="cap samples per class (0 = no cap); speeds up SVM")
    args = parser.parse_args()

    if not RAW_DIR.is_dir():
        print(f"ERROR: dataset folder not found: {RAW_DIR}")
        print("Run scripts/prepare_dataset.py or the collector first.")
        return 1

    print("Loading landmark samples...")
    X, y, labels = load_dataset(RAW_DIR, vocab=ISL_VOCAB)
    print(f"Loaded {len(X):,} samples, {len(labels)} classes, "
          f"feature dim {feature_dim()}")

    # Optional per-class cap (helps SVM train fast on big datasets).
    if args.max_per_class > 0:
        keep = np.zeros(len(y), dtype=bool)
        for label_idx in range(len(labels)):
            idx = np.where(y == label_idx)[0]
            rng = np.random.default_rng(args.random_state)
            keep[idx[: args.max_per_class]] = True
        X, y = X[keep], y[keep]
        print(f"Capped to {args.max_per_class}/class -> {len(X):,} samples")

    print("\nSplitting train/validation/test "
          f"({1 - args.val_size - args.test_size:.0%}/"
          f"{args.val_size:.0%}/{args.test_size:.0%}, stratified)...")
    X_train, X_val, X_test, y_train, y_val, y_test = train_val_test_split(
        X, y, val_size=args.val_size, test_size=args.test_size,
        random_state=args.random_state,
    )
    print(f"Train: {len(X_train):,}   Val: {len(X_val):,}   Test: {len(X_test):,}")

    candidates = [args.model] if args.model != "all" else ["rf", "mlp", "svm"]
    models = build_models()

    results: dict[str, dict] = {}
    best_name, best_score, best_clf = None, -1.0, None

    for name in candidates:
        clf = models[name]
        print(f"\n[{name}] training on {len(X_train):,} samples...")
        t0 = time.perf_counter()
        clf.fit(X_train, y_train)
        t_train = time.perf_counter() - t0

        val_acc = float(clf.score(X_val, y_val))
        y_pred = clf.predict(X_test)
        metrics = evaluate(y_test, y_pred, labels)
        metrics["val_accuracy"] = val_acc
        metrics["train_seconds"] = round(t_train, 2)
        results[name] = metrics

        print(f"  train time : {t_train:.1f}s")
        print(f"  val acc    : {val_acc:.4f}")
        print(f"  test acc   : {metrics['accuracy']:.4f}")
        print(f"  precision  : {metrics['precision']:.4f}")
        print(f"  recall     : {metrics['recall']:.4f}")
        print(f"  f1         : {metrics['f1']:.4f}")

        if metrics["f1"] > best_score:
            best_score, best_name, best_clf = metrics["f1"], name, clf

    if best_clf is None:
        print("No model trained.")
        return 1

    # ---- Save artifacts ----
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    import joblib

    model_path = MODELS_DIR / "model.pkl"
    joblib.dump(best_clf, model_path)

    classes_path = MODELS_DIR / "classes.json"
    classes_path.write_text(
        json.dumps({"classes": labels, "feature_dim": feature_dim(),
                    "model": best_name}, indent=2),
        encoding="utf-8",
    )

    metrics_path = MODELS_DIR / "metrics.json"
    metrics_path.write_text(json.dumps(results, indent=2), encoding="utf-8")

    # Confusion matrix PNG (for the project report / evaluation).
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from sklearn.metrics import ConfusionMatrixDisplay

        y_pred_best = best_clf.predict(X_test)
        disp = ConfusionMatrixDisplay.from_predictions(
            y_test, y_pred_best, labels=list(range(len(labels))),
            display_labels=labels, normalize="true", cmap="Blues",
        )
        fig, ax = plt.subplots(figsize=(18, 16))
        disp.plot(ax=ax, cmap="Blues", colorbar=True)
        ax.set_title(f"ISL sign classifier — normalized confusion matrix ({best_name})")
        fig.tight_layout()
        fig.savefig(MODELS_DIR / "confusion_matrix.png", dpi=120)
        plt.close(fig)
        print("\nConfusion matrix saved: models/confusion_matrix.png")
    except Exception as exc:  # plotting must never break training
        print(f"\n(Warning: could not save confusion matrix: {exc})")

    print("\n" + "=" * 56)
    print(f"BEST MODEL: {best_name}  (F1 {best_score:.4f})")
    print(f"Saved to  : {model_path}")
    print(f"Classes   : {classes_path}  ({len(labels)} classes)")
    print(f"Metrics   : {metrics_path}")
    print("\nTest-set classification report (best model):")
    print(results[best_name]["classification_report"])
    print("=" * 56)

    # Show a compact per-class test accuracy row for a quick sanity check.
    y_pred_best = best_clf.predict(X_test)
    print("\nPer-class test accuracy (best model):")
    row = []
    for i, label in enumerate(labels):
        mask = y_test == i
        acc = float((y_pred_best[mask] == i).mean()) if mask.sum() else float("nan")
        row.append(f"{label}:{acc:.2f}")
    for chunk in [row[i:i+6] for i in range(0, len(row), 6)]:
        print("  " + "    ".join(chunk))

    return 0

if __name__ == "__main__":
    sys.exit(main())
