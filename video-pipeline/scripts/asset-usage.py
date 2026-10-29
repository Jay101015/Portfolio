#!/usr/bin/env python3
"""What every channel video has already put on screen, and what the libraries hold that none has used yet.

    python3 scripts/asset-usage.py [--out library/usage.md] [--project <slug>]

The director (.claude/agents/director.md) reads this before planning a video, so the next one does not recycle the
last one's pictures: the same footage, the same drawings, the same rooms and poses, the same kinds of scene.

Reads each channel project's script.md (header `brand.name: The Everyday Investor`, or the `--project` given) and
counts, per video:
- footage: library clips (lib=), downloaded clips (src=, with the stock id from credit=), searches not yet filled
- drawings: art= (traced illustrations and stop-motion strips) and icon= (doodles)
- set pieces: room= and every pose cue ({shocked}) and prop ({prop=keys})
- scene types: shrink, compare, grow, pie, bite, chart, news, quote, stat, broll, set, ...
Then lists what is used in more than one video, and what each library holds that no video has used.
"""
import argparse
import json
import os
import re
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TAG = re.compile(r"^\[(\w+)([^\]]*)\]\s*$")
ATTR = re.compile(r'(\w+)=(?:"([^"]*)"|(\S+))')
CUE = re.compile(r"\{([a-z][a-z0-9-]*)(?::[a-z]+)?(?:=([a-z0-9-]+))?\}")
CHANNEL = "The Everyday Investor"


def load(path: str) -> list:
    with open(os.path.join(ROOT, path), encoding="utf-8") as f:
        return json.load(f)


def scan(md: str) -> dict:
    used: dict[str, Counter] = defaultdict(Counter)
    for line in md.splitlines():
        m = TAG.match(line.strip())
        if m:
            kind, raw = m.group(1), m.group(2)
            a = {k: (v1 if v1 != "" else v2) for k, v1, v2 in ATTR.findall(raw)}
            used["scene type"][kind] += 1
            if a.get("lib"):
                used["footage"]["lib:" + a["lib"]] += 1
            elif a.get("src") and kind in ("broll", "clip"):
                stock = re.search(r"Video (\d+)", a.get("credit", ""))
                used["footage"][("stock:" + stock.group(1)) if stock else "file:" + a["src"]] += 1
            elif a.get("search") and kind in ("broll", "clip"):
                used["footage"]["search:" + a["search"]] += 1
            if a.get("art") and a["art"] != "off":
                used["drawing"][a["art"]] += 1
            if a.get("icon"):
                used["doodle"][a["icon"]] += 1
            if kind == "set" and a.get("room"):
                used["room"][a["room"]] += 1
            continue
        for pose, prop in CUE.findall(line):
            if pose == "prop" and prop:
                used["prop"][prop] += 1
            elif pose != "prop":
                used["pose"][pose] += 1
    return used


def channel_projects(only: str | None) -> list[tuple[str, str]]:
    out = []
    base = os.path.join(ROOT, "projects")
    for slug in sorted(os.listdir(base)):
        path = os.path.join(base, slug, "script.md")
        if not os.path.isfile(path):
            continue
        md = open(path, encoding="utf-8").read()
        if only and slug != only:
            continue
        if not only and f"brand.name: {CHANNEL}" not in md:
            continue
        out.append((slug, md))
    out.sort(key=lambda p: os.path.getmtime(os.path.join(base, p[0], "script.md")))
    return out


def libraries() -> dict[str, list[str]]:
    poses_dir = os.path.join(ROOT, "remotion", "public", "poses", "solid")
    props_dir = os.path.join(ROOT, "remotion", "public", "props", "solid")
    base = lambda d: sorted({re.sub(r"-\d$", "", f[:-4]) for f in os.listdir(d) if f.endswith(".png")}) if os.path.isdir(d) else []  # noqa: E731
    return {
        "footage": ["lib:" + c["name"] for c in load("library/footage/manifest.json")],
        "drawing": [d["name"] for d in load("library/illus/manifest.json")] + [d["name"] for d in load("library/flipbook/manifest.json")],
        "room": [r["name"] for r in load("library/backgrounds/manifest.json") if (r.get("spot") or {}).get("x") is not None],
        "pose": [p for p in base(poses_dir) if not p.startswith(("stand", "jump-", "sit"))],
        "prop": base(props_dir),
        "scene type": ["shrink", "grow", "pie", "bite", "compare", "chart", "news", "quote", "set", "broll", "stat", "list"],
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=os.path.join(ROOT, "library", "usage.md"))
    ap.add_argument("--project", help="also include this project even if its header does not name the channel")
    args = ap.parse_args()
    projects = channel_projects(None)
    if args.project and args.project not in [s for s, _ in projects]:
        projects += channel_projects(args.project)
    per = {slug: scan(md) for slug, md in projects}
    lines = ["# What the channel's videos have put on screen", "",
             "Written by scripts/asset-usage.py, oldest video first. The director reads it before planning a video: what the",
             "last videos used is what this one should not lean on again, and the unused list is where fresh pictures are.", ""]
    for slug, used in per.items():
        lines.append(f"## {slug}")
        for cat in ("footage", "drawing", "doodle", "room", "pose", "prop", "scene type"):
            if used.get(cat):
                lines.append(f"- {cat}: " + ", ".join(f"{k}" + (f" ×{n}" if n > 1 else "") for k, n in used[cat].most_common()))
        lines.append("")
    lines += ["## Used in more than one video", ""]
    for cat in ("footage", "drawing", "doodle", "room", "pose", "prop"):
        seen = defaultdict(list)
        for slug, used in per.items():
            for k in used.get(cat, {}):
                seen[k].append(slug)
        rep = {k: v for k, v in seen.items() if len(v) > 1}
        if rep:
            lines.append(f"- {cat}: " + "; ".join(f"{k} ({len(v)} videos)" for k, v in sorted(rep.items(), key=lambda x: -len(x[1]))))
    lines += ["", "## In the libraries, never used yet", ""]
    lib = libraries()
    for cat, names in lib.items():
        used_any = set().union(*[set(u.get(cat, {})) for u in per.values()]) if per else set()
        fresh = [n for n in names if n not in used_any]
        lines.append(f"- {cat} ({len(fresh)} of {len(names)} unused): " + (", ".join(fresh) if fresh else "none"))
    lines.append("")
    with open(args.out, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"wrote {os.path.relpath(args.out, ROOT)}: {len(per)} videos")


if __name__ == "__main__":
    main()
