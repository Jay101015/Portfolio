#!/usr/bin/env python3
"""Cut every pose in the library again from its source sheet, after a change to how pose-cut.py cuts a panel.

    python3 scripts/pose-recut.py

Each sheet in library/poses/source that poses in the manifest came from is cut again with pose-cut.py's own code (the
same scale rule: standing height, or seated with --seated for a batch where nobody stands). Each new panel is matched
to the pose it was cut as before by comparing the drawings, so names, tags, in-betweens (`into`) and loops keep their
entries; the image, its solid copy and the feet position are replaced. A single unboxed drawing (*-single.png) is cut
whole. The walk cycle is not a pose sheet (scripts/set-assets.py makes it).
"""
import importlib.util
import json
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("pose_cut", os.path.join(HERE, "pose-cut.py"))
pc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pc)
SRC = os.path.join(HERE, "..", "library", "poses", "source")


def mask(im: Image.Image, size=(48, 72)) -> np.ndarray:
    a = np.array(im.convert("RGBA").resize(size, Image.BILINEAR))[..., 3].astype(np.float32) / 255
    return a - a.mean()


def similarity(a: np.ndarray, b: np.ndarray) -> float:
    return float((a * b).sum() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-9))


def cut_sheet(sheet: str, seated: bool, single: bool) -> list[tuple[Image.Image, int, int]]:
    """every panel of the sheet as (ink image at the library's scale, foot_x, floor_y)"""
    a = np.array(Image.open(sheet).convert("L"))
    boxes = [(0, 0, a.shape[1], a.shape[0])] if single else pc.grid(a)
    cuts = []
    for (x0, y0, x1, y1) in boxes:
        c, g = pc.cut_panel(a[y0:y1, x0:x1])
        d = c < 140
        ys, xs = np.nonzero(d)
        cuts.append((c, g, ys.min(), ys.max(), xs.min(), xs.max()))
    if seated:
        heights = sorted(g - top for c, g, top, *_ in cuts)
        scale = pc.STAND_H * pc.SEATED / heights[len(heights) // 2]
    else:
        standing = sorted(g - top for c, g, top, bottom, *_ in cuts if g - bottom < 12) or sorted(g - top for c, g, top, *_ in cuts)
        scale = pc.STAND_H / standing[len(standing) // 2]
    out = []
    for c, g, top, bottom, left, right in cuts:
        m = 12
        box = c[max(0, top - m):bottom + m + 1, max(0, left - m):right + m + 1]
        im = pc.ink(box)
        im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
        d = c < 140
        feet = d[max(0, g - 45):g + 1]
        fx = np.nonzero(feet.any(axis=0))[0]
        foot_x = ((fx.min() + fx.max()) / 2 if len(fx) else (left + right) / 2) - max(0, left - m)
        out.append((im, round(foot_x * scale), round((g - max(0, top - m)) * scale)))
    return out


def main() -> None:
    with open(pc.MANIFEST, encoding="utf-8") as f:
        manifest = json.load(f)
    by_sheet: dict[str, list[dict]] = {}
    for e in manifest:
        if e.get("recut") is False:  # matched the wrong panel, or kept a floor line, last time: left as cut by hand
            continue
        by_sheet.setdefault(e["source"], []).append(e)
    for sheet, entries in sorted(by_sheet.items()):
        path = os.path.join(SRC, sheet)
        if not os.path.exists(path):
            print(f"{sheet}: not in library/poses/source, left as it is")
            continue
        seated = any(e.get("seated") for e in entries)
        panels = cut_sheet(path, seated, sheet.endswith("-single.png"))
        olds = {e["name"]: mask(Image.open(os.path.join(pc.OUT, f"{e['name']}.png"))) for e in entries}
        news = [mask(im) for im, _, _ in panels]
        # each pose to the panel that looks most like it, best pairs first, a panel used once
        pairs = sorted(((similarity(olds[e["name"]], news[j]), e["name"], j) for e in entries for j in range(len(panels))), reverse=True)
        taken_pose, taken_panel = set(), set()
        for score, name, j in pairs:
            if name in taken_pose or j in taken_panel:
                continue
            taken_pose.add(name)
            taken_panel.add(j)
            im, fx, fy = panels[j]
            im.save(os.path.join(pc.OUT, f"{name}.png"), optimize=True)
            pc.solid(im).save(os.path.join(pc.OUT, "solid", f"{name}.png"), optimize=True)
            e = next(x for x in entries if x["name"] == name)
            e.update({"w": im.width, "h": im.height, "foot_x": fx, "floor_y": fy})
            print(f"{sheet}: {name} <- panel {j + 1} (match {score:.2f})")
    with open(pc.MANIFEST, "w", encoding="utf-8") as f:
        json.dump(sorted(manifest, key=lambda e: e["name"]), f, indent=1)


if __name__ == "__main__":
    main()
