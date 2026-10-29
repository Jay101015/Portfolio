"""The recording, tidied for the edit, and the edit's timing fitted to it (LEARNINGS.md, the b-roll and character demo).

- `fill_gated`: a phone or app noise gate leaves patches of digital silence (exact zeros) between words. Cut next to
  one, or played on its own, the sound drops to nothing and the viewer hears the edit. Each patch gets the room's own
  tone (the quietest stretch of the recording that has none of the patches in it), faded in and out.
- `tighten_pauses`: a pause longer than `longest` seconds is closed up to `keep` seconds (the middle taken out, at the
  quietest point), so a recorded hesitation does not sit as dead air. Before transcription, so every time after it
  (words, scenes, cues) is on the tightened recording. `pauses: keep` in the header leaves them.
- `snap_cuts`: a scene cut lands on the quietest moment between the last word of one scene and the first of the next,
  measured in the sound itself, not on the word times (a transcript's word times can run 0.4 s early in places, and a
  cut on them landed mid-word).
- `take_words`: the captions follow what was said, not the script, where the two differ by a small word or two ("a
  year" said for "per year" written, "comes to be around" for "comes to around"); the script keeps its figures and
  names, which a recogniser gets wrong ("$60,000" for "£60,000").
"""
from __future__ import annotations

import difflib
import re
import subprocess
from typing import Any

import numpy as np

SR = 48000


def read(path: str, sr: int = SR) -> np.ndarray:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(sr), "-f", "s16le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float64)


def write(path: str, x: np.ndarray, sr: int = SR) -> None:
    pcm = np.clip(np.round(x), -32768, 32767).astype(np.int16).tobytes()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "s16le", "-ar", str(sr), "-ac", "1", "-i", "-", path], input=pcm, check=True)


def zero_runs(x: np.ndarray, min_len: int) -> list[tuple[int, int]]:
    z = np.r_[0, (x == 0).astype(np.int8), 0]
    d = np.diff(z)
    return [(int(a), int(b)) for a, b in zip(np.nonzero(d == 1)[0], np.nonzero(d == -1)[0]) if b - a >= min_len]


def rms_db(x: np.ndarray, win: int) -> np.ndarray:
    n = len(x) // win
    if n == 0:
        return np.array([-120.0])
    frames = x[: n * win].reshape(n, win)
    return 20 * np.log10(np.sqrt((frames ** 2).mean(axis=1)) / 32768 + 1e-9)


def room_tone(x: np.ndarray, sr: int = SR, length: float = 0.5) -> np.ndarray | None:
    """the quietest `length` seconds of the recording with no gated silence in it (the room, between words)"""
    win = int(0.05 * sr)
    db = rms_db(x, win)
    need = int(length / 0.05)
    best, at = None, None
    for i in range(0, max(0, len(db) - need)):
        seg = x[i * win:(i + need) * win]
        if zero_runs(seg, sr // 1000):
            continue
        level = float(db[i:i + need].max())
        if level < -35 and (best is None or level < best):
            best, at = level, i
    return None if at is None else x[at * win:(at + need) * win].copy()


def _bed(tone: np.ndarray, n: int, xf: int) -> np.ndarray:
    out = np.zeros(n)
    ramp = np.linspace(0, 1, xf)
    pos = 0
    while pos < n:
        piece = tone.copy()
        piece[:xf] *= ramp
        piece[-xf:] *= ramp[::-1]
        k = min(len(piece), n - pos)
        out[pos:pos + k] += piece[:k]
        pos += len(piece) - xf
    return out


def fill_gated(src: str, dst: str, sr: int = SR) -> tuple[str, int]:
    """`src` with every run of digital silence over 5 ms filled with room tone; returns (path, runs filled)."""
    x = read(src, sr)
    runs = zero_runs(x, int(0.005 * sr))
    if not runs:
        return src, 0
    tone = room_tone(x, sr)
    if tone is None:
        return src, 0
    xf = int(0.015 * sr)
    for a, b in runs:
        lo, hi = max(0, a - xf), min(len(x), b + xf)
        bed = _bed(tone, hi - lo, min(xf, (len(tone) - 1) // 2))
        w = np.ones(hi - lo)  # 1 = room tone, fading to the recording at the edges of the patch
        if a > lo:
            w[: a - lo] = np.linspace(0, 1, a - lo)
        if hi > b:
            w[-(hi - b):] = np.linspace(1, 0, hi - b)
        x[lo:hi] = x[lo:hi] * (1 - w) + bed * w
    write(dst, x, sr)
    return dst, len(runs)


def silences(x: np.ndarray, sr: int, min_len: float) -> list[tuple[float, float]]:
    """stretches quieter than the room plus 12 dB (and under -40 dBFS) lasting at least `min_len` seconds"""
    win = int(0.02 * sr)
    db = rms_db(x, win)
    floor = float(np.percentile(db, 10))
    quiet = db < min(floor + 12, -40)
    out = []
    i = 0
    while i < len(quiet):
        if quiet[i]:
            j = i
            while j < len(quiet) and quiet[j]:
                j += 1
            if (j - i) * 0.02 >= min_len:
                out.append((i * 0.02, j * 0.02))
            i = j
        else:
            i += 1
    return out


def tighten_pauses(src: str, dst: str, longest: float = 0.7, keep: float = 0.4, sr: int = SR) -> tuple[str, float, list[tuple[float, float]]]:
    """`src` with every pause over `longest` seconds closed up to `keep` (the start of the recording is left to
    trim_lead); returns (path, seconds taken out, the stretches taken out in the original's seconds)."""
    x = read(src, sr)
    cut = [(a, b) for a, b in silences(x, sr, longest) if a > 0.05]
    removed: list[tuple[float, float]] = []
    if not cut:
        return src, 0.0, removed
    xf = int(0.01 * sr)
    pieces, last, gone = [], 0, 0.0
    for a, b in cut:
        # keep half of `keep` after the word that ends and half before the word that starts
        s0, s1 = int((a + keep / 2) * sr), int((b - keep / 2) * sr)
        if s1 - s0 < xf * 2:
            continue
        pieces.append(x[last:s0 + xf])
        last = s1 - xf
        gone += (s1 - s0) / sr
        removed.append((s0 / sr, s1 / sr))
    pieces.append(x[last:])
    out = pieces[0]
    ramp = np.linspace(0, 1, 2 * xf)
    for p in pieces[1:]:
        out = np.concatenate([out[:-2 * xf], out[-2 * xf:] * ramp[::-1] + p[:2 * xf] * ramp, p[2 * xf:]])
    write(dst, out, sr)
    return dst, gone, removed


def shift_time(t: float, removed: list[tuple[float, float]]) -> float:
    """a moment of the original recording on the tightened one"""
    gone = 0.0
    for a, b in removed:
        if t >= b:
            gone += b - a
        elif t > a:
            return round(a - gone, 3)
    return round(t - gone, 3)


def snap_cuts(sb: dict[str, Any], wav16k: str) -> int:
    """Every cut between two spoken scenes moved to the quietest 30 ms between the start of the last word before it
    and the first word after it (the word times can be early, so the search runs from the last word's start, not its
    end). Returns how many cuts moved."""
    x = read(wav16k, 16000)
    win = int(0.03 * 16000)
    moved = 0
    scenes = sb["scenes"]
    for prev, sc in zip(scenes, scenes[1:]):
        pw, nw = prev.get("words") or [], sc.get("words") or []
        if not pw or not nw:
            continue
        lo, hi = max(pw[-1]["s"], nw[0]["s"] - 0.7), nw[0]["s"] + 0.05
        a, b = int(lo * 16000), int(hi * 16000)
        if b - a < win * 2 or b > len(x):
            continue
        e = np.convolve(x[a:b] ** 2, np.ones(win) / win, mode="valid")
        t = round((a + int(e.argmin()) + win // 2) / 16000, 3)
        if t <= prev["start"] + 0.5 or abs(t - sc["start"]) < 0.02:
            continue
        prev["end"] = sc["start"] = t
        moved += 1
    return moved


SMALL = re.compile(r"^[a-z']{1,5}$")
FILLERS = {"um", "uh", "er", "erm", "hmm", "mm", "ah"}


def _n(w: str) -> str:
    return re.sub(r"[^\w']", "", w.lower())


def take_words(sb: dict[str, Any], transcript: list[dict[str, Any]]) -> int:
    """Each scene's caption words made to follow the take where it differs from the script by one or two small words
    (said instead, or said as well); figures, names and longer words stay as written. Returns words changed."""
    changed = 0
    for sc in sb["scenes"]:
        ws = sc.get("words") or []
        if not ws:
            continue
        said = [w for w in transcript if ws[0]["s"] - 0.3 <= w["s"] <= ws[-1]["e"] + 0.3]
        a, b = [_n(w["w"]) for w in ws], [_n(w["w"]) for w in said]
        out: list[dict[str, Any]] = []
        for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
            mine, theirs = ws[i1:i2], said[j1:j2]
            small = lambda xs, ns: 0 < len(xs) <= 2 and all(SMALL.match(n) and n not in FILLERS for n in ns)  # noqa: E731
            if op == "replace" and small(mine, a[i1:i2]) and small(theirs, b[j1:j2]):
                tail = re.search(r"[.,!?;:]+$", mine[-1]["w"])
                new = [dict(w=t["w"].strip(".,!?;:"), s=t["s"], e=t["e"]) for t in theirs]
                if tail:
                    new[-1]["w"] += tail.group(0)
                out += new
                changed += len(new)
            elif op == "insert" and small(theirs, b[j1:j2]) and out:
                out += [dict(w=t["w"].strip(".,!?;:"), s=t["s"], e=t["e"]) for t in theirs]
                changed += len(theirs)
            else:
                out += mine
        sc["words"] = out
    return changed
