#!/usr/bin/env python3
"""Turn a finished video into what the reviewers look at (.claude/skills/video-review).

    python3 scripts/review-kit.py <video.mp4> <out dir> [--words words.json] [--storyboard storyboard.json]

Writes into <out dir>:
- facts.md: length, size, frame rate, loudness (integrated and true peak), every cut with its time, the longest
  stretch with no cut, and the words with their times when given (--words: [{"w","s","e"}], or the words of a
  storyboard or a Short's cut storyboard)
- overview.png: a frame every 2 seconds (every 1 second for a Short), each stamped with its time
- opening.png: the first 6 seconds, a frame every half second (the scroll-in moment)
- cuts.png: the first frame after every cut, stamped, so each scene can be checked against its words
- facts.md "Eyes": every stretch of 4 seconds or more where nothing new happens on screen (no cut, no writing, no
  pose, no footage moving; the slow push-in alone does not count), how many times a minute something does, and every
  stretch of 3 seconds or more where the page is mostly empty paper (white space the eye has nothing to do in)
"""
import argparse
import json
import os
import re
import subprocess

from PIL import Image, ImageDraw, ImageFont


def probe(path: str) -> dict:
    out = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def loudness(path: str) -> tuple[str, str]:
    err = subprocess.run(["ffmpeg", "-nostats", "-i", path, "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"], capture_output=True, text=True).stderr
    i = re.findall(r"I:\s+(-?[\d.]+) LUFS", err)
    tp = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", err)
    return (i[-1] if i else "?"), (tp[-1] if tp else "?")


def cuts(path: str, thresh: float = 0.3) -> list[float]:
    err = subprocess.run(["ffmpeg", "-nostats", "-i", path, "-vf", f"select='gt(scene,{thresh})',showinfo", "-an", "-f", "null", "-"], capture_output=True, text=True).stderr
    raw = [round(float(x), 2) for x in re.findall(r"pts_time:([\d.]+)", err)]
    out: list[float] = []
    for c in raw:  # a page turn or a wipe shows up as several cuts in a row: keep the first
        if not out or c - out[-1] > 0.5:
            out.append(c)
    return out


def idle_stretches(path: str, fps: int = 5, event: float = 0.45, longest: float = 4.0) -> tuple[list[tuple[float, float]], float]:
    """Stretches where the picture does not change enough to hold an eye: the mean frame-to-frame difference (96x54,
    grey, 0-255) stays under `event`. A board's slow push-in measures about 0.1-0.3, writing and footage 0.5 and up.
    Returns the stretches of `longest` seconds or more, and the visual events a minute (a change starting)."""
    import numpy as np
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf", f"fps={fps},scale=96:54,format=gray", "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.uint8).reshape(-1, 54, 96).astype(np.float32)
    if len(x) < 2:
        return [], 0.0
    busy = np.abs(np.diff(x, axis=0)).mean(axis=(1, 2)) >= event
    out, start = [], None
    for i, b in enumerate(list(busy) + [True]):
        if not b and start is None:
            start = i
        elif b and start is not None:
            if (i - start) / fps >= longest:
                out.append((round(start / fps, 1), round(i / fps, 1)))
            start = None
    starts = int(np.sum(busy[1:] & ~busy[:-1])) + int(busy[0])
    return out, round(starts / (len(busy) / fps / 60), 1)


def blank_stretches(path: str, fps: int = 2, longest: float = 3.0) -> list[tuple[float, float, int]]:
    """Stretches of `longest` seconds or more where the page is mostly empty: at 192x108, at least 90% of the frame is
    plain paper (grey 228 and up) and under 3.5% is ink (under 170). Measured on the Gen Z cut: a hook line or a lone
    doodle 0.5-1% ink, three written lines 2-3%, a board with a traced drawing 5-7%, a set piece 11%, footage 65% and
    up with almost no plain paper. Returns (start, end, the least ink in tenths of a percent)."""
    import numpy as np
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf", f"fps={fps},scale=192:108,format=gray", "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.uint8).reshape(-1, 108, 192)
    ink = (x < 170).mean(axis=(1, 2))
    paper = (x >= 228).mean(axis=(1, 2))
    empty = (paper >= 0.9) & (ink < 0.035)
    out, start = [], None
    for i, e in enumerate(list(empty) + [False]):
        if e and start is None:
            start = i
        elif not e and start is not None:
            if (i - start) / fps >= longest:
                out.append((round(start / fps, 1), round(i / fps, 1), int(round(1000 * float(ink[start:i].min())))))
            start = None
    return out

def frame_at(path: str, t: float, w: int) -> Image.Image:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.3f}", "-i", path, "-frames:v", "1", "-vf", f"scale={w}:-2", "-f", "image2pipe", "-vcodec", "png", "-"], capture_output=True, check=True).stdout
    import io
    return Image.open(io.BytesIO(raw)).convert("RGB")


def sheet(path: str, times: list[float], w: int, cols: int, out: str) -> None:
    font = ImageFont.load_default()
    ims = []
    for t in times:
        im = frame_at(path, t, w)
        d = ImageDraw.Draw(im)
        label = f"{int(t // 60)}:{t % 60:05.2f}"
        d.rectangle((0, 0, 8 + 7 * len(label), 16), fill=(0, 0, 0))
        d.text((4, 2), label, fill=(255, 255, 0), font=font)
        ims.append(im)
    if not ims:
        return
    h = max(i.height for i in ims)
    rows = (len(ims) + cols - 1) // cols
    s = Image.new("RGB", (cols * (w + 4), rows * (h + 4)), "white")
    for k, im in enumerate(ims):
        s.paste(im, ((k % cols) * (w + 4), (k // cols) * (h + 4)))
    s.save(out)


def scene_changes(args) -> list[float]:
    """the storyboard's own scene boundaries (a page slide or a fade is missed by the cut detector)"""
    if not args.storyboard:
        return []
    sb = json.load(open(args.storyboard, encoding="utf-8"))
    return [round(float(sc["start"]), 2) for sc in sb.get("scenes", [])[1:]]


def words_from(args) -> list[dict]:
    if args.words:
        return json.load(open(args.words, encoding="utf-8"))
    if args.storyboard:
        sb = json.load(open(args.storyboard, encoding="utf-8"))
        return [w for sc in sb.get("scenes", []) for w in (sc.get("words") or [])]
    return []


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video")
    ap.add_argument("out")
    ap.add_argument("--words")
    ap.add_argument("--storyboard")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    info = probe(args.video)
    v = next(s for s in info["streams"] if s["codec_type"] == "video")
    dur = float(info["format"]["duration"])
    w, h = int(v["width"]), int(v["height"])
    vertical = h > w
    fps = v.get("r_frame_rate", "?")
    lufs, peak = loudness(args.video)
    cs = cuts(args.video)
    changes = scene_changes(args)
    if changes:
        cs = sorted(set(cs) | set(changes))
        merged: list[float] = []
        for c in cs:
            if not merged or c - merged[-1] > 0.5:
                merged.append(c)
        cs = merged
    bounds = [0.0] + cs + [dur]
    gaps = [(b - a, a) for a, b in zip(bounds, bounds[1:])]
    longest = max(gaps) if gaps else (dur, 0.0)
    words = words_from(args)
    lines = [f"# Review kit: {os.path.basename(args.video)}", "",
             f"- length {dur:.1f}s, {w}x{h} ({'vertical, a Short' if vertical else 'landscape'}), {fps} fps",
             f"- loudness {lufs} LUFS integrated (target -14), true peak {peak} dBFS (keep under -1)",
             f"- {len(cs)} cuts{' (with the storyboard scene changes)' if changes else ''}; longest stretch with no cut {longest[0]:.1f}s from {longest[1]:.1f}s",
             "", "## Cuts (seconds)", "", ", ".join(f"{c:.2f}" for c in cs) or "none"]
    idle, per_min = idle_stretches(args.video)
    lines += ["", "## Eyes", "", f"- something new on screen {per_min} times a minute; still for 4 s or more: {len(idle)} times, {sum(b - a for a, b in idle):.0f}s in all"]
    lines += [f"- still {int(a // 60)}:{a % 60:04.1f} to {int(b // 60)}:{b % 60:04.1f} ({b - a:.1f}s)" for a, b in idle]
    blank = blank_stretches(args.video)
    lines += [f"- mostly empty page (3 s or more of plain paper with under 3.5% ink): {len(blank)} times, {sum(b - a for a, b, _ in blank):.0f}s in all"]
    lines += [f"- empty {int(a // 60)}:{a % 60:04.1f} to {int(b // 60)}:{b % 60:04.1f} ({b - a:.1f}s, as little as {pc / 10:.1f}% ink)" for a, b, pc in blank]
    if words:
        lines += ["", "## Words (start time, word)", ""]
        line, t0 = [], None
        for x in words:
            if t0 is None:
                t0 = x["s"]
            line.append(x["w"])
            if len(line) >= 12 or str(x["w"]).endswith((".", "?", "!")):
                lines.append(f"- {t0:6.2f}  {' '.join(line)}")
                line, t0 = [], None
        if line:
            lines.append(f"- {t0:6.2f}  {' '.join(line)}")
    open(os.path.join(args.out, "facts.md"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
    step = 1.0 if vertical else 2.0
    tw = 240 if vertical else 384
    sheet(args.video, [round(t * step, 2) for t in range(int(dur / step) + 1) if t * step < dur - 0.05], tw, 8 if vertical else 5, os.path.join(args.out, "overview.png"))
    sheet(args.video, [x / 2 for x in range(12) if x / 2 < dur], tw, 6, os.path.join(args.out, "opening.png"))
    sheet(args.video, [min(dur - 0.05, c + 0.1) for c in cs], tw, 8 if vertical else 5, os.path.join(args.out, "cuts.png"))
    print(os.path.join(args.out, "facts.md"))


if __name__ == "__main__":
    main()
