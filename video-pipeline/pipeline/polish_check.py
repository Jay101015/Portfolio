"""The editor's pass, checked: the polished script keeps every spoken word in order, names drawings that exist, and
has the shape the channel wants (a hook with a drawing, a headline and a drawing on every text scene, figures on the
stat cards). `python3 -m pipeline.polish_check before.md after.md` prints the verdict and exits 1 when the words
changed; the shape findings are warnings, listed but not fatal."""
from __future__ import annotations

import json
import os
import re
import sys
from typing import Any

from .script_parser import parse_script

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "library", "illus", "manifest.json")


def spoken(md: str) -> list[str]:
    sb = parse_script(md)
    return [w for sc in sb["scenes"] for w in re.findall(r"\S+", sc["narration"])]


def drawing_names() -> set[str]:
    try:
        return {e["name"] for e in json.load(open(MANIFEST, encoding="utf-8"))}
    except OSError:
        return set()


def check(before: str, after: str) -> dict[str, Any]:
    a, b = spoken(before), spoken(after)
    if len(a) != len(b):
        return {"ok": False, "why": f"the words changed ({len(a)} before, {len(b)} after)", "warnings": []}
    for i, (x, y) in enumerate(zip(a, b)):
        if x != y:
            return {"ok": False, "why": f"word {i + 1} changed: {x!r} became {y!r}", "warnings": []}
    sb = parse_script(after)
    scenes = sb["scenes"]
    names = drawing_names()
    warnings: list[str] = []
    if not scenes:
        return {"ok": False, "why": "no scenes", "warnings": []}
    first = scenes[0]
    if first["type"] != "hook":
        warnings.append("the first scene is not a [hook]")
    else:
        if not first["props"].get("board"):
            warnings.append("the hook has no board= line")
        if not first["props"].get("art"):
            warnings.append("the hook has no art= drawing beside it")
    for sc in scenes:
        p = sc["props"]
        if sc["type"] == "text":
            if not p.get("board"):
                warnings.append(f"scene {sc['id']} (text) has no board= headline")
            if not p.get("art"):
                warnings.append(f"scene {sc['id']} (text) names no drawing")
        if sc["type"] == "stat" and not re.search(r"\d", str(p.get("value", ""))):
            warnings.append(f"scene {sc['id']} (stat) has no figure in value=")
        art = p.get("art")
        if art and names and art not in names:
            warnings.append(f"scene {sc['id']} names a drawing that does not exist: {art}")
    if not any(sc["type"] == "takeaway" for sc in scenes):
        warnings.append("no takeaway cards")
    if not any(sc["type"] == "recap" for sc in scenes):
        warnings.append("no recap")
    return {"ok": True, "why": "", "scenes": len(scenes), "warnings": warnings}


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: python3 -m pipeline.polish_check before.md after.md", file=sys.stderr)
        return 2
    before = open(argv[0], encoding="utf-8").read()
    after = open(argv[1], encoding="utf-8").read()
    r = check(before, after)
    if not r["ok"]:
        print("REFUSED: " + r["why"])
        return 1
    print(f"ok: {r['scenes']} scenes, every spoken word as it was")
    for w in r["warnings"]:
        print("warning: " + w)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
