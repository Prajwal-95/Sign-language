"""
scripts/prepare_dataset.py — convert an EXISTING ISL dataset into the
project's landmark .npz format, so no manual data collection is required.

Supported layouts (the standard "class subfolder" layout used by Kaggle,
GitHub and INCLUDE-style archives):

    <source>/
        HELLO/
            img1.jpg  (or video1.mp4)
            ...
        THANK_YOU/
            ...

For every frame/image where a hand is detected, one sample is saved to

    dataset/raw/<TARGET_SIGN>/dataset_<SOURCE_CLASS>_<n>.npz

in the EXACT same format the webcam collector writes, so the training
pipeline is identical whether samples came from your webcam or a dataset.

Usage:
    python scripts\\prepare_dataset.py --source path\\to\\dataset_folder
    python scripts\\prepare_dataset.py --source ... --map dataset\\class_map.json
    python scripts\\prepare_dataset.py --source ... --frames-per-video 4

Class mapping:
    By default a source subfolder is matched to the vocabulary sign with the
    same name (case-insensitive, spaces -> underscores). If your dataset uses
    different names (e.g. "hello", "thankyou"), pass --map with a JSON file:
        { "hello": "HELLO", "thankyou": "THANK_YOU", ... }
    Target names MUST exist in ml/vocabulary.py ISL_VOCAB; unmapped classes
    are reported and skipped (so you can see what is being left out).

Options:
    --source PATH          dataset root folder (required)
    --map PATH             optional JSON class-name mapping
    --frames-per-video N   evenly spaced frames taken per video (default 4)
    --min-confidence F     minimum MediaPipe hand confidence (default 0.5)
    --out PATH             output root (default dataset/raw)
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

# Make the project root importable no matter where this is run from.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

import cv2  # noqa: E402

from ml.features import select_primary_hand  # noqa: E402
from ml.landmarks import LandmarkExtractor  # noqa: E402
from ml.vocabulary import ISL_VOCAB  # noqa: E402

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}
VIDEO_EXTS = {".mp4", ".avi", ".mov", ".mkv", ".webm", ".m4v"}

VOCAB_LOOKUP = {name.replace(" ", "_").upper(): name for name in ISL_VOCAB}


def resolve_target(class_name: str, mapping: dict[str, str]) -> str | None:
    """Map a source class name to a valid vocabulary sign, or None."""
    if class_name in mapping:
        candidate = mapping[class_name]
    else:
        candidate = class_name.replace(" ", "_").upper()
    if candidate in VOCAB_LOOKUP:
        return VOCAB_LOOKUP[candidate]
    # Also try the raw name (in case vocab uses different casing)
    if class_name.upper() in VOCAB_LOOKUP:
        return VOCAB_LOOKUP[class_name.upper()]
    return None


def discover_classes(source: Path) -> list[tuple[str, list[Path]]]:
    """Return [(class_name, [media_files])] for subfolders with media."""
    classes: list[tuple[str, list[Path]]] = []
    for child in sorted(source.iterdir()):
        if not child.is_dir():
            continue
        files = sorted(
            p
            for p in child.iterdir()
            if p.suffix.lower() in IMAGE_EXTS | VIDEO_EXTS
        )
        if files:
            classes.append((child.name, files))
    return classes


def save_sample(out_dir: Path, prefix: str, counter: list[int],
                hand: dict, frame_bgr) -> None:
    """Save one primary-hand sample in the collector-compatible format."""
    out_dir.mkdir(parents=True, exist_ok=True)
    idx = counter[0]
    counter[0] += 1
    np = __import__("numpy")
    np.savez_compressed(
        out_dir / f"dataset_{prefix}_{idx:05d}.npz",
        landmarks=np.asarray(hand["landmarks"], dtype=np.float32),
        handedness_label=hand["handedness"],
        handedness_score=hand["handedness_score"],
        timestamp=time.time(),
    )


def process_image(extractor, path: Path, out_dir: Path, prefix: str,
                  counter: list[int], min_conf: float, skipped: list[int]) -> None:
    img = cv2.imread(str(path))
    if img is None:
        print(f"    ! could not read {path.name}, skipped")
        skipped[0] += 1
        return
    data = extractor.extract(img)
    if data["num_hands"] < 1:
        skipped[0] += 1
        return
    hand = select_primary_hand(data["hands"])
    if hand and hand["handedness_score"] >= min_conf:
        save_sample(out_dir, prefix, counter, hand, img)


def process_video(extractor, path: Path, out_dir: Path, prefix: str,
                  counter: list[int], min_conf: float, n_frames: int) -> None:
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        print(f"    ! could not open video {path.name}, skipped")
        return
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total <= 0:
        cap.release()
        return
    indices = set(
        int(i * (total - 1) / (n_frames - 1)) for i in range(n_frames)
    ) if n_frames > 1 else {total // 2}

    frame_idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if frame_idx in indices:
            data = extractor.extract(frame)
            if data["num_hands"] >= 1:
                hand = select_primary_hand(data["hands"])
                if hand and hand["handedness_score"] >= min_conf:
                    save_sample(out_dir, prefix, counter, hand, frame)
        frame_idx += 1
    cap.release()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--map", type=Path, default=None)
    parser.add_argument("--frames-per-video", type=int, default=4)
    parser.add_argument("--min-confidence", type=float, default=0.5)
    parser.add_argument("--out", type=Path, default=PROJECT_ROOT / "dataset" / "raw")
    args = parser.parse_args()

    if not args.source.is_dir():
        print(f"ERROR: source folder not found: {args.source}")
        return 1

    mapping: dict[str, str] = {}
    if args.map is not None:
        if not args.map.is_file():
            print(f"ERROR: mapping file not found: {args.map}")
            return 1
        mapping = json.loads(args.map.read_text(encoding="utf-8"))

    classes = discover_classes(args.source)
    if not classes:
        print("ERROR: no image/video class subfolders found under the source.")
        print("Expected layout: <source>/<SIGN>/file.jpg|mp4 ...")
        return 1

    extractor = LandmarkExtractor(max_num_hands=2)

    print(f"Vocabulary: {len(ISL_VOCAB)} signs")
    print(f"Classes found in source: {len(classes)}\n")

    totals: list[tuple[str, int, int]] = []  # (target, samples, skipped)
    for class_name, files in classes:
        target = resolve_target(class_name, mapping)
        if target is None:
            print(f"[SKIP] {class_name!r} -> no match in ISL_VOCAB. "
                  f"Add it to ml/vocabulary.py or map it with --map.")
            continue

        out_dir = args.out / target
        counter = [0]
        skipped = [0]
        is_video = any(p.suffix.lower() in VIDEO_EXTS for p in files)
        kind = "video" if is_video else "image"
        print(f"[{kind:5s}] {class_name} -> {target}  ({len(files)} files)")

        for path in files:
            if path.suffix.lower() in VIDEO_EXTS:
                process_video(extractor, path, out_dir, class_name, counter,
                              args.min_confidence, args.frames_per_video)
            else:
                process_image(extractor, path, out_dir, class_name, counter,
                              args.min_confidence, skipped)

        totals.append((target, counter[0], skipped[0]))
        print(f"         saved {counter[0]:4d} samples "
              f"(skipped {skipped[0]} frames without a confident hand)\n")

    extractor.close()

    print("=" * 46)
    print(f"{'Sign':<14s}{'Samples':>9s}")
    for target, n, _ in totals:
        print(f"{target:<14s}{n:>9d}")
    print("=" * 46)
    print(f"Output written to {args.out.resolve()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
