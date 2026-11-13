"""<slug>.srt: the long video's captions from the script's own words and their times, for YouTube's Subtitles.

Most of a long video's first views are muted autoplay in the home feed (retirement video: 445 views, 82 engaged).
YouTube's automatic captions garble the figures ("£12,548"); this file carries the script's words, cut into short
lines at punctuation, timed to the voice (checked: lines start within about 0.1 s of the word).
"""
from __future__ import annotations

from typing import Any


def _ts(t: float) -> str:
    ms = int(round(max(0.0, t) * 1000))
    h, ms = divmod(ms, 3600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def cues(sb: dict[str, Any], max_chars: int = 42, max_secs: float = 3.6, gap: float = 0.9) -> list[tuple[float, float, str]]:
    # the script's order is the order the words are said. Sorting by time put "has Nvidia So lost" on screen when the
    # aligner had to guess three word times and they ran backwards, so a time never reorders the words: it is held
    # at the word before it
    words: list[tuple[float, float, str]] = []
    last = 0.0
    for sc in sb.get("scenes", []):
        for w in sc.get("words") or []:
            s = max(float(w["s"]), last)
            words.append((s, max(float(w["e"]), s), str(w["w"])))
            last = s
    out: list[tuple[float, float, str]] = []
    cur: list[tuple[float, float, str]] = []

    def flush() -> None:
        if cur:
            out.append((cur[0][0], cur[-1][1], " ".join(w for _, _, w in cur)))
            cur.clear()

    for s, e, w in words:
        line = len(" ".join(x[2] for x in cur) + " " + w)
        # a sentence's last word stays with its sentence when it is only a little over ("... in 2 days." not "days." alone)
        closes = w[-1:] in ".?!" and line <= max_chars + 8
        if cur and (s - cur[-1][1] > gap or (line > max_chars and not closes) or s - cur[0][0] > max_secs + (0.6 if closes else 0)):
            flush()
        cur.append((s, e, w))
        text = " ".join(x[2] for x in cur)
        if w[-1:] in ".?!" and len(cur) >= 2:
            flush()
        elif w[-1:] in ",;:" and len(text) > 24:
            flush()
    flush()
    return out


def write_srt(sb: dict[str, Any], path: str) -> int:
    cs = cues(sb)
    blocks = []
    for k, (s, e, text) in enumerate(cs):
        nxt = cs[k + 1][0] if k + 1 < len(cs) else e + 1.0
        end = min(max(e + 0.25, s + 0.8), nxt - 0.02)
        blocks.append(f"{k + 1}\n{_ts(s)} --> {_ts(end)}\n{text}\n")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(blocks))
    return len(cs)
