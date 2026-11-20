import base64
import unittest
from types import SimpleNamespace

import numpy as np

import speech_worker


class SpeechWorkerTests(unittest.TestCase):
    def test_transcribes_verbatim_english_float32_audio_without_rewriting(self):
        audio = np.array([0.1, -0.2, 0.3], dtype=np.float32)
        request = {
            "sampleRate": 16000,
            "audioBase64": base64.b64encode(audio.tobytes()).decode("ascii"),
        }
        calls = []

        class FakeModel:
            def transcribe(self, received_audio, **options):
                calls.append((received_audio.copy(), options))
                return iter([
                    SimpleNamespace(text=" I am not understand this."),
                    SimpleNamespace(text=" I I still don't understand."),
                ]), SimpleNamespace(language="en")

        transcript = speech_worker.transcribe(FakeModel(), request)

        self.assertEqual(
            transcript,
            "I am not understand this. I I still don't understand.",
        )
        np.testing.assert_array_equal(calls[0][0], audio)
        self.assertEqual(
            calls[0][1],
            {
                "language": "en",
                "task": "transcribe",
                "beam_size": 1,
                "vad_filter": True,
                "vad_parameters": {"min_silence_duration_ms": 400},
                "condition_on_previous_text": False,
                "without_timestamps": True,
            },
        )

    def test_rejects_non_english_models(self):
        with self.assertRaisesRegex(ValueError, "only supports tiny.en, base.en, and small.en"):
            speech_worker.create_model("large-v3")

    def test_rejects_audio_that_is_not_16_khz_or_has_no_speech(self):
        audio = np.zeros(16000, dtype=np.float32)
        request = {
            "sampleRate": 16000,
            "audioBase64": base64.b64encode(audio.tobytes()).decode("ascii"),
        }

        with self.assertRaisesRegex(ValueError, "No speech was detected"):
            speech_worker.transcribe(object(), request)
        with self.assertRaisesRegex(ValueError, "16 kHz"):
            speech_worker.transcribe(
                object(),
                {**request, "sampleRate": 8000},
            )


if __name__ == "__main__":
    unittest.main()
