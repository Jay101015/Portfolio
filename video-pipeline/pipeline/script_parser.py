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

import re
from dataclasses import dataclass, field
from typing import Any

WORDS_PER_SEC = 2.6  # typical YouTube narration pace; replaced by real timings after alignment
SCENE_GAP_SEC = 0.35
SCENE_TYPES = {"title", "text", "stat", "list", "chart", "compare", "quote", "image", "still", "clip", "poster", "score", "avatar", "outro"}

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
        if "headline" in a:
            p["headline"] = a["headline"]
    elif b.type == "stat":
        for k in ("value", "label", "sub", "source", "from", "trend"):
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
    elif b.type == "quote":
        p["quote"] = " ".join(b.quote) if b.quote else " ".join(b.prose)
        if "by" in a:
            p["attribution"] = a["by"]
    elif b.type in ("image", "still"):
        for k in ("src", "caption", "prompt", "credit", "zoom", "search", "fallback"):
            if k in a:
                p[k] = a[k]
    elif b.type == "clip":
        for k in ("src", "caption", "credit", "fallback", "search"):
            if k in a:
                p[k] = a[k]
        if "from" in a:
            p["from"] = float(a["from"])
        if "vol" in a:
            p["vol"] = float(a["vol"])
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
        for k in ("title", "cta"):
            if k in a:
                p[k] = a[k]
    if "dur" in a:
        p["dur"] = float(a["dur"])
    # The character can be placed and posed on any scene.
    for k in ("pos", "pose", "face", "scale"):
        if k in a:
            p[k] = a[k]
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
            if m and len(line.split()) <= 12:
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

    scenes = []
    for i, b in enumerate(blocks, 1):
        narration, cues = split_cues(_narration_for(b))
        scenes.append({
            "id": i,
            "type": b.type,
            "start": 0.0,
            "end": 0.0,
            "narration": narration,
            "words": [],
            "cueWords": cues,
            "cues": [],
            "props": _block_to_props(b, title),
        })
    if scenes and header.get("kicker") and scenes[0]["type"] == "title":
        scenes[0]["props"].setdefault("kicker", header["kicker"])

    brand: dict[str, str] = {}
    avatar: dict[str, str] = {}
    for k, v in header.items():
        if k.startswith("brand."):
            brand[k[6:]] = v
        elif k.startswith("avatar."):
            key = k[7:]
            camel = re.sub(r"_([a-z])", lambda m: m.group(1).upper(), key)
            avatar[camel] = v

    duration = estimate_timings(scenes)
    slug = header.get("slug") or re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or "video"
    return {
        "title": title,
        "slug": slug,
        "fps": 30,
        "durationSec": duration,
        "audio": None,
        "captions": header.get("captions", "true").lower() not in ("false", "no", "off", "0"),
        "theme": header.get("theme", "toon"),
        "host": header.get("host", "painted"),
        "brand": brand,
        "avatar": avatar,
        "mouth": [],
        "scenes": scenes,
        "timing": "estimated",
    }
