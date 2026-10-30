"""
scripts/demo_landmarks.py â€” Phase 2 verification.

Opens your webcam, runs MediaPipe hand landmark extraction, and shows a live
window with the hand skeleton overlaid plus:
  - number of hands detected
  - average processing FPS
  - which hand it is (Left/Right) and its confidence

Run from the project root (venv active):
    python scripts\\demo_landmarks.py

Use a different camera if index 0 is busy:
    python scripts\\demo_landmarks.py --camera 1

Controls:  q or ESC  -> quit
"""

import sys
import time
from pathlib import Path

# Make the project root importable no matter where this is run from.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import cv2  # noqa: E402

from ml.landmarks import LandmarkExtractor  # noqa: E402


def main() -> int:
    camera_index = 0
    if len(sys.argv) > 1 and sys.argv[1] == "--camera":
        camera_index = int(sys.argv[2])

    cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        print(f"ERROR: could not open webcam (index {camera_index}).")
        print("  - Is another app (browser/Teams/Zoom) using the camera?")
        print("  - Try another index:  python scripts\\demo_landmarks.py --camera 1")
        return 1

    extractor = LandmarkExtractor(max_num_hands=2)

    print("Phase 2 demo â€” MediaPipe hand landmark extraction.")
    print("Show your hand to the camera. Press q or ESC to quit.\n")

    fps = 0.0
    frame_count = 0
    last_time = time.perf_counter()

    while True:
        ok, frame = cap.read()
        if not ok:
            print("WARNING: could not read a frame from the camera.")
            break

        frame = cv2.flip(frame, 1)  # mirror, like a selfie view

        data = extractor.extract(frame)
        annotated = extractor.draw_skeleton(frame)

        # Smooth FPS estimate
        now = time.perf_counter()
        dt = now - last_time
        last_time = now
        if dt > 0:
            fps = 0.9 * fps + 0.1 * (1.0 / dt)

        num_hands = data["num_hands"]
        cv2.putText(
            annotated,
            f"Hands: {num_hands}   FPS: {fps:4.1f}",
            (10, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (0, 255, 0),
            2,
        )

        if num_hands > 0:
            hand = data["hands"][0]
            info = (
                f"{hand['handedness']} hand "
                f"({hand['handedness_score']:.2f})  "
                f"{len(hand['landmarks'])} landmarks"
            )
            cv2.putText(
                annotated,
                info,
                (10, 60),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (0, 255, 255),
                2,
            )

        cv2.imshow("ISL - Hand Landmark Demo (Phase 2)", annotated)

        key = cv2.waitKey(1) & 0xFF
        if key in (27, ord("q")):  # ESC or q
            break
        frame_count += 1

    cap.release()
    extractor.close()
    cv2.destroyAllWindows()
    print(f"Demo finished. Processed {frame_count} frames.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
