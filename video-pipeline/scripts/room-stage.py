#!/usr/bin/env python3
"""Check (or find) where the character stands in a room, before a [set] scene uses it.

    python3 scripts/room-stage.py <room> [out.png] [--x 0.44 --floor 0.72 --h 0.41]

Draws the room as the landscape video and as a Short will show it, with him standing at the room's spot (from
library/backgrounds/manifest.json, or the --x/--floor/--h given, all fractions of the drawing), a grid, the caption
band and the Shorts overlays. Measure a new room from things of known height (docs/pose-library.md "Sizing him in a
room"): a counter 0.9 m at his waist, a door 2 m just above his head, a garden wall 1 m at his hip, then write the
spot into the manifest.
"""
import argparse
import json
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, ROOT)
from pipeline.setpiece import poses, rooms, stage_for  # noqa: E402

PUB = os.path.join(ROOT, "remotion", "public")


def frame(room: dict, st: dict, vertical: bool, pose: str = "stand") -> Image.Image:
    W, H = (1080, 1920) if vertical else (1920, 1080)
    im = Image.open(os.path.join(PUB, room["file"])).convert("RGB")
    if vertical:
        s = st["vert"]
        sh = H * s["zoom"]; sw = im.width * sh / im.height
        big = im.resize((round(sw), round(sh)), Image.LANCZOS)
        x0 = min(max(0, s["cx"] * sw - W / 2), sw - W); y0 = (sh - H) * s["vtop"]
        f = big.crop((round(x0), round(y0), round(x0) + W, round(y0) + H))
    else:
        s = st["land"]
        sh = im.height * W / im.width
        big = im.resize((W, round(sh)), Image.LANCZOS)
        y0 = (sh - H) * s["top"]
        f = big.crop((0, round(y0), W, round(y0) + H))
    e = poses()[pose]
    fig = Image.open(os.path.join(PUB, "poses", "solid", f"{pose}.png")).convert("RGBA")
    k = s["h"] * H / 800
    fig = fig.resize((round(fig.width * k), round(fig.height * k)), Image.LANCZOS)
    f = f.convert("RGBA")
    f.alpha_composite(fig, (round(s["x"] * W - e["foot_x"] * k), round(s["floor"] * H - e["floor_y"] * k)))
    d = ImageDraw.Draw(f)
    for i in range(1, 20):
        d.line([(0, H * i / 20), (W, H * i / 20)], fill=(255, 0, 0, 90))
        d.text((4, H * i / 20 - 12), f"{i / 20:.2f}", fill=(255, 0, 0))
    if vertical:
        d.rectangle((0, H * 0.155, W, H * 0.225), outline=(0, 120, 255), width=4)  # captions
        d.rectangle((0, H * 0.85, W, H), outline=(255, 0, 140), width=4)  # Shorts title and channel
        d.rectangle((W * 0.85, H * 0.45, W, H * 0.85), outline=(255, 0, 140), width=4)  # Shorts buttons
    else:
        d.rectangle((0, H * 0.84, W, H * 0.93), outline=(0, 120, 255), width=4)  # captions
    return f.convert("RGB")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("room")
    ap.add_argument("out", nargs="?")
    ap.add_argument("--x", type=float)
    ap.add_argument("--floor", type=float)
    ap.add_argument("--h", type=float)
    a = ap.parse_args()
    room = rooms()[a.room]
    over = {k: getattr(a, k) for k in ("x", "floor", "h") if getattr(a, k) is not None}
    if not room.get("spot") and len(over) < 3:
        raise SystemExit(f"{a.room} has no spot yet: give --x --floor --h (drawing fractions)")
    room = dict(room, spot={**(room.get("spot") or {}), **over})
    st = stage_for(room)
    print(json.dumps({k: st[k] for k in ("land", "vert")}), *st["notes"], sep="\n")
    land, vert = frame(room, st, False), frame(room, st, True)
    v = vert.resize((round(vert.width * land.height / vert.height), land.height))
    sheet = Image.new("RGB", (land.width + v.width + 20, land.height), "white")
    sheet.paste(land, (0, 0)); sheet.paste(v, (land.width + 20, 0))
    out = a.out or f"room-stage-{a.room}.png"
    sheet.save(out)
    print(out)


if __name__ == "__main__":
    main()
