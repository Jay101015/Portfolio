"""Chapter timestamps for the YouTube description, from the render's own scene times.

The takeaway cards are the chapters; the first chapter is 0:00. If description.md has a "Chapters" block, its lines
are replaced in place (the 0:00 line keeps its wording); otherwise chapters.txt is written. YouTube wants the first
at 0:00, at least three, each 10 seconds or longer.
"""
from __future__ import annotations

import os
import re
from typing import Any


def _mmss(t: float) -> str:
    t = max(0, int(round(t)))
    return f"{t // 60}:{t % 60:02d}"


def chapters(sb: dict[str, Any], first: str = "Intro") -> list[tuple[int, str]]:
    out: list[tuple[int, str]] = [(0, first)]
    for sc in sb.get("scenes", []):
        if sc.get("type") == "takeaway" and sc.get("props", {}).get("title"):
            t = int(round(float(sc["start"])))
            if t - out[-1][0] >= 10:
                out.append((t, str(sc["props"]["title"])))
    return out


def write_chapters(project: str, sb: dict[str, Any]) -> str:
    """Returns a one-line note of what was written."""
    desc = os.path.join(project, "description.md")
    chs = chapters(sb)
    if len(chs) < 3:
        return "chapters: fewer than three takeaway cards, none written"
    if os.path.exists(desc):
        with open(desc, encoding="utf-8") as f:
            text = f.read()
        m = re.search(r"(^Chapters\n)((?:\d+:\d\d .*\n?)+)", text, flags=re.M)
        if m:
            old_first = m.group(2).splitlines()[0]
            first_title = old_first.split(" ", 1)[1] if old_first.startswith("0:00 ") else chs[0][1]
            lines = [f"{_mmss(t)} {first_title if i == 0 else title}" for i, (t, title) in enumerate(chs)]
            text = text[: m.start(2)] + "\n".join(lines) + "\n" + text[m.end(2):]
            with open(desc, "w", encoding="utf-8") as f:
                f.write(text)
            return f"chapters: {len(chs)} written into description.md"
    with open(os.path.join(project, "chapters.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(f"{_mmss(t)} {title}" for t, title in chs) + "\n")
    return f"chapters: {len(chs)} written to chapters.txt (no Chapters block in description.md)"
