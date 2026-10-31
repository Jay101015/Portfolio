"""What lands on the page beyond the script's own tags, so the eye is never idle (the director's first rule):
- key words: the figures said pop up big as they are said (scene["keys"]), on scenes where they are not already the
  picture, and never where a card already carries them;
- cards for empty stretches: a board that runs more than six seconds with nothing landing gets cards from the
  figures it says;
- marks on footage and photos: `marks="circle 62,40@price; arrow 30,70@word; note:the bit that matters 50,80@word"`,
  drawn on the clip at that point (per cent of the picture) on the word, red unless the spec says green or ink.
Runs after the words have their times (build.py), before the storyboard is written.
"""
from __future__ import annotations

import re

from . import sfx
from .setpiece import COST_WORDS, anchor_word

KEY_TYPES = {"text", "stat", "chart", "compare", "shrink", "grow", "bite", "pie", "news", "list", "quote", "broll", "still", "image"}
BOARD_TYPES = {"text", "stat", "chart", "compare", "shrink", "grow", "bite", "pie", "news", "list", "quote"}
LOOPS = {"coins-jar", "stack-grow", "arrow-up", "clock", "plant-grow"}
MARK_RE = re.compile(r"^(?:(red|green|ink):\s*)?(circle|arrow|note(?::([^@]*?))?)\s+(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:@(.+))?$", re.I)
KEY_GAP = 2.5  # seconds between key words on one scene
CARD_EVERY = 6.0  # a landing at least this often on a board


def _clean(w: str) -> str:
    return re.sub(r"[^a-z0-9£$%.\-]", "", str(w).lower())


def number_runs(words: list[dict]) -> list[tuple[int, int]]:
    """(first, after-last) word indices of every spoken number: "thirty percent", "one thousand four hundred and six"."""
    runs: list[tuple[int, int]] = []
    i0 = None
    for i, w in enumerate(words):
        text = str(w.get("w", ""))
        if sfx._is_number(text) and w.get("s") is not None:
            if i0 is None:
                i0 = i
        elif i0 is not None and re.sub(r"[^a-z]", "", text.lower()) in sfx.JOINERS:
            continue
        else:
            if i0 is not None:
                runs.append((i0, i))
            i0 = None
    if i0 is not None:
        runs.append((i0, len(words)))
    out = []
    for a, b in runs:
        while b > a and re.sub(r"[^a-z]", "", str(words[b - 1]["w"]).lower()) in sfx.JOINERS:
            b -= 1
        if b > a:
            out.append((a, b))
    return out


def figure_text(words: list[dict], i0: int, i1: int) -> tuple[str, float] | None:
    """The figure as it would be written ("thirty percent" -> "30%", "eighty-three grand" -> "£83,000", "seven point
    six times" -> "7.6×", "two hundred pounds a month" -> "£200 a month"), with its value; None when it is not a
    figure worth a card (a small plain count: "two things")."""
    v = sfx.spoken_value(words[i0:i1])
    if v is None:
        return None
    toks = [_clean(w["w"]) for w in words[i0:i1]]
    after = [re.sub(r"[^a-z%]", "", str(w.get("w", "")).lower()) for w in words[i1:i1 + 3]]
    nxt = after[0] if after else ""
    pct = "percent" in toks or any(x.endswith("%") for x in toks) or nxt in ("percent", "%")
    pounds = any(x.startswith("£") for x in toks) or any(x in ("grand", "quid", "pounds", "pound") for x in toks) or nxt in ("pounds", "pound", "quid", "grand")
    times = nxt in ("times", "x")
    num = f"{int(round(v)):,}" if abs(v - round(v)) < 1e-9 else f"{v:g}"
    rest = after[1:] if nxt in ("pounds", "pound", "quid", "grand", "percent") else after
    tail = " a year" if rest[:2] in (["a", "year"], ["per", "year"]) else " a month" if rest[:2] in (["a", "month"], ["per", "month"]) else ""
    if pounds and nxt in ("pound", "pounds", "quid") and len(after) > 1:
        pence = sfx.spoken_value([words[i1 + 1]]) if i1 + 1 < len(words) and sfx._is_number(str(words[i1 + 1]["w"])) else None  # "fifty", not "a"
        if pence is not None and 0 < pence < 100 and not sfx._is_number(str(words[i1 + 2]["w"]) if i1 + 2 < len(words) else ""):
            return f"£{v + pence / 100:.2f}" + tail, v + pence / 100  # "three pound fifty"
    if pct:
        return f"{num}%" + tail, v
    if pounds:
        return f"£{num}" + tail, v
    if times:
        return f"{num}×", v
    if nxt in UNITS:  # "eighteen years", "ten minutes": the unit makes the figure
        if len(after) > 1 and after[1] in ("old", "olds"):
            return None  # "twenty-four year olds": an age, not a figure
        return f"{num} {nxt}", v
    if v < 1000:
        return None  # "22", "39": a bare small number says nothing on its own
    return num + tail, v


def _card_values(cues: list[dict]) -> list[tuple[float, float]]:
    """(time, value) of every figure already on a card: "£83K" 83000, "7.6×" 7.6, "30%" 30."""
    out = []
    for c in cues:
        if c.get("do") != "card":
            continue
        for text in (c.get("text"), c.get("old")):
            for m in re.finditer(r"(\d[\d,]*(?:\.\d+)?)\s*(k|m|bn)?", str(text or ""), re.I):
                v = float(m.group(1).replace(",", ""))
                v *= {"k": 1e3, "m": 1e6, "bn": 1e9}.get((m.group(2) or "").lower(), 1)
                out.append((float(c.get("t", 0)), v))
    return out


def _same(a: float, b: float) -> bool:
    return abs(a - b) <= max(0.051, abs(b) * 0.005)


def _cost(words: list[dict], i0: int) -> bool:
    before = " ".join(str(w.get("w", "")) for w in words[max(0, i0 - 6):i0])
    return bool(COST_WORDS.search(before))


def auto_cards(sc: dict) -> int:
    """Cards from the figures said, on a board that runs on with nothing landing. Returns how many were added."""
    if sc.get("type") not in BOARD_TYPES:
        return 0
    start, end = float(sc["start"]), float(sc["end"])
    dur = end - start
    if dur < CARD_EVERY:
        return 0
    words = sc.get("words") or []
    cues = sc.setdefault("cues", [])
    existing = [c for c in cues if c.get("do") == "card"]
    needed = int((dur - 2.0) // CARD_EVERY) - len(existing)
    if needed <= 0:
        return 0
    shown = _shown_values(sc.get("props") or {})
    have = _card_values(existing)
    lands = sorted(float(c["t"]) for c in existing)
    added = 0
    for i0, i1 in number_runs(words):
        if added >= needed:
            break
        fig = figure_text(words, i0, i1)
        if fig is None:
            continue
        text, v = fig
        t = round(max(start, float(words[i0]["s"]) - 0.08), 3)
        if t < start + 0.5 or t > end - 0.8:
            continue
        if any(_same(v, sv) for sv in shown):
            continue  # the scene's own figures are the picture already
        if any(_same(v, hv) for _, hv in have) or any(abs(t - lt) < 4.0 for lt in lands):
            continue
        cues.append({"t": t, "do": "card", "text": text, "color": "red" if _cost(words, i0) else "green", "auto": True})
        lands.append(t)
        have.append((t, v))
        added += 1
    cues.sort(key=lambda c: float(c.get("t", 0)))
    return added


EMPHASIS = {"free", "never", "nothing", "double", "everything"}
UNITS = {"years", "year", "months", "month", "weeks", "week", "days", "day", "hours", "hour", "minutes", "minute"}


def _shown_values(props: dict) -> list[float]:
    """every figure already written on the scene (its value, lines, label, note): a key or card never repeats one"""
    out = []
    for k in ("value", "to", "lose", "from", "board", "label", "sub", "note", "title", "headline", "bars", "data", "rows", "left", "right", "items"):
        for m in re.finditer(r"(\d[\d,]*(?:\.\d+)?)\s*(k|m|bn)?\b", str(props.get(k) or ""), re.I):
            out.append(float(m.group(1).replace(",", "")) * {"k": 1e3, "m": 1e6, "bn": 1e9}.get((m.group(2) or "").lower(), 1))
    return out


def key_words(sc: dict) -> int:
    """scene["keys"]: the figures said, popping up as they are said, where nothing on the page already shows them."""
    sc.pop("keys", None)
    if sc.get("type") not in KEY_TYPES or str((sc.get("props") or {}).get("next", "")) == "on":
        return 0
    words = sc.get("words") or []
    start, end = float(sc["start"]), float(sc["end"])
    shown = _shown_values(sc.get("props") or {})
    have = _card_values(sc.get("cues") or [])
    keys: list[dict] = []
    last = -1e9
    for i0, i1 in number_runs(words):
        fig = figure_text(words, i0, i1)
        if fig is None:
            continue
        text, v = fig
        t = round(float(words[i0]["s"]), 3)
        if t - last < KEY_GAP or t > end - 0.6:
            continue
        if any(_same(v, sv) for sv in shown):
            continue
        if any(_same(v, hv) and abs(t - ht) < 2.0 for ht, hv in have):
            continue
        keys.append({"t": t, "text": text, "color": "red" if _cost(words, i0) else "ink"})
        last = t
    used = 0
    for i, w in enumerate(words):
        if used:
            break
        clean = re.sub(r"[^a-z]", "", str(w.get("w", "")).lower())
        if clean in EMPHASIS and w.get("s") is not None:
            t = round(float(w["s"]), 3)
            if all(abs(t - k["t"]) >= KEY_GAP for k in keys) and start + 0.5 < t < end - 0.6:
                keys.append({"t": t, "text": clean, "color": "green" if clean == "free" else "ink"})
                used = 1
    keys.sort(key=lambda k: k["t"])
    if keys:
        sc["keys"] = keys
    return len(keys)


def plan_marks(sc: dict, attrs: dict) -> list[str]:
    """`marks=` on footage or a photo: word-indexed until the words are timed (time_cues turns them into cues)."""
    spec = str(attrs.get("marks", "")).strip()
    if not spec:
        return []
    problems: list[str] = []
    marks = []
    for raw in [m.strip() for m in spec.split(";") if m.strip()]:
        m = MARK_RE.match(raw)
        if not m:
            problems.append(f"scene {sc.get('id', '?')}: mark '{raw}' is not 'circle|arrow|note:text x,y@word'")
            continue
        color, kind, text, x, y, anchor = m.groups()
        kind = kind.split(":")[0].lower()
        marks.append({"anchor": anchor or (text or "").split()[0] if (anchor or text) else "", "mark": {"kind": kind, "x": float(x), "y": float(y), "color": (color or "red").lower(), **({"text": text.strip()} if text else {})}})
    for mk in marks:  # each mark finds its own word: marks on one picture are not in any order
        anchor_word([mk], sc["narration"])
    sc["markWords"] = [{"word": mk["word"], "mark": mk["mark"]} for mk in marks]
    return problems


def ration(sb: dict) -> str | None:
    """The character is rationed to one set piece a video until his animated clips exist: more reads as a template."""
    n = sum(1 for sc in sb.get("scenes", []) if sc.get("type") == "set")
    if n > 1:
        return f"WARNING: {n} set pieces: the character is rationed to one a video (the stop-motion poses read as choppy) until his animated clips are in the library"
    return None


def enrich(sb: dict) -> list[str]:
    """Auto cards, then key words (which skip what the cards carry). Returns the notes to print."""
    cards = sum(auto_cards(sc) for sc in sb.get("scenes", []))
    keys = sum(key_words(sc) for sc in sb.get("scenes", []))
    notes = [f"auto cards: {cards} added on boards that ran on with nothing landing; key words: {keys} pop up as they are said"]
    r = ration(sb)
    if r:
        notes.append(r)
    return notes
