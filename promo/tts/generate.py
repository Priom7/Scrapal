"""Voiceover for the promo, generated locally with Kokoro-82M (Apache-2.0).

    tts/.venv/bin/python tts/generate.py               # every line, student film
    tts/.venv/bin/python tts/generate.py plan.meet     # just these lines
    tts/.venv/bin/python tts/generate.py --film=admin  # the operator film
    tts/.venv/bin/python tts/generate.py --phonemes    # print how names will be said

Reads a film's script.json, writes one WAV per line to its audio folder and every
line's spoken length to its durations.json, which the film uses to keep the
picture in step with the voice. Each line is trimmed to its first and last
sound, high-passed, levelled to the same loudness and peak-limited, so lines
recorded separately sit together as one read.
"""

from __future__ import annotations

import json
import os
import sys
import wave
from pathlib import Path

import numpy as np
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / "tts" / "models"
# Each film: its script, where line lengths go, where the audio goes.
FILMS = {
    "student": (ROOT / "src" / "vo", ROOT / "public" / "audio" / "vo"),
    "admin": (ROOT / "src" / "admin" / "vo", ROOT / "public" / "audio" / "vo-admin"),
}

TARGET_RMS_DB = -16.5   # every line at the same speaking level
PEAK_DB = -1.5          # and never louder than this
EDGE_DB = -42.0         # below this, relative to the line's peak, counts as silence
PAD_S = 0.03            # breath kept either side of the trimmed sound


def db(x: float) -> float:
    return 20 * np.log10(max(x, 1e-9))


def trim(samples: np.ndarray, rate: int) -> np.ndarray:
    """Cut leading and trailing silence, keeping a few milliseconds of air."""
    window = int(rate * 0.01)
    frames = len(samples) // window
    if frames == 0:
        return samples
    energy = np.sqrt(np.mean(samples[: frames * window].reshape(frames, window) ** 2, axis=1))
    loud = np.where(energy > np.max(energy) * 10 ** (EDGE_DB / 20))[0]
    if not len(loud):
        return samples
    pad = int(rate * PAD_S)
    start = max(0, loud[0] * window - pad)
    end = min(len(samples), (loud[-1] + 1) * window + pad)
    return samples[start:end]


def highpass(samples: np.ndarray, rate: int, freq: float = 75.0) -> np.ndarray:
    """One-pole high-pass: takes out rumble a narrator never needs."""
    a = np.exp(-2 * np.pi * freq / rate)
    out = np.empty_like(samples)
    prev_x = prev_y = 0.0
    for i, x in enumerate(samples):
        y = a * (prev_y + x - prev_x)
        out[i] = y
        prev_x, prev_y = x, y
    return out


def level(samples: np.ndarray) -> np.ndarray:
    """Same RMS for every line, then a soft limit on the peaks."""
    rms = np.sqrt(np.mean(samples**2))
    samples = samples * (10 ** (TARGET_RMS_DB / 20) / max(rms, 1e-9))
    ceiling = 10 ** (PEAK_DB / 20)
    return np.tanh(samples / ceiling) * ceiling


def fade(samples: np.ndarray, rate: int, seconds: float = 0.006) -> np.ndarray:
    n = min(len(samples) // 2, int(rate * seconds))
    ramp = np.linspace(0, 1, n)
    samples[:n] *= ramp
    samples[-n:] *= ramp[::-1]
    return samples


def write_wav(path: Path, samples: np.ndarray, rate: int) -> None:
    pcm = np.clip(samples * 32767, -32768, 32767).astype("<i2")
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(rate)
        f.writeframes(pcm.tobytes())


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    film = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--film=")), "student")
    folder, OUT = FILMS[film]
    SCRIPT, DURATIONS = folder / "script.json", folder / "durations.json"
    script = json.loads(SCRIPT.read_text())
    kokoro = Kokoro(str(MODELS / "kokoro-v1.0.onnx"), str(MODELS / "voices-v1.0.bin"))

    if "--phonemes" in sys.argv:
        for word in ["Scrapal", "Amara", "PhD", "master’s", "surcharge"]:
            print(f"{word:12} {kokoro.tokenizer.phonemize(word, script['language'])}")
        return

    OUT.mkdir(parents=True, exist_ok=True)
    durations = json.loads(DURATIONS.read_text()) if DURATIONS.exists() else {}
    for line in script["lines"]:
        if args and line["id"] not in args:
            continue
        spoken = line.get("say", line["text"])
        samples, rate = kokoro.create(spoken, voice=script["voice"], speed=script["speed"], lang=script["language"])
        samples = np.asarray(samples, dtype=np.float64)
        samples = fade(level(highpass(trim(samples, rate), rate)), rate)
        write_wav(OUT / f"{line['id']}.wav", samples, rate)
        durations[line["id"]] = round(len(samples) / rate, 3)
        words = len(spoken.split())
        print(f"{line['id']:18} {durations[line['id']]:6.2f}s  {words / durations[line['id']] * 60:5.0f} wpm  peak {db(np.max(np.abs(samples))):5.1f} dBFS")

    ordered = {line["id"]: durations[line["id"]] for line in script["lines"] if line["id"] in durations}
    DURATIONS.write_text(json.dumps(ordered, indent=2) + "\n")
    print(f"{sum(ordered.values()):.1f}s of narration across {len(ordered)} lines")


if __name__ == "__main__":
    main()
    # onnxruntime can abort while tearing down its thread pool at interpreter
    # exit, after every file is written. Leave before that can turn a good run
    # into a failed exit code.
    sys.stdout.flush()
    os._exit(0)
