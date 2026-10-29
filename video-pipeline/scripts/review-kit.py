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
