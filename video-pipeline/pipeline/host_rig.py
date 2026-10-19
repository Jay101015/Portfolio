"""Turn one painted portrait of the host into animation layers.

Reads projects/host-art/base.jpg (or any portrait) and projects/host-art/landmarks.json,
and writes the layers the raster host rig draws:

  remotion/public/host/body.png       the bust with the head cleared (neck kept)
  remotion/public/host/head.png       hair, face, ears, top of the neck; brows and irises healed out
  remotion/public/host/brow-l.png     the brows as separate patches (moved/rotated for expressions)
  remotion/public/host/brow-r.png
  remotion/public/host/mouth-heal.png skin painted over the mouth, shown under drawn mouth shapes
  remotion/public/host/host.json      boxes, centres and sampled colours the rig needs

The landmarks are picked once per portrait (see projects/host-art/README.md).

    python -m pipeline.host_rig                       # defaults
    python -m pipeline.host_rig --portrait x.jpg --landmarks x.json --out remotion/public/host
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent


def key_background(im: np.ndarray) -> np.ndarray:
    """Alpha for a subject painted on a plain, light, low-saturation background."""
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    s = hsv[:, :, 1].astype(int)
    v = hsv[:, :, 2].astype(int)
    bg = ((s < 45) & (v > 150)).astype(np.uint8) * 255
    n, lab, stats, _ = cv2.connectedComponentsWithStats(bg)
    keep = np.zeros_like(bg)
    border = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
    for l in border:
        if l != 0 and stats[l, cv2.CC_STAT_AREA] > 500:
            keep[lab == l] = 255
    fg = 255 - keep
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(fg)
    big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    fg = np.where(lab == big, 255, 0).astype(np.uint8)
    return cv2.GaussianBlur(fg, (3, 3), 0)


def poly_mask(shape: tuple[int, int], pts: list[list[int]], feather: int = 0) -> np.ndarray:
    m = np.zeros(shape, np.uint8)
    cv2.fillPoly(m, [np.array(pts, np.int32)], 255)
    if feather:
        m = cv2.GaussianBlur(m, (feather * 2 + 1, feather * 2 + 1), 0)
    return m


def dark_mask(im: np.ndarray, box: list[int], vmax: int, grow: int) -> np.ndarray:
    """Dark pixels inside a box (brows, irises), grown and feathered."""
    x0, y0, x1, y1 = box
    m = np.zeros(im.shape[:2], np.uint8)
    roi = cv2.cvtColor(im[y0:y1, x0:x1], cv2.COLOR_BGR2HSV)[:, :, 2]
    sub = (roi < vmax).astype(np.uint8) * 255
    sub = cv2.morphologyEx(sub, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(sub)
    if n > 1:
        big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        sub = np.where(lab == big, 255, 0).astype(np.uint8)
    if grow:
        sub = cv2.dilate(sub, np.ones((grow * 2 + 1, grow * 2 + 1), np.uint8))
    m[y0:y1, x0:x1] = sub
    return m


def cut(im: np.ndarray, alpha: np.ndarray, box: list[int] | None = None) -> np.ndarray:
    rgba = cv2.cvtColor(im, cv2.COLOR_BGR2BGRA)
    rgba[:, :, 3] = alpha
    if box:
        x0, y0, x1, y1 = box
        return rgba[y0:y1, x0:x1]
    return rgba


def sample(im: np.ndarray, x: int, y: int, r: int = 6) -> str:
    patch = im[y - r : y + r, x - r : x + r].reshape(-1, 3).astype(int)
    b, g, rr = np.median(patch, axis=0)
    return f"#{int(rr):02x}{int(g):02x}{int(b):02x}"


def build(portrait: Path, landmarks: Path, out: Path) -> dict:
    L = json.loads(landmarks.read_text())
    im = cv2.imread(str(portrait))
    h, w = im.shape[:2]
    out.mkdir(parents=True, exist_ok=True)
    fg = key_background(im)

    # head / body split
    head_poly = poly_mask((h, w), L["head_polygon"], feather=6)
    neck = poly_mask((h, w), L["neck_polygon"])
    head_alpha = cv2.min(fg, head_poly)
    body_clear = cv2.erode(head_poly, np.ones((61, 61), np.uint8))
    body_clear = cv2.max(0, body_clear.astype(int) - neck.astype(int)).astype(np.uint8)
    body_alpha = cv2.min(fg, 255 - body_clear)

    # brows come off the head; the skin under them is healed
    brow_l = dark_mask(im, L["brow_l"], L.get("brow_vmax", 80), 3)
    brow_r = dark_mask(im, L["brow_r"], L.get("brow_vmax", 80), 3)
    heal = cv2.dilate(cv2.max(brow_l, brow_r), np.ones((9, 9), np.uint8))
    healed = cv2.inpaint(im, heal, 7, cv2.INPAINT_TELEA)
    # the mouth is covered with skin: each row blends the colour just left of the lips into the
    # colour just right of them, so the face's side-to-side shading carries across the patch
    mouth = poly_mask((h, w), L["mouth_polygon"])
    mouth_healed = im.copy()
    ys = np.where(mouth.any(axis=1))[0]
    for y in range(int(ys.min()) - 12, int(ys.max()) + 13):
        row = mouth[y] if 0 <= y < h else None
        xs = np.where(mouth[min(max(y, int(ys.min())), int(ys.max()))] > 0)[0]
        if row is None or len(xs) == 0:
            continue
        xl, xr = int(xs.min()), int(xs.max())
        left = np.median(im[y - 2 : y + 3, xl - 26 : xl - 8].reshape(-1, 3), axis=0)
        right = np.median(im[y - 2 : y + 3, xr + 8 : xr + 26].reshape(-1, 3), axis=0)
        t = np.linspace(0, 1, xr - xl + 1)[:, None]
        mouth_healed[y, xl : xr + 1] = (left * (1 - t) + right * t).astype(np.uint8)
    mouth_soft = cv2.GaussianBlur(cv2.dilate(mouth, np.ones((5, 5), np.uint8)), (15, 15), 0)

    def feather(m: np.ndarray, k: int = 2) -> np.ndarray:
        return cv2.GaussianBlur(m, (k * 2 + 1, k * 2 + 1), 0)

    layers = {
        "body.png": (cut(im, body_alpha), None),
        "head.png": (cut(healed, head_alpha), None),
        "brow-l.png": (cut(im, feather(brow_l), L["brow_l"]), L["brow_l"]),
        "brow-r.png": (cut(im, feather(brow_r), L["brow_r"]), L["brow_r"]),
        "mouth-heal.png": (cut(mouth_healed, cv2.min(mouth_soft, fg), L["mouth_box"]), L["mouth_box"]),
    }
    boxes = {}
    for name, (img, box) in layers.items():
        cv2.imwrite(str(out / name), img)
        boxes[name] = box or [0, 0, w, h]

    def centroid(m: np.ndarray) -> list[int]:
        ys, xs = np.where(m > 128)
        return [int(xs.mean()), int(ys.mean())] if len(xs) else [0, 0]

    info = {
        "width": w,
        "height": h,
        "boxes": boxes,
        "brow_l": centroid(brow_l),
        "brow_r": centroid(brow_r),
        "eye_l": L["eye_l"],
        "eye_r": L["eye_r"],
        "eye_shape_l": L["eye_shape_l"],
        "eye_shape_r": L["eye_shape_r"],
        "mouth": L["mouth_center"],
        "mouth_half_width": L["mouth_half_width"],
        "neck_base": L["neck_base"],
        "shoulder_l": L["shoulder_l"],
        "shoulder_r": L["shoulder_r"],
        "colors": {k: sample(im, *v) for k, v in L["color_samples"].items()},
    }
    (out / "host.json").write_text(json.dumps(info, indent=2))
    return info


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--portrait", default=str(ROOT / "projects/host-art/base.jpg"))
    ap.add_argument("--landmarks", default=str(ROOT / "projects/host-art/landmarks.json"))
    ap.add_argument("--out", default=str(ROOT / "remotion/public/host"))
    a = ap.parse_args()
    info = build(Path(a.portrait), Path(a.landmarks), Path(a.out))
    print(json.dumps({k: v for k, v in info.items() if k != "boxes"}, indent=1))


if __name__ == "__main__":
    main()
