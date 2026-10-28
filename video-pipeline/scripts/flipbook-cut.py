#!/usr/bin/env python3
"""Cut a generated strip of poses into a stop-motion drawing for the art library.

    python3 scripts/flipbook-cut.py library/flipbook/source/celebrate-strip.png celebrate --anchor feet
    python3 scripts/flipbook-cut.py library/flipbook/source/hand-money-strip.png hand-money --anchor back
    python3 scripts/flipbook-cut.py library/flipbook/source/train-strip.png train --anchor none

The strip is one image of equal panels side by side, each boxed in a thin black frame (the prompts are in
docs/drawing-guide.md). Each panel becomes remotion/public/flipbook/<name>/NN.png: ink on a transparent ground,
the panel's own floor line replaced by one shared line, and the figure lined up from frame to frame so it does
not jitter. --anchor says what stays still: `feet` (the middle of the shoes; a jump lines up on the chest),
`back` (the back of the shoes, for a figure facing right whose arm reaches out), `none` (the panel as drawn, for a
strip whose background is part of the picture). Then add the name to library/flipbook/manifest.json and check the
frames (or the --gif preview) before a video uses it.
"""
import argparse
import os

import numpy as np
from PIL import Image, ImageDraw

W, H, FLOOR = 480, 860, 800


def panels(a: np.ndarray) -> list[tuple[int, int, int, int]]:
    """The boxes of the panels. Each panel is boxed in a thin black frame and the panels are separated by a white
    gap, so: the outer borders are the first and last near-solid dark columns, and a gap is a run of all-white
    columns with a border on each side. A drawn background's own vertical lines are never all-white beside."""
    dark = a < 100
    rows = (dark.mean(axis=1) > 0.5).nonzero()[0]
    top, bot = int(rows[0]) + 1, int(rows[-1]) - 1
    band = dark[top + 5:bot - 5]
    colfrac = band.mean(axis=0)
    border = colfrac > 0.7
    white = colfrac < 0.01
    xs = border.nonzero()[0]
    left, right = int(xs[0]), int(xs[-1])
    cuts = [left]
    x = left + 1
    while x < right:
        if white[x]:
            g0 = x
            while x < right and white[x]:
                x += 1
            # a gap: 4 to 60 white columns with a frame line within 3 px on each side (the edges are anti-aliased)
            if 4 <= x - g0 <= 60 and border[max(0, g0 - 4):g0].any() and border[x:x + 4].any():
                cuts.extend([g0 - 1, x])
        x += 1
    cuts.append(right)
    boxes = []
    for i in range(0, len(cuts) - 1, 2):
        x0, x1 = cuts[i], cuts[i + 1]
        # step inside the frame lines
        while x0 < x1 and border[x0]:
            x0 += 1
        while x1 > x0 and border[x1]:
            x1 -= 1
        boxes.append((x0 + 3, top + 3, x1 - 2, bot - 2))
    return boxes


def cut(strip: str, name: str, anchor: str, out_root: str, gif: bool) -> list[str]:
    a = np.array(Image.open(strip).convert("L"))
    boxes = panels(a)
    if len(boxes) < 2:
        raise SystemExit(f"{strip}: found {len(boxes)} panels; is it a strip of boxed panels?")
    out_dir = os.path.join(out_root, name)
    os.makedirs(out_dir, exist_ok=True)
    made, previews = [], []
    for k, (x0, y0, x1, y1) in enumerate(boxes):
        crop = a[y0:y1, x0:x1].copy()
        if anchor != "none":
            crop[:, :8] = 255
            crop[:, -8:] = 255
            crop[:6, :] = 255
        d = crop < 110
        rf = d.mean(axis=1)
        floor = [y for y in range(len(rf)) if rf[y] > 0.45 and y > crop.shape[0] * 0.6] if anchor != "none" else []
        g = floor[-1] if floor else None
        if g is not None:
            for y in floor:
                crop[max(0, y - 1):y + 2, :] = 255
            shoes = d[g - 55:g - 4]
            sx = np.nonzero(shoes.any(axis=0))[0]
            on_ground = len(sx) > 20 and shoes.sum() > 400
            if anchor == "back" and on_ground:
                cx, tx = sx.min() + 40, 150
            elif on_ground:
                cx, tx = (sx.min() + sx.max()) / 2, W / 2
            else:  # off the ground (a jump): line up on the chest
                ys = np.nonzero(d[:g - 4].any(axis=1))[0]
                top = ys.min()
                band = d[top + int((g - top) * 0.30):top + int((g - top) * 0.45)]
                bx = np.nonzero(band.any(axis=0))[0]
                cx, tx = (bx.min() + bx.max()) / 2, (150 if anchor == "back" else W / 2)
            ox, oy = int(round(tx - cx)), int(round(FLOOR - g))
        else:
            ox, oy = int(W / 2 - crop.shape[1] / 2), 0
        canvas = Image.new("L", (W, H), 255)
        canvas.paste(Image.fromarray(crop), (ox, oy))
        if g is not None:
            ImageDraw.Draw(canvas).line([(30, FLOOR), (W - 30, FLOOR)], fill=30, width=2)
        L = np.array(canvas).astype(np.float32)
        alpha = (np.clip((235 - L) / 195, 0, 1) ** 0.9 * 255).astype(np.uint8)
        rgba = np.zeros(L.shape + (4,), np.uint8)
        rgba[..., :3] = (29, 29, 31)
        rgba[..., 3] = alpha
        path = os.path.join(out_dir, f"{k + 1:02d}.png")
        Image.fromarray(rgba, "RGBA").save(path, optimize=True)
        made.append(path)
        previews.append(canvas.convert("RGB"))
    if gif:
        dur = [300] + [200] * (len(previews) - 2) + [900]
        previews[0].save(os.path.join(out_dir, "..", f"{name}.gif"), save_all=True, append_images=previews[1:], duration=dur, loop=0)
    return made


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("strip")
    ap.add_argument("name")
    ap.add_argument("--anchor", choices=["feet", "back", "none"], default="feet")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "remotion", "public", "flipbook"))
    ap.add_argument("--gif", action="store_true", help="also write <out>/<name>.gif to check the motion")
    args = ap.parse_args()
    for p in cut(args.strip, args.name, args.anchor, args.out, args.gif):
        print(p)


if __name__ == "__main__":
    main()
