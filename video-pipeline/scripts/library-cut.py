#!/usr/bin/env python3
"""Cut a generated sheet of props or backgrounds into the art library (poses have their own scripts/pose-cut.py).

    python3 scripts/library-cut.py props library/props/source/props-a.png keys note-20 coins house ...
    python3 scripts/library-cut.py backgrounds library/backgrounds/source/bg-batch-1.png graduation-hall office ...

Names are given in reading order (left to right, top row first); `-` skips a panel.
- props: ink on a transparent ground, cropped to the object, longest side PROP_MAX px, so a prop can pop in over
  any background: remotion/public/props/<name>.png, listed in library/props/manifest.json.
- backgrounds: the panel inside its frame, kept as drawn (RGB): remotion/public/backgrounds/<name>.png, listed in
  library/backgrounds/manifest.json. The renderer lightens them so he stands out in front.
"""
import importlib.util
import json
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..")
spec = importlib.util.spec_from_file_location("pose_cut", os.path.join(os.path.dirname(__file__), "pose-cut.py"))
pc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pc)
PROP_MAX = 600


def panels(a: np.ndarray) -> list[tuple[int, int, int, int]]:
    """the boxed panels; a busy background can fool the column finder in one row (a fridge edge next to the frame),
    so drop any sliver and take each column's edges as the middle value across the rows"""
    boxes = [b for b in pc.grid(a) if b[2] - b[0] > 80 and b[3] - b[1] > 80]
    rows: dict[int, list] = {}
    for b in boxes:
        rows.setdefault(b[1], []).append(b)
    counts = [len(r) for r in rows.values()]
    best = max(set(counts), key=counts.count)
    full = [sorted(r) for r in rows.values() if len(r) == best]
    cols = [(int(np.median([r[i][0] for r in full])), int(np.median([r[i][2] for r in full]))) for i in range(best)]
    return [(x0, y, x1, r[0][3]) for y, r in sorted(rows.items()) for x0, x1 in cols]


def save_manifest(path: str, entries: dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(sorted(entries.values(), key=lambda e: e["name"]), f, indent=1)


def main(argv: list[str]) -> None:
    kind, sheet, names = argv[0], argv[1], argv[2:]
    assert kind in ("props", "backgrounds"), kind
    src = Image.open(sheet)
    a = np.array(src.convert("L"))
    boxes = panels(a)
    if len(boxes) != len(names):
        raise SystemExit(f"{sheet}: {len(boxes)} panels found, {len(names)} names given")
    out = os.path.join(ROOT, "remotion", "public", kind)
    os.makedirs(out, exist_ok=True)
    mpath = os.path.join(ROOT, "library", kind, "manifest.json")
    try:
        with open(mpath, encoding="utf-8") as f:
            manifest = {e["name"]: e for e in json.load(f)}
    except FileNotFoundError:
        manifest = {}
    for name, (x0, y0, x1, y1) in zip(names, boxes):
        if name == "-":
            continue
        if kind == "props":
            c = a[y0:y1, x0:x1].copy()
            c[:, :6] = 255
            c[:, -6:] = 255
            c[:5, :] = 255
            c[-5:, :] = 255
            ys, xs = np.nonzero(c < 200)
            m = 10
            c = c[max(0, ys.min() - m):ys.max() + m + 1, max(0, xs.min() - m):xs.max() + m + 1]
            im = pc.ink(c)
            s = PROP_MAX / max(im.size)
            im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        else:
            im = src.convert("RGB").crop((x0 + 2, y0 + 2, x1 - 1, y1 - 1))
        im.save(os.path.join(out, f"{name}.png"), optimize=True)
        e = manifest.get(name, {"name": name, "tags": [], "about": ""})
        e.update({"file": f"{kind}/{name}.png", "w": im.width, "h": im.height, "source": os.path.basename(sheet)})
        manifest[name] = e
        print(name, im.size)
    save_manifest(mpath, manifest)


if __name__ == "__main__":
    main(sys.argv[1:])
