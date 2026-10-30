"""
Offline text-to-speech engines for Hindi and Kannada.

Why this exists
---------------
A default Windows 11 install exposes exactly two speech voices, both English
(Microsoft Zira and Microsoft David). Neither the Web Speech API nor SAPI can
speak Devanagari or Kannada script, so the web app has no way to be heard in
those languages unless it either (a) asks the user to install a language pack,
or (b) synthesises the audio itself.

This module runs the synthesis locally and offline. Engines are tried in
priority order per language, so a machine that only has the smallest one
installed still speaks both languages.

Engines
-------
mms      Meta Multilingual Speech (VITS) via `transformers`. Neural voices for
         Hindi (`facebook/mms-tts-hin`) and Kannada (`facebook/mms-tts-kan`).
         CPU-only, ~145 MB per model, cached by Hugging Face. Licence:
         CC-BY-NC-4.0 (free, non-commercial).
piper    Piper1 (VITS/ONNX). Higher quality Hindi, but there is no Kannada
         voice, so it only covers 'hi'. Optional; used when installed.
espeak   eSpeak NG formants. Tiny, instant, robotic, but covers 'hi' and 'kn'
         with no model download at all. Used only if the binary is on PATH.

None of these need an account, a subscription, an API key or an internet
connection after the models are downloaded once.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
import threading
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import numpy as np

log = logging.getLogger("tts.engines")

SUPPORTED_LANGUAGES = ("en", "hi", "kn")

#: Maximum characters handed to a single synthesis call; longer text is split.
MAX_CHARS_PER_CHUNK = 160

MODEL_DIR = Path(os.environ.get("TTS_MODEL_DIR", Path(__file__).resolve().parent / "models"))


def _split_text(text: str, limit: int = MAX_CHARS_PER_CHUNK) -> list[str]:
    """Split on whitespace so no word is ever cut in half."""
    words = text.split()
    if not words:
        return []
    chunks: list[str] = []
    current: list[str] = []
    length = 0
    for word in words:
        extra = len(word) + (1 if current else 0)
        if current and length + extra > limit:
            chunks.append(" ".join(current))
            current = [word]
            length = len(word)
        else:
            current.append(word)
            length += extra
    if current:
        chunks.append(" ".join(current))
    return chunks


def _normalise(waveform: np.ndarray, target_peak: float = 0.92) -> np.ndarray:
    """Peak-normalise and guard against clipping."""
    if waveform.size == 0:
        return waveform
    peak = float(np.max(np.abs(waveform)))
    if peak > 0:
        waveform = waveform * (target_peak / peak)
    return np.clip(waveform, -1.0, 1.0)


@dataclass(frozen=True)
class Synthesis:
    """A synthesised clip."""

    samples: np.ndarray
    sample_rate: int
    engine: str


class EngineError(RuntimeError):
    """Raised when an engine cannot serve a request."""


class BaseEngine:
    """Common interface every backend implements."""

    name = "base"
    languages: tuple[str, ...] = ()

    def available(self) -> bool:
        raise NotImplementedError

    def synth(self, language: str, text: str, rate: float) -> Synthesis:
        raise NotImplementedError


class MmsEngine(BaseEngine):
    """Meta Multilingual Speech VITS models through `transformers`."""

    name = "mms"
    #: One VITS checkpoint per language. English is included so the service can
    #: still be heard on a machine whose browser has no engine at all.
    models = {
        "hi": "facebook/mms-tts-hin",
        "kn": "facebook/mms-tts-kan",
        "en": "facebook/mms-tts-eng",
    }
    languages = SUPPORTED_LANGUAGES

    def __init__(self) -> None:
        # One lock per language: loading Kannada must not block a Hindi request.
        self._locks: dict[str, threading.Lock] = {
            lang: threading.Lock() for lang in self.models
        }
        # Separate lock serialising the actual forward passes. A single VITS
        # checkpoint is NOT safe to run from two threads at the same time
        # (negative lengths in narrow()/pad, empty waveforms). The web layer
        # dispatches every request to a worker thread, so without this lock
        # two overlapping /speak calls corrupt each other.
        self._pass_locks: dict[str, threading.Lock] = {}
        self._loaded: dict[str, tuple[object, object, int]] = {}

    def available(self) -> bool:
        """Is the library installed? (Not the model - see `model_present`.)"""
        try:
            import transformers  # noqa: F401
            import torch  # noqa: F401
        except Exception:  # pragma: no cover - depends on the environment
            return False
        return True

    @staticmethod
    def _cache_folder(model_id: str) -> Path:
        return MODEL_DIR / ("models--" + model_id.replace("/", "--"))

    def model_present(self, language: str) -> bool:
        """Are this language's weights already on disk?

        `/health` must not claim a language works when the checkpoint is
        missing: the frontend would offer Kannada speech and then fail on the
        first real request.
        """
        model_id = self.models.get(language)
        if not model_id:
            return False
        snapshots = self._cache_folder(model_id) / "snapshots"
        if not snapshots.is_dir():
            return False
        for snapshot in snapshots.iterdir():
            if not snapshot.is_dir():
                continue
            if any(snapshot.glob("*.safetensors")) or any(snapshot.glob("*.bin")):
                return True
        return False

    def loaded(self, language: str) -> bool:
        """Is the model resident in memory (i.e. warm-up finished)?"""
        return language in self._loaded

    def _load(self, language: str):
        lock = self._locks.setdefault(language, threading.Lock())
        with lock:
            entry = self._loaded.get(language)
            if entry is not None:
                return entry
            from transformers import AutoTokenizer, VitsModel

            model_id = self.models[language]
            MODEL_DIR.mkdir(parents=True, exist_ok=True)
            log.info("loading %s (%s) into %s", model_id, language, MODEL_DIR)
            tokenizer = AutoTokenizer.from_pretrained(model_id, cache_dir=str(MODEL_DIR))
            model = VitsModel.from_pretrained(model_id, cache_dir=str(MODEL_DIR))
            model.eval()
            entry = (tokenizer, model, int(model.config.sampling_rate))
            self._loaded[language] = entry
            return entry

    def warm_up(self, languages: tuple[str, ...] = ("hi", "kn")) -> list[str]:
        """Pre-download and load models so the first request is not slow."""
        done: list[str] = []
        for language in languages:
            try:
                self._load(language)
                done.append(language)
            except Exception as exc:  # noqa: BLE001
                log.warning("warm-up failed for %s: %s", language, exc)
        return done

    #: Minimum fraction of characters that must belong to the target script
    #: for the engine to attempt synthesis. Below this threshold the VITS
    #: model's attention layers can produce degenerate tensors (negative
    #: lengths in narrow()), crashing the process.
    _SCRIPT_RANGES: dict[str, tuple[int, ...]] = {
        # Devanagari (Hindi/Marathi/etc.)
        "hi": (0x0900, 0x097F),
        # Kannada
        "kn": (0x0C80, 0x0CFF),
        # Basic Latin + Latin Extended (English fallback)
        "en": (0x0041, 0x007A),
    }

    @classmethod
    def _script_coverage(cls, text: str, language: str) -> float:
        """Fraction of alphabetic characters in *text* that fall inside the
        Unicode block for *language*. Returns 1.0 when there are no letters."""
        lo_hi = cls._SCRIPT_RANGES.get(language)
        if not lo_hi:
            return 1.0
        lo, hi = lo_hi
        letters = [ch for ch in text if ch.isalpha()]
        if not letters:
            return 1.0
        in_range = sum(1 for ch in letters if lo <= ord(ch) <= hi)
        return in_range / len(letters)

    def synth(self, language: str, text: str, rate: float) -> Synthesis:
        import torch

        # Guard: refuse text whose script is entirely unrelated (e.g. sending
        # "Hello world" to the Kannada model). The threshold is deliberately
        # lenient because of real-world slips observed in production:
        #   * 'ನಮಸ್ಕಾರ' (typical keyboard slip: final letter typed in
        #     Telugu) is 86% Kannada,
        #   * a Kannada word plus one stray Latin letter is ~87% Kannada.
        # All of these speak perfectly fine; the old 30% threshold rejected
        # them with a hard error.
        coverage = self._script_coverage(text, language)
        if coverage < 0.05:
            raise EngineError(
                f"text does not appear to be {language} "
                f"(only {coverage:.0%} of characters are in the expected script); "
                f"refusing to synthesise to avoid a model crash"
            )

        tokenizer, model, sample_rate = self._load(language)

        # A VITS checkpoint is NOT safe to run twice at once: the web service
        # fans each request out to a worker thread, and two concurrent
        # forward passes on the same model corrupt each other (negative
        # lengths inside narrow()/pad, empty waveforms, or the whole process
        # being torn down). Serialise every pass; synthesis is fast enough
        # that requests simply queue behind each other.
        pass_lock = self._pass_locks.setdefault(language, threading.Lock())

        pieces: list[np.ndarray] = []
        silence = np.zeros(int(sample_rate * 0.12), dtype=np.float32)
        with torch.no_grad():
            for chunk in _split_text(text):
                # Per-chunk guard: a mixed sentence can split into a chunk
                # that is 100% the wrong script. Skip it rather than feed
                # the model text it cannot read.
                chunk_cov = self._script_coverage(chunk, language)
                if chunk_cov < 0.05:
                    log.warning(
                        "skipping chunk with %.0f%% %s coverage: %r",
                        chunk_cov * 100, language, chunk[:60],
                    )
                    continue
                inputs = tokenizer(chunk, return_tensors="pt")
                try:
                    with pass_lock:
                        output = model(**inputs, speaking_rate=max(0.5, min(2.0, rate)))
                except RuntimeError as exc:
                    # Catch any residual narrow/pad crash and convert it to a
                    # recoverable EngineError so the HTTP layer returns 4xx/5xx
                    # cleanly instead of tearing down the worker.
                    msg = str(exc).lower()
                    if "narrow" in msg or "non-negative" in msg or "pad" in msg:
                        raise EngineError(
                            f"VITS internal error for {language}: {exc}"
                        ) from exc
                    raise
                wv = output.waveform.squeeze().cpu().numpy()
                if wv.ndim == 0 or wv.size == 0:
                    log.warning("empty waveform for chunk %r, skipping", chunk[:40])
                    continue
                pieces.append(wv.astype(np.float32))
                pieces.append(silence)
        if not pieces:
            raise EngineError("nothing to synthesise after script filtering")
        samples = np.concatenate(pieces[:-1]).astype(np.float32)
        return Synthesis(_normalise(samples), sample_rate, self.name)


class PiperEngine(BaseEngine):
    """Piper1 CLI. Optional quality upgrade for Hindi; no Kannada voice exists."""

    name = "piper"
    languages = ("hi",)

    VOICES = {
        "hi": "hi_IN-rohan-medium",
    }

    def __init__(self, executable: str | None = None) -> None:
        self.executable = executable or shutil.which("piper")

    def available(self) -> bool:
        return bool(self.executable)

    def _voice_path(self, language: str) -> Path:
        return MODEL_DIR / f"{self.VOICES[language]}.onnx"

    def synth(self, language: str, text: str, rate: float) -> Synthesis:
        if not self.executable:
            raise EngineError("piper is not installed")
        voice = self._voice_path(language)
        if not voice.exists():
            raise EngineError(f"piper voice not downloaded: {voice.name}")
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "out.wav"
            length_scale = 1.0 / max(0.5, min(2.0, rate))
            subprocess.run(
                [
                    self.executable,
                    "--model",
                    str(voice),
                    "--output_file",
                    str(out),
                    "--length_scale",
                    f"{length_scale:.3f}",
                ],
                input=text.encode("utf-8"),
                check=True,
                capture_output=True,
            )
            with wave.open(str(out), "rb") as handle:
                sample_rate = handle.getframerate()
                frames = handle.readframes(handle.getnframes())
                samples = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
        return Synthesis(_normalise(samples), sample_rate, self.name)


class EspeakEngine(BaseEngine):
    """eSpeak NG formants. Always-available last resort for hi and kn."""

    name = "espeak"
    languages = ("hi", "kn")

    def __init__(self, executable: str | None = None) -> None:
        self.executable = executable or shutil.which("espeak-ng") or shutil.which("espeak")

    def available(self) -> bool:
        return bool(self.executable)

    def synth(self, language: str, text: str, rate: float) -> Synthesis:
        if not self.executable:
            raise EngineError("espeak-ng is not installed")
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "out.wav"
            words_per_minute = int(150 * max(0.5, min(2.0, rate)))
            subprocess.run(
                [self.executable, "-v", language, "-s", str(words_per_minute), "-w", str(out)],
                input=text.encode("utf-8"),
                check=True,
                capture_output=True,
            )
            with wave.open(str(out), "rb") as handle:
                sample_rate = handle.getframerate()
                frames = handle.readframes(handle.getnframes())
                width = handle.getsampwidth()
                dtype = {1: np.uint8, 2: np.int16, 4: np.int32}[width]
                samples = np.frombuffer(frames, dtype=dtype).astype(np.float32)
                samples = samples / float(np.iinfo(dtype).max)
        return Synthesis(_normalise(samples), sample_rate, self.name)


class EngineRegistry:
    """Picks an engine per language and exposes honest capability."""

    #: Highest quality first. `mms` covers every language, so it is the default.
    ORDER = (PiperEngine, MmsEngine, EspeakEngine)

    def __init__(self, engines: list[BaseEngine] | None = None) -> None:
        self.engines = engines if engines is not None else [cls() for cls in self.ORDER]

    def _engine_usable(self, engine: BaseEngine, language: str) -> bool:
        """Is this engine installed AND does it hold this language's model?

        Checking only "transformers imports" would let `/health` advertise
        Kannada support on a machine where the checkpoint was never downloaded.
        """
        if language not in engine.languages:
            return False
        try:
            if not engine.available():
                return False
        except Exception:  # noqa: BLE001
            return False
        if isinstance(engine, MmsEngine) and not engine.model_present(language):
            return False
        return True

    def capabilities(self) -> dict[str, str | None]:
        """language -> engine name, or None when it genuinely cannot be served."""
        result: dict[str, str | None] = {}
        for language in SUPPORTED_LANGUAGES:
            result[language] = None
            for engine in self.engines:
                if self._engine_usable(engine, language):
                    result[language] = engine.name
                    break
        return result

    def loaded(self) -> dict[str, bool]:
        """language -> is the model resident in memory yet."""
        result: dict[str, bool] = {}
        for language in SUPPORTED_LANGUAGES:
            result[language] = False
            for engine in self.engines:
                if isinstance(engine, MmsEngine) and engine.loaded(language):
                    result[language] = True
                    break
        return result

    def engine_for(self, language: str) -> BaseEngine | None:
        for engine in self.engines:
            if self._engine_usable(engine, language):
                return engine
        return None

    def synth(self, language: str, text: str, rate: float = 1.0) -> Synthesis:
        if language not in SUPPORTED_LANGUAGES:
            raise EngineError(f"unsupported language: {language}")
        engine = self.engine_for(language)
        if engine is None:
            raise EngineError(f"no engine available for {language}")
        log.info("synthesising %s with %s", language, engine.name)
        return engine.synth(language, text, rate)

    def warm_up(self) -> dict[str, bool]:
        """Download/load models ahead of the first request."""
        warmable: dict[str, Callable[[], object]] = {}
        result: dict[str, bool] = {}
        for engine in self.engines:
            if not isinstance(engine, MmsEngine):
                continue
            for language in engine.languages:
                warmable[language] = lambda e=engine, l=language: e._load(l)
        for language, load in warmable.items():
            try:
                load()
                result[language] = True
            except Exception as exc:  # noqa: BLE001
                log.warning("could not pre-load %s: %s", language, exc)
                result[language] = False
        return result