"""'No empty white space', measured before any render: on the proof sheet's stills, and on the storyboard alone.

Jeffrey's standing rule, and what the reviewers found after every render: a Short whose first frame is bare paper
with a sticker, a chart in the top third over an empty lower half, a page that stays near-empty for five seconds, a
Short that ends on a fading board, a real page held eighteen seconds with nothing pointing at it. Each is a number
here, read off the small stills pipeline/proof.py renders, so it is found in minutes and not after 25 of rendering.

On the stills (the review kit's own measures: ink is grey under 170, plain paper is 228 and over):
- `first_frame`: a Short's frame 0 has under 4% ink below the sticker band, unless footage fills it.
- `bare_band`: on an upright scene's busiest still, the band from 60% to 85% down has under 4% ink and over 92% paper,
  or some stretch between 25% and 85% down, taller than 12% of the height, has no ink in it at all.
- `near_empty`: a scene's stills at 1, 3 and 5 seconds are all under 3.5% ink and over 90% paper.
- `fading_end`: a Short's last frame has under 80% of the ink of its last scene's busiest still.
`still_gates` runs the four over one sheet's tiles and names the tile each finding is on.

From the storyboard alone:
- `held_stills`: a still picture on screen for over 8 seconds (6 in a Short) that no mark lands on, or that sits for
  that long with neither a mark nor a card landing.
- `opening`: a long video whose first scene is not a full-frame picture with one figure on it.

The thresholds come from about 25 frames of one video (the delivered Nvidia Shorts) and are to be tuned on a second.
So the gates report and stop nothing: only pipeline/proof.py calls them, and a Short's findings print as FAIL, a long
video's as warnings. See docs/proof.md.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any

import numpy as np

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZONES = os.path.join(HERE, "remotion", "src", "components", "upright.json")  # a Short's zones, kept in that one file

INK, PAPER = 170, 228  # grey under 170 is ink, 228 and over is plain paper (scripts/review-kit.py blank_stretches)
MEASURE = 768  # a still is measured with its long side at most this (a frame at scale 0.4): ink reads higher on smaller stills

FIRST_INK = 0.04  # a Short's frame 0: at least this much ink below the sticker band
FILLED = 0.5  # under this much paper below the sticker band, a picture fills the frame whatever its ink
BAND = (0.60, 0.85)  # the lower band of an upright frame, above YouTube's title strip
BAND_INK, BAND_PAPER = 0.04, 0.92  # bare: under this much ink and over this much paper in the band
RUN = (0.25, 0.85)  # the part of an upright frame a scene's own content is laid in
RUN_MOST = 0.12  # no stretch of rows without ink there may be taller than this share of the height
EARLY = (1.0, 3.0, 5.0)  # seconds into a scene: the stills the near-empty check reads
EARLY_INK, EARLY_PAPER = 0.035, 0.90  # near-empty: under this much ink and over this much paper, on all of them
END_SHARE = 0.80  # a Short's last frame keeps at least this share of its busiest still's ink
HELD, HELD_SHORT = 8.0, 6.0  # seconds a still picture may sit with nothing landing on it: a long video, a Short

FOOTAGE = ("broll", "clip", "still", "image")  # the scene types whose picture is a photo or a clip
STILL_EXTS = (".jpg", ".jpeg", ".png", ".webp")  # as pipeline/build.py: a picture file that does not move


def zones(path: str | None = None) -> dict[str, Any]:
    """A Short's zones as fractions (remotion/src/components/upright.json). The file is the one place a zone is
    written down, so there is no copy of its numbers here: without it this raises FileNotFoundError."""
    with open(path or ZONES, encoding="utf-8") as f:
        return json.load(f)


# --- measures on one still ----------------------------------------------------------------------------------------------

def grey(frame: Any) -> np.ndarray:
    """A still as grey levels, 0 to 255, one row per line of the picture: from a file, a Pillow image or an array
    (rows by columns, with or without colour). Anything larger than MEASURE on its long side is shrunk to it first, so
    a full-size frame and a small still of the same picture measure alike."""
    from PIL import Image
    if isinstance(frame, np.ndarray):
        a = frame
        if a.ndim == 3:
            a = a[..., :3].astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32)
        if max(a.shape[:2]) <= MEASURE:
            return a
        im = Image.fromarray(np.clip(np.rint(a), 0, 255).astype(np.uint8))
    else:
        im = (Image.open(frame) if isinstance(frame, (str, os.PathLike)) else frame).convert("L")
    if max(im.size) > MEASURE:
        k = MEASURE / max(im.size)
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.BOX)
    return np.asarray(im)


def _rows(g: np.ndarray, top: float, bottom: float) -> np.ndarray:
    h = g.shape[0]
    return g[int(round(top * h)):max(int(round(top * h)) + 1, int(round(bottom * h)))]


def ink(frame: Any, top: float = 0.0, bottom: float = 1.0) -> float:
    """The share of the picture that is ink, between `top` and `bottom` (fractions of the height)."""
    return float((_rows(grey(frame), top, bottom) < INK).mean())


def paper(frame: Any, top: float = 0.0, bottom: float = 1.0) -> float:
    """The share of the picture that is plain paper, between `top` and `bottom`."""
    return float((_rows(grey(frame), top, bottom) >= PAPER).mean())


def bare_run(frame: Any, top: float = RUN[0], bottom: float = RUN[1]) -> tuple[float, float]:
    """The tallest stretch of rows with no ink in them between `top` and `bottom`: (its height, where it starts),
    both as shares of the frame's height. A row a picture crosses is not bare, even where the picture is pale: it has
    to be nearly all plain paper as well."""
    g = grey(frame)
    h = g.shape[0]
    r0, r1 = int(round(top * h)), int(round(bottom * h))
    bare = ~(g[r0:r1] < INK).any(axis=1) & ((g[r0:r1] >= PAPER).mean(axis=1) >= 0.9)
    best, at, start = 0, r0, None
    for i, b in enumerate(list(bare) + [False]):
        if b and start is None:
            start = i
        elif not b and start is not None:
            if i - start > best:
                best, at = i - start, r0 + start
            start = None
    return best / h, at / h


# --- the four checks, each on the stills it needs: None when the still passes, else what is wrong ---------------------------

def first_frame(frame: Any, footage: bool = False, sticker_foot: float | None = None) -> str | None:
    """A Short's frame 0, the picture a scroller sees first: under 4% ink below the sticker band is a bare page with a
    sticker. `footage` says the storyboard opens on a photo or a clip, which fills the frame whatever it measures."""
    if footage:
        return None
    foot = zones()["sticker"]["bottom"] if sticker_foot is None else sticker_foot
    g = grey(frame)
    if paper(g, foot, 1.0) < FILLED:
        return None  # a picture fills it
    got = ink(g, foot, 1.0)
    if got >= FIRST_INK:
        return None
    return f"a bare first frame: {got:.1%} ink below the sticker band ({ink(g):.1%} over the whole frame; at least {FIRST_INK:.0%} is wanted)"


def bare_band(frame: Any) -> str | None:
    """An upright scene at its busiest: the lower band still bare, or a tall empty stretch in the middle of the page."""
    g = grey(frame)
    bi, bp = ink(g, *BAND), paper(g, *BAND)
    if bi < BAND_INK and bp > BAND_PAPER:
        return f"a bare band: {bi:.1%} ink and {bp:.1%} paper from {BAND[0]:.0%} to {BAND[1]:.0%} down (bare is under {BAND_INK:.0%} ink and over {BAND_PAPER:.0%} paper)"
    tall, at = bare_run(g)
    if tall > RUN_MOST:
        return f"a bare stretch: nothing from {at:.0%} to {at + tall:.0%} down, {tall:.0%} of the height (at most {RUN_MOST:.0%} between {RUN[0]:.0%} and {RUN[1]:.0%})"
    return None


def near_empty(frames: list[Any]) -> str | None:
    """A scene's stills at 1, 3 and 5 seconds (those it is long enough to have): all of them near-empty paper. One
    still alone proves nothing, since every board starts empty, so fewer than two is no finding."""
    if len(frames) < 2:
        return None
    got = [(ink(g), paper(g)) for g in map(grey, frames)]
    if all(i < EARLY_INK and p > EARLY_PAPER for i, p in got):
        return (f"a near-empty page for its first {EARLY[len(got) - 1]:g} seconds: ink " + ", ".join(f"{i:.1%}" for i, _ in got)
                + f" (near-empty is under {EARLY_INK:.1%} ink and over {EARLY_PAPER:.0%} paper)")
    return None


def fading_end(last: Any, busiest: Any) -> str | None:
    """A Short's last frame against its last scene's busiest still: a Short loops, so a board that is fading or gone
    on the last frame is a blink of empty paper every time round."""
    a, b = ink(last), ink(busiest)
    if b > 0 and a < END_SHARE * b:
        return f"a fading last frame: {a:.1%} ink, {a / b:.0%} of the {b:.1%} on its scene's busiest still (at least {END_SHARE:.0%} is wanted)"
    return None


# --- the checks over one sheet -------------------------------------------------------------------------------------------

def _finding(short: bool, gate: str, tile: dict[str, Any], text: str) -> dict[str, Any]:
    return {"level": "FAIL" if short else "warning", "gate": gate, "scene": tile.get("scene"), "type": tile.get("type"),
            "frame": tile.get("frame"), "t": tile.get("t"), "text": text}


def still_gates(tiles: list[dict[str, Any]], short: bool, upright: bool | None = None) -> list[dict[str, Any]]:
    """The measured checks over one sheet's tiles (the long video's, or one Short's). A tile is {frame, t, scene, type,
    why, image} as pipeline/proof.py plans it: `why` holds what the still is for ('first', 'last', 'at1', 'at3',
    'at5' and the rest), `image` is the still (a file or an array), `footage` is set when the scene's picture is a
    photo or a clip, and `unseen` when that picture is not in the bundle, so the still shows a placeholder and is
    not judged. `short` is a Short's cut: its findings are FAIL, a long video's are warnings, and only a Short has a
    first and a last frame to check. `upright` (the band check) is taken from the first still's shape when not given.
    Returns [{level, gate, scene, type, frame, t, text}], in the order the tiles are in."""
    seen = [t for t in tiles if t.get("image") is not None and not t.get("unseen")]
    if not seen:
        return []
    cache: dict[int, np.ndarray] = {}

    def g(t: dict[str, Any]) -> np.ndarray:
        if id(t) not in cache:
            cache[id(t)] = grey(t["image"])
        return cache[id(t)]

    if upright is None:
        upright = g(seen[0]).shape[0] > g(seen[0]).shape[1]
    out: list[dict[str, Any]] = []
    by_scene: dict[Any, list[dict[str, Any]]] = {}
    for t in seen:
        if t.get("scene") is not None:
            by_scene.setdefault(t["scene"], []).append(t)
    busiest = {sc: max(ts, key=lambda t: ink(g(t))) for sc, ts in by_scene.items()}
    if short:
        first = next((t for t in seen if "first" in t.get("why", ())), None)
        if first is not None:
            why = first_frame(g(first), footage=bool(first.get("footage")))
            if why:
                out.append(_finding(short, "first frame", first, why))
    for sc, ts in by_scene.items():
        if upright:
            why = bare_band(g(busiest[sc]))
            if why:
                out.append(_finding(short, "bare band", busiest[sc], why))
        early = [t for t in ts if any(k in t.get("why", ()) for k in ("at1", "at3", "at5"))]
        why = near_empty([g(t) for t in early])
        if why:
            out.append(_finding(short, "near-empty page", early[-1], why))
    if short:
        last = next((t for t in seen if "last" in t.get("why", ())), None)
        if last is not None and by_scene:
            sc = last.get("scene") if last.get("scene") in by_scene else list(by_scene)[-1]
            # a photo or a clip: its dark share is not ink and moves with the picture, so the last frame is only held
            # against it once the picture has gone (most of the frame is paper again)
            moving = bool(busiest[sc].get("footage")) and paper(g(last)) < FILLED
            why = None if moving else fading_end(g(last), g(busiest[sc]))
            if why:
                if last.get("scene") is None:
                    why += "; no scene is on screen on the last frame"
                out.append(_finding(short, "last frame", last, why))
    return sorted(out, key=lambda f: (f["frame"] if f["frame"] is not None else 0))


# --- from the storyboard alone -------------------------------------------------------------------------------------------

def picture(sc: dict[str, Any]) -> str:
    """The file a footage scene shows (the upright crop counts as the same picture), or '' for a drawn scene."""
    if sc.get("type") not in FOOTAGE:
        return ""
    p = sc.get("props") or {}
    return str(p.get("src") or p.get("vsrc") or p.get("missing") or "")


def is_footage(sc: dict[str, Any]) -> bool:
    """True when the scene's picture is a photo or a clip (found already, or still to be found)."""
    p = sc.get("props") or {}
    return sc.get("type") in FOOTAGE and any(p.get(k) for k in ("src", "vsrc", "lib", "search", "want", "missing"))


def _frozen(sc: dict[str, Any], a: float, b: float) -> tuple[float, str] | None:
    """When the scene's picture stops moving and what it is: a photo or a page from the scene's start; a clip that
    is held on its last frame from where it runs out (paper/scenes.tsx PaperBroll). None for a picture that moves."""
    p = sc.get("props") or {}
    src = picture(sc)
    if not src:
        return None
    if os.path.splitext(src)[1].lower() in STILL_EXTS:
        return a, "a still"
    if p.get("hold") and p.get("clipDur"):
        played = (float(p["clipDur"]) - float(p.get("from") or 0)) / max(0.05, float(p.get("rate") or 1))
        if float(sc["start"]) + played < b:
            return max(a, float(sc["start"]) + played), "a clip held on its last frame"
    return None


def held_stills(sb: dict[str, Any]) -> list[dict[str, Any]]:
    """Still pictures that sit too long: over 8 seconds on screen in a long video, 6 in a Short (a storyboard with a
    `short` name). A still is named when no mark lands on it in that time: cards beside a page do not point at it, so
    they do not count (the Nvidia video's CNBC page sat 18.4 seconds under seven cards and read as wallpaper). It is
    also named when it does carry a mark but then sits for over the limit with neither a mark nor a card landing.
    Returns [{level, gate, scene, type, t, seconds, quiet, marks, cards, text}]."""
    short = bool(sb.get("short"))
    limit = HELD_SHORT if short else HELD
    total = float(sb.get("durationSec") or 0) or max((float(sc["end"]) for sc in sb.get("scenes") or []), default=0.0)
    out = []
    for sc in sb.get("scenes") or []:
        a, b = max(0.0, float(sc["start"])), min(float(sc["end"]), total)
        froze = _frozen(sc, a, b)
        if not froze or b - froze[0] <= limit:
            continue
        since, what = froze
        lands = sorted((float(c["t"]), str(c.get("do"))) for c in sc.get("cues") or [] if c.get("do") in ("mark", "card") and since <= float(c["t"]) < b)
        marks = sum(1 for _, do in lands if do == "mark")
        cards = len(lands) - marks
        edges = [since] + [t for t, _ in lands] + [b]
        quiet = max(y - x for x, y in zip(edges, edges[1:]))
        if marks and quiet <= limit:
            continue
        name = os.path.basename(picture(sc))
        if marks:
            why = f"{quiet:.1f}s of it with nothing landing"
        elif cards:
            why = f"no mark on it ({cards} card{'s' if cards != 1 else ''} beside it; the longest stretch with nothing new is {quiet:.1f}s)"
        else:
            why = "no mark or card lands in that time"
        out.append({"level": "FAIL" if short else "warning", "gate": "held still", "scene": sc.get("id"), "type": sc.get("type"), "t": round(since, 2),
                    "seconds": round(b - since, 1), "quiet": round(quiet, 1), "marks": marks, "cards": cards,
                    "text": f"{what} on screen for {b - since:.1f}s ({name}): {why}; over {limit:g}s it wants a mark on the picture, or a second picture"})
    return out


def opening(sb: dict[str, Any]) -> list[dict[str, Any]]:
    """A long video opens on one real picture, edge to edge, with one figure across it (a [broll] with big=): never on
    half a page of handwriting, which Jeffrey rejected. Silent for a Short and for a storyboard that opens that way;
    otherwise one finding that says what the first scene is. Returns [{level, gate, scene, type, t, text}]."""
    scenes = sb.get("scenes") or []
    if sb.get("short") or not scenes:
        return []
    sc = scenes[0]
    p = sc.get("props") or {}
    big = str(p.get("big") or "")
    figure = bool(re.search(r"\d", big.split("|")[0]))
    if sc.get("type") == "broll" and is_footage(sc) and figure and str(p.get("phone") or "") != "on":
        return []
    if sc.get("type") in FOOTAGE and is_footage(sc):
        what = "a picture with no figure on it (no big=)" if not big else f"a picture whose big= has no number in its first line ('{big}')" if not figure else "a phone screen, not a full-frame picture"
    else:
        words = str(p.get("board") or p.get("title") or p.get("value") or p.get("headline") or "").strip()
        what = f"a [{sc.get('type')}] board" + (f" ('{words}')" if words else "")
    return [{"level": "warning", "gate": "opening", "scene": sc.get("id"), "type": sc.get("type"), "t": 0.0,
             "text": f"the video opens on {what}, not on a full-frame picture with one figure (a [broll] with big=)"}]
