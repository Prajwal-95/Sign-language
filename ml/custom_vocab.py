"""Custom vocabulary — user-defined signs added through the UI.

The 20 signs in `ISL_VOCAB` are the ones the project was trained on out of
the box. A user who wants to recognise an extra word (their own name, a
specific action, etc.) records a handful of samples through the Sample
Collector, and this module persists the word name so the backend and the
retrained model both know about it.

Format: one UPPER_SNAKE_CASE token per line, `#` starts a comment. The file
is created on first use, so it is safe to delete to roll back to the shipped
vocabulary.
"""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

CUSTOM_VOCAB_FILE = PROJECT_ROOT / "custom_vocab.txt"


def _normalise(token: str) -> str:
    """Upper-snake-case a free-form user entry so 'my name' -> MY_NAME."""
    cleaned = "".join(ch.upper() if ch.isalnum() else "_" for ch in token.strip())
    while "__" in cleaned:
        cleaned = cleaned.replace("__", "_")
    return cleaned.strip("_")


def load_custom_vocab(file: Path = CUSTOM_VOCAB_FILE) -> list[str]:
    """Return the list of custom signs, de-duplicated and in file order."""
    if not file.is_file():
        return []
    out: list[str] = []
    seen: set[str] = set()
    for raw in file.read_text(encoding="utf-8").splitlines():
        token = _normalise(raw)
        if not token or token.startswith("#") or token in seen:
            continue
        seen.add(token)
        out.append(token)
    return out


def add_custom_vocab(token: str, file: Path = CUSTOM_VOCAB_FILE) -> str:
    """Append one user-defined sign. Returns the normalised token."""
    normalised = _normalise(token)
    if not normalised:
        raise ValueError("empty sign name")
    existing = load_custom_vocab(file)
    if normalised not in existing:
        file.parent.mkdir(parents=True, exist_ok=True)
        with file.open("a", encoding="utf-8") as handle:
            handle.write(f"\n{normalised}\n")
    return normalised


def full_vocab() -> list[str]:
    """ISL_VOCAB followed by any user-added signs (appended, never inserted)."""
    from ml.vocabulary import ISL_VOCAB  # noqa: E402

    return list(ISL_VOCAB) + load_custom_vocab()