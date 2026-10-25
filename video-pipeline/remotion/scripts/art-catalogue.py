#!/usr/bin/env python3
"""Write library/art/catalogue.json: every drawing's name, what it shows, its scene tags and its search words.

The studio embeds this list (its GIF-keyboard search runs on it) and the GIF and still scripts render from the
same names. Drawings come from two places: the hand-written catalogue in src/paper/art.tsx, and the traced
illustrations listed in library/illus/manifest.json (which carry kind "illus"). Names starting with "trial-" are
stand-ins and are left out.

    python3 scripts/art-catalogue.py
"""
from __future__ import annotations

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PIPE = os.path.dirname(ROOT)


def from_tsx() -> list[dict]:
    s = open(os.path.join(ROOT, "src", "paper", "art.tsx"), encoding="utf-8").read()
    body = s.split("export const ART: Record<string, ArtDef> = {")[1].split("\n};\n")[0]
    blocks = re.split(r"\n  '?([a-z0-9-]+)'?: \{\n", body)
    out = []
    for i in range(1, len(blocks), 2):
        name, b = blocks[i], blocks[i + 1]
        about = re.search(r"about: '((?:[^'\\]|\\.)*)'", b).group(1).replace("\\'", "'")

        def arr(key: str) -> list[str]:
            m = re.search(key + r": \[(.*?)\],\n", b, re.S)
            if not m:
                return []
            return [(x[0] or x[1]).replace("\\'", "'") for x in re.findall(r"'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\"", m.group(1))]

        out.append({"name": name, "about": about, "tags": arr("tags"), "search": arr("search")})
    return out


def from_manifest() -> list[dict]:
    mf = os.path.join(PIPE, "library", "illus", "manifest.json")
    if not os.path.exists(mf):
        return []
    out = []
    for e in json.load(open(mf, encoding="utf-8")):
        if e["name"].startswith("trial-") or not os.path.exists(os.path.join(PIPE, "library", "illus", e["name"] + ".svg")):
            continue
        out.append({"name": e["name"], "about": e.get("about", ""), "tags": e.get("tags", []), "search": e.get("search", []), "kind": "illus"})
    return out


def main() -> int:
    cat = from_tsx() + from_manifest()
    names = [d["name"] for d in cat]
    if len(names) != len(set(names)):
        print("duplicate names: " + ", ".join(sorted({n for n in names if names.count(n) > 1})), file=sys.stderr)
        return 1
    dst = os.path.join(PIPE, "library", "art", "catalogue.json")
    json.dump(cat, open(dst, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"{len(cat)} drawings ({sum(1 for d in cat if d.get('kind') == 'illus')} traced) -> {os.path.relpath(dst, PIPE)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
