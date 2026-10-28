"""the final mix: longest run of exact zeros, and the level at each segment join"""
import subprocess, numpy as np, sys
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', sys.argv[1], '-ac', '1', '-ar', '48000', '-f', 's16le', '-'], capture_output=True).stdout
x = np.frombuffer(raw, np.int16).astype(np.float64)
z = np.r_[0, (x == 0).astype(int), 0]; d = np.diff(z); runs = np.nonzero(d == -1)[0] - np.nonzero(d == 1)[0]
print('length', len(x) / 48000, 'longest zero run ms', runs.max(initial=0) / 48)
n = 2400; db = 20 * np.log10(np.sqrt(np.convolve(x ** 2, np.ones(n) / n, 'valid')[::n]) / 32768 + 1e-9)
print('quietest 50ms windows dB', np.sort(db)[:5].round(1))
