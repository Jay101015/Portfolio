"""Checks on a script before anything renders: the things that cost a re-render or a bad first 30 seconds.

    python -m pipeline.preflight projects/<name>      (exit 1 on a warning)

Also run at the start of every build, printed as PREFLIGHT lines. Each check names the rule it comes from.
"""
from __future__ import annotations

import os
import re
import sys
from typing import Any

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _header(md: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in md.splitlines():
        if line.startswith("["):
            break
        m = re.match(r"^([\w.]+):\s*(.+)$", line.strip())
        if m:
            out[m.group(1).lower()] = m.group(2).strip()
    return out


def _title(md: str) -> str:
    m = re.search(r"^#\s+(.+)$", md, flags=re.M)
    return m.group(1).strip() if m else ""


def _numbers(text: str) -> list[str]:
    """the figures in a title: "£1 Million" -> ["1", "million"], "£83,000" -> ["83,000"], "Top 10%" -> ["10"]"""
    out = [n.replace(",", "") for n in re.findall(r"\d[\d,]*(?:\.\d+)?", text)]
    out += [w.lower() for w in re.findall(r"\b(million|billion|thousand|hundred)\b", text, flags=re.I)]
    return out


def _ledger_last(repo: str) -> dict[str, str]:
    """the newest row of the ledger in docs/formats.md: format, signature device, chapter device, opening, ending"""
    path = os.path.join(repo, "docs", "formats.md")
    if not os.path.exists(path):
        return {}
    rows = [l for l in open(path, encoding="utf-8").read().splitlines() if l.startswith("| ") and not l.startswith("| video") and not l.startswith("|---")]
    if not rows:
        return {}
    cells = [c.strip() for c in rows[0].strip("|").split("|")]
    keys = ["video", "format", "device", "chapters", "opening", "ending"]
    return dict(zip(keys, cells))


def checks(md: str, project: str, has_audio: bool, repo: str = HERE) -> list[tuple[str, str]]:
    """[(level, message)]: level is WARN or INFO"""
    out: list[tuple[str, str]] = []
    h = _header(md)
    if has_audio and "voice" not in h:
        out.append(("WARN", "no `voice:` line: an ElevenLabs or clean take needs `voice: natural`; without it the recording goes through the phone-memo chain and comes out harsh (retirement video)"))
    if "loudness" not in h:
        out.append(("INFO", "no `loudness:` line: the video is levelled to -14 LUFS (Jeffrey found the retirement video too loud at -14; -16 is quieter)"))
    tags = re.findall(r"^\[(\w+)([^\]]*)\]", md, flags=re.M)
    title = _title(md)
    first = next(((t, a) for t, a in tags if t in ("hook", "stat", "text")), None)
    if first:
        board = re.search(r'board="([^"]*)"', first[1])
        if board and not re.search(r"\d", board.group(1)):
            out.append(("WARN", "the first board has no number on it: frame one must carry the title's question and its number for a muted feed (EDITOR.md, the first 30 seconds muted)"))
        # the first spoken sentence
        body = md.split("]", 1)[1] if "]" in md else ""
        first_line = next((l.strip() for l in md.splitlines()[md.splitlines().index(next(l for l in md.splitlines() if l.startswith("["))) + 1:] if l.strip() and not l.startswith("[")), "")
        nums = _numbers(title)
        said = first_line.lower().replace(",", "")
        hit = any((re.search(rf"(?<![\d.]){re.escape(n)}(?![\d.])", said) if n[0].isdigit() else re.search(rf"\b{n}\b", said)) for n in nums)
        if nums and not hit:
            out.append(("WARN", f"the first sentence does not say the title's number ({', '.join(nums[:3])}): say it in the first sentence (retention: viewers skipped to the answer)"))
        del body
    last = _ledger_last(repo)
    slug = h.get("slug") or os.path.basename(os.path.abspath(project))
    if last and last.get("video") != slug:
        uses_takeaway = any(t == "takeaway" for t, _ in tags)
        if uses_takeaway and "takeaway" in last.get("chapters", "").lower():
            out.append(("WARN", f"\"Takeaway n of N\" cards again: the last video ({last['video']}) used them too (docs/formats.md: never two videos in a row)"))
        uses_recap = any(t == "recap" for t, _ in tags)
        if uses_recap and "recap" in last.get("ending", "").lower():
            out.append(("WARN", f"a recap ending again: the last video ({last['video']}) ended on one too (docs/formats.md)"))
    if len(tags) > 12 and not any(t in ("broll", "clip") for t, _ in tags):
        out.append(("WARN", "no footage scenes at all: aim for one scene in three"))
    return out


def main(argv: list[str] | None = None) -> int:
    args = argv if argv is not None else sys.argv[1:]
    if not args:
        print(__doc__)
        return 2
    project = args[0]
    md = open(os.path.join(project, "script.md"), encoding="utf-8").read()
    has_audio = any(f.startswith("voiceover.") for f in os.listdir(project))
    found = checks(md, project, has_audio)
    for lv, msg in found:
        print(f"PREFLIGHT {lv}: {msg}")
    if not found:
        print("PREFLIGHT: clean")
    return 1 if any(lv == "WARN" for lv, _ in found) else 0


if __name__ == "__main__":
    sys.exit(main())
