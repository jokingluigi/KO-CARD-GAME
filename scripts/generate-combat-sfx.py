"""Generate original, short, layered PCM hit sounds for the four damage brackets."""
import wave
from pathlib import Path
import numpy as np
from scipy.signal import butter, sosfilt

RATE = 22050
ROOT = Path(__file__).resolve().parents[1] / 'artifacts/ko-game/public/sfx'
RNG = np.random.default_rng(194704)


def band_noise(length, low, high):
    source = RNG.standard_normal(length)
    return sosfilt(butter(3, [low, high], btype='bandpass', fs=RATE, output='sos'), source)


def render(name, length, strength):
    samples = int(RATE * length)
    t = np.arange(samples) / RATE
    hit = np.zeros(samples)
    # The initial crack is dry and broad. It carries the attack; no tonal 'pop'.
    crack = band_noise(samples, 480, min(8000, 5000 + strength * 450))
    hit += (0.80 + strength * 0.08) * crack * np.exp(-t * (165 - strength * 13))
    body = band_noise(samples, 85, 1250)
    hit += (0.65 + strength * 0.10) * body * np.exp(-t * (36 - strength * 4))
    # Short, distorted low thud with falling pitch and zero-crossing fade.
    phase = 2 * np.pi * (54 * t + (67 + strength * 9) * (1 - np.exp(-t * 55)) / 55)
    low = np.tanh(2.5 * np.sin(phase)) * np.exp(-t * (29 - strength * 3))
    hit += (0.65 + strength * 0.16) * low
    for delay in ([0.019] if strength == 1 else [0.016, 0.037] if strength == 2 else [0.016, 0.034, 0.061]):
        start = int(RATE * delay)
        n = samples - start
        if n <= 0:
            continue
        debris = band_noise(n, 650, 6500)
        hit[start:] += 0.11 * strength * debris * np.exp(-np.arange(n) / RATE * (70 - strength * 5))
    if strength >= 3:
        rumble = band_noise(samples, 32, 270)
        hit += 0.11 * strength * rumble * np.exp(-t * 13)
    # Gentle saturated body and a fast noise tail, without reverb or a pitched boing.
    hit = np.tanh(hit * 1.9)
    hit[:32] *= np.linspace(0, 1, 32)
    hit[-min(400, samples):] *= np.linspace(1, 0, min(400, samples))
    hit *= 0.92 / max(abs(hit).max(), 0.001)
    with wave.open(str(ROOT / name), 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes((hit * 32767).astype('<i2').tobytes())


for name, duration, strength in [
    ('combat-hit-1-2.wav', .24, 1),
    ('combat-hit-3-5.wav', .32, 2),
    ('combat-hit-6-9.wav', .43, 3),
    ('combat-hit-10-plus.wav', .57, 4),
    ('combat-finisher.wav', .85, 5),
]:
    render(name, duration, strength)
