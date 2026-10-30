"""
scripts/collect_dataset.py — Phase 3 dataset collection tool.

Records landmark samples for each sign in ml/vocabulary.py using your webcam.

Run from the project root (venv active):
    python scripts\\collect_dataset.py

Keyboard controls (in the video window):
    [  ......... previous sign
    ]  ......... next sign
    R  ......... record a burst (~2 seconds) of frames, saving a sample per
                 frame where a hand is detected
    D  ......... delete the last saved sample of the current sign
    Q / ESC .... quit

Samples are saved as compressed .npz files under dataset/raw/<SIGN>/, each
containing:
    landmarks         (21, 3) normalized hand landmarks
    handedness_label  "Left" / "Right"
    handedness_score  float
    timestamp         float

Diversity guidance: between bursts, change hand position, distance from
camera, rotation, lighting and background. If possible collect from
multiple people — the model generalizes much better that way.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

# Make the project root importable no matter where this is run from.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import cv2  # noqa: E402
import numpy as np  # noqa: E402

from ml.features import select_primary_hand  # noqa: E402
from ml.landmarks import LandmarkExtractor  # noqa: E402
from ml.vocabulary import ISL_VOCAB  # noqa: E402

RAW_DIR = Path(__file__).resolve().parents[1] / "dataset" / "raw"
RECORD_SECONDS = 2.0
MIN_HAND_CONFIDENCE = 0.5


def sample_count(sign: str) -> int:
    d = RAW_DIR / sign
    if not d.exists():
        return 0
    return len(list(d.glob("sample_*.npz")))


def next_sample_index(sign: str) -> int:
    d = RAW_DIR / sign
    if not d.exists():
        return 0
    existing = sorted(d.glob("sample_*.npz"))
    if not existing:
        return 0
    return max(int(p.stem.split("_")[1]) for p in existing) + 1


def delete_last_sample(sign: str) -> bool:
    d = RAW_DIR / sign
    if not d.exists():
        return False
    files = sorted(d.glob("sample_*.npz"))
    if not files:
        return False
    files[-1].unlink()
    return True


def main() -> int:
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    extractor = LandmarkExtractor(max_num_hands=2)
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("ERROR: could not open webcam (index 0).")
        print("Close other apps using the camera, then retry.")
        return 1

    sign_index = 0
    recording = False
    record_until = 0.0
    saved_this_burst = 0
    warned_no_hand = False

    print("ISL dataset collector (Phase 3)")
    print("Controls: [ / ] change sign, R record burst, D delete last, Q quit.\n")
    print("Diversity tips: change position, distance, rotation, lighting and")
    print("background between bursts. More performers = a stronger model.\n")

    while True:
        ok, frame = cap.read()
        if not ok:
            print("WARNING: could not read a frame from the camera.")
            break

        display = cv2.flip(frame, 1)  # mirrored, for the user's comfort only

        # Extract from the RAW (unflipped) frame so collection matches inference.
        data = extractor.extract(frame)
        annotated = extractor.draw_skeleton(display)

        sign = ISL_VOCAB[sign_index]
        now = time.time()

        if recording and now >= record_until:
            recording = False
            if saved_this_burst == 0:
                print(f"No hand detected during that burst for {sign} — "
                      "show your hand clearly and press R again.")
            else:
                print(f"Saved {saved_this_burst} samples for {sign} "
                      f"(total {sample_count(sign)}).")
            saved_this_burst = 0

        if recording and data["num_hands"] >= 1:
            hand = select_primary_hand(data["hands"])
            if hand and hand["handedness_score"] >= MIN_HAND_CONFIDENCE:
                (RAW_DIR / sign).mkdir(parents=True, exist_ok=True)
                idx = next_sample_index(sign)
                np.savez_compressed(
                    RAW_DIR / sign / f"sample_{idx:05d}.npz",
                    landmarks=np.asarray(hand["landmarks"], dtype=np.float32),
                    handedness_label=hand["handedness"],
                    handedness_score=hand["handedness_score"],
                    timestamp=now,
                )
                saved_this_burst += 1
            elif data["num_hands"] >= 1 and not warned_no_hand:
                warned_no_hand = True

        # ---- overlay ----
        cv2.putText(annotated, f"Sign: {sign}   samples: {sample_count(sign)}",
                    (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
        cv2.putText(annotated, "[ ]: change sign   R: record   D: delete last   Q: quit",
                    (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

        if recording:
            remaining = max(0.0, record_until - now)
            frac = 1.0 - remaining / RECORD_SECONDS
            bar_w = int(300 * frac)
            cv2.rectangle(annotated, (10, 90), (310, 110), (255, 255, 255), 1)
            cv2.rectangle(annotated, (10, 90), (10 + bar_w, 110), (0, 0, 255), -1)
            cv2.putText(annotated, f"RECORDING... saved {saved_this_burst}",
                        (10, 130), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
        else:
            warned_no_hand = False
            cv2.putText(annotated, "Press R to record a ~2s burst",
                        (10, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

        cv2.imshow("ISL Dataset Collector (Phase 3)", annotated)
        key = cv2.waitKey(1) & 0xFF

        if key in (27, ord("q"), ord("Q")):
            break
        elif key in (ord("r"), ord("R")):
            recording = True
            record_until = now + RECORD_SECONDS
            saved_this_burst = 0
        elif key in (ord("d"), ord("D")):
            if delete_last_sample(sign):
                print(f"Deleted last sample of {sign} (now {sample_count(sign)}).")
            else:
                print(f"No samples to delete for {sign}.")
        elif key == ord("["):
            sign_index = (sign_index - 1) % len(ISL_VOCAB)
        elif key == ord("]"):
            sign_index = (sign_index + 1) % len(ISL_VOCAB)

    cap.release()
    extractor.close()
    cv2.destroyAllWindows()

    print("\nDone. Dataset summary:")
    for s in ISL_VOCAB:
        print(f"  {s:12s} {sample_count(s):5d}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
