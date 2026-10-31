"""A downloaded stock clip is checked before it is used, so the finder never settles for a clip that reads badly on
the board: one that barely moves (a photo sold as video), one too dark to read, one letterboxed, or one with
lettering or a logo burned in (the reviewers caught a "SAVE MONEY" title under the cards twice). Measured from a
handful of frames with ffmpeg and numpy, no model: a static high-contrast patch in a moving picture is an overlay.

    python3 -m pipeline.footage_gate <clip.mp4>     prints the measures and the verdict
"""
from __future__ import annotations

import subprocess
import sys

import numpy as np

W, H = 320, 180
MIN_MOTION = 1.2  # mean grey change between frames a second apart (0..255): under this it is a still
MIN_LUMA = 38.0  # mean brightness: under this the picture is mud on the board
BAR_SHARE = 0.08  # black bands this tall at top and bottom on every frame: letterboxed
OVERLAY_SHARE = 0.012  # this share of the picture high-contrast and static while the rest moves: lettering or a logo


def frames(path: str, n: int = 6) -> np.ndarray:
    """`n` grey frames spread over the clip, W x H."""
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True).stdout.strip()
    dur = max(0.2, float(out or 1.0))
    step = max(0.2, dur / n)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf", f"fps=1/{step:.3f},scale={W}:{H}", "-pix_fmt", "gray", "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
    k = len(raw) // (W * H)
    return np.frombuffer(raw[: k * W * H], np.uint8).reshape(k, H, W).astype(np.float32)


def measure(fr: np.ndarray) -> dict:
    if len(fr) < 2:
        return {"motion": 0.0, "luma": float(fr.mean()) if len(fr) else 0.0, "bars": 0.0, "overlay": 0.0}
    motion = float(np.mean([np.abs(fr[i + 1] - fr[i]).mean() for i in range(len(fr) - 1)]))
    luma = float(fr.mean())
    rows = fr.mean(axis=(0, 2))  # brightness per row, over all frames
    dark = rows < 14
    top = int(np.argmax(~dark)) if (~dark).any() else H
    bottom = int(np.argmax(~dark[::-1])) if (~dark).any() else H
    bars = (top + bottom) / H
    # strong local contrast that does not move: an edge present in every frame
    edges = np.abs(np.diff(fr, axis=2))[:, :, :-1] + np.abs(np.diff(fr, axis=1))[:, :, :-1][:, :-1, :] if False else None
    ex = np.abs(fr[:, :, 1:] - fr[:, :, :-1])[:, :-1, :]
    ey = np.abs(fr[:, 1:, :] - fr[:, :-1, :])[:, :, :-1]
    strong = (np.maximum(ex, ey) > 80)
    static = strong.all(axis=0)
    overlay = float(static.mean()) if motion >= MIN_MOTION else 0.0
    return {"motion": round(motion, 2), "luma": round(luma, 1), "bars": round(bars, 3), "overlay": round(overlay, 4)}


def verdict(m: dict) -> str | None:
    """why the clip should not be used, or None when it is fine"""
    if m["luma"] < MIN_LUMA:
        return f"too dark (brightness {m['luma']})"
    if m["motion"] < MIN_MOTION:
        return f"barely moves (motion {m['motion']}): a photo sold as video"
    if m["bars"] >= BAR_SHARE:
        return f"letterboxed (black bands {m['bars']:.0%} of the height)"
    if m["overlay"] >= OVERLAY_SHARE:
        return f"lettering or a logo burned in ({m['overlay']:.1%} of the picture is a static edge while the rest moves)"
    return None


def check(path: str) -> tuple[dict, str | None]:
    """the measures and why the clip fails, or None; a file ffmpeg cannot read is left unchecked (measures empty)"""
    try:
        m = measure(frames(path))
    except (subprocess.CalledProcessError, ValueError, OSError):
        return {}, None
    return m, verdict(m)


if __name__ == "__main__":
    for p in sys.argv[1:]:
        m, why = check(p)
        print(p, m, "->", why or "ok")
