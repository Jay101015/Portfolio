"""Set pieces: the character acting out a moment in a drawn room, between stretches of footage (`[set room=...]`).

The format that tested best (docs/pose-library.md "Set pieces", experiments/broll-character): footage carries the
video and the character punctuates it, two to four times in a long video, in a whole room. A set scene says which
room; the room's staging (where he stands and how tall he is, measured once per room from things of known height)
comes from library/backgrounds/manifest.json; what he does comes from cues written in the narration, or is picked
from the words when none are written:

    [set room=first-flat walk=left]
    Add a {count-notes} £12,000 deposit and your budget is around {fist-pump} £125,000. {prop=keys} That's around
    £600 a month.

- `{pose}`: a pose from the pose library (library/poses/manifest.json) lands on the next word; `{pose:flip}` mirrors
  it (point-board points to the right as drawn); `{jump}` is a crouch, a leap and a landing.
- `{prop=keys}`: a prop from library/props pops in on the next word, beside the card that lands with it.
- `cards="£125,000; ink:£600 a month; 3 years -> 2 years 9 months"` on the tag: number cards, each landing on the
  word its first figure (or first word) is said; `@word` picks the word; `red:`/`green:`/`ink:` the colour (figures
  are green, words ink); `old -> new` strikes the old one through. With no cards= every amount said gets a card
  (`cards=off`: none).
- `walk` (or `walk=left|right`): he walks in before the first move, from the room's clear side (`walk_from` in its spot)
  or the side given.

All of it becomes timed cues on the scene ({t, do: pose|card|prop, ...}), so the Shorts cutter and the 1.2x speed-up
move them with the words like every other cue.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POSE_LIB = os.path.join(ROOT, "library", "poses", "manifest.json")
PROP_LIB = os.path.join(ROOT, "library", "props", "manifest.json")
ROOM_LIB = os.path.join(ROOT, "library", "backgrounds", "manifest.json")

HAPPY = {"thumbs-up", "fist-pump", "arms-up", "jump", "phone-excited", "relieved", "idea"}  # these land with a little hop
SET_CUE_RE = re.compile(r"\{([a-z][a-z0-9-]*)(?::(flip))?(?:=([a-z0-9-]+))?\}")
AMOUNT_RE = re.compile(r"£\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|m|bn|million|billion)\b)?|\d[\d,]*(?:\.\d+)?\s?%", re.I)
COST_WORDS = re.compile(r"\b(fees?|costs?|debts?|lose|lost|loss|tax|interest|charges?|penalty|short|shortfall|owe|owed)\b", re.I)
CAPTION_FLOOR = {"land": 0.80, "vert": 0.80}  # his feet stay above this: the captions (landscape), the Shorts title (vertical)
NUMBER_WORDS = {str(i): w for i, w in enumerate("zero one two three four five six seven eight nine ten eleven twelve".split())}
# single-word pose tags too common to act on by themselves when picking poses from the words
COMMON = {"this", "here", "what", "how", "why", "one", "two", "three", "first", "second", "third", "no", "yes", "good",
          "up", "down", "red", "today", "let's", "number", "look", "maybe", "wait", "don't", "check", "bad", "side",
          "stand", "turn", "so", "but", "the", "thing", "never", "stop", "listen", "neutral", "settle", "sit"}
HEAD_CLEAR = 0.26  # in a Short his head stays below this, under the captions
CARD_SIDE_X = 0.64  # in a vertical slice he stands at this share of the width, the cards beside him


def _load(path: str) -> list[dict[str, Any]]:
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return []


def poses() -> dict[str, dict[str, Any]]:
    return {e["name"]: e for e in _load(POSE_LIB)}


def props() -> dict[str, dict[str, Any]]:
    return {e["name"]: e for e in _load(PROP_LIB)}


def rooms() -> dict[str, dict[str, Any]]:
    return {e["name"]: e for e in _load(ROOM_LIB)}


# --- where he stands -----------------------------------------------------------------------------------------------

def stage_for(room: dict[str, Any], over: dict[str, Any] | None = None) -> dict[str, Any]:
    """The room's staging for both frames, from its measured spot (drawing fractions: x, floor = where his feet are, h =
    his height as a share of the drawing's height). Landscape shows the full width of the drawing and a 16:9 band of
    its height (`top` 0 = the top of the drawing, 1 = the bottom); vertical shows a 9:16 slice, the full height or a
    little less (`zoom`) so his feet stay above the Shorts title, with him at about two thirds across and the cards
    on the other side. Returns frame fractions for the renderer: {land: {top, x, floor, h}, vert: {cx, zoom, vtop, x,
    floor, h}, ok, notes}."""
    spot = dict(room.get("spot") or {})
    spot.update({k: float(v) for k, v in (over or {}).items() if k in ("x", "floor", "h") and v is not None})
    W, H = float(room["w"]), float(room["h"])
    x, floor, h = float(spot["x"]), float(spot["floor"]), float(spot["h"])
    notes: list[str] = []
    # landscape: the full width, a 16:9 band of the height
    bh = W * 9 / 16 / H  # band height in drawing-height units
    if "land_top" in spot and not over:
        top = float(spot["land_top"])
    else:
        top = (floor - CAPTION_FLOOR["land"] * bh) / max(1e-6, 1 - bh)
    top = min(1.0, max(0.0, top))
    y0 = top * max(0.0, 1 - bh)
    land = {"top": round(top, 3), "x": round(x, 3), "floor": round((floor - y0) / bh, 3), "h": round(h / bh, 3)}
    # vertical: a 9:16 slice of the full height if that keeps his head under the captions and his feet above the
    # Shorts title; otherwise the least zoom that does (a spot high in the room is shown from a window nearer the top)
    hv, y0v = 1.0, 0.0
    for k in range(0, 46):
        cand = 1 - k / 100
        lo, hi = max(0.0, floor - CAPTION_FLOOR["vert"] * cand), min(1 - cand, (floor - h) - HEAD_CLEAR * cand)
        if lo <= hi + 1e-9:
            hv, y0v = cand, lo
            break
    sw = hv * H * 9 / 16 / W  # slice width in drawing-width units
    x0 = min(max(0.0, x - CARD_SIDE_X * sw), max(0.0, 1 - sw))
    vert = {"cx": round(x0 + sw / 2, 3), "zoom": round(1 / hv, 3), "vtop": round(y0v / (1 - hv), 3) if hv < 1 else 1.0, "x": round((x - x0) / sw, 3),
            "floor": round((floor - y0v) / hv, 3), "h": round(h / hv, 3)}
    for name, s in (("landscape", land), ("vertical", vert)):
        head = s["floor"] - s["h"]
        if head < (0.08 if name == "landscape" else 0.25):
            notes.append(f"{room['name']}: in {name} his head is at {head:.2f} of the height, under the {'top of the frame' if name == 'landscape' else 'captions'}; measure another spot (scripts/room-stage.py)")
        if s["floor"] > 1.0:
            notes.append(f"{room['name']}: in {name} his feet fall below the frame")
    return {"land": land, "vert": vert, "ok": not notes, "notes": notes}


# --- what he does --------------------------------------------------------------------------------------------------

def split_set_cues(text: str) -> tuple[str, list[dict[str, Any]], list[str]]:
    """'Add a {count-notes} £12,000 deposit {prop=keys}' -> ('Add a £12,000 deposit', [{'word': 2, 'pose':
    'count-notes'}, {'word': 4, 'prop': 'keys'}], problems). The word index is the word the cue comes before."""
    lib, pl = poses(), props()
    cues: list[dict[str, Any]] = []
    problems: list[str] = []
    out: list[str] = []
    for tok in text.split():
        for name, flip, value in SET_CUE_RE.findall(tok):
            at = len(out)
            if name == "prop":
                if value in pl:
                    cues.append({"word": at, "prop": value})
                else:
                    problems.append(f"no prop called '{value}' in library/props")
            elif name in lib or name == "jump":
                cues.append({"word": at, "pose": name, **({"flip": True} if flip else {})})
            else:
                problems.append(f"no pose called '{name}' in library/poses")
        cleaned = SET_CUE_RE.sub("", tok)
        if cleaned:
            out.append(cleaned)
    return " ".join(out), cues, problems


def _norm(w: str) -> str:
    return re.sub(r"[^\w£%.]", "", w.lower()).rstrip(".")


def parse_cards(spec: str) -> list[dict[str, Any]]:
    """'£125,000; ink:£600 a month; 3 years -> 2 years 9 months@two' -> card specs with text, colour, anchor word."""
    out = []
    for raw in [c.strip() for c in spec.split(";") if c.strip()]:
        color = None
        m = re.match(r"^(red|green|ink):\s*(.*)$", raw)
        if m:
            color, raw = m.group(1), m.group(2)
        anchor = None
        if "@" in raw:
            raw, anchor = raw.rsplit("@", 1)
            raw, anchor = raw.strip(), anchor.strip()
        old = None
        if "->" in raw:
            old, raw = [s.strip() for s in raw.split("->", 1)]
        text = raw
        figure = AMOUNT_RE.search(old or text) or re.search(r"\d[\d,.]*", old or text)
        out.append({"text": text, "old": old, "color": color or ("green" if re.search(r"\d", text) else "ink"),
                    "anchor": anchor or (figure.group(0) if figure else (old or text).split()[0])})
    return out


def auto_cards(narration: str) -> list[dict[str, Any]]:
    """A card for every amount said: the figure, with 'a year'/'a month' when it follows; red after a cost word."""
    words = narration.split()
    cards = []
    for i, w in enumerate(words):
        fig = w.strip(".,!?;:")
        if not AMOUNT_RE.fullmatch(fig):
            continue
        nxt = " ".join(_norm(x) for x in words[i + 1:i + 3])
        tail = " a year" if nxt in ("a year", "per year") else " a month" if nxt in ("a month", "per month") else ""
        if fig.endswith("%") and i + 1 < len(words) and re.fullmatch(r"[A-Za-z]{4,}[.,]?", words[i + 1]):
            tail = " " + words[i + 1].strip(".,")  # "10% deposit", not a bare "10%"
        before = " ".join(words[max(0, i - 6):i])
        cards.append({"text": fig + tail, "old": None, "color": "red" if COST_WORDS.search(before) else "green", "anchor": fig, "word": i})
    return cards


def auto_poses(narration: str, every: int = 6) -> list[dict[str, Any]]:
    """Poses picked from the words when the script names none: a pose whose tags are said lands on that word, no
    closer than `every` words to the last, never the same pose twice in a row; an amount with nothing else said
    gets a point at its card."""
    lib = poses()
    words = [_norm(w) for w in narration.split()]
    tagged = []
    for name, e in lib.items():
        if e.get("into") or e.get("seated") or name in ("stand", "stand-3q", "stand-side", "sit", "jump-crouch-side"):
            continue
        for tag in e.get("tags") or []:
            tag_words = [_norm(t) for t in tag.split()]
            if len(tag_words) == 1 and tag_words[0] in COMMON:
                continue
            tagged.append((tag_words, name))
    picks: list[dict[str, Any]] = []
    last_i, last_pose = -every, ""
    for i in range(len(words)):
        if i - last_i < every:
            continue
        hit = None
        for tag_words, name in tagged:
            n = len(tag_words)
            if words[i:i + n] == tag_words and name != last_pose and len(tag_words[0]) > 2:
                hit = name
                break
        if hit is None and AMOUNT_RE.match(narration.split()[i].strip(".,!?")) and last_pose != "point-board":
            hit = "point-board"
        if hit:
            picks.append({"word": i, "pose": hit})
            last_i, last_pose = i, hit
    return picks


def anchor_word(cards: list[dict[str, Any]], narration: str) -> None:
    """Each card's word index: the first word from its anchor on that matches (after the previous card's word)."""
    words = [_norm(w) for w in narration.split()]
    after = 0
    for c in cards:
        if "word" in c:
            after = c["word"]
            continue
        key = _norm(str(c["anchor"]))
        said = NUMBER_WORDS.get(key, key)
        hit = next((i for i in range(after, len(words)) if key and (words[i].startswith(key) or words[i] == said)), None)
        c["word"] = hit if hit is not None else max(0, len(words) - 1)
        after = c["word"]


def plan(sc: dict[str, Any], attrs: dict[str, Any]) -> list[str]:
    """Fill a set scene from its tag and narration (called by the parser): the room's staging, the poses (written or
    picked), the cards and props, all word-indexed in sc['setWords'] until the words are timed. Returns problems."""
    problems: list[str] = []
    narration, cues, bad = split_set_cues(sc["narration"])
    problems += bad
    sc["narration"] = narration
    rm = rooms().get(str(attrs.get("room", "")))
    if not rm:
        problems.append(f"scene {sc['id']}: no room called '{attrs.get('room')}' in library/backgrounds")
    elif not rm.get("spot"):
        problems.append(f"scene {sc['id']}: room '{rm['name']}' has no measured spot yet (scripts/room-stage.py)")
    else:
        st = stage_for(rm, {k: attrs.get(k) for k in ("x", "floor", "h") if k in attrs})
        sc["props"]["stage"] = {"land": st["land"], "vert": st["vert"]}
        problems += [f"scene {sc['id']}: {n}" for n in st["notes"]]
        sc["props"]["room"] = rm["name"]
        sc["props"]["roomFile"] = rm["file"]
    walk = attrs.get("walk")
    if walk is True or str(walk).lower() in ("yes", "on", "true"):
        walk = (rm or {}).get("spot", {}).get("walk_from", "left")  # the room's clear side: nothing nearer the camera in his path
    if walk in ("left", "right"):
        sc["props"]["walk"] = walk
        sc["props"]["walkDx"] = float(((rm or {}).get("spot") or {}).get("walk_dx", 0.28))
    sc["props"]["art"] = "off"  # the room is the picture: no drawing from the art library on top of it
    pose_cues = [c for c in cues if "pose" in c] or auto_poses(narration)
    spec = str(attrs.get("cards", "")).strip()
    cards = [] if spec.lower() == "off" else parse_cards(spec) if spec else auto_cards(narration)
    anchor_word(cards, narration)
    sc["setWords"] = pose_cues + [c for c in cues if "prop" in c] + [{"word": c["word"], "card": {k: c[k] for k in ("text", "old", "color") if c.get(k)}} for c in cards]
    return problems


def plan_cards(sc: dict[str, Any], attrs: dict[str, Any]) -> None:
    """Cards over a footage scene: the amounts said land on the picture as they are said (or the tag's cards=), so a
    figure the viewer only hears over footage, and a later card crosses out, has been seen."""
    spec = str(attrs.get("cards", "")).strip()
    cards = [] if spec.lower() == "off" else parse_cards(spec) if spec else auto_cards(sc["narration"])
    if not cards:
        return
    anchor_word(cards, sc["narration"])
    sc["setWords"] = [{"word": c["word"], "card": {k: c[k] for k in ("text", "old", "color") if c.get(k)}} for c in cards]


def _inbetweens() -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for e in _load(POSE_LIB):
        if e.get("into") and e["name"] not in ("jump-air", "jump-crouch"):
            out.setdefault(e["into"], []).append(e["name"])
    return {k: sorted(v) for k, v in out.items()}


def timed(sc: dict[str, Any], fps: int = 30) -> list[dict[str, Any]]:
    """The set scene's moves as absolute-time cues once its words have times: each pose lands on its word (a few
    frames early, as the eye reads it), its in-between drawings just before on twos, a jump as crouch, leap and
    landing; cards and props on their word."""
    words = sc.get("words") or []
    ib = _inbetweens()
    step = 4 / fps
    out: list[dict[str, Any]] = []

    def at(i: int) -> float:
        if not words:
            return sc["start"]
        return round(max(sc["start"], words[min(i, len(words) - 1)]["s"] - 0.08), 3)

    for c in sc.get("setWords") or []:
        t = at(c["word"])
        if "pose" in c:
            flip = {"flip": True} if c.get("flip") else {}
            if c["pose"] == "jump":
                out += [{"t": round(max(sc["start"], t - step), 3), "do": "pose", "pose": "jump-crouch", "ib": True},
                        {"t": t, "do": "pose", "pose": "jump-air", "ib": True, "arc": 0.4},
                        {"t": round(t + 0.4, 3), "do": "pose", "pose": "arms-up"}]
                continue
            before = ib.get(c["pose"], [])
            for k, name in enumerate(before):
                out.append({"t": round(max(sc["start"], t - step * (len(before) - k)), 3), "do": "pose", "pose": name, "ib": True, **flip})
            out.append({"t": t, "do": "pose", "pose": c["pose"], **({"hop": True} if c["pose"] in HAPPY else {}), **flip})
        elif "prop" in c:
            out.append({"t": t, "do": "prop", "prop": c["prop"]})
        elif "card" in c:
            out.append({"t": t, "do": "card", **c["card"]})
    out.sort(key=lambda c: c["t"])
    return out
