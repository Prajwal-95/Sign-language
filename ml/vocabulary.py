"""
Vocabulary — 20 most-used DAILY ISL word signs from the official Indian
Sign Language channel dataset (prasadshet/..., MIT license, 60 videos each).

Two-hand mode: every frame contributes BOTH hands (128-d), so the
two-handed signs (THANK_YOU, DRINK, COOK, POUR, CLOSE, BREAK, ...) carry
their full signal. STILL = hand-down pause (from the dataset's "Still").

These 20 are chosen as the most common daily words with DISTINCT motions.
"""

ISL_VOCAB: list[str] = [
    "STILL",
    "HELLO",
    "THANK_YOU",
    "GOOD_MORNING",
    "GOOD_AFTERNOON",
    "WHAT_IS_YOUR_NAME",
    "MAYBE",
    "COME",
    "DRINK",
    "GIVE",
    "CLEAN",
    "COOK",
    "CLOSE",
    "BREAK",
    "POUR",
    "CRY",
    "JUMP",
    "TEA",
    "KEY",
    "WIFE",
]
