"""Download the offline voice models so the first speech request is fast."""

from __future__ import annotations

import logging
import sys

from tts_engines import MODEL_DIR, MmsEngine

logging.basicConfig(level=logging.INFO, format="%(message)s")

LANGUAGES = ("hi", "kn", "en")


def main() -> int:
    if not MODEL_DIR.exists():
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Downloading voice models into {MODEL_DIR}")

    engine = MmsEngine()
    loaded = engine.warm_up(LANGUAGES)
    for language, ok in loaded.items():
        print(f"  {language}: {'ready' if ok else 'FAILED'}")

    if not any(loaded.values()):
        print("\nNo model could be downloaded. Check your internet connection.", file=sys.stderr)
        return 1

    print("\nAll models are cached locally. The service now works offline.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())