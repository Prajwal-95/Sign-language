"""
Tests for the local speech service.

Fast, offline and model-free: they cover the logic that decides whether a
language can be served at all, which is the part that silently lied before.

Run:  .venv\\Scripts\\python.exe -m unittest test_service -v
"""

import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import tts_engines as E


class TestSplitText(unittest.TestCase):
    def test_short_text_is_one_chunk(self):
        self.assertEqual(E._split_text("hello"), ["hello"])

    def test_empty_text_yields_nothing(self):
        self.assertEqual(E._split_text(""), [])
        self.assertEqual(E._split_text("   "), [])

    def test_words_are_never_split_in_half(self):
        chunks = E._split_text("word " * 200, limit=40)
        self.assertGreater(len(chunks), 1)
        self.assertEqual(" ".join(chunks).split(), ("word " * 200).split())

    def test_hindi_and_kannada_survive_chunking(self):
        for text in ("ನಮಸ್ಕಾರ ಧನ್ಯವಾದ ಚಹಾ", "नमस्ते धन्यवाद चाय"):
            chunks = E._split_text(text, limit=20)
            self.assertEqual(" ".join(chunks), text)


class TestNormalise(unittest.TestCase):
    def test_peak_is_targeted(self):
        import numpy as np

        out = E._normalise(np.array([0.1, -0.2, 0.05], dtype="float32"))
        self.assertAlmostEqual(float(np.max(np.abs(out))), 0.92, places=5)

    def test_output_never_clips(self):
        import numpy as np

        out = E._normalise(np.array([5.0, -5.0], dtype="float32"))
        self.assertLessEqual(float(np.max(np.abs(out))), 1.0)


class TestModelPresence(unittest.TestCase):
    """`/health` must not advertise a language whose checkpoint is missing."""

    def test_unknown_language_has_no_model(self):
        engine = E.MmsEngine()
        self.assertFalse(engine.model_present("fr"))
        self.assertFalse(engine.model_present("zz"))

    def test_known_languages_map_to_the_right_checkpoints(self):
        self.assertEqual(E.MmsEngine.models["hi"], "facebook/mms-tts-hin")
        self.assertEqual(E.MmsEngine.models["kn"], "facebook/mms-tts-kan")

    def test_absent_checkpoint_reports_false(self):
        with tempfile.TemporaryDirectory() as tmp:
            original = E.MODEL_DIR
            E.MODEL_DIR = Path(tmp)
            try:
                self.assertFalse(E.MmsEngine().model_present("kn"))
            finally:
                E.MODEL_DIR = original

    def test_present_checkpoint_reports_true(self):
        with tempfile.TemporaryDirectory() as tmp:
            original = E.MODEL_DIR
            E.MODEL_DIR = Path(tmp)
            try:
                folder = E.MmsEngine()._cache_folder(E.MmsEngine.models["kn"])
                snap = folder / "snapshots" / "abc123"
                snap.mkdir(parents=True)
                (snap / "model.safetensors").write_bytes(b"weights")
                self.assertTrue(E.MmsEngine().model_present("kn"))
                self.assertFalse(E.MmsEngine().model_present("hi"))
            finally:
                E.MODEL_DIR = original


class TestRegistryCapabilities(unittest.TestCase):
    def test_language_without_a_model_is_reported_as_unavailable(self):
        class StubMms(E.MmsEngine):
            def available(self):
                return True

            def model_present(self, language):
                return language in ("hi",)  # Kannada checkpoint deliberately absent

        registry = E.EngineRegistry([StubMms()])
        caps = registry.capabilities()
        self.assertEqual(caps["hi"], "mms")
        self.assertIsNone(
            caps["kn"],
            "a language with no local checkpoint must not be advertised",
        )

    def test_synth_refuses_a_language_without_an_engine(self):
        class StubMms(E.MmsEngine):
            def available(self):
                return True

            def model_present(self, language):
                return language == "hi"

        registry = E.EngineRegistry([StubMms()])
        with self.assertRaises(E.EngineError):
            registry.synth("kn", "ನಮಸ್ಕಾರ")

    def test_throwing_engine_does_not_break_capabilities(self):
        class Broken(E.BaseEngine):
            name = "broken"
            languages = ("en", "hi", "kn")

            def available(self):
                raise RuntimeError("boom")

        class StubMms(E.MmsEngine):
            def available(self):
                return True

            def model_present(self, language):
                return True

        registry = E.EngineRegistry([Broken(), StubMms()])
        self.assertEqual(registry.capabilities()["kn"], "mms")


class TestWavEncoding(unittest.TestCase):
    def test_written_wav_is_a_valid_riff_file(self):
        import numpy as np
        import service

        samples = np.sin(np.linspace(0, 200, 8000)).astype("float32") * 0.5
        data = service._to_wav_bytes(samples, 16000)
        self.assertEqual(data[:4], b"RIFF")
        self.assertEqual(data[8:12], b"WAVE")
        # fmt chunk: PCM tag, channels, sample rate, bits per sample
        self.assertEqual(int.from_bytes(data[20:22], "little"), 1, "PCM")
        self.assertEqual(int.from_bytes(data[22:24], "little"), 1, "mono")
        self.assertEqual(int.from_bytes(data[24:28], "little"), 16000, "sample rate")
        self.assertEqual(int.from_bytes(data[34:36], "little"), 16, "16-bit samples")
        self.assertGreater(len(data) - 44, 0, "must contain PCM samples")


if __name__ == "__main__":
    unittest.main(verbosity=2)