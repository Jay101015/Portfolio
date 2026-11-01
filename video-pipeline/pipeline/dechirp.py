"""Take a smoke alarm's low-battery chirp out of a recording.

A chirp is a warbling tone around 3.1 kHz, 100 to 300 ms long, with a faint harmonic near 6.2 kHz, once every 30 to
60 seconds. It stands 13 dB or more above the bands either side of it, which speech never does for that long. Every
chirp is found from that, then a band-stop (2.85 to 3.35 kHz and 5.95 to 6.45 kHz) is applied only inside a gated
window around it, faded in and out over 20 ms. The rest of the recording is untouched, and 500 Hz missing from a
fifth of a second of speech cannot be heard.

    python3 -m pipeline.dechirp in.wav out.wav        # prints every chirp it treated
"""
from __future__ import annotations

import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfiltfilt, stft

TONE = (2980, 3220)  # where the chirp's peak sits
SIDES = ((2500, 2800), (3450, 3800))  # the bands it must stand clear of
STOPS = ((2850, 3350), (5950, 6450))  # what the gate removes
NARROW_DB = 13  # how far above both sides the peak must stand
MIN_DUR = 0.05  # seconds


def find_chirps(x: np.ndarray, sr: int) -> list[tuple[float, float, float]]:
    """(start, end, frequency) of every chirp in a mono float signal."""
    f, t, Z = stft(x, sr, nperseg=8192, noverlap=8192 - 480)
    db = 10 * np.log10(np.abs(Z) ** 2 + 1e-12)

    def band(lo, hi):
        return db[(f >= lo) & (f <= hi)].max(axis=0)

    sel = (f >= TONE[0]) & (f <= TONE[1])
    tone = db[sel].max(axis=0)
    tf = f[sel][db[sel].argmax(axis=0)]
    narrow = tone - np.maximum(band(*SIDES[0]), band(*SIDES[1]))
    floor = np.median(tone) - 10  # only rules out digital silence; standing clear of the sides is the real test
    hits = np.where((narrow > NARROW_DB) & (tone > floor))[0]
    groups: list[list[int]] = []
    for i in hits:
        if groups and i - groups[-1][-1] <= 4:
            groups[-1].append(i)
        else:
            groups.append([i])
    hop = t[1] - t[0]
    out = []
    for g in groups:
        a, b = float(t[g[0]]), float(t[g[-1]] + hop)
        if b - a >= MIN_DUR:
            out.append((a, b, float(np.median(tf[g]))))
    return out


def dechirp(x: np.ndarray, sr: int, pad: float = 0.04, ramp: float = 0.02) -> tuple[np.ndarray, list[tuple[float, float, float]]]:
    chirps = find_chirps(x, sr)
    if not chirps:
        return x, []
    sos = [butter(4, list(lo_hi), "bandstop", fs=sr, output="sos") for lo_hi in STOPS]
    y = x.copy()
    r = int(ramp * sr)
    for a, b, _ in chirps:
        s0, s1 = max(int((a - pad) * sr), 0), min(int((b + pad) * sr), len(x))
        reg0, reg1 = max(s0 - sr // 2, 0), min(s1 + sr // 2, len(x))
        seg = x[reg0:reg1]
        for s in sos:
            seg = sosfiltfilt(s, seg)
        env = np.ones(s1 - s0)
        env[:r] = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, r))
        env[-r:] = env[:r][::-1]
        y[s0:s1] = x[s0:s1] * (1 - env) + seg[s0 - reg0:s1 - reg0] * env
    return y, chirps


def dechirp_file(src: str, dst: str) -> list[tuple[float, float, float]]:
    sr, x = wavfile.read(src)
    scale = 32768.0 if x.dtype == np.int16 else 1.0
    x = x.astype(np.float64) / scale
    if x.ndim > 1:
        x = x.mean(axis=1)
    y, chirps = dechirp(x, sr)
    wavfile.write(dst, sr, np.clip(y, -1, 1).astype(np.float32))
    return chirps


if __name__ == "__main__":
    for a, b, f0 in dechirp_file(sys.argv[1], sys.argv[2]):
        print(f"chirp {a:7.2f}-{b:7.2f}s  {f0:.0f} Hz")
