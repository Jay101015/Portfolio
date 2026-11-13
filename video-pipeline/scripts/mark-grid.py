#!/usr/bin/env python3
"""A labelled 10% grid over a picture, so a mark's place is read off the real page and not guessed.

    python3 scripts/mark-grid.py projects/<name>/media/real-page.jpg /tmp/real-page-grid.png [--step 10]

The highlighter, box and underline drawn on a real page (remotion/src/paper/pagework.tsx) take a rectangle in per
cent of the picture: `marks="highlight 12,18,46,7@word; box 10,52,60,14@word; underline 12,40,30@word"`. Open the
gridded picture, find the words, and read off the top-left corner (x, y), then the width and height: the numbers
along the top and bottom are x, the numbers down the sides are y, a heavy line every 10%, a light one halfway between.
For an underline read the line's left end and its length.

The picture itself is never changed: the grid is written to the path given (a scratch folder, not the project).
"""
import argparse
import os
import sys

from PIL import Image, ImageDraw, ImageFont

LINE = (215, 38, 160)  # magenta: a colour no article page is set in, so the grid never reads as part of it
FONTS = ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf", "DejaVuSans-Bold.ttf", "Arial Bold.ttf", "arialbd.ttf"]


def load_font(size: int):
    for name in FONTS:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    try:
        return ImageFont.load_default(size)
    except TypeError:  # an older Pillow: its one small built-in face
        return ImageFont.load_default()


def label(draw: ImageDraw.ImageDraw, xy: tuple, text: str, font, anchor: str) -> None:
    """A number on a white pad, so it reads on a dark page as well as a white one."""
    box = draw.textbbox(xy, text, font=font, anchor=anchor)
    draw.rectangle((box[0] - 4, box[1] - 3, box[2] + 4, box[3] + 3), fill=(255, 255, 255, 235))
    draw.text(xy, text, font=font, fill=LINE + (255,), anchor=anchor)


def grid(src: str, out: str, step: int = 10) -> tuple:
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    over = Image.new("RGBA", im.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(over)
    heavy = max(2, round(w / 800))
    font = load_font(max(13, round(w / 80)))
    half = step / 2
    k = 1
    while k * half < 100:  # the light lines first, the heavy ones over them
        if k % 2:
            x, y = round(w * k * half / 100), round(h * k * half / 100)
            draw.line((x, 0, x, h), fill=LINE + (70,), width=1)
            draw.line((0, y, w, y), fill=LINE + (70,), width=1)
        k += 1
    for p in range(step, 100, step):
        x, y = round(w * p / 100), round(h * p / 100)
        draw.line((x, 0, x, h), fill=LINE + (170,), width=heavy)
        draw.line((0, y, w, y), fill=LINE + (170,), width=heavy)
    for p in range(step, 100, step):  # the numbers last, so no line runs through one: on all four edges, where a page
        x, y = round(w * p / 100), round(h * p / 100)  # has its margins, so a number never sits on the words being read
        label(draw, (x, 6), str(p), font, "mt")
        label(draw, (x, h - 6), str(p), font, "mb")
        label(draw, (6, y), str(p), font, "lm")
        label(draw, (w - 6, y), str(p), font, "rm")
    done = Image.alpha_composite(im, over)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    if out.lower().endswith((".jpg", ".jpeg")):
        done.convert("RGB").save(out, quality=92)
    else:
        done.save(out)
    return w, h


def main() -> int:
    ap = argparse.ArgumentParser(description="Draw a labelled grid over a picture, to read a mark's rectangle off it in per cent.")
    ap.add_argument("picture", help="the page or photo, for example projects/<name>/media/real-page.jpg")
    ap.add_argument("out", help="where to write the gridded picture (.png or .jpg)")
    ap.add_argument("--step", type=int, default=10, help="per cent between heavy lines (default 10)")
    a = ap.parse_args()
    if not os.path.isfile(a.picture):
        print(f"mark-grid: no picture at {a.picture}", file=sys.stderr)
        return 1
    if not 2 <= a.step <= 50:
        print("mark-grid: --step is between 2 and 50", file=sys.stderr)
        return 1
    if os.path.abspath(a.out) == os.path.abspath(a.picture):
        print("mark-grid: the grid is written to a new file, never over the picture", file=sys.stderr)
        return 1
    w, h = grid(a.picture, a.out, a.step)
    print(f"{a.out}: {w}x{h}, a heavy line every {a.step}%")
    print("read x,y (top-left corner) then w,h in per cent: highlight x,y,w,h@word  box x,y,w,h@word  underline x,y,w@word")
    if abs(w / h - 16 / 9) > 0.02:
        print(f"note: this picture is not 16:9 ({w / h:.2f}:1). A landscape frame crops it to fill, so marks read off it land a little off; crop the page to 16:9 first.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
