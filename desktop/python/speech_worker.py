import base64
import json
import os
import sys
import traceback
from typing import Any

import ctranslate2
import numpy as np
from faster_whisper import WhisperModel

SAMPLE_RATE = 16000
MAX_DURATION_SECONDS = 30
INITIAL_PROMPT = "Indian speaker using Tamil or English, possibly with mixed-language words, asking a question or giving instructions."


def write_message(message: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(message, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def create_model(model_name: str) -> tuple[WhisperModel, str, str]:
    # Use the GPU only when CTranslate2 can see CUDA; otherwise keep the worker on CPU int8.
    if ctranslate2.get_cuda_device_count() > 0:
        try:
            model = WhisperModel(
                model_name,
                device="cuda",
                compute_type="int8_float16",
                download_root=os.environ.get("CODECLASH_SPEECH_MODEL_CACHE"),
            )
            return model, "cuda", "int8_float16"
        except Exception:
            traceback.print_exc(file=sys.stderr)

    model = WhisperModel(
        model_name,
        device="cpu",
        compute_type="int8",
        download_root=os.environ.get("CODECLASH_SPEECH_MODEL_CACHE"),
    )
    return model, "cpu", "int8"


def transcribe(model: WhisperModel, request: dict[str, Any]) -> str:
    if request.get("sampleRate") != SAMPLE_RATE:
        raise ValueError("Audio must be mono 16 kHz PCM.")

    encoded_audio = request.get("audioBase64")
    if not isinstance(encoded_audio, str):
        raise ValueError("Audio data is missing.")

    audio_bytes = base64.b64decode(encoded_audio, validate=True)
    if not audio_bytes or len(audio_bytes) % np.dtype(np.float32).itemsize:
        raise ValueError("Audio data has an invalid format.")

    audio = np.frombuffer(audio_bytes, dtype=np.float32)
    if not 0 < audio.size <= SAMPLE_RATE * MAX_DURATION_SECONDS:
        raise ValueError("Record a speech clip that is 30 seconds or shorter.")
    if not np.isfinite(audio).all():
        raise ValueError("Audio data contains invalid samples.")
    if float(np.mean(audio.astype(np.float64) ** 2)) < 0.000001:
        raise ValueError("No speech was detected. Speak closer to the microphone and try again.")

    segments, _ = model.transcribe(
        audio,
        beam_size=1,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 400},
        condition_on_previous_text=False,
        without_timestamps=True,
        initial_prompt=INITIAL_PROMPT,
    )
    return "".join(segment.text for segment in segments).strip()


def main() -> int:
    model_name = os.environ.get("CODECLASH_SPEECH_MODEL", "large-v3")
    try:
        model, device, compute_type = create_model(model_name)
    except Exception:
        traceback.print_exc(file=sys.stderr)
        write_message({
            "type": "startup_error",
            "error": "The speech model could not load. Check internet access, free disk space, and available memory.",
        })
        return 1

    write_message({
        "type": "ready",
        "model": model_name,
        "device": device,
        "computeType": compute_type,
    })

    for line in sys.stdin:
        request: dict[str, Any] = {}
        try:
            request = json.loads(line)
            request_id = request.get("id")
            transcript = transcribe(model, request)
            write_message({"id": request_id, "text": transcript})
        except ValueError as error:
            write_message({"id": request.get("id"), "error": str(error)})
        except Exception:
            traceback.print_exc(file=sys.stderr)
            write_message({
                "id": request.get("id"),
                "error": "Speech could not be transcribed. Please try again.",
            })
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
