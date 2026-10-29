#!/usr/bin/env python3
"""The extra drawings a [set] scene needs, made from the library: run again after adding props or a new walk sheet.

    python3 scripts/set-assets.py

- the walk cycle: library/poses/source/batch-5a-walk.png cut into remotion/public/poses/walk/<n>.png (white inside his
  outline, at the poses' scale: 800 px standing), with library/poses/walk.json giving each drawing's foot centre and
  floor line and the order they play in (on threes at 8 drawings a second, no side-to-side waddle);
- the props with white inside their outlines (remotion/public/props/solid/), so a room does not show through a prop
  that pops in over it.
"""
import importlib.util
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
spec = importlib.util.spec_from_file_location("pose_cut", os.path.join(os.path.dirname(os.path.abspath(__file__)), "pose-cut.py"))
pc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pc)

STAND = 800  # a standing figure in the saved poses, head to toe
WALK_STAND = 418  # the same in the walk sheet
CYCLE = [0, 3, 1, 4, 7, 5]  # the sheet's drawings in playing order (contact, down, pass, up, for each foot)
# a stride is 161 px of the sheet for every three drawings: "step" in walk.json is the share of his height moved per drawing


def walk() -> None:
    a = np.array(Image.open(os.path.join(ROOT, "library", "poses", "source", "batch-5a-walk.png")).convert("L"))
    out = os.path.join(ROOT, "remotion", "public", "poses", "walk")
    os.makedirs(out, exist_ok=True)
    s = STAND / WALK_STAND
    frames = []
    for n, (x0, y0, x1, y1) in enumerate(pc.grid(a)):
        c, g = pc.cut_panel(a[y0:y1, x0:x1])
        d = c < 140
        ys, _ = np.nonzero(d)
        top = ys.min()
        band = d[top + int((g - top) * 0.25):top + int((g - top) * 0.45)]  # the torso: where the body is, whatever the legs do
        bx = np.nonzero(band.any(axis=0))[0]
        im = pc.ink(c)
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        im = pc.solid(im)
        im.save(os.path.join(out, f"{n}.png"), optimize=True)
        frames.append({"file": f"poses/walk/{n}.png", "w": im.width, "h": im.height, "foot_x": round((bx.min() + bx.max()) / 2 * s), "floor_y": round(g * s)})
    with open(os.path.join(ROOT, "library", "poses", "walk.json"), "w", encoding="utf-8") as f:
        json.dump({"about": "walk cycle facing right, played on threes (8 drawings a second); mirror for a walk to the left",
                   "cycle": CYCLE, "step": round(161 / WALK_STAND / 3, 4), "frames": frames}, f, indent=1)
    print(f"walk: {len(frames)} drawings")


def props() -> None:
    src = os.path.join(ROOT, "remotion", "public", "props")
    out = os.path.join(src, "solid")
    os.makedirs(out, exist_ok=True)
    n = 0
    for name in sorted(os.listdir(src)):
        if name.endswith(".png"):
            pc.solid(Image.open(os.path.join(src, name)).convert("RGBA")).save(os.path.join(out, name), optimize=True)
            n += 1
    print(f"props: {n} made solid")


if __name__ == "__main__":
    walk()
    props()
