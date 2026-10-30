"""
Offline speech engines for Hindi and Kannada.

Windows 11 ships only English voices, so the web app cannot speak Devanagari or
Kannada through the Web Speech API. This service synthesises both locally.

Engines are tried in priority order per language, so a machine with only the
smallest one installed still speaks both languages:

  mms      Meta Multilingual Speech (VITS) via `transformers`. Neural voices for
           Hindi (`facebook/mms-tts-hin`) and Kannada (`facebook/mms-tts-kan`).
           CPU-only, ~145 MB per model, cached on disk. Licence CC-BY-NC-4.0
           (free, non-commercial).
  piper    Piper1 CLI. Better-sounding Hindi, but Piper ships no Kannada voice,
           so it only covers 'hi'. Optional.
  espeak   eSpeak NG formants. Tiny, instant, robotic, no model download, and it
           covers 'hi' and 'kn'. Optional last resort.

No account, subscription, API key or internet connection is required after the
models have been downloaded once.
"""