"""The real-material board: which scenes show real material, a verdict on every captured page, a short ask list.

    python -m pipeline.realboard projects/<slug> --out DIR

Run it before a voice is made. It reads script.md, real/sources.json, real/wanted.json and media/, changes nothing
in the project, and writes four files into DIR:
- board.png: one tile per scene with the picture that scene will use, its number, its type and one class: REAL
  PHOTO (author and licence from sources.json), REAL PAGE (the outlet, and the verdict on its capture), APP RECORDING
  ("check for balances"), STOCK, or BOARD (a drawing or a figure on paper). The heading reads "N of M scenes show
  real material" and names a long video that does not open on a full-frame real picture;
- verdicts.md: every page capture in real/ marked blocked, covered, banner, advert box or ok, and why; the crop
  check on the page crops in media/; what the script still breaks of the standard for pages (pipeline.preflight);
- asks.md: at most five things to ask Jeffrey for, most valuable first, each tied to a scene and its sentence. An
  ask is written only when the automatic route failed. With no wanted.json it asks for nothing and lists the
  sources the script names, as the list to gather first;
- board.json: the same facts for another tool to read.

It reports and fixes nothing. The pixel rules for a banner and an advert box are guesses from ten captures and
will miss some; the title rule for a blocked page is reliable. docs/real-material.md has the rest.
"""
from __future__ import annotations

import argparse
import colorsys
import io
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import numpy as np

from . import footage_library, preflight, thumbnail
from .script_parser import CARD_TYPES, FOOTAGE_TYPES, SCENE_TYPES, TAG_RE, parse_script
from .thumbnail import Refused, credit_line, photo_source, tile_image

REAL = ("REAL PHOTO", "REAL PAGE")
CLASSES = REAL + ("APP RECORDING", "STOCK", "BOARD")
VERDICTS = ("blocked", "covered", "banner", "advert box", "ok")  # worst first
MAX_ASKS = 5  # more than this and he stops reading them
LONG = 8  # scenes: under this a script is a demo or a Short (as footage_share has it), and its opening is not judged
FIGURES = {"stat", "chart", "compare", "pie", "receipt", "grow", "shrink", "score"}
# the whole title of a page that would not let the screenshot in (PerimeterX, Cloudflare, Akamai and the like): a
# wall's title is nothing but one of these, so a real headline that starts "Just a moment ago" is not taken for one
BLOCKED_TITLE = re.compile(
    r"^\W*(access( to this page)? (has been |is |was )?denied|just a moment|attention required|are you a robot|robot or human"
    r"|pardon our interruption|(error )?403( forbidden)?|forbidden|request blocked|(sorry, )?you have been blocked|checking your browser"
    r"|security check|(please )?verify (that )?you are (a )?human|verifying (that )?you are (a )?human|human verification)\W*(\|.*)?$", re.I)
EMPTY = 0.015  # under this share of anything but background, a page is near empty (The Hill's wall: 0.4%; an article: 4% and up)
INK = 48  # how far a pixel is from its ground before it counts as ink
OTHER = 24  # how far a bar is from the page's ground before it is "another colour"
FLAT = 1.4  # how much a flat patch may vary: an empty box on a page 0 to 1.1, a smooth sky or wall in a photograph 1.7 and up
STOP = {"with", "from", "that", "this", "what", "have", "will", "into", "over", "after", "about", "their", "they", "them", "then",
        "than", "when", "were", "been", "your", "news", "says", "said", "more", "most", "also", "just", "could", "would", "there"}


# ---------------------------------------------------------------- small helpers

def host(url: str) -> str:
    return urlparse(url or "").netloc.lower().removeprefix("www.")


def _squeeze(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def _words(text: str) -> set[str]:
    """the words of a sentence worth matching on: four letters or more, no possessive, no filler"""
    return {w for w in (re.sub(r"['’]s$", "", t) for t in re.findall(r"[a-z0-9][a-z0-9'’]+", text.lower())) if len(w) >= 4 and w not in STOP}


def first_sentence(text: str, most: int = 110) -> str:
    s = re.split(r"(?<=[.?!])\s+", (text or "").strip())[0]
    return s if len(s) <= most else s[: most - 1].rsplit(" ", 1)[0] + "…"


def _runs(flags) -> list[tuple[int, int]]:
    """the stretches of True in a row of flags, as (first, one past the last)"""
    f = np.concatenate(([False], np.asarray(flags, bool), [False]))
    edges = np.flatnonzero(f[1:] != f[:-1])
    return list(zip(edges[::2].tolist(), edges[1::2].tolist()))


def _tone(colour) -> str:
    """a colour in two words, for a sentence: 'dark blue', 'light grey', 'red'"""
    r, g, b = (int(v) for v in colour)
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    if max(r, g, b) - min(r, g, b) < 28:
        return "black" if lum < 36 else "white" if lum > 251 else "dark grey" if lum < 100 else "pale grey" if lum > 225 else "light grey" if lum > 185 else "grey"
    h = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)[0]
    hue = next(name for edge, name in ((0.04, "red"), (0.11, "orange"), (0.19, "yellow"), (0.45, "green"), (0.72, "blue"), (0.86, "purple"), (1.01, "red")) if h < edge)
    return ("dark " if lum < 80 else "light " if lum > 190 else "") + hue


# ---------------------------------------------------------------- the pixels of a page

def _small(im, width: int = 480):
    """The picture as numbers, at most `width` wide. A flat area keeps its exact colour when a capture is scaled down."""
    from PIL import Image

    im = im.convert("RGB")
    if im.width > width:
        im = im.resize((width, max(1, round(im.height * width / im.width))), Image.BILINEAR)
    return np.asarray(im).astype(np.int16)


def _flat_colours(a, least: float = 0.012) -> list[tuple[Any, float]]:
    """The picture's commonest colours, commonest first: [(colour, its share of the picture)]. The first is the ground."""
    px = a.reshape(-1, 3)
    key = (px[:, 0] // 8) * 1024 + (px[:, 1] // 8) * 32 + px[:, 2] // 8
    vals, counts = np.unique(key, return_counts=True)
    out = []
    for i in np.argsort(-counts)[:10]:
        if out and counts[i] / len(px) < least:
            break
        out.append((np.median(px[key == vals[i]], axis=0), counts[i] / len(px)))
    return out


def _patches(a, colour, tol: int = 7, least: float = 0.012) -> list[dict[str, Any]]:
    """Joined-up patches of one flat colour, biggest first. Each has its box as shares of the picture (x0, y0, x1,
    y1), the share of the picture it covers (area), how much of its box it fills (fill), how much of its box is ink
    (ink): a box that is nearly all one colour is empty; and how much its own colour varies (rough): a box drawn by
    a page is flat, a smooth part of a photograph is not."""
    from scipy import ndimage

    h, w = a.shape[:2]
    far = np.abs(a - colour).max(axis=2)
    lab, n = ndimage.label(far <= tol)
    if not n:
        return []
    sizes = np.bincount(lab.ravel())[1:]
    boxes = ndimage.find_objects(lab)
    out = []
    for i in np.argsort(-sizes)[:8]:
        if sizes[i] < least * h * w:
            break
        ys, xs = boxes[i]
        patch = lab[ys, xs] == i + 1
        # the box is the patch's solid part: a few stray pixels of the same colour that touch it (the soft edge of
        # a line of text) do not stretch it
        rows, cols = np.flatnonzero(patch.mean(axis=1) >= 0.5), np.flatnonzero(patch.mean(axis=0) >= 0.5)
        if len(rows) and len(cols):
            ys, xs = slice(ys.start + rows[0], ys.start + rows[-1] + 1), slice(xs.start + cols[0], xs.start + cols[-1] + 1)
            patch = lab[ys, xs] == i + 1
        box = far[ys, xs]
        rough = float(a[ys, xs][patch].std(axis=0).mean()) if patch.any() else float("inf")  # a ring-shaped patch has no solid part
        out.append({"colour": colour, "x0": xs.start / w, "x1": xs.stop / w, "y0": ys.start / h, "y1": ys.stop / h, "area": sizes[i] / (h * w),
                    "fill": float(patch.mean()), "ink": float(np.mean(box > 40)), "rough": rough, "box": (ys, xs)})
    return out


def verdict_image(im, title: str = "", crop: bool = False) -> tuple[str, list[str]]:
    """(verdict, why) for one captured page: from the title it was saved with, then from its pixels.

    blocked: a wall's title, or a near-empty page. covered: a light panel over a page that is dimmed everywhere
    else. banner: a full-width bar of another colour along the bottom edge, or along the top edge above the site's
    own bar. advert box: a large flat empty box. Otherwise ok. `crop=True` is for a crop in media/: a crop may
    start inside the site's own header, so the top-edge rule is left out."""
    found: list[tuple[str, str]] = []
    title = (title or "").strip()
    if BLOCKED_TITLE.match(title):
        found.append(("blocked", f'its title is "{title}"'))
    a = _small(im)
    h, w = a.shape[:2]
    colours = _flat_colours(a)
    ground = colours[0][0]
    ink = float(np.mean(np.abs(a - ground).max(axis=2) > INK))
    if ink < EMPTY and not crop:
        found.append(("blocked", f"a near-empty page: {ink:.1%} of it is anything but its background"))

    parts: list[dict[str, Any]] = []
    for colour, _ in colours[1:]:
        for p in _patches(a, colour):
            if not any(all(abs(p[k] - q[k]) < 0.01 for k in ("x0", "y0", "x1", "y1")) for q in parts):  # one patch found under two near colours
                parts.append(p | {"differs": int(np.abs(colour - ground).max()), "wide": p["x0"] <= 0.01 and p["x1"] >= 0.99})
    lum = a @ np.array([0.299, 0.587, 0.114])
    luma = lambda c: float(np.dot(c, [0.299, 0.587, 0.114]))  # noqa: E731

    # a dialog over a dimmed page: a panel clear of every edge, brighter than everything outside it. The panel can be
    # the commonest colour itself, when the dimmed page behind it is all pictures
    own = _patches(a, ground)
    for p in parts + own[:1]:
        size = (p["x1"] - p["x0"]) * (p["y1"] - p["y0"])
        clear = p["x0"] > 0.01 and p["y0"] > 0.01 and p["x1"] < 0.99 and p["y1"] < 0.99
        if clear and 0.02 <= size <= 0.7 and p["fill"] >= 0.55 and p["rough"] <= FLAT:
            ys, xs = p["box"]
            outside = np.ones((h, w), bool)
            outside[max(0, ys.start - 2): ys.stop + 2, max(0, xs.start - 2): xs.stop + 2] = False  # and the soft edge the scaling gives it
            if np.percentile(lum[outside], 99.5) <= luma(p["colour"]) - 25:
                found.append(("covered", f"a {_tone(p['colour'])} panel ({p['x1'] - p['x0']:.0%} by {p['y1'] - p['y0']:.0%} of the page) over a page that is dimmed everywhere else"))
                break

    parts = [p for p in parts if p["rough"] <= FLAT]  # from here on only what a page draws: flat colour
    bars = [p for p in parts if p["wide"] and p["differs"] > OTHER and 0.02 <= p["y1"] - p["y0"] <= 0.45 and 0.5 <= p["fill"] < 0.995]
    for p in bars:
        if p["y1"] >= 0.99:
            found.append(("banner", f"a {_tone(p['colour'])} bar along the bottom edge, from {p['y0']:.0%} down"))
        elif p["y0"] <= 0.01 and not crop:
            below = [q for q in bars if q is not p and q["y0"] >= p["y1"] - 0.01 and int(np.abs(q["colour"] - p["colour"]).max()) > OTHER]
            if below:
                q = min(below, key=lambda q: q["y0"])
                found.append(("banner", f"a {_tone(p['colour'])} bar along the top edge, down to {p['y1']:.0%}, above the site's own bar at {q['y0']:.0%}"))

    def where(p: dict[str, Any]) -> str:
        return f"{p['x0']:.0%} to {p['x1']:.0%} across, {p['y0']:.0%} to {p['y1']:.0%} down"

    for p in parts:
        tall, across = p["y1"] - p["y0"], p["x1"] - p["x0"]
        gutter = (p["x0"] <= 0.01 or p["x1"] >= 0.99) and tall >= 0.7
        if p["wide"]:
            if p["differs"] >= 6 and p["fill"] >= 0.995 and 0.05 <= tall <= 0.6:
                found.append(("advert box", f"a flat empty {_tone(p['colour'])} band, {where(p)}"))
        elif p["differs"] >= 6 and p["fill"] >= 0.95 and p["ink"] <= 0.025 and across >= 0.08 and tall >= 0.05 and not gutter:
            found.append(("advert box", f"a flat empty {_tone(p['colour'])} box, {where(p)}"))
    for p in own[1:]:  # a box drawn as an outline: page-coloured, shut off from the page, and empty
        tall, across = p["y1"] - p["y0"], p["x1"] - p["x0"]
        if p["rough"] <= FLAT and p["fill"] >= 0.97 and p["ink"] <= 0.01 and across >= 0.08 and tall >= 0.05 and p["x0"] > 0.005 and p["y0"] > 0.005 and p["x1"] < 0.995 and p["y1"] < 0.995:
            found.append(("advert box", f"an empty outlined box, {where(p)}"))

    if not found:
        return "ok", []
    worst = min((v for v, _ in found), key=VERDICTS.index)
    return worst, [why if v == worst else f"{v}: {why}" for v, why in sorted(found, key=lambda f: VERDICTS.index(f[0]))]


# ---------------------------------------------------------------- the edges of a crop

def _texty(ink, band, ground, least_runs: int) -> bool:
    """Is this band a row of text: several separate glyphs or words, mostly paper, the paper flat, and ink on paper
    with little in between. Text has only the soft edges of its letters between its two tones (measured: 0.2 to
    0.5 of the ink); a photograph has every tone in between (0.9 to 7 times the ink)."""
    if len(_runs(ink.any(axis=0))) < least_runs or not 0.02 <= ink.mean() <= 0.6:
        return False
    far = np.abs(band - ground).max(axis=2)
    if float(far[~ink].mean()) >= 12:
        return False  # the ground itself wanders: a picture
    return float(((far > 12) & ~ink).mean()) <= 0.7 * float(ink.mean())


def _side_rows(a) -> list[tuple[int, int]]:
    """Rows of text the LEFT edge of `a` passes through, as (first row, height) in pixels. A row of text is a band
    with ink in it, between clean paper above and below; the edge passes through it when its ink reaches the very
    first columns. A bar or a picture cut by the edge is not text and is left alone."""
    h, w = a.shape[:2]
    near = a[:, : max(16, round(w * 0.15))]
    paper = np.median(near, axis=1)  # each row's own ground: the paper, or a bar's colour
    inked = (np.abs(near - paper[:, None, :]).max(axis=2) > INK).any(axis=1)
    out = []
    for y0, y1 in _runs(inked):
        if not 0.008 * h <= y1 - y0 <= 0.14 * h:
            continue  # a hairline, or something too tall to be a row of text
        band = near[y0:y1]
        ground = _flat_colours(band)[0][0]
        ink = np.abs(band - ground).max(axis=2) > INK
        if _texty(ink, band, ground, 3) and ink[:, :2].any(axis=1).sum() >= max(2, 0.08 * (y1 - y0)):
            out.append((y0, y1 - y0))
    return out


def _top_rows(a) -> list[tuple[int, int]]:
    """The row of text the TOP edge passes through, if any: a band that starts on the first row, whose ink touches
    the edge in several separate strokes (a logo block or a picture touches it in one)."""
    h, w = a.shape[:2]
    near = a[: max(16, round(h * 0.15))]
    paper = np.median(near, axis=1)
    inked = (np.abs(near - paper[:, None, :]).max(axis=2) > INK).any(axis=1)
    runs = _runs(inked)
    if not runs or runs[0][0] > 1 or runs[0][1] >= len(near) or runs[0][1] < 0.008 * h:
        return []
    y1 = runs[0][1]
    band = near[:y1]
    ground = _flat_colours(band)[0][0]
    ink = np.abs(band - ground).max(axis=2) > INK
    strokes = _runs(ink[:2].any(axis=0))
    if _texty(ink, band, ground, 6) and len(strokes) >= 4 and float(np.median([b - a_ for a_, b in strokes])) <= y1:
        return [(0, y1)]
    return []


def cut_text(im) -> dict[str, list[tuple[float, float]]]:
    """Where the left, right or top edge of a page crop passes through a row of text, which is how a headline gets
    cut mid-word: {edge: [(how far down, how tall), ...]} in shares of the picture's height. The bottom edge is not
    judged: a crop always ends somewhere in the article."""
    from PIL import Image

    im = im.convert("RGB")
    if im.width > 1920:
        im = im.resize((1920, round(im.height * 1920 / im.width)), Image.BILINEAR)
    a = np.asarray(im).astype(np.int16)
    h = a.shape[0]
    return {side: [(y / h, t / h) for y, t in rows] for side, rows in (("left", _side_rows(a)), ("right", _side_rows(a[:, ::-1])), ("top", _top_rows(a)))}


def _cut_words(rows: list[tuple[float, float]]) -> str:
    if not rows:
        return "clear"
    y, t = max(rows, key=lambda r: r[1])
    if len(rows) == 1:
        return f"cuts text at {y:.0%} down ({t:.1%} tall)"
    return f"cuts text in {len(rows)} places, the tallest at {y:.0%} down ({t:.1%} tall)"


# ---------------------------------------------------------------- reading the project

def tag_lines(md: str) -> list[str]:
    """The script's tag lines, one per scene, as the parser reads them."""
    out = []
    for raw in md.splitlines():
        m = TAG_RE.match(raw.strip())
        if m and m.group(1).lower() in SCENE_TYPES:
            out.append(raw.strip())
    return out


def _json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def trace(crop: str, credit: str, sources: dict[str, dict]) -> str | None:
    """The real/ file a media/ crop was cut from. A page is credited to its site, so the site finds it; a photo is
    credited to its author, so any file with that credit line carries the same author and licence; with no credit
    to go by, the crop's own name."""
    stem = re.sub(r"-v$", "", Path(crop).stem.removeprefix("real-"))
    credit = (credit or "").strip()
    named = lambda names: [n for n in names if stem and (Path(n).stem == stem or stem in Path(n).stem or Path(n).stem in stem)]  # noqa: E731
    pages = [n for n, e in sources.items() if not e.get("licence") and e.get("url") and host(e["url"]) == credit.lower().removeprefix("www.")]
    if len(pages) > 1:
        pages = named(pages)
    if len(pages) == 1:
        return pages[0]
    photos = [n for n, e in sources.items() if e.get("licence") and credit and credit_line(e) == credit]
    if photos:
        return (named(photos) or photos)[0]
    if not credit:
        hits = [n for n in sources if Path(n).stem == stem or Path(n).stem.endswith("-" + stem)]
        if len(hits) == 1:
            return hits[0]
    return None


def outlet_name(entry: dict, scenes: list[dict] | None = None) -> str:
    """What to call a page's outlet: the name a scene gives it, else the end of its title, else its site."""
    for sc in scenes or []:
        if sc["url"] and _same_link(sc["url"], entry.get("url", "")) and sc["outlet"]:
            return sc["outlet"]
    title = entry.get("title") or ""
    if " | " in title and not BLOCKED_TITLE.match(title):
        tail = title.rsplit(" | ", 1)[1].strip()
        if 0 < len(tail.split()) <= 4:
            return tail
    return host(entry.get("url", ""))


def _same_link(a: str, b: str) -> bool:
    norm = lambda u: re.sub(r"^https?://(www\.)?", "", (u or "").strip().lower()).split("?")[0].rstrip("/")  # noqa: E731
    return bool(a and b) and norm(a) == norm(b)


def _names(text: str, key: str) -> bool:
    """Does this text name an outlet: 'thehill' in 'The Hill'; a short key ('cnn', 'nbc') must stand as a word."""
    if len(key) < 5:
        return bool(re.search(rf"(?<![a-z0-9]){re.escape(key)}(?![a-z0-9])", text.lower()))
    return key in _squeeze(text)


def _site_key(url: str) -> str:
    parts = host(url).split(".")
    if len(parts) >= 3 and parts[-2] in ("co", "org", "gov", "ac", "com"):
        parts = parts[:-1]
    return parts[-2] if len(parts) >= 2 else (parts[0] if parts else "")


def read_scenes(project: Path, md: str, sb: dict, sources: dict[str, dict]) -> list[dict[str, Any]]:
    """One row per scene: its class, the picture it will use, and what the label under its tile says."""
    tags = tag_lines(md)
    header = preflight._header(md)
    library = footage_library.manifest()
    media = project / "media"
    rows = []
    for i, sc in enumerate(sb["scenes"]):
        p = sc["props"]
        tag = tags[i] if i < len(tags) else ""
        src = str(p.get("src") or "")
        row: dict[str, Any] = {"n": sc["id"], "type": sc["type"], "class": "BOARD", "detail": "", "flags": [], "picture": None, "clip": None, "at": 0.0,
                               "words": "", "sentence": first_sentence(sc.get("narration") or ""), "narration": sc.get("narration") or "", "tag": tag,
                               "src": src, "source": None, "url": str(p.get("url") or ""), "outlet": str(p.get("outlet") or ""), "named": str(p.get("source") or ""),
                               "full_frame": False}
        if sc["type"] in FOOTAGE_TYPES and src.startswith("real-"):
            credit = str(p.get("credit") or "")
            row["source"] = trace(src, credit, sources)
            path = media / src
            row["picture"] = str(path) if path.is_file() else None
            row["full_frame"] = str(p.get("phone", "")).lower() not in ("on", "true", "yes", "1")
            kind, entry = "", {}
            if row["source"] and path.is_file():
                try:  # the thumbnail builder's rule for "real material with a licence on record"
                    kind = photo_source(project, path, credit_from=row["source"])["kind"]
                    entry = sources[row["source"]]
                except Refused:
                    kind = ""
            if not kind:  # nothing on record: go by how the script credits it (a page to its site, a photo to its author)
                kind = "page" if re.fullmatch(r"[\w.-]+\.[a-z]{2,}", credit) else "photo"
                row["flags"].append("no source on record in real/sources.json" if path.is_file() else "not in media/ yet")
            if kind == "page":
                row["class"] = "REAL PAGE"
                row["detail"] = host(entry.get("url", "")) or credit or "a captured page"
            else:
                row["class"] = "REAL PHOTO"
                row["detail"] = ", ".join(x for x in (entry.get("author"), entry.get("licence")) if x) or credit or "no licence on record"
            for lv, msg in preflight.real_material(tag, header):  # the standard for pages, asked of this one scene
                if msg.startswith(src + ":"):
                    row["flags"].append(_own_words(msg, src))
        elif sc["type"] in FOOTAGE_TYPES:
            entry = library.get(str(p.get("lib") or ""), {})
            phone = str(p.get("phone", "")).lower() in ("on", "true", "yes", "1") or bool(entry.get("phone"))
            clip = Path(footage_library.LIB) / entry["file"] if entry.get("file") else (media / src if src else None)
            row["clip"] = str(clip) if clip and clip.is_file() else None
            row["at"] = float(p.get("from") or 0) + 0.5
            if phone:
                row["class"], row["detail"] = "APP RECORDING", "check for balances"
            else:
                row["class"] = "STOCK"
                credit = str(p.get("credit") or entry.get("credit") or "")
                row["detail"] = credit or (f"to be found: {p.get('search')}" if p.get("search") else "footage")
            if not row["clip"]:
                row["words"] = f"not in media/ | {src}" if src else f"to be found | {p.get('search') or p.get('lib') or 'footage'}"
        else:
            row["detail"] = "a figure on paper" if sc["type"] in FIGURES else f"a retyped card: {p.get('outlet')}" if sc["type"] == "news" else "a drawing"
            row["words"] = _board_words(sc["type"], p)
        rows.append(row)
    return rows


def _board_words(kind: str, p: dict) -> str:
    """The words a board, a figure or a card will carry, for its tile."""
    bits = [p.get("value"), p.get("headline"), p.get("board"), p.get("title"), p.get("label"), p.get("room") and f"the room: {p['room']}", p.get("cta")]
    return " | ".join(str(b) for b in bits if b) or kind


def _own_words(msg: str, src: str) -> str:
    """One of preflight's findings about a page, said the board's way. A finding it does not know is passed on as it is."""
    if "none of its own words marked" in msg:
        n = re.search(r"(\d+) cards", msg)
        return f"{n.group(1) if n else 'several'} cards and none of the page's own words marked"
    if "zoom=in" in msg:
        return "a page that pushes in (zoom=in): it can lose the edge of its headline"
    return msg.removeprefix(src + ":").strip()


def read_captures(project: Path, sources: dict[str, dict], wanted: dict | None, scenes: list[dict]) -> list[dict[str, Any]]:
    """Every page capture in real/ with its verdict, and the scenes that use it or cite it."""
    from PIL import Image

    real = project / "real"
    pages = {n: e for n, e in sources.items() if e.get("url") and not e.get("licence")}
    for w in (wanted or {}).get("pages", []):
        pages.setdefault(w["name"] + ".png", {"url": w.get("url", ""), "title": ""})
    rows = []
    for name, entry in pages.items():
        path = real / name
        if path.is_file():
            verdict, why = verdict_image(Image.open(path), entry.get("title", ""))
        else:
            verdict, why = "blocked", ["no screenshot was saved: the page did not load"]
        key = _site_key(entry.get("url", ""))
        uses = [s["n"] for s in scenes if s["source"] == name]  # its picture is cut from this capture
        cites = [s["n"] for s in scenes if s["n"] not in uses and _same_link(s["url"], entry.get("url", ""))]  # it gives this page's link
        names = [s["n"] for s in scenes if s["n"] not in uses + cites and key and _names(" ".join((s["outlet"], s["named"])), key)]  # it names the outlet
        rows.append({"name": name, "url": entry.get("url", ""), "title": entry.get("title", ""), "outlet": outlet_name(entry, scenes), "verdict": verdict, "why": why,
                     "uses": uses, "cites": cites, "names": names})
    return rows


def read_crops(project: Path, scenes: list[dict], captures: list[dict]) -> list[dict[str, Any]]:
    """The crop check: every page crop in media/ (real-*.jpg and the upright -v files), each edge, and what the
    pixel rules still find in it. Report only."""
    from PIL import Image

    media = project / "media"
    page_names = {c["name"] for c in captures}
    by_src = {}
    for s in scenes:
        if s["class"] == "REAL PAGE":
            by_src.setdefault(s["src"], []).append(s["n"])
            m = re.search(r'\bvsrc="([^"]+)"', s["tag"])
            if m:
                by_src.setdefault(m.group(1), []).append(s["n"])
    rows = []
    for path in sorted(media.glob("real-*.jpg")) if media.is_dir() else []:
        used = by_src.get(path.name)
        if used is None:  # not in the script: a page crop if its name finds a capture
            stem = re.sub(r"-v$", "", path.stem.removeprefix("real-"))
            if not any(Path(n).stem == stem or Path(n).stem.endswith("-" + stem) or stem.endswith(Path(n).stem) for n in page_names):
                continue
        im = Image.open(path)
        verdict, why = verdict_image(im, crop=True)
        rows.append({"name": path.name, "size": f"{im.width}x{im.height}", "edges": cut_text(im), "still": verdict, "why": why, "scenes": used or []})
    return rows


# ---------------------------------------------------------------- the asks

def _best_scene(words: set[str], scenes: list[dict]) -> dict | None:
    """The scene whose sentence shares the most words with a page's title or a search: where it would go."""
    best, score = None, 0
    for s in scenes:
        hit = len(words & _words(" ".join((s["narration"], s["words"]))))
        if hit > score:
            best, score = s, hit
    return best


def build_asks(scenes: list[dict], captures: list[dict], wanted: dict | None, real: Path, sources: dict[str, dict]) -> tuple[list[dict], int]:
    """(the asks, how many were left out). An ask is written only when the automatic route failed: a blocked or
    covered page the script uses or cites or had asked for, or a search in wanted.json that returned nothing
    usable. Most valuable first: a page a scene shows, a page a scene cites, a search that found nothing, a page no
    scene names; then in the order of the scenes. Never more than MAX_ASKS."""
    if wanted is None:
        return [], 0
    by_n = {s["n"]: s for s in scenes}
    asks = []
    for c in captures:
        if c["verdict"] not in ("blocked", "covered"):
            continue
        named = c["uses"] or c["cites"] or c["names"]
        rank, scene = (0 if c["uses"] else 1, by_n[named[0]]) if named else (3, None)
        if scene is None:  # no scene names it: the scene it would go with
            slug = urlparse(c["url"]).path.replace("-", " ").replace("/", " ")
            scene = _best_scene(_words(slug if BLOCKED_TITLE.match(c["title"]) or not c["title"] else c["title"]), scenes)
        what = "would not let the screenshot in" if c["verdict"] == "blocked" else "is covered by a dialog"
        asks.append({"rank": rank, "scene": scene["n"] if scene else None, "sentence": scene["sentence"] if scene else "", "nearest": not named, "about": c["name"],
                     "text": f"{c['outlet']}'s page ({host(c['url'])}) {what}. Open {c['url']} on your phone and send a screenshot of the top of the article: "
                             "the masthead, the headline and the first lines."})
    for q in wanted.get("commons", []):
        got = [n for n in sources if re.fullmatch(re.escape(q["name"]) + r"-\d+\.\w+", n) and sources[n].get("licence") and (real / n).is_file()]
        if got:
            continue
        scene = _best_scene(_words(q.get("query", "")), scenes)
        asks.append({"rank": 2, "scene": scene["n"] if scene else None, "sentence": scene["sentence"] if scene else "", "nearest": True, "about": q["name"],
                     "text": f"The search for \"{q.get('query', q['name'])}\" found no photo with a free licence. Send one you took yourself, or the link to one "
                             "on Wikimedia Commons (CC BY, CC BY-SA or public domain)."})
    asks.sort(key=lambda a: (a["rank"], a["scene"] if a["scene"] is not None else 10**6))
    return asks[:MAX_ASKS], max(0, len(asks) - MAX_ASKS)


def named_sources(scenes: list[dict], captures: list[dict]) -> list[dict[str, Any]]:
    """The sources the script names (source=, url=), each with its scene: the list to gather first. `captured` holds
    the captures from the same outlet, if any: a page from that outlet is in real/, though it may not be the page
    the scene means, so it is said and not assumed."""
    out = []
    for s in scenes:
        if not (s["named"] or s["url"]):
            continue
        same = [c["name"] for c in captures if (s["url"] and _same_link(s["url"], c["url"])) or (_site_key(c["url"]) and _names(" ".join((s["named"], s["outlet"])), _site_key(c["url"])))
                or (c["outlet"] and len(_squeeze(c["outlet"])) >= 5 and _squeeze(c["outlet"]) in _squeeze(s["named"]))]
        out.append({"scene": s["n"], "type": s["type"], "source": " ".join(x for x in (s["outlet"], s["named"], s["url"]) if x), "captured": same})
    return out


# ---------------------------------------------------------------- the whole report

def report(project: str | Path) -> dict[str, Any]:
    """Everything the board, the verdicts and the asks say about one project. Nothing is written."""
    project = Path(project)
    md = (project / "script.md").read_text(encoding="utf-8")
    sb = parse_script(md)
    sources = _json(project / "real" / "sources.json") or {}
    wanted = _json(project / "real" / "wanted.json")
    scenes = read_scenes(project, md, sb, sources)
    captures = read_captures(project, sources, wanted, scenes)
    by_name = {c["name"]: c for c in captures}
    for s in scenes:
        c = by_name.get(s["source"] or "")
        if s["class"] == "REAL PAGE" and c:
            s["verdict"] = c["verdict"]
            s["detail"] += f" · capture: {c['verdict']}"
    crops = read_crops(project, scenes, captures)
    for s in scenes:  # what the crop check found, on the tile of each scene that shows the crop
        found: dict[str, list[str]] = {}
        for c in crops:
            if s["n"] in c["scenes"]:
                which = "upright crop" if c["name"] != s["src"] else "crop"
                cut = [side for side in ("left", "right", "top") if c["edges"][side]]
                for what in ([f"{c['still']} still in frame"] if c["still"] != "ok" else []) + ([f"{' and '.join(cut)} edge cuts text"] if cut else []):
                    found.setdefault(what, []).append(which)
        s["crop_notes"] = [f"{'both crops' if len(who) > 1 else who[0]}: {what}" for what, who in found.items()]
    asks, left_out = build_asks(scenes, captures, wanted, project / "real", sources)

    n_real = sum(1 for s in scenes if s["class"] in REAL)
    counts = {c: sum(1 for s in scenes if s["class"] == c) for c in CLASSES}
    heading = f"{n_real} of {len(scenes)} scenes show real material"
    plural = {"REAL PHOTO": "real photos", "REAL PAGE": "real pages", "APP RECORDING": "app recordings (check for balances)", "STOCK": "stock", "BOARD": "boards"}
    lines: list[tuple[str, str]] = [("plain", " · ".join(f"{counts[c]} {plural[c] if counts[c] != 1 or c == 'STOCK' else c.lower()}" for c in CLASSES if counts[c]))]
    first = scenes[0] if scenes else None
    is_long = sum(1 for s in scenes if s["type"] not in CARD_TYPES) >= LONG
    opening = ""
    if first and first["class"] in REAL and first["full_frame"]:
        opening = f"Opens on a {first['class'].lower()}, full frame."
        lines.append(("plain", opening))
    elif first and is_long:
        what = {"BOARD": "a board", "STOCK": "stock footage", "APP RECORDING": "an app recording"}.get(first["class"], "a real picture in a phone frame")
        opening = f"Opens on {what}, not a real picture: scene 1 is a [{first['type']}]."
        lines.append(("warn", opening))

    # the standard for pages and news, by asking preflight: script-wide findings here, a scene's own on its tile
    standard = []
    flagged = [s["n"] for s in scenes if any("own words marked" in f for f in s["flags"])]
    if flagged:
        standard.append(f"{len(flagged)} page scene{'s' if len(flagged) != 1 else ''} carr{'y' if len(flagged) != 1 else 'ies'} more than two cards and no mark on the page's own words: "
                        f"scene{'s' if len(flagged) != 1 else ''} {', '.join(map(str, flagged))}.")
    for lv, msg in preflight.real_material(md, preflight._header(md)):
        if re.match(r"^real-[^ ]+:", msg):
            continue  # a scene's own: on its tile
        if "brand.pagecards" in msg:
            carded = ["{} (scene {})".format(s["src"], s["n"]) for s in scenes if s["class"] == "REAL PAGE" and re.search(r'\bcards="[^"]+"', s["tag"])]  # where it bites
            which = f" On the pages with cards: {', '.join(carded)}." if carded else ""
            standard.append(f"{n_real} scene{'s' if n_real != 1 else ''} show a real page or photo and the header has no `brand.pagecards: strip`: "
                            f"their cards will sit on the picture, and on a page that means on its words.{which}")
        elif "recorded" in msg:
            standard.append("A news story with no `recorded:` line in the header: that line is what puts the date on the title card.")
        else:
            standard.append(msg)
    lines += [("warn", s) for s in standard]
    bad = [c for c in captures if c["verdict"] != "ok"]
    if captures:
        tally = ", ".join(f"{sum(1 for c in captures if c['verdict'] == v)} {v}" for v in VERDICTS if any(c["verdict"] == v for c in captures))
        lines.append(("warn" if bad else "plain", f"{len(captures)} captured pages: {tally} (verdicts.md)."))
    if wanted is None:
        lines.append(("plain", "Nothing gathered yet: no real/wanted.json. No asks; asks.md lists the sources to gather first."))
    else:
        lines.append(("warn" if asks else "plain", f"{len(asks)} ask{'s' if len(asks) != 1 else ''} for Jeffrey (asks.md)." if asks else "Nothing to ask Jeffrey for."))
    return {"project": str(project), "slug": sb.get("slug") or project.name, "title": sb.get("title", ""), "heading": heading, "lines": lines, "opening": opening,
            "real": n_real, "scenes_total": len(scenes), "counts": counts, "scenes": scenes, "captures": captures, "crops": crops, "asks": asks,
            "asks_left_out": left_out, "gather": named_sources(scenes, captures), "standard": standard, "has_wanted": wanted is not None}


# ---------------------------------------------------------------- what is written

def _cell(text: str) -> str:
    return str(text).replace("|", "/").replace("\n", " ")


def crop_table(crops: list[dict]) -> str:
    """The crop check as a table: one row per page crop in media/."""
    if not crops:
        return "No page crops in media/ (real-*.jpg cut from a captured page)."
    head = ["crop", "size", "left edge", "right edge", "top edge", "still in it", "scenes"]
    rows = [[c["name"], c["size"], _cut_words(c["edges"]["left"]), _cut_words(c["edges"]["right"]), _cut_words(c["edges"]["top"]),
             c["still"] if c["still"] == "ok" else f"{c['still']}: {'; '.join(c['why'])}", ", ".join(map(str, c["scenes"])) or "not used"] for c in crops]
    return "\n".join(["| " + " | ".join(head) + " |", "|" + "---|" * len(head)] + ["| " + " | ".join(_cell(x) for x in r) + " |" for r in rows])


def verdicts_md(rep: dict[str, Any]) -> str:
    out = [f"# Real material: {rep['slug']}", "", rep["heading"] + ".", ""] + [text for _, text in rep["lines"]] + ["", "## Page captures in real/", ""]
    if rep["captures"]:
        out += ["| capture | verdict | why | scenes |", "|---|---|---|---|"]
        for c in rep["captures"]:
            used = "; ".join(f"{how} {', '.join(map(str, c[k]))}" for k, how in (("uses", "shown in"), ("cites", "its link is in"), ("names", "its outlet is named in")) if c[k]) or "no scene"
            out.append(f"| {c['name']} | {c['verdict']} | {_cell('; '.join(c['why'])) or 'nothing found'} | {used} |")
        out += ["", "blocked or covered: the page cannot be used and an ask is written if the script wanted it. banner or advert box: usable once that part is cropped out.",
                "A bar along the top edge can be the site's own header: look before you crop."]
    else:
        out.append("No page has been captured (no real/sources.json).")
    out += ["", "## Page crops in media/", "", crop_table(rep["crops"]), "",
            "An edge that cuts text passes through a row of words: a headline cut there is cut mid-word. The bottom edge is not judged."]
    if rep["standard"] or any(s["flags"] for s in rep["scenes"]):
        out += ["", "## The standard for pages (pipeline.preflight)", ""] + [f"- {s}" for s in rep["standard"]]
        out += [f"- scene {s['n']} ({s['src']}): {f}." for s in rep["scenes"] for f in s["flags"]]
    if rep["has_wanted"] and rep["gather"]:
        verdict = {c["name"]: c["verdict"] for c in rep["captures"]}
        out += ["", "## Sources the script names", "", "No page from these is in real/. They are what the next gather could fetch.", ""]
        out += [f"- scene {g['scene']} [{g['type']}]: {g['source']}" for g in rep["gather"] if not g["captured"]] or ["- none"]
        if any(g["captured"] for g in rep["gather"]):
            out += ["", "A page from the same outlet is in real/ for these. It may not be the page the scene means, so check.", ""]
            out += [f"- scene {g['scene']} [{g['type']}]: {g['source']} (in real/: {'; '.join(f'{n} {verdict[n]}' for n in g['captured'])})" for g in rep["gather"] if g["captured"]]
    return "\n".join(out) + "\n"


def asks_md(rep: dict[str, Any]) -> str:
    out = [f"# Asks for Jeffrey: {rep['slug']}", ""]
    if not rep["has_wanted"]:
        out += ["No asks. Nothing has been gathered for this video yet (there is no real/wanted.json), so nothing has failed.", ""]
        todo = [g for g in rep["gather"] if not g["captured"]]
        if todo:
            out += [f"Gather these first: the {len(todo)} sources the script names that have no captured page.", ""]
            out += [f"- scene {g['scene']} [{g['type']}]: {g['source']}" for g in todo]
        else:
            out.append("The script names no source (source=, url=) to gather.")
        return "\n".join(out) + "\n"
    if not rep["asks"]:
        return "\n".join(out + ["No asks. Everything the script wanted was found."]) + "\n"
    out += ["Only what could not be found. Most valuable first.", ""]
    for i, a in enumerate(rep["asks"], 1):
        tie = "No scene yet." if not a["scene"] else f"Scene {a['scene']}, \"{a['sentence']}\"" + (" (the nearest scene: none names it yet)" if a["nearest"] else "")
        out.append(f"{i}. {tie} {a['text']}")
    if rep["asks_left_out"]:
        out += ["", f"{rep['asks_left_out']} more could not be found and are left out: five is the most he is asked for at once (verdicts.md has them all)."]
    return "\n".join(out) + "\n"


def record(rep: dict[str, Any]) -> dict[str, Any]:
    """board.json: the report without the long text, for another tool."""
    keep = ("n", "type", "class", "detail", "flags", "crop_notes", "src", "source", "sentence")
    return {"slug": rep["slug"], "heading": rep["heading"], "real": rep["real"], "scenes_total": rep["scenes_total"], "counts": rep["counts"], "opening": rep["opening"],
            "lines": [text for _, text in rep["lines"]], "scenes": [{k: s[k] for k in keep} | {"verdict": s.get("verdict")} for s in rep["scenes"]],
            "captures": [{k: c[k] for k in ("name", "url", "outlet", "verdict", "why", "uses", "cites", "names")} for c in rep["captures"]],
            "crops": [{"name": c["name"], "size": c["size"], "edges": c["edges"], "still": c["still"], "why": c["why"], "scenes": c["scenes"]} for c in rep["crops"]],
            "asks": [{k: a[k] for k in ("scene", "sentence", "nearest", "about", "text")} for a in rep["asks"]], "asks_left_out": rep["asks_left_out"],
            "gather": rep["gather"], "standard": rep["standard"]}


# ---------------------------------------------------------------- the picture

GROUND, WHITE, GREY, AMBER, PAPER, INK_C = (24, 24, 24), (255, 255, 255), (170, 170, 170), (255, 196, 92), (246, 243, 236), (30, 30, 30)
TILE_H = round(thumbnail.TILE_W * 9 / 16)
CHIP = {"REAL PHOTO": (WHITE, INK_C), "REAL PAGE": (WHITE, INK_C), "APP RECORDING": (AMBER, INK_C), "STOCK": ((96, 96, 100), WHITE), "BOARD": ((52, 52, 56), GREY)}


def _fit(d, text: str, font, width: int) -> str:
    """The text cut to fit a width, with an ellipsis."""
    if d.textlength(text, font=font) <= width:
        return text
    while text and d.textlength(text + "…", font=font) > width:
        text = text[:-1]
    return text.rstrip() + "…"


def _wrap(d, text: str, font, width: int, most: int) -> list[str]:
    lines, cur = [], ""
    for word in text.split():
        if cur and d.textlength(cur + " " + word, font=font) > width:
            lines.append(cur)
            cur = word
        else:
            cur = (cur + " " + word).strip()
    lines.append(cur)
    if len(lines) > most:
        lines = lines[:most]
        lines[-1] = _fit(d, lines[-1] + " …", font, width)
    return [_fit(d, ln, font, width) for ln in lines]


def _slot(im):
    """A picture fitted whole into a tile, on the board's ground."""
    from PIL import Image

    tw = thumbnail.TILE_W
    s = min(tw / im.width, TILE_H / im.height)
    im = im.convert("RGB").resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    tile = Image.new("RGB", (tw, TILE_H), (40, 40, 44))
    tile.paste(im, ((tw - im.width) // 2, (TILE_H - im.height) // 2))
    return tile


def _frame(clip: str, at: float):
    """One frame of a clip, or None when there is no ffmpeg or the clip will not read."""
    from PIL import Image

    for t in (at, 0.0):
        try:
            got = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-ss", f"{t:.2f}", "-i", clip, "-frames:v", "1", "-vf", "scale=640:-2", "-f", "image2pipe", "-vcodec", "png", "-"],
                                 capture_output=True, timeout=60, stdin=subprocess.DEVNULL).stdout
            if got:
                return Image.open(io.BytesIO(got)).convert("RGB")
        except (OSError, subprocess.SubprocessError, ValueError):
            return None
    return None


def _paper(words: str, ground=PAPER, ink=INK_C):
    """A board's tile: its words on paper. The render draws the real thing; this says what the scene carries."""
    from PIL import Image, ImageDraw

    tile = Image.new("RGB", (thumbnail.TILE_W, TILE_H), ground)
    d = ImageDraw.Draw(tile)
    parts = [p.strip() for p in words.split("|") if p.strip()] or [""]
    y = 30  # below the scene's number
    for k, part in enumerate(parts[:3]):
        font = thumbnail._face(24 if k == 0 else 15)
        for ln in _wrap(d, part, font, thumbnail.TILE_W - 28, 2 if k == 0 else 2):
            d.text((14, y), ln, font=font, fill=ink)
            y += 30 if k == 0 else 20
        y += 6
    return tile


def tile_for(row: dict[str, Any]):
    """The picture one scene will use, at tile size."""
    if row["picture"]:
        return _slot(tile_image(Path(row["picture"])))
    if row["clip"]:
        frame = _frame(row["clip"], row["at"])
        if frame is not None:
            return _slot(frame)
    if row["class"] == "BOARD":
        return _paper(row["words"])
    return _paper(row["words"] or row["class"].lower(), ground=(60, 60, 64), ink=WHITE)


def draw_board(path: Path, rep: dict[str, Any], cols: int = 6) -> Path:
    """board.png: one tile per scene, each labelled with its number, its type and its class."""
    from PIL import Image, ImageDraw

    face = thumbnail._face
    rows = rep["scenes"]
    tw, gap, cap = thumbnail.TILE_W, 14, 86
    top = 66 + 22 * len(rep["lines"]) + 14
    width = cols * tw + (cols + 1) * gap
    height = top + ((len(rows) + cols - 1) // cols) * (TILE_H + cap) + gap
    im = Image.new("RGB", (width, height), GROUND)
    d = ImageDraw.Draw(im)
    d.text((gap, 14), rep["heading"], font=face(32), fill=WHITE)
    d.text((gap + d.textlength(rep["heading"], font=face(32)) + 18, 29), _fit(d, rep["title"], face(15), 700), font=face(15), fill=GREY)
    for k, (kind, text) in enumerate(rep["lines"]):
        d.text((gap, 62 + 22 * k), _fit(d, text, face(15), width - 2 * gap), font=face(15), fill=AMBER if kind == "warn" else (225, 225, 225))
    for k, row in enumerate(rows):
        x = gap + (k % cols) * (tw + gap)
        y = top + (k // cols) * (TILE_H + cap)
        im.paste(tile_for(row), (x, y))
        d.rectangle([x, y, x + tw - 1, y + TILE_H - 1], outline=WHITE if row["class"] in REAL else (70, 70, 74), width=2 if row["class"] in REAL else 1)
        num = str(row["n"])
        d.rectangle([x, y, x + 14 + d.textlength(num, font=face(14)), y + 22], fill=GROUND)
        d.text((x + 7, y + 3), num, font=face(14), fill=WHITE)
        fill, ink = CHIP[row["class"]]
        cw = d.textlength(row["class"], font=face(12)) + 12
        d.rectangle([x, y + TILE_H + 6, x + cw, y + TILE_H + 24], fill=fill)
        d.text((x + 6, y + TILE_H + 8), row["class"], font=face(12), fill=ink)
        d.text((x + cw + 8, y + TILE_H + 8), row["type"], font=face(12), fill=GREY)
        d.text((x, y + TILE_H + 28), _fit(d, row["detail"], face(12), tw), font=face(12), fill=(225, 225, 225))
        notes = ([f"its capture is {row['verdict']}"] if row.get("verdict") in ("blocked", "covered") else []) + row.get("crop_notes", []) + row["flags"]
        for j, ln in enumerate(_wrap(d, "; ".join(notes), face(12), tw, 2) if notes else []):
            d.text((x, y + TILE_H + 45 + 16 * j), ln, font=face(12), fill=AMBER)
    im.save(path)
    return path


# ---------------------------------------------------------------- the command

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m pipeline.realboard", description="The real-material board, the verdicts on captured pages and the ask list for one project.")
    ap.add_argument("project", help="the project folder, e.g. projects/nvidia-400-billion")
    ap.add_argument("--out", required=True, help="the folder to write board.png, verdicts.md, asks.md and board.json into; it is never chosen for you")
    args = ap.parse_args(argv)
    project = Path(args.project)
    if not (project / "script.md").is_file():
        print(f"no script.md in {project}", file=sys.stderr)
        return 2
    rep = report(project)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    draw_board(out / "board.png", rep)
    (out / "verdicts.md").write_text(verdicts_md(rep), encoding="utf-8")
    (out / "asks.md").write_text(asks_md(rep), encoding="utf-8")
    (out / "board.json").write_text(json.dumps(record(rep), indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(rep["heading"])
    for _, text in rep["lines"]:
        print("  " + text)
    print()
    for c in rep["captures"]:
        print(f"  {c['name']:24s} {c['verdict']:10s} {'; '.join(c['why'])}")
    print()
    print(crop_table(rep["crops"]))
    print()
    print(asks_md(rep).rstrip())
    print()
    print(f"written: {out / 'board.png'}, {out / 'verdicts.md'}, {out / 'asks.md'}, {out / 'board.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
