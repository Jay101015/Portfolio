"""Make a script say what the recording says.

You wrote a script, then recorded it and said it your own way: a word swapped here, a sentence added there, a
line skipped. Alignment finds where each scene starts and ends in the recording; this module then gives every
scene the words you actually said in that stretch. Tags, layouts, list items, chart data, compare sides, quotes,
headlines and every other attribute stay exactly as they were: only the spoken prose under each tag changes.
A scene you did not say at all keeps its written words (it is reported, so you can cut it or record it).
"""
from __future__ import annotations

import re
from typing import Any

from .script_parser import _parse_tag

Word = dict[str, Any]

STRUCTURE = ("- ", "* ", "> ")
STRUCTURE_KEYS = ("data:", "bars:", "left:", "right:")


def _cuts(words: list[Word]) -> list[tuple[float, float]]:
    """Every place the transcript can be cut (before word j), as (time, strength): a sentence end or a long pause
    makes a strong cut, a comma or a short pause a weaker one, the middle of a phrase hardly any."""
    out = []
    for j in range(1, len(words)):
        prev, w = words[j - 1], words[j]
        gap = max(0.0, w["s"] - prev["e"])
        strength = gap
        if re.search(r"[.!?…]$", prev["w"]):
            strength += 1.0
        elif re.search(r"[,;:]$", prev["w"]):
            strength += 0.3
        out.append(((prev["e"] + w["s"]) / 2, strength))
    return out


def spoken_by_scene(scenes: list[dict[str, Any]], words: list[Word], window: float = 1.6, matched: list[float] | None = None) -> list[str]:
    """The transcript cut into scenes. Alignment says roughly where each scene starts; each start is moved to the
    strongest cut (sentence end, pause) within `window` seconds, so a scene never starts mid-sentence. A scene that
    was not said ends up with no words at all (its start and the next one snap to the same cut)."""
    if not scenes:
        return []
    if not words:
        return ["" for _ in scenes]
    cuts = _cuts(words)  # cut i sits before word i + 1
    # a scene whose own words were barely heard was not said (or said so differently it cannot be placed): its
    # start is a guess, so it is pulled to the next scene's start and its stretch goes to the scene before
    said = [m is None or m >= 0.2 for m in (matched or [None] * len(scenes))]
    starts = [sc["start"] for sc in scenes]
    for k in range(len(scenes) - 1, 0, -1):
        if not said[k]:
            starts[k] = starts[k + 1] if k + 1 < len(scenes) else words[-1]["e"] + 1
    idx = [0]
    for k, sc in enumerate(scenes[1:], 1):
        t = starts[k]
        if t > words[-1]["e"]:
            idx.append(len(words))
            continue
        best, best_score = None, None
        for i, (ct, strength) in enumerate(cuts):
            d = abs(ct - t)
            if d > window:
                continue
            score = strength - 0.35 * d
            if best_score is None or score > best_score:
                best, best_score = i + 1, score
        if best is None:  # nothing near: the word nearest the aligned start
            best = min(range(len(words)), key=lambda j: abs(words[j]["s"] - t))
        if not said[k] and k + 1 < len(scenes):
            best = None  # placed below, at the next scene's cut
        last = next((v for v in reversed(idx) if v is not None), 0)
        idx.append(max(last, best) if best is not None else None)
    idx.append(len(words))
    # a scene that was not said starts where the next one does
    for k in range(len(idx) - 2, -1, -1):
        if idx[k] is None:
            idx[k] = idx[k + 1]
    spans = [[idx[k], idx[k + 1]] for k in range(len(scenes))]
    # a scrap of a few words is the tail of the scene before (a scene is never two words long): give it back, and
    # the scene is left as not said
    for k in range(1, len(spans)):
        n = spans[k][1] - spans[k][0]
        if 0 < n <= 3:
            prev = next((j for j in range(k - 1, -1, -1) if spans[j][1] > spans[j][0]), None)
            if prev is not None and spans[prev][1] == spans[k][0]:
                spans[prev][1] = spans[k][1]
                spans[k][0] = spans[k][1]
    return [" ".join(w["w"] for w in words[a:b]).strip() for a, b in spans]


def _is_structure(line: str) -> bool:
    s = line.strip()
    low = s.lower()
    return s.startswith(STRUCTURE) or low.startswith(STRUCTURE_KEYS) or s.startswith("<!--") or s.startswith("//")


def rewrite_prose(md: str, texts: list[str]) -> tuple[str, list[int]]:
    """Replace the spoken prose of tagged block i with texts[i]; keep everything else. Returns the new script and
    the (1-based) scenes that were left as written because nothing was said in them."""
    lines = md.splitlines()
    out: list[str] = []
    block = -1
    kept: list[int] = []
    pending: list[str] = []  # structure lines of the current block, in order

    def flush() -> None:
        nonlocal pending
        if block < 0:
            return
        said = texts[block] if block < len(texts) else ""
        out.extend(pending)
        if said:
            out.append(said)
        else:
            out.extend(prose_kept)
            kept.append(block + 1)
        out.append("")
        pending = []

    prose_kept: list[str] = []
    for line in lines:
        if _parse_tag(line):
            flush()
            block += 1
            out.append(line.rstrip())
            prose_kept = []
            continue
        if block < 0:
            out.append(line.rstrip())
            continue
        if not line.strip():
            continue
        if _is_structure(line):
            pending.append(line.rstrip())
        else:
            prose_kept.append(line.rstrip())
    flush()
    while out and not out[-1].strip():
        out.pop()
    return "\n".join(out) + "\n", kept


def tagged_from_storyboard(sb: dict[str, Any], header_md: str) -> str:
    """An untagged script (plain paragraphs) as tags, so its prose can be rewritten scene by scene."""
    head = [ln for ln in header_md.splitlines() if ln.startswith("# ") or (":" in ln and not ln.startswith("["))][:20]
    body = []
    for sc in sb["scenes"]:
        p = sc["props"]
        attrs = ""
        if sc["type"] == "stat" and p.get("value"):
            attrs = f' value="{p["value"]}"'
        body += [f"[{sc['type']}{attrs}]"]
        for it in p.get("items") or []:
            body.append(f"- {it}")
        body += [sc["narration"], ""]
    return "\n".join(head + [""] + body)


def matched_share(sb: dict[str, Any]) -> list[float]:
    """For each scene, the share of its written words the aligner found in the recording."""
    rows = (sb.get("alignment") or {}).get("perScene") or []
    out = []
    for i, sc in enumerate(sb["scenes"]):
        n = len([w for w in sc["narration"].split() if w.strip()])
        m = rows[i]["matched"] if i < len(rows) else n
        out.append(m / n if n else 1.0)
    return out
