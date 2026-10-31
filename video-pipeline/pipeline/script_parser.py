"""Parse a tagged Markdown script into a storyboard dict.

Script format (see README):

    # Video title
    kicker: Money basics            <- optional header lines before the first tag

    [title subtitle="..."]
    Narration you will read aloud.

    [stat value="$10,000" label="..." source="..."]
    More narration.

    [list title="The order"]
    - item one
    - item two
    Narration for the list.

    [chart line title="..." y="$" x="Year" source="..."]
    data: Index fund = 0:10000, 10:19672, 20:38697
    Narration.

A script with no tags still works: each paragraph becomes a scene and
numbers are turned into stat callouts where it is obvious.
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from typing import Any

from . import setpiece
from . import craft

WORDS_PER_SEC = 2.6  # typical YouTube narration pace; replaced by real timings after alignment
SCENE_GAP_SEC = 0.35
SCENE_TYPES = {"title", "text", "stat", "list", "chart", "compare", "quote", "image", "still", "clip", "poster", "score", "avatar", "outro", "art", "bite", "grow", "pie", "shrink", "takeaway", "recap", "hook", "broll", "news", "set"}

TAG_RE = re.compile(r"^\[(\w+)([^\]]*)\]\s*$")
ATTR_RE = re.compile(r'(\w+)=(?:"([^"]*)"|(\S+))')
FLAG_RE = re.compile(r"(?<![\w=\"])([A-Za-z_]\w*)(?![\w=\"])")
CUE_RE = re.compile(r"\{([a-z_]+)\}")
POSE_NAMES = {"idle", "point", "crossed", "think", "shocked", "thumbsup", "facepalm", "laugh", "wave", "shrug"}
FACE_NAMES = {"neutral", "happy", "angry", "sad", "smug", "surprised", "confused", "laugh_face", "closed", "flat"}
MONEY_OR_PCT_RE = re.compile(r"\$\s?[\d,]+(?:\.\d+)?[KMBTkmbt]?|[\d,]+(?:\.\d+)?\s?%")


@dataclass
class Block:
    type: str
    attrs: dict[str, Any] = field(default_factory=dict)
    prose: list[str] = field(default_factory=list)
    items: list[str] = field(default_factory=list)
    quote: list[str] = field(default_factory=list)
    data_lines: list[str] = field(default_factory=list)
    bars: str | None = None
    left: str | None = None
    right: str | None = None


def _parse_tag(line: str) -> tuple[str, dict[str, Any]] | None:
    m = TAG_RE.match(line.strip())
    if not m:
        return None
    typ = m.group(1).lower()
    if typ not in SCENE_TYPES:
        return None
    rest = m.group(2)
    attrs: dict[str, Any] = {}
    for key, quoted, bare in ATTR_RE.findall(rest):
        attrs[key] = quoted if quoted != "" else bare
    stripped = ATTR_RE.sub(" ", rest)
    for flag in FLAG_RE.findall(stripped):
        attrs[flag.lower()] = True
    return typ, attrs


def _num(s: str) -> float:
    return float(s.strip().replace("$", "").replace(",", "").replace("%", ""))


def _parse_points(spec: str) -> list[list[float]]:
    pts = []
    for pair in spec.split(","):
        pair = pair.strip()
        if not pair:
            continue
        x, y = pair.split(":")
        pts.append([_num(x), _num(y)])
    return pts


def _parse_side(spec: str) -> dict[str, Any]:
    parts = [p.strip() for p in spec.split("|")]
    side: dict[str, Any] = {"title": parts[0] if parts else ""}
    if len(parts) > 1 and parts[1]:
        side["value"] = parts[1]
    if len(parts) > 2 and parts[2]:
        side["items"] = [i.strip() for i in parts[2].split(";") if i.strip()]
    return side


def _block_to_props(b: Block, title_default: str) -> dict[str, Any]:
    a = dict(b.attrs)
    p: dict[str, Any] = {}
    if b.type == "title":
        p["title"] = a.get("title", title_default)
        for k in ("subtitle", "kicker"):
            if k in a:
                p[k] = a[k]
    elif b.type == "text":
        # board= sets the words written (lines split on |); wrong= is written first and rubbed out
        for k in ("headline", "board", "wrong"):
            if k in a:
                p[k] = a[k]
    elif b.type == "stat":
        # fact="uk.cpi" (or plain words: "uk inflation") is filled in at render time with the real figure, its source and date
        for k in ("value", "label", "sub", "source", "from", "trend", "fact", "count", "countSeconds"):  # count=off: the figure is written, not counted up
            if k in a:
                p[k] = a[k]
        if "count" in a:
            p["countSeconds"] = float(a["count"])
    elif b.type == "list":
        p["items"] = b.items
        if "title" in a:
            p["title"] = a["title"]
        if a.get("unnumbered") or a.get("checks"):
            p["numbered"] = False
    elif b.type == "chart":
        p["chartType"] = "bar" if (a.get("bar") or b.bars) else "line"
        for k in ("title", "source"):
            if k in a:
                p[k] = a[k]
        if "y" in a:
            p["yFormat"] = a["y"]
        if "x" in a:
            p["xLabel"] = a["x"]
        if p["chartType"] == "line":
            series = []
            for line in b.data_lines:
                name = None
                spec = line
                if "=" in line:
                    name, spec = line.split("=", 1)
                    name = name.strip()
                series.append({"name": name, "points": _parse_points(spec)} if name else {"points": _parse_points(spec)})
            p["series"] = series
        else:
            bars = []
            for pair in (b.bars or "").split(","):
                pair = pair.strip()
                if not pair:
                    continue
                label, val = pair.rsplit(":", 1)
                bars.append({"label": label.strip(), "value": _num(val)})
            p["bars"] = bars
    elif b.type == "compare":
        if "title" in a:
            p["title"] = a["title"]
        if "source" in a:
            p["source"] = a["source"]
        p["left"] = _parse_side(b.left or a.get("left", "A"))
        p["right"] = _parse_side(b.right or a.get("right", "B"))
        # the right side is the better one (green tick) unless good=left says the left is
        if a.get("good") in ("left", "right"):
            p["good"] = a["good"]
    elif b.type == "quote":
        p["quote"] = " ".join(b.quote) if b.quote else " ".join(b.prose)
        if "by" in a:
            p["attribution"] = a["by"]
    elif b.type in ("image", "still"):
        for k in ("src", "caption", "prompt", "credit", "zoom", "search", "fallback", "want", "from", "focus", "mag", "rotate", "flip", "bright", "contrast", "sat", "bw", "look"):
            if k in a:
                p[k] = a[k]
    elif b.type in ("clip", "broll"):
        # broll: the footage fills the whole frame, a short caption and the credit over it; clip: the framed card
        # phone=on: a vertical screen recording shown in a drawn phone on the board, the cards beside it
        for k in ("src", "caption", "credit", "fallback", "search", "want", "zoom", "focus", "mag", "rotate", "flip", "bright", "contrast", "sat", "bw", "look", "lib", "phone"):
            if k in a:
                p[k] = a[k]
        if "pick" in a:  # pick=2: the second of the finder's candidates (footage-candidates.png shows three)
            p["pick"] = int(a["pick"])
        if "stock" in a:  # stock=27028: that exact library clip, by the number on the scout sheet
            p["stock"] = a["stock"]
        if "from" in a:
            p["from"] = float(a["from"])
        if "vol" in a:
            p["vol"] = float(a["vol"])
        if "next" in a:  # next=on: a preview of another of the channel's videos, framed under "Watch next"
            p["next"] = a["next"]
    elif b.type == "news":
        # a real headline: search= asks the render to find one (GDELT, reputable outlets), or give headline/outlet/date/url yourself
        for k in ("search", "headline", "outlet", "date", "url", "caption", "source", "board"):  # board=: the line shown if no headline is found
            if k in a:
                p[k] = a[k]
    elif b.type == "poster":
        for k in ("src", "title", "year", "director", "runtime", "genre", "starring", "tagline"):
            if k in a:
                p[k] = str(a[k])
    elif b.type == "score":
        for k in ("value", "max", "label", "verdict"):
            if k in a:
                p[k] = str(a[k])
    elif b.type == "avatar":
        for k in ("headline", "sub"):
            if k in a:
                p[k] = a[k]
    elif b.type == "outro":
        for k in ("title", "cta", "cards"):  # cards=on shows the two end-screen boxes (off unless asked for)
            if k in a:
                p[k] = a[k]
    elif b.type == "art":
        # one big drawing from the art library, with a handwritten line above and a note under it
        for k in ("name", "headline", "title", "caption", "sub"):
            if k in a:
                p[k] = a[k]
    elif b.type == "recap":
        # the takeaways again, as a checklist ticked one by one; `- ` lines set them, else fill_recaps copies the cards
        p["items"] = b.items
        if "title" in a:
            p["title"] = a["title"]
    elif b.type == "hook":
        # the first five seconds: one line big on a clean board before the title; board= sets the words, art= a drawing beside it
        for k in ("board", "art"):
            if k in a:
                p[k] = a[k]
    elif b.type == "takeaway":
        # a numbered section card: the big number drawn, the title written; n and of are filled in by number_takeaways
        for k in ("n", "of", "title"):
            if k in a:
                p[k] = a[k]
    elif b.type in ("bite", "grow", "pie", "shrink"):
        # the money pictures: a bar with a bite out of it, bars growing year by year, a pie slice, a note that shrinks;
        # every attribute is the picture's own (value, lose, pct, from, to, years, rate, per, label, sub, source)
        for k, v in a.items():
            p[k] = v
    if "dur" in a:
        p["dur"] = float(a["dur"])
    # The character can be placed and posed on any scene; a doodle (icon=) can be drawn on any scene on the board.
    for k in ("pos", "pose", "face", "scale", "icon", "keep", "transition", "tint", "anim", "screen"):  # anim=coins-jar: a drawn loop where a drawing would go; screen=laptop: footage in a drawn laptop  # tint=red: every figure on the board in red (bad news)  # keep=yes|arrow|strike builds on the board before; transition=wipe|slide|cut picks how it comes in
        if k in a:
            p[k] = a[k]
    if "dur" in a and "dur" not in p:  # dur=6.4 on any scene: its length in seconds when there is no recording to time it
        try:
            p["dur"] = float(a["dur"])
        except ValueError:
            pass
    # a sticker (GIF or picture) on any scene, with its own edits as sticker_<edit>; a drawing from the art library
    # on any scene as art=<name> with art_at, art_size, art_start (art=off keeps the corner clear)
    for k, v in a.items():
        if k == "sticker" or k.startswith("sticker_") or k == "art" or k.startswith("art_") or k == "clip" or k.startswith("clip_"):  # clip="busy high street": stock b-roll in the picture column
            p[k] = v
    return p


def split_cues(text: str) -> tuple[str, list[dict[str, Any]]]:
    """'Look at this {shocked} thing' -> ('Look at this thing', [{'word': 3, 'pose': 'shocked'}]).

    The word index is the index of the word the cue precedes, in the cleaned text.
    A face name changes the expression only; a pose name changes body and expression.
    """
    cues: list[dict[str, Any]] = []
    out: list[str] = []
    for tok in text.split():
        m = CUE_RE.fullmatch(tok)
        if m:
            name = m.group(1)
            if name in POSE_NAMES:
                cues.append({"word": len(out), "pose": name})
            elif name in FACE_NAMES:
                cues.append({"word": len(out), "face": name.replace("_face", "")})
            continue
        # cue glued to a word, e.g. "{angry}No."
        inner = CUE_RE.findall(tok)
        cleaned = CUE_RE.sub("", tok)
        for name in inner:
            if name in POSE_NAMES:
                cues.append({"word": len(out), "pose": name})
            elif name in FACE_NAMES:
                cues.append({"word": len(out), "face": name.replace("_face", "")})
        if cleaned:
            out.append(cleaned)
    return " ".join(out), cues


def _narration_for(b: Block) -> str:
    prose = " ".join(x.strip() for x in b.prose if x.strip())
    if prose:
        return prose
    # Nothing written as prose: assume the narrator reads the visual content aloud.
    if b.type == "list":
        return ". ".join(b.items)
    if b.type == "quote":
        return " ".join(b.quote)
    return ""


def _spread_words(text: str, start: float, end: float) -> list[dict[str, Any]]:
    ws = text.split()
    if not ws:
        return []
    step = (end - start) / len(ws)
    return [{"w": w, "s": round(start + i * step, 3), "e": round(start + (i + 1) * step - 0.04, 3)} for i, w in enumerate(ws)]


def fill_recaps(scenes: list[dict[str, Any]]) -> None:
    """A recap with no lines of its own lists the video's takeaway cards, in order."""
    titles = [str(sc["props"].get("title", "")).strip() for sc in scenes if sc["type"] == "takeaway"]
    titles = [t for t in titles if t]
    for sc in scenes:
        if sc["type"] == "recap" and not sc["props"].get("items"):
            sc["props"]["items"] = list(titles)


def number_takeaways(scenes: list[dict[str, Any]]) -> None:
    """Takeaway cards count themselves: the first is 1 of N unless the tag says otherwise."""
    cards = [sc for sc in scenes if sc["type"] == "takeaway"]
    for i, sc in enumerate(cards):
        sc["props"].setdefault("n", str(i + 1))
        sc["props"].setdefault("of", str(len(cards)))


def time_cues(sc: dict[str, Any]) -> None:
    """Turn word-indexed cues into absolute times using the scene's word timings."""
    words = sc.get("words") or []
    cues = []
    for c in sc.get("cueWords", []):
        i = min(c["word"], max(0, len(words) - 1))
        t = words[i]["s"] - 0.08 if words else sc["start"]
        cue = {"t": round(max(sc["start"], t), 3)}
        if "pose" in c:
            cue["pose"] = c["pose"]
        if "face" in c:
            cue["face"] = c["face"]
        cues.append(cue)
    if sc.get("setWords") is not None:
        cues += setpiece.timed(sc)
    for m in sc.get("markWords") or []:
        i = min(m["word"], max(0, len(words) - 1))
        t = words[i]["s"] - 0.08 if words else sc["start"]
        cues.append({"t": round(max(sc["start"], t), 3), "do": "mark", **m["mark"]})
    sc["cues"] = cues


def estimate_timings(scenes: list[dict[str, Any]], lead_in: float = 0.4) -> float:
    """Fill start/end/words with a reading-pace estimate. Returns total duration."""
    t = lead_in
    for sc in scenes:
        n = len(sc["narration"].split())
        dur = sc["props"].get("dur") or max(2.5, n / WORDS_PER_SEC + SCENE_GAP_SEC)
        sc["start"] = round(t, 3)
        sc["end"] = round(t + dur, 3)
        sc["words"] = _spread_words(sc["narration"], t + 0.15, t + dur - 0.25)
        time_cues(sc)
        t += dur
    return round(t + 1.0, 3)


def pace_for(header: dict[str, str]) -> tuple[float, float]:
    """How much air each scene gets: (lead, hold) in seconds. `pace: calm` (the illustrated style's default) gives the
    picture time to land before the first words and a beat after the last before the board is rubbed out; `pace: tight`
    runs the scenes back to back. `pace.lead` and `pace.hold` set the numbers by hand."""
    style = str(header.get("brand.style", "icons")).lower()
    # a real recording runs on without pauses and its scenes are cut mid-sentence: silence at every cut chops the voice
    recorded = str(header.get("source", "")).lower() == "voiceover"
    pace = str(header.get("pace", "calm" if style == "illustrated" and not recorded else "tight")).lower()
    lead, hold = (1.2, 0.6) if pace == "calm" else (0.0, 0.0)
    if "pace.lead" in header:
        lead = max(0.0, float(header["pace.lead"]))
    if "pace.hold" in header:
        hold = max(0.0, float(header["pace.hold"]))
    return lead, hold


def pace_scenes(sb: dict[str, Any], lead: float, hold: float) -> list[tuple[float, float]]:
    """Open the scenes up: every scene starts `lead` seconds before its first word and keeps `hold` seconds after its
    last, so a drawing can land before the words and the rub-out has a beat of its own. Scenes stay back to back; the
    words (and cues) of scene i move later by i * (lead + hold) + lead. Returns the (at, length) silences to put into
    the voiceover, in the original audio's time, so the voice moves with the words."""
    scenes = sb["scenes"]
    gap = lead + hold
    if not scenes or gap <= 0:
        return []
    silences: list[tuple[float, float]] = [(0.0, lead)]
    old_bounds = [sc["end"] for sc in scenes]
    for i, sc in enumerate(scenes):
        shift = i * gap + lead
        for w in sc.get("words", []) or []:
            w["s"] = round(w["s"] + shift, 3)
            w["e"] = round(w["e"] + shift, 3)
        for c in sc.get("cues", []) or []:
            if "t" in c:
                c["t"] = round(c["t"] + shift, 3)
        sc["start"] = round(sc["start"] + (i * gap), 3)  # the lead sits inside the scene, before its first word
        sc["end"] = round(sc["end"] + (i + 1) * gap, 3)  # the hold after the last word, then the next scene's lead
    if len(scenes) > 1:
        silences += [(b, gap) for b in old_bounds[:-1]]
    sb["durationSec"] = round(scenes[-1]["end"] + 0.6, 3)
    return silences


def room_for_silent(sb: dict[str, Any], after: float = 0.15, lead: float = 0.25) -> list[tuple[float, float]]:
    """A card with no words between two spoken scenes (the title after the teasers) was given its `dur` out of the end
    of the scene before it, so it covered the last line said there. Each one now gets its own stretch: it starts just
    after the last word before it and runs its `dur`, and the voice after it moves later to make the room. Returns the
    (at, length) silences to put into the voiceover, in its own clock, as pace_scenes does."""
    scenes = sb["scenes"]
    spoken = [i for i, sc in enumerate(scenes) if sc.get("words")]
    if len(spoken) < 2:
        return []
    silences: list[tuple[float, float]] = []
    shift = 0.0

    def move(sc: dict[str, Any], by: float) -> None:
        for w in sc.get("words", []) or []:
            w["s"] = round(w["s"] + by, 3)
            w["e"] = round(w["e"] + by, 3)
        for c in sc.get("cues", []) or []:
            if "t" in c:
                c["t"] = round(c["t"] + by, 3)
        sc["start"] = round(sc["start"] + by, 3)
        sc["end"] = round(sc["end"] + by, 3)

    for i, sc in enumerate(scenes):
        if shift:
            move(sc, shift)
        if sc.get("words") or not (spoken[0] < i < spoken[-1]):
            continue
        prev = max(j for j in spoken if j < i)
        nxt = min(j for j in spoken if j > i)
        dur = float(sc["props"].get("dur", 3.0))
        start = scenes[prev]["words"][-1]["e"] + after
        first_next = scenes[nxt]["words"][0]["s"] + shift  # not moved yet
        need = round(start + dur + lead - first_next, 3)
        if need > 0.05:
            silences.append((round(start - shift, 3), need))
            shift += need
        scenes[i - 1]["end"] = round(start, 3)
        sc["start"], sc["end"] = round(start, 3), round(start + dur, 3)
        if i + 1 < len(scenes):
            scenes[i + 1]["start"] = round(start + dur, 3) - shift  # moved by `shift` when its turn comes
    if shift:
        sb["durationSec"] = round(sb.get("durationSec", scenes[-1]["end"]) + shift, 3)
    return silences


_DRAWINGS: tuple[set[str], set[str]] | None = None


def _drawing_names() -> tuple[set[str], set[str]]:
    """(drawings art= can name, doodles icon= can name), read from the renderer's own lists: art.tsx's catalogue,
    the traced illustrations and stop-motion strips (library manifests) and doodles.ts."""
    global _DRAWINGS
    if _DRAWINGS is None:
        here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        paper = os.path.join(here, "remotion", "src", "paper")
        art, icons = set(), set()
        try:
            art |= set(re.findall(r"^  '?([a-z0-9-]+)'?: \{$", open(os.path.join(paper, "art.tsx"), encoding="utf-8").read(), re.M))
            icons |= set(re.findall(r'"([a-z0-9-]+)":\[\[', open(os.path.join(paper, "doodles.ts"), encoding="utf-8").read()))
            for lib in ("illus", "flipbook"):
                art |= {e["name"] for e in json.load(open(os.path.join(here, "library", lib, "manifest.json"), encoding="utf-8"))}
        except (OSError, ValueError):
            pass
        _DRAWINGS = (art, icons)
    return _DRAWINGS


def _unknown_drawings(i: int, props: dict[str, Any]) -> list[str]:
    """A name the renderer does not have draws nothing, silently (icon=warning on a board: the doodle is
    triangle-alert): say so at build time."""
    art, icons = _drawing_names()
    out = []
    if art and props.get("art") and props["art"] not in art | {"off", "none"}:
        out.append(f"scene {i}: art={props['art']} is not a drawing in the library; nothing will be drawn")
    if icons and props.get("icon") and props["icon"] not in icons:
        out.append(f"scene {i}: icon={props['icon']} is not a doodle (icon= takes a doodle name from doodles.ts); nothing will be drawn")
    return out


def _auto_blocks(paragraphs: list[str]) -> list[Block]:
    """Untagged script: make reasonable scenes from plain paragraphs."""
    blocks: list[Block] = []
    for i, para in enumerate(paragraphs):
        lines = [l for l in para.splitlines() if l.strip()]
        items = [l[2:].strip() for l in lines if l.startswith("- ")]
        prose = [l for l in lines if not l.startswith("- ")]
        text = " ".join(prose)
        if i == 0:
            blocks.append(Block("title", {}, prose=prose))
        elif len(items) >= 2:
            blocks.append(Block("list", {}, prose=prose, items=items))
        elif (m := MONEY_OR_PCT_RE.search(text)) and len(text.split()) <= 45:
            blocks.append(Block("stat", {"value": m.group(0).replace(" ", "")}, prose=prose))
        else:
            blocks.append(Block("text", {}, prose=prose))
    return blocks


LONG_HEADER_KEYS = {"topic", "title", "subtitle", "kicker", "description", "plan"}


def parse_script(md: str) -> dict[str, Any]:
    title = "Untitled"
    header: dict[str, str] = {}
    blocks: list[Block] = []
    cur: Block | None = None
    seen_tag = False
    pre_tag_lines: list[str] = []

    for raw in md.splitlines():
        line = raw.rstrip()
        if line.startswith("# ") and not seen_tag and title == "Untitled":
            title = line[2:].strip()
            continue
        tag = _parse_tag(line)
        if tag:
            seen_tag = True
            cur = Block(tag[0], tag[1])
            blocks.append(cur)
            continue
        if not seen_tag:
            m = re.match(r"^([\w.]+):\s*(.+)$", line)
            # a known header key is a header line however long its value (a topic often runs past twelve words)
            if m and (len(line.split()) <= 12 or m.group(1).lower() in LONG_HEADER_KEYS):
                header[m.group(1).lower()] = m.group(2).strip()
            else:
                pre_tag_lines.append(line)
            continue
        assert cur is not None
        s = line.strip()
        if not s:
            continue
        low = s.lower()
        if s.startswith("- ") or s.startswith("* "):
            cur.items.append(s[2:].strip())
        elif s.startswith("> "):
            cur.quote.append(s[2:].strip())
        elif low.startswith("data:"):
            cur.data_lines.append(s[5:].strip())
        elif low.startswith("bars:"):
            cur.bars = s[5:].strip()
        elif low.startswith("left:"):
            cur.left = s[5:].strip()
        elif low.startswith("right:"):
            cur.right = s[6:].strip()
        elif s.startswith("<!--") or s.startswith("//"):
            continue  # comments / production notes
        else:
            cur.prose.append(s)

    if not seen_tag:
        paragraphs = [p for p in re.split(r"\n\s*\n", "\n".join(pre_tag_lines)) if p.strip()]
        blocks = _auto_blocks(paragraphs)
    # every video ends on the same subscribe page: when a script forgets the outro it is added, twelve seconds, nothing
    # said: long enough for YouTube's end-screen elements, which need the last 5 to 20 seconds
    if blocks and header.get("theme") == "whiteboard" and not any(b.type == "outro" for b in blocks):
        blocks.append(Block(type="outro", attrs={"title": "The Everyday Investor", "cta": "Subscribe for the next one", "dur": "12"}))

    scenes = []
    problems: list[str] = []
    for i, b in enumerate(blocks, 1):
        # a set piece's cues name poses from the pose library ({count-notes}, {prop=keys}); setpiece reads them
        narration, cues = (_narration_for(b), []) if b.type == "set" else split_cues(_narration_for(b))
        sc = {
            "id": i,
            "type": b.type,
            "start": 0.0,
            "end": 0.0,
            "narration": narration,
            "words": [],
            "cueWords": cues,
            "cues": [],
            "props": _block_to_props(b, title),
        }
        problems += _unknown_drawings(i, sc["props"])
        if b.type == "set":
            problems += setpiece.plan(sc, b.attrs)
        elif b.type == "broll":
            setpiece.plan_cards(sc, b.attrs)  # the amounts said over footage land on it as cards
        elif b.attrs.get("cards"):
            setpiece.plan_cards(sc, b.attrs)  # cards= on a board, stat or chart: text pops up on its word there too
        if b.attrs.get("marks"):
            problems += craft.plan_marks(sc, b.attrs)  # marks= on footage or a photo: circles, arrows and notes drawn on the picture on their word
        if sc["props"].get("anim") and str(sc["props"]["anim"]) not in craft.LOOPS:
            problems.append(f"scene {i}: anim='{sc['props']['anim']}' is not a drawn loop ({', '.join(sorted(craft.LOOPS))})")
        if sc["props"].get("anim") and not sc["props"].get("art"):
            sc["props"]["art"] = "off"  # the loop takes the drawing's place: no auto-picked drawing under it
        scenes.append(sc)
    if scenes and header.get("kicker") and scenes[0]["type"] == "title":
        scenes[0]["props"].setdefault("kicker", header["kicker"])

    brand: dict[str, str] = {}
    avatar: dict[str, str] = {}
    for k, v in header.items():
        if k.startswith("brand."):
            brand[k[6:]] = v
        elif k == "credits":  # `credits: screen` draws footage credits on the picture; by default they go to credits.txt
            brand["credits"] = v
        elif k.startswith("avatar."):
            key = k[7:]
            camel = re.sub(r"_([a-z])", lambda m: m.group(1).upper(), key)
            avatar[camel] = v

    number_takeaways(scenes)
    fill_recaps(scenes)
    duration = estimate_timings(scenes)
    slug = header.get("slug") or re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or "video"
    return {
        "title": title,
        "slug": slug,
        "fps": 30,
        "durationSec": duration,
        "audio": None,
        "captions": header.get("captions", "true").lower() not in ("false", "no", "off", "0"),
        # the marker hand that used to follow the writing is off unless the header asks for it with `hand: on`
        "hand": header.get("hand", "off").lower() in ("on", "yes", "true", "1"),
        "theme": header.get("theme", "toon"),
        # the painted host belongs to the hand-drawn look; the motion-graphics themes carry the video without one
        "host": header.get("host", "painted" if header.get("theme", "toon") == "toon" else "none"),
        "brand": brand,
        "avatar": avatar,
        "mouth": [],
        "scenes": scenes,
        "timing": "estimated",
        "pace": dict(zip(("lead", "hold"), pace_for(header))),
        "problems": problems,
    }
