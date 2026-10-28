#!/usr/bin/env python3
"""Cut a generated sheet of boxed poses (a grid, usually 4 x 2) into the pose library.

    python3 scripts/pose-cut.py library/poses/source/batch-1-talking.png explain point-board count-fingers ...

Names are given in reading order (left to right, top row first); `-` skips a panel. Each pose becomes
remotion/public/poses/<name>.png: ink on a transparent ground, the panel's floor line removed, cropped to the figure
with a margin, and scaled so a standing figure is STAND_H px tall whatever size the batch drew him at, so poses from
different sheets cut together without the character changing size. The feet position goes in
library/poses/manifest.json with the name, so a cut from one pose to the next keeps him on the same spot.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "remotion", "public", "poses")
MANIFEST = os.path.join(ROOT, "library", "poses", "manifest.json")
STAND_H = 800  # a standing figure, head to toe, in the saved pose


def runs(mask: np.ndarray) -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    for i in np.nonzero(mask)[0]:
        if out and i <= out[-1][1] + 2:
            out[-1] = (out[-1][0], int(i))
        else:
            out.append((int(i), int(i)))
    return out


def grid(a: np.ndarray) -> list[tuple[int, int, int, int]]:
    """the panels of a boxed grid, row by row: rows split at the white band across the middle(s), then each row's
    panels found between its vertical frame lines and the white gaps that separate neighbouring boxes"""
    dark = a < 140
    h, w = a.shape
    # rows of panels: separated by bands where almost nothing is drawn
    empty = dark.mean(axis=1) < 0.002
    bands = [(y0, y1) for y0, y1 in runs(empty) if y1 - y0 >= 3 and h * 0.15 < (y0 + y1) / 2 < h * 0.85]
    edges = [0] + [(y0 + y1) // 2 for y0, y1 in bands] + [h]
    boxes = []
    for r0, r1 in zip(edges, edges[1:]):
        part = dark[r0:r1]
        lines = runs(part.mean(axis=1) > 0.3)
        if len(lines) < 2:
            continue
        top, bot = r0 + lines[0][1] + 1, r0 + lines[-1][0] - 1
        band = dark[top + 5:bot - 5]
        colfrac = band.mean(axis=0)
        border, white = colfrac > 0.6, colfrac < 0.01
        xs = border.nonzero()[0]
        left, right = int(xs[0]), int(xs[-1])
        cuts, x = [left], left + 1
        while x < right:
            if white[x]:
                g0 = x
                while x < right and white[x]:
                    x += 1
                if 4 <= x - g0 <= 60 and border[max(0, g0 - 4):g0].any() and border[x:x + 4].any():
                    cuts.extend([g0 - 1, x])
            x += 1
        cuts.append(right)
        for i in range(0, len(cuts) - 1, 2):
            x0, x1 = cuts[i], cuts[i + 1]
            while x0 < x1 and border[x0]:
                x0 += 1
            while x1 > x0 and border[x1]:
                x1 -= 1
            boxes.append((x0 + 3, top + 3, x1 - 2, bot - 2))
    return boxes


def cut_panel(a: np.ndarray) -> tuple[np.ndarray, int]:
    """the panel without its frame edges and floor line; returns it and the floor's y (or the lowest ink)"""
    c = a.copy()
    c[:, :6] = 255
    c[:, -6:] = 255
    c[:5, :] = 255
    c[-5:, :] = 255
    d = c < 140
    rf = d.mean(axis=1)
    floor = [y for y in range(len(rf)) if rf[y] > 0.3 and y > c.shape[0] * 0.7]
    for y in floor:
        c[max(0, y - 1):y + 2, :] = 255
    ys = np.nonzero((c < 140).any(axis=1))[0]
    g = floor[-1] if floor else int(ys.max())
    return c, g


def ink(c: np.ndarray) -> Image.Image:
    """grey ink to opacity: the white ground goes see-through, colour (a tan envelope, a blue card) turns to grey"""
    L = c.astype(np.float32)
    alpha = (np.clip((235 - L) / 195, 0, 1) ** 0.9 * 255).astype(np.uint8)
    rgba = np.zeros(L.shape + (4,), np.uint8)
    rgba[..., :3] = (29, 29, 31)
    rgba[..., 3] = alpha
    return Image.fromarray(rgba, "RGBA")


def main(argv: list[str]) -> None:
    sheet, names = argv[0], argv[1:]
    src = Image.open(sheet).convert("L")
    a = np.array(src)
    boxes = grid(a)
    if len(boxes) != len(names):
        raise SystemExit(f"{sheet}: {len(boxes)} panels found, {len(names)} names given")
    # the batch's scale: the median height of the figures standing on the floor
    cuts = []
    for (x0, y0, x1, y1) in boxes:
        c, g = cut_panel(a[y0:y1, x0:x1])
        d = c < 140
        ys, xs = np.nonzero(d)
        cuts.append((c, g, ys.min(), ys.max(), xs.min(), xs.max()))
    standing = sorted(g - top for c, g, top, bottom, *_ in cuts if g - bottom < 12)
    scale = STAND_H / standing[len(standing) // 2]
    os.makedirs(OUT, exist_ok=True)
    try:
        with open(MANIFEST, encoding="utf-8") as f:
            manifest = {e["name"]: e for e in json.load(f)}
    except FileNotFoundError:
        manifest = {}
    for name, (c, g, top, bottom, left, right) in zip(names, cuts):
        if name == "-":
            continue
        m = 12
        box = c[max(0, top - m):bottom + m + 1, max(0, left - m):right + m + 1]
        im = ink(box)
        im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
        im.save(os.path.join(OUT, f"{name}.png"), optimize=True)
        # where his feet are in the saved image: the middle of what touches the floor, and the floor itself
        d = c < 140
        feet = d[max(0, g - 45):g + 1]
        fx = np.nonzero(feet.any(axis=0))[0]
        foot_x = ((fx.min() + fx.max()) / 2 if len(fx) else (left + right) / 2) - max(0, left - m)
        e = manifest.get(name, {"name": name, "tags": [], "about": ""})
        e.update({"file": f"poses/{name}.png", "w": im.width, "h": im.height, "foot_x": round(foot_x * scale),
                  "floor_y": round((g - max(0, top - m)) * scale), "source": os.path.basename(sheet)})
        manifest[name] = e
        print(name, im.size)
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(sorted(manifest.values(), key=lambda e: e["name"]), f, indent=1)


if __name__ == "__main__":
    main(sys.argv[1:])
