#!/usr/bin/env python3
"""Turn a black-line drawing (PNG or JPEG) into pen strokes the whiteboard hand can draw.

The usual tracer (potrace) outlines each black shape, so a marker line comes back as two edges; a pen drawing it
would go round every line twice. This one finds the centreline instead: threshold, skeletonise, walk the skeleton
into polylines, smooth and simplify them, and write them as SVG paths with round caps and a stroke width equal to
the drawing's own line width. The result is what a hand drew, stroke by stroke, in a sensible order.

    python3 scripts/illus-trace.py in.png out.svg [--size 1000] [--min 12] [--eps 1.2] [--mode auto|ink|outline]

A flat-colour illustration (black outlines round coloured fills, as image models like to draw) is handled by the
`outline` mode: thin black lines stay, a black fill (hair, a suit) becomes its rim, and a coloured area that meets
the white page without a line gets an edge there. `auto` picks it whenever the picture has colour or solid black.

Prints a one-line summary (strokes, total length) and writes the SVG with a `data-strokes` attribute.
"""
from __future__ import annotations

import argparse
import json
import math
import sys

import numpy as np
from PIL import Image, ImageFilter, ImageOps
from scipy import ndimage as ndi

try:
    from skimage.morphology import skeletonize
except ImportError:  # a slow fallback would be a Zhang-Suen pass; keep the dependency simple
    skeletonize = None


def load_ink(path: str, size: int, mode: str = "auto", dark: int = 80, speck: int = 12) -> np.ndarray:
    """A boolean image of the ink, `size` px on its long side, background removed."""
    im = Image.open(path).convert("RGBA")
    # a transparent background (our stills) becomes white
    bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
    im = Image.alpha_composite(bg, im).convert("RGB")
    scale = size / max(im.size)
    if scale < 1:
        im = im.resize((max(1, round(im.size[0] * scale)), max(1, round(im.size[1] * scale))), Image.LANCZOS)
    im = im.filter(ImageFilter.GaussianBlur(0.6))
    if speck > 12:  # a textured fill: smooth it before looking for lines
        im = im.filter(ImageFilter.MedianFilter(5))
    rgb = np.asarray(im, dtype=np.float32)
    lum = rgb.mean(axis=2)
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    if mode == "auto":
        coloured = (sat > 40).mean() > 0.01
        solid = (lum < 60).mean() > 0 and (lum < 150).mean() > 1.6 * (lum < 60).mean()
        mode = "outline" if coloured or solid else "ink"
    if mode == "ink":
        a = np.asarray(ImageOps.autocontrast(im.convert("L"), cutoff=1), dtype=np.float32)
        return a < 150
    return outline_ink(lum, sat, dark, speck)


def outline_ink(lum: np.ndarray, sat: np.ndarray, thresh: int = 80, speck: int = 12) -> np.ndarray:
    """Outline-only ink for a flat-colour drawing: thin dark lines, the rims of dark fills, the edges of colour on white."""
    dark = lum < thresh
    # the drawing's line width: twice the typical distance from a skeleton pixel to the nearest non-ink pixel
    dist = ndi.distance_transform_edt(dark)
    sk = skeletonize(dark) if skeletonize is not None else dark
    half = float(np.median(dist[sk])) if sk.any() else 2.0
    r = max(2, int(math.ceil(2.5 * half)))
    rim = dark & ~ndi.binary_erosion(dark, iterations=r)
    nonwhite = (lum < 225) | (sat > 30)
    nonwhite = ndi.binary_opening(nonwhite, iterations=2)
    edge = nonwhite & ~ndi.binary_erosion(nonwhite, iterations=max(1, int(round(half))))
    edge &= ~ndi.binary_dilation(dark, iterations=r)
    ink = rim | edge
    # nothing along the picture's own border: a fill that runs off the page should not become a frame
    m = r + 2
    ink[:m, :] = ink[-m:, :] = False
    ink[:, :m] = ink[:, -m:] = False
    # drop specks
    lab, n = ndi.label(ink)
    if n:
        sizes = ndi.sum(ink, lab, range(1, n + 1))
        keep = np.zeros(n + 1, bool)
        keep[1:] = sizes >= speck
        ink = keep[lab]
    return ink


def stroke_width(ink: np.ndarray, skel: np.ndarray) -> float:
    """Mean line width: ink area over skeleton length."""
    s = max(1, int(skel.sum()))
    return max(1.5, float(ink.sum()) / s)


NB = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def walk(skel: np.ndarray) -> list[list[tuple[int, int]]]:
    """Polylines through the skeleton: start at ends and junctions, follow until the next, then mop up loops."""
    h, w = skel.shape
    pts = set(zip(*np.nonzero(skel)))
    deg = {}
    for p in pts:
        y, x = p
        deg[p] = sum(((y + dy, x + dx) in pts) for dy, dx in NB)
    used_edges: set[tuple[tuple[int, int], tuple[int, int]]] = set()
    lines: list[list[tuple[int, int]]] = []

    def nbrs(p):
        y, x = p
        return [(y + dy, x + dx) for dy, dx in NB if (y + dy, x + dx) in pts]

    def trace(a, b):
        line = [a, b]
        used_edges.add((a, b))
        used_edges.add((b, a))
        prev, cur = a, b
        while deg.get(cur, 0) == 2:
            nxt = [q for q in nbrs(cur) if q != prev and (cur, q) not in used_edges]
            if not nxt:
                break
            prev, cur = cur, nxt[0]
            used_edges.add((prev, cur))
            used_edges.add((cur, prev))
            line.append(cur)
            if cur == a:
                break
        return line

    starts = sorted([p for p in pts if deg[p] != 2], key=lambda p: (p[1], p[0]))  # left to right, as a hand would
    for s in starts:
        for q in nbrs(s):
            if (s, q) not in used_edges:
                lines.append(trace(s, q))
    # closed loops with no end or junction
    for p in sorted(pts, key=lambda p: (p[1], p[0])):
        for q in nbrs(p):
            if (p, q) not in used_edges:
                lines.append(trace(p, q))
    return lines


def simplify(line: list[tuple[int, int]], eps: float) -> list[tuple[float, float]]:
    """Douglas-Peucker, on (x, y)."""
    pts = [(float(x), float(y)) for y, x in line]
    if len(pts) < 3:
        return pts

    def dp(a: int, b: int, keep: list[int]) -> None:
        (x1, y1), (x2, y2) = pts[a], pts[b]
        dx, dy = x2 - x1, y2 - y1
        L = math.hypot(dx, dy) or 1e-9
        best, bi = 0.0, -1
        for i in range(a + 1, b):
            x, y = pts[i]
            d = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / L
            if d > best:
                best, bi = d, i
        if best > eps and bi > 0:
            dp(a, bi, keep)
            keep.append(bi)
            dp(bi, b, keep)

    keep = [0]
    dp(0, len(pts) - 1, keep)
    keep.append(len(pts) - 1)
    keep = sorted(set(keep))
    return [pts[i] for i in keep]


def smooth(pts: list[tuple[float, float]]) -> str:
    """A path through the points with gentle curves (quadratic midpoints), so it reads as a pen, not a polyline."""
    if len(pts) == 1:
        x, y = pts[0]
        return f"M{x:.1f},{y:.1f} L{x + 0.5:.1f},{y:.1f}"
    if len(pts) == 2:
        return f"M{pts[0][0]:.1f},{pts[0][1]:.1f} L{pts[1][0]:.1f},{pts[1][1]:.1f}"
    d = [f"M{pts[0][0]:.1f},{pts[0][1]:.1f}"]
    for i in range(1, len(pts) - 1):
        mx, my = (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2
        d.append(f"Q{pts[i][0]:.1f},{pts[i][1]:.1f} {mx:.1f},{my:.1f}")
    d.append(f"L{pts[-1][0]:.1f},{pts[-1][1]:.1f}")
    return " ".join(d)


def length(pts: list[tuple[float, float]]) -> float:
    return sum(math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) for i in range(1, len(pts)))


def order(strokes: list[list[tuple[float, float]]]) -> list[list[tuple[float, float]]]:
    """Draw order: nearest-next from the top left, flipping a stroke when its far end is closer, like a hand would."""
    left = strokes[:]
    out: list[list[tuple[float, float]]] = []
    cur = (0.0, 0.0)
    while left:
        best, bi, flip = None, -1, False
        for i, s in enumerate(left):
            d0 = math.hypot(s[0][0] - cur[0], s[0][1] - cur[1])
            d1 = math.hypot(s[-1][0] - cur[0], s[-1][1] - cur[1])
            d, f = (d0, False) if d0 <= d1 else (d1, True)
            if best is None or d < best:
                best, bi, flip = d, i, f
        s = left.pop(bi)
        if flip:
            s = s[::-1]
        out.append(s)
        cur = s[-1]
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--size", type=int, default=1000, help="work at this many px on the long side")
    ap.add_argument("--min", type=float, default=5, help="drop strokes shorter than this (px); a dot is a short stroke, so keep this small")
    ap.add_argument("--eps", type=float, default=1.2, help="simplification tolerance (px)")
    ap.add_argument("--dark", type=int, default=80, help="outline mode: a pixel darker than this is line ink (raise it for brown or olive lines)")
    ap.add_argument("--speck", type=int, default=12, help="outline mode: drop ink blobs smaller than this many px (raise it for a textured fill)")
    ap.add_argument("--mode", choices=["auto", "ink", "outline"], default="auto", help="ink: a black-line drawing; outline: a flat-colour illustration; auto picks")
    args = ap.parse_args()
    if skeletonize is None:
        print("scikit-image is needed: pip install scikit-image", file=sys.stderr)
        return 2
    ink = load_ink(args.src, args.size, args.mode, args.dark, args.speck)
    skel = skeletonize(ink)
    width = stroke_width(ink, skel)
    lines = walk(skel)
    strokes = [simplify(ln, args.eps) for ln in lines if len(ln) >= 2]
    strokes = [s for s in strokes if length(s) >= args.min]
    strokes = order(strokes)
    h, w = ink.shape
    paths = "\n".join(f'  <path d="{smooth(s)}"/>' for s in strokes)
    total = sum(length(s) for s in strokes)
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" fill="none" stroke="#1d1d1f" stroke-width="{width:.1f}" '
        f'stroke-linecap="round" stroke-linejoin="round" data-strokes="{len(strokes)}" data-length="{total:.0f}">\n{paths}\n</svg>\n'
    )
    with open(args.dst, "w", encoding="utf-8") as f:
        f.write(svg)
    print(json.dumps({"strokes": len(strokes), "length": round(total), "width": round(width, 1), "size": [w, h]}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
