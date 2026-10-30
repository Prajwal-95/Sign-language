"""
scripts/prepare_word_dataset.py — convert a word-level ISL VIDEO dataset into
per-sign landmark SEQUENCES for the temporal model.

Source layout expected (prasadshet/indian-sign-language-video-dataset):
    <source>/<WORD>/video1.mp4 ...      (one subfolder per sign)

For every video a (SEQ_LEN, 64) feature sequence is saved to
    dataset/seq/<TARGET_SIGN>/seq_<n>.npz

Run (venv active, from project root):
    python scripts\\prepare_word_dataset.py --source "C:\\path\\to\\Video_Dataset\\Video_Dataset"
    python scripts\\prepare_word_dataset.py --source ... --seq-len 32 --workers 4

Options:
    --source PATH       dataset root (required)
    --seq-len N         frames per sequence (default 32)
    --workers N         parallel processes (default 2)
    --min-confidence F  hand confidence floor (default 0.5)
"""

from __future__ import annotations

import argparse
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ml.vocabulary import ISL_VOCAB  # noqa: E402

SEQ_DIR = PROJECT_ROOT / "dataset" / "seq"
VIDEO_EXTS = {".mp4", ".avi", ".mov", ".mkv", ".webm", ".m4v"}
VOCAB_LOOKUP = {name.replace(" ", "_").upper(): name for name in ISL_VOCAB}

# Per-worker globals (created inside each worker process).
_WORKER_EXTRACTOR = None
_WORKER_SEQ_LEN = 32
_WORKER_MIN_CONF = 0.5


def _init_worker(seq_len: int, min_conf: float) -> None:
    global _WORKER_EXTRACTOR, _WORKER_SEQ_LEN, _WORKER_MIN_CONF
    import sys as _sys
    if str(PROJECT_ROOT) not in _sys.path:
        _sys.path.insert(0, str(PROJECT_ROOT))
    from ml.landmarks import LandmarkExtractor

    _WORKER_EXTRACTOR = LandmarkExtractor(max_num_hands=2)
    _WORKER_SEQ_LEN = seq_len
    _WORKER_MIN_CONF = min_conf


def _process_one(args: tuple[str, Path]) -> tuple[str, Path, np.ndarray | None]:
    """Return (class_name, video_path, seq_array_or_None)."""
    import sys as _sys
    if str(PROJECT_ROOT) not in _sys.path:
        _sys.path.insert(0, str(PROJECT_ROOT))
    from ml.sequences import video_to_sequence

    class_name, video_path = args
    seq = video_to_sequence(
        _WORKER_EXTRACTOR, video_path,
        seq_len=_WORKER_SEQ_LEN, min_confidence=_WORKER_MIN_CONF,
    )
    return class_name, video_path, seq


def discover(source: Path) -> list[tuple[str, list[Path]]]:
    classes = []
    for child in sorted(source.iterdir()):
        if not child.is_dir():
            continue
        files = sorted(p for p in child.iterdir() if p.suffix.lower() in VIDEO_EXTS)
        if files:
            classes.append((child.name, files))
    return classes


def _clean_name(class_name: str) -> str:
    """Strip the 'NN. ' prefix used by INCLUDE folder names (e.g. '48. Hello')."""
    name = class_name.strip()
    if name[:1].isdigit():
        dot = name.find(".")
        if 0 < dot < 5:
            name = name[dot + 1:].strip()
    return name


def resolve_target(class_name: str) -> str | None:
    cleaned = _clean_name(class_name)
    cand = cleaned.replace(" ", "_").upper()
    return VOCAB_LOOKUP.get(cand) or VOCAB_LOOKUP.get(cleaned.upper())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--seq-len", type=int, default=32)
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--min-confidence", type=float, default=0.5)
    args = parser.parse_args()

    if not args.source.is_dir():
        print(f"ERROR: source folder not found: {args.source}")
        return 1

    classes = discover(args.source)
    if not classes:
        print("ERROR: no video class subfolders found under the source.")
        return 1

    SEQ_DIR.mkdir(parents=True, exist_ok=True)

    jobs: list[tuple[str, Path]] = []
    counters: dict[str, int] = {}
    skipped_existing: dict[str, int] = {}
    for class_name, files in classes:
        target = resolve_target(class_name)
        if target is None:
            print(f"[SKIP] {_clean_name(class_name)!r} -> not in ISL_VOCAB")
            continue
        out_dir = SEQ_DIR / target
        out_dir.mkdir(parents=True, exist_ok=True)
        existing = {p.stem for p in out_dir.glob("seq_*.npz")}
        counters[target] = len(existing)
        skipped_existing[target] = len(existing)
        for f in files:
            if f.stem not in existing:
                jobs.append((class_name, f))

    print(f"Vocabulary: {len(ISL_VOCAB)} words")
    print(f"Sequences to build: {len(jobs)} "
          f"(resuming {sum(skipped_existing.values())} already done)\n")

    t0 = time.time()
    done = 0
    saved: dict[str, int] = {t: 0 for t in counters}
    nohand: dict[str, int] = {t: 0 for t in counters}

    with ProcessPoolExecutor(
        max_workers=max(1, args.workers),
        initializer=_init_worker,
        initargs=(args.seq_len, args.min_confidence),
    ) as ex:
        futures = {ex.submit(_process_one, j): j for j in jobs}
        for fut in as_completed(futures):
            class_name, video_path, seq = fut.result()
            target = resolve_target(class_name)
            if seq is not None:
                idx = counters[target]
                np.savez_compressed(SEQ_DIR / target / f"seq_{idx:05d}.npz", seq=seq)
                counters[target] += 1
                saved[target] += 1
            else:
                nohand[target] += 1
            done += 1
            if done % 100 == 0 or done == len(jobs):
                print(f"  {done}/{len(jobs)} sequences done "
                      f"({time.time() - t0:.0f}s elapsed)")

    print("\n" + "=" * 46)
    print(f"{'Word':<20s}{'Saved':>7s}{'No-hand':>9s}")
    for word in ISL_VOCAB:
        print(f"{word:<20s}{saved.get(word, 0):>7d}{nohand.get(word, 0):>9d}")
    print("=" * 46)
    print(f"Output: {SEQ_DIR.resolve()}")
    print(f"Total time: {time.time() - t0:.0f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
