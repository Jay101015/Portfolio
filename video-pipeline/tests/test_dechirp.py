"""pipeline/dechirp.py: a smoke alarm's chirp is found and notched out; speech-like sound without one is left alone."""
import numpy as np

from pipeline.dechirp import dechirp, find_chirps

SR = 48000


def _voice_like(seconds: float, seed: int = 1) -> np.ndarray:
    """Pink-ish noise with a buzzy 120 Hz harmonic stack: dense harmonics through 3 kHz like a voice, no lone tone."""
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    x = sum(np.sin(2 * np.pi * 120 * k * t + rng.uniform(0, 6.28)) / k for k in range(1, 60))
    x = x / np.abs(x).max() * 0.3
    return x + rng.normal(0, 0.003, n)


def _chirp(x: np.ndarray, at: float, dur: float = 0.15, level: float = 0.05) -> np.ndarray:
    t = np.arange(int(dur * SR)) / SR
    tone = level * np.sin(2 * np.pi * 3090 * t) * np.hanning(len(t))
    y = x.copy()
    s = int(at * SR)
    y[s:s + len(t)] += tone
    return y


def _band_db(x: np.ndarray, a: float, b: float) -> float:
    seg = x[int(a * SR):int(b * SR)] * np.hanning(int(b * SR) - int(a * SR))
    sp = np.abs(np.fft.rfft(seg)) ** 2
    f = np.fft.rfftfreq(len(seg), 1 / SR)
    return 10 * np.log10(sp[(f > 3000) & (f < 3200)].sum() + 1e-12)


def test_chirps_found_and_notched():
    x = _voice_like(8.0)
    x = _chirp(_chirp(x, 1.0, level=0.12), 5.5, level=0.06)
    found = find_chirps(x, SR)
    assert [round(a, 1) for a, _, _ in found] == [1.0, 5.5]
    assert all(3000 < f0 < 3200 for _, _, f0 in found)
    y, chirps = dechirp(x, SR)
    assert len(chirps) == 2
    assert _band_db(x, 1.0, 1.15) - _band_db(y, 1.0, 1.15) > 20  # the chirp is gone
    assert np.allclose(x[int(3 * SR):int(4 * SR)], y[int(3 * SR):int(4 * SR)])  # the rest is untouched


def test_no_chirp_nothing_changes():
    x = _voice_like(6.0, seed=2)
    y, chirps = dechirp(x, SR)
    assert chirps == []
    assert y is x
