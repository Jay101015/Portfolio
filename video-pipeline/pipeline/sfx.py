"""Sound effects under the voice: small sounds on the things that happen on screen, so every event is heard as well
as seen. Not music (the channel has none): a soft whoosh on a cut, a pop when a card lands, a pen scribble as a
board starts writing, a light ding on the key number (where the picture punches in). All made here from numbers, so
there is nothing to download or license, and all well under the voice (the loudest is about 22 dB below it).

    set_punches(sb)                       # scene["punch"]: the time of the key number in money and hook scenes
    lay(track, sb, out) -> out            # the voice track with the effects mixed in (48 kHz mono wav)

`sfx: off` in a script's header turns the effects off for that video (sb["sfx"] False); the punch-ins stay.
"""
from __future__ import annotations

import re
from functools import lru_cache

import numpy as np

from .voice import SR, read, write

# the scenes whose key number gets a punch-in and a ding
PUNCH_TYPES = {"hook", "stat", "bite", "grow", "shrink", "pie", "compare"}
# the scenes that open by writing on the board
WRITE_TYPES = {"hook", "text", "takeaway", "recap", "list", "quote"}
NUMBER_WORDS = {
    "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen",
    "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty", "fifty",
    "sixty", "seventy", "eighty", "ninety", "hundred", "thousand", "million", "billion", "half", "double",
    "triple", "quarter", "grand",  # "percent" is the unit after a number, never a number ("a few percent" is not one)
}
# peak level of each sound, relative to full scale, before the whole track is levelled to -14 LUFS (a voice peaks
# around 0.5 to 0.9 here): a cut and a card are felt more than heard, the ding is the one you notice
GAIN = {"whoosh": 0.07, "pop": 0.10, "scribble": 0.045, "ding": 0.09}


JOINERS = {"point", "and", "a"}  # inside a number only: "seven point six", "one thousand four hundred and six", "a hundred"


def _is_number(word: str) -> bool:
    """a spoken number: digits, or a number word ("thirty-nine" counts: either half is one), but never a year"""
    w = re.sub(r"[^a-z0-9£$%.\-]", "", word.lower())
    if re.fullmatch(r"(19|20)\d\d", w.strip("£$%.")):
        return False
    if re.search(r"\d", w):
        return True
    return any(p.strip(".") in NUMBER_WORDS or p.strip(".").rstrip("s") in NUMBER_WORDS for p in w.split("-"))


UNITS = {w: i for i, w in enumerate(["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
                                      "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"])}
TENS = {"twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90}
SCALES = {"hundred": 100, "thousand": 1000, "grand": 1000, "million": 1_000_000, "billion": 1_000_000_000}


def spoken_value(run: list[dict]) -> float | None:
    """What a run of spoken number words says: "thirty-nine thousand three hundred" 39300, "seven point six" 7.6,
    "a hundred" 100, "£1,406" 1406. None when it cannot be read as one figure."""
    total, cur, dec = 0.0, 0.0, ""
    after_point = False
    for w in run:
        for tok in re.sub(r"[^a-z0-9£$%.\-]", "", str(w.get("w", "")).lower()).split("-"):
            tok = tok.strip("£$%.")
            if not tok:
                continue
            if re.fullmatch(r"\d[\d,]*(\.\d+)?", tok):
                cur += float(tok.replace(",", ""))
            elif after_point and tok in UNITS:
                dec += str(UNITS[tok])
            elif tok == "point":
                after_point = True
            elif tok in ("a", "an"):
                cur = cur or 1
            elif tok in UNITS:
                cur += UNITS[tok]
            elif tok in TENS:
                cur += TENS[tok]
            elif tok == "hundred":
                cur = (cur or 1) * 100
            elif tok in SCALES:
                total += (cur or 1) * SCALES[tok]
                cur = 0
            elif tok == "half":
                cur += 0.5
            elif tok == "quarter":
                cur += 0.25
            elif tok in ("and", "percent", "pounds", "pound", "dollars", "p", "k"):
                continue
            else:
                return None
    v = total + cur
    return float(f"{int(v)}.{dec}") if dec else v


def figure_on_screen(props: dict) -> float | None:
    """the number the scene shows (its value, the shrink's `to`, a bite's `lose`, the hook line's figure)"""
    for k in ("value", "to", "lose", "from", "board", "label"):
        m = re.search(r"\d[\d,]*(?:\.\d+)?", str(props.get(k) or ""))
        if m:
            return float(m.group(0).replace(",", ""))
    return None


def key_number(words: list[dict], props: dict | None = None) -> dict | None:
    """The word that starts the scene's key number: the spoken run that says the figure on screen ("thirteen hundred"
    for a £1,300 stat, not the "thirty-nine thousand" salary before it); failing that, the longest run of number
    words (a year never counts, and "one" on its own is a pronoun as often as a figure, so a lone "one" loses to any
    real figure). "Since 2021, prices have gone up about thirty percent": "thirty"."""
    runs: list[list[dict]] = []
    cur: list[dict] = []
    for w in words:
        text = str(w.get("w", ""))
        clean = re.sub(r"[^a-z]", "", text.lower())
        if _is_number(text) and w.get("s") is not None:
            cur.append(w)
        elif cur and clean in JOINERS:
            cur.append(w)
        else:
            if cur:
                runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    shown = figure_on_screen(props or {})
    scored = []
    for r in runs:
        while r and re.sub(r"[^a-z]", "", str(r[-1]["w"]).lower()) in JOINERS:  # a trailing joiner is not part of it
            r = r[:-1]
        if not r:
            continue
        said = spoken_value(r)
        if shown is not None and said is not None and abs(said - shown) <= max(0.051, shown * 0.005):
            return r[0]
        lone_one = len(r) == 1 and re.sub(r"[^a-z]", "", str(r[0]["w"]).lower()) in ("one", "a")
        scored.append((0 if lone_one else len(r), r[0]))
    if not scored:
        return None
    best = max(s for s, _ in scored)
    return next(w for s, w in scored if s == best)


def set_punches(sb: dict, gap: float = 6.0) -> int:
    """Give each money or hook scene a punch-in (scene["punch"], absolute seconds) on its key number, at most one
    every `gap` seconds across the video so it stays an accent, not a habit. Returns how many."""
    last = -1e9
    n = 0
    for sc in sb.get("scenes", []):
        sc.pop("punch", None)
        if sc.get("type") not in PUNCH_TYPES:
            continue
        w = key_number(sc.get("words") or [], sc.get("props") or {})
        if w is None:
            continue
        t = float(w["s"])
        if t - last >= gap and float(sc["start"]) <= t < float(sc["end"]) - 0.5:
            sc["punch"] = round(t, 3)
            last = t
            n += 1
    return n


def events(sb: dict) -> list[tuple[float, str, float]]:
    """(time, sound, length) for every effect in the video, earliest first."""
    out: list[tuple[float, str, float]] = []
    scenes = sb.get("scenes", [])
    last_whoosh = -1e9
    for i, sc in enumerate(scenes):
        start, end = float(sc["start"]), float(sc["end"])
        if i > 0 and start - last_whoosh >= 1.5 and sc.get("props", {}).get("cont") != "on":  # a continued preview is no cut
            out.append((max(0.0, start - 0.12), "whoosh", 0.45))  # the swish peaks on the cut itself
            last_whoosh = start
        if sc.get("type") in WRITE_TYPES:
            out.append((start + 0.08, "scribble", min(1.1, max(0.4, (end - start) * 0.25))))
        if sc.get("punch") is not None:
            out.append((float(sc["punch"]) + 0.03, "ding", 0.9))
        for cue in sc.get("cues") or []:
            if cue.get("do") == "card" and cue.get("t") is not None:
                out.append((float(cue["t"]), "pop", 0.12))
    out.sort()
    # a pop right on top of a ding or another pop is one sound too many
    kept: list[tuple[float, str, float]] = []
    for ev in out:
        if ev[1] == "pop" and any(k[1] in ("pop", "ding") and abs(k[0] - ev[0]) < 0.2 for k in kept[-3:]):
            continue
        kept.append(ev)
    return kept


# ------------------------------------------------------------------ the sounds themselves


def _biquad_bandpass(x: np.ndarray, f: np.ndarray, q: float) -> np.ndarray:
    """a band-pass filter whose centre frequency moves sample by sample (f, Hz)"""
    y = np.zeros_like(x)
    x1 = x2 = y1 = y2 = 0.0
    for i in range(len(x)):
        w0 = 2 * np.pi * f[i] / SR
        alpha = np.sin(w0) / (2 * q)
        a0 = 1 + alpha
        b0, b2 = alpha / a0, -alpha / a0
        a1, a2 = -2 * np.cos(w0) / a0, (1 - alpha) / a0
        yi = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, x[i], y1, yi
        y[i] = yi
    return y


def _norm(x: np.ndarray) -> np.ndarray:
    m = float(np.max(np.abs(x))) or 1.0
    return x / m


@lru_cache(maxsize=None)
def _whoosh(length: float = 0.45) -> np.ndarray:
    n = int(SR * length)
    t = np.linspace(0, 1, n)
    rng = np.random.default_rng(7)
    noise = rng.standard_normal(n)
    # the air rushes past: the band sweeps up and back down, loudest a little after the middle
    f = 350 + 2200 * np.sin(np.pi * t) ** 1.5
    env = np.sin(np.pi * np.clip(t * 1.1, 0, 1)) ** 2
    return _norm(_biquad_bandpass(noise, f, 1.2) * env)


@lru_cache(maxsize=None)
def _pop(length: float = 0.12) -> np.ndarray:
    n = int(SR * length)
    t = np.arange(n) / SR
    # a soft bubble pop: a pitch that drops fast under a short decay, with a tiny click on the front
    freq = 260 + 700 * np.exp(-t / 0.018)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    tone = np.sin(phase) * np.exp(-t / 0.035)
    click = np.zeros(n)
    click[: int(SR * 0.002)] = np.hanning(int(SR * 0.002) * 2)[: int(SR * 0.002)] * 0.4
    return _norm(tone + click)


@lru_cache(maxsize=None)
def _scribble_full(length: float = 1.1) -> np.ndarray:
    n = int(SR * length)
    t = np.arange(n) / SR
    rng = np.random.default_rng(11)
    noise = rng.standard_normal(n)
    # a marker on a whiteboard: bright hiss, in strokes of uneven length (about 7 a second)
    hiss = _biquad_bandpass(noise, np.full(n, 3200.0), 0.9)
    strokes = 0.55 + 0.45 * np.sin(2 * np.pi * (6.5 * t + 0.6 * np.sin(2 * np.pi * 1.3 * t)))
    strokes = np.clip(strokes, 0, 1) ** 1.5
    return _norm(hiss * strokes * np.clip(np.minimum(1, t / 0.04), 0, 1))


def _scribble(length: float = 0.8) -> np.ndarray:
    """the first `length` seconds of the scribble, faded out at the end (one filtered sound, sliced: each distinct
    length used to be its own 38,000-sample Python filter loop)"""
    n = int(SR * length)
    x = _scribble_full()[:n].copy()
    t = np.arange(n) / SR
    return _norm(x * np.clip(np.minimum(1, (length - t) / 0.12), 0, 1))


@lru_cache(maxsize=None)
def _ding(length: float = 0.9) -> np.ndarray:
    n = int(SR * length)
    t = np.arange(n) / SR
    # a light bell (E6 and B6 with a faint upper partial), quick attack, half-second ring
    tone = np.sin(2 * np.pi * 1318.5 * t) + 0.6 * np.sin(2 * np.pi * 1975.5 * t) + 0.15 * np.sin(2 * np.pi * 3951 * t)
    env = np.minimum(1, t / 0.004) * np.exp(-t / 0.22)
    return _norm(tone * env)


def _sound(kind: str, length: float) -> np.ndarray:
    length = round(length, 2)
    return {"whoosh": _whoosh, "pop": _pop, "scribble": _scribble, "ding": _ding}[kind](length)


def lay(track: str, sb: dict, out: str) -> str:
    """`out`: the track (48 kHz mono wav) with every effect mixed in at its place. Returns `out`, or `track` when
    the video has effects turned off or has none."""
    if sb.get("sfx") is False:
        return track
    evs = events(sb)
    if not evs:
        return track
    x = read(track)  # 16-bit scale
    for t, kind, length in evs:
        s = _sound(kind, length) * GAIN[kind] * 32767
        i = int(round(t * SR))
        if i >= len(x):
            continue
        j = min(len(x), i + len(s))
        x[i:j] += s[: j - i]
    write(out, x)
    return out
