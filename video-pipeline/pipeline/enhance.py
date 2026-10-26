"""Make a phone recording sound like a better microphone.

A voice memo from a phone in a bedroom has room hum, hiss, some boom when the phone is close and not much presence;
its level wanders. This runs it through the chain a podcast editor would: a high-pass to drop the rumble, noise
removal, a de-esser, a little EQ (less mud at 250 Hz, more presence at 3 kHz), a compressor to even the level out,
and loudness normalisation to the -14 LUFS YouTube plays at. Three strengths:

    light    high-pass, gentle noise removal, EQ, light compression, loudness
    normal   the same with proper noise removal and compression (the default)
    strong   RNNoise (a neural noise suppressor) in front of all of that, for noisy rooms and bad mics
    natural  nothing but the volume: brought to the loudness target and kept under a limiter, for a recording
             that is already clean or was edited by hand (noise removal on clean audio makes it watery)

The original recording is never touched: the result is a new file. `voice: raw` in a script header turns it off.

    python -m pipeline.enhance in.m4a out.mp3 --level strong
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys

MODEL = os.path.join(os.path.dirname(__file__), "models", "bd.rnnn")  # RNNoise speech model (BSD-3, GregorR/rnnoise-models)
LEVELS = ("off", "raw", "natural", "light", "normal", "strong")


def level_from_header(value: str | None) -> str:
    """`voice: enhance strong` / `voice: strong` / `voice: raw` / nothing -> a level name."""
    v = (value or "").strip().lower()
    if not v or v in ("enhance", "on", "yes", "clean"):
        return "normal"
    for lv in ("natural", "strong", "light", "normal"):
        if lv in v:
            return lv
    if v in ("raw", "off", "no", "none"):
        return "off"
    return "normal"


def chain(level: str, measured: dict[str, float] | None = None) -> str:
    """The ffmpeg filter graph for a level. With `measured` (from a first pass), the loudness step is a plain gain
    change to the target instead of a moving one, so nothing pumps."""
    if level == "natural":
        ln = "loudnorm=I=-14:TP=-1.5:LRA=11"
        if measured:
            ln += f":measured_I={measured['lufs']}:measured_TP={measured['peak_dbtp']}:measured_LRA={measured['range_lu']}:measured_thresh={measured['thresh']}:linear=true"
        return "anull," + ln + ",alimiter=limit=0.85:attack=4:release=60:level=false"
    parts = ["highpass=f=80:poles=2"]
    if level == "strong" and os.path.exists(MODEL):
        parts.append(f"arnndn=m={MODEL}:mix=0.85")
        parts.append("afftdn=nf=-30:nr=8:tn=1")
    elif level == "light":
        parts.append("afftdn=nf=-25:nr=6:tn=1")
    else:
        parts.append("afftdn=nf=-28:nr=12:tn=1")
    parts += [
        "deesser=i=0.3:m=0.5:f=0.5",
        "equalizer=f=250:t=q:w=1.4:g=-2.5",
        "equalizer=f=3000:t=q:w=1.0:g=2.5",
        "equalizer=f=8000:t=q:w=1.0:g=1",
    ]
    if level == "light":
        parts.append("acompressor=threshold=-20dB:ratio=2:attack=12:release=150:makeup=2")
    else:
        parts.append("acompressor=threshold=-20dB:ratio=3:attack=8:release=120:makeup=3")
    ln = "loudnorm=I=-14:TP=-1.5:LRA=11"
    if measured:
        ln += f":measured_I={measured['lufs']}:measured_TP={measured['peak_dbtp']}:measured_LRA={measured['range_lu']}:measured_thresh={measured['thresh']}:linear=true"
    parts.append(ln)
    parts.append("alimiter=limit=0.85:attack=4:release=60:level=false")
    return ",".join(parts)


def enhance(src: str, dst: str, level: str = "normal") -> str:
    """Run the chain on `src`, writing `dst` (mono; mp3 or wav by extension). Returns dst."""
    if level in ("off", "raw"):
        return src
    os.makedirs(os.path.dirname(os.path.abspath(dst)) or ".", exist_ok=True)
    ext = os.path.splitext(dst)[1].lower()
    codec = ["-codec:a", "libmp3lame", "-q:a", "2"] if ext == ".mp3" else ["-codec:a", "pcm_s16le"]
    # pass one: run the chain and measure what comes out of it; pass two: the same chain with the loudness step
    # set from that measurement
    measured = measure(src, chain(level).rsplit(",loudnorm", 1)[0])
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", src, "-vn", "-ac", "1", "-ar", "48000", "-af", chain(level, measured or None), *codec, dst]
    subprocess.run(cmd, check=True)
    return dst


def measure(path: str, before: str | None = None) -> dict[str, float]:
    """Integrated loudness, true peak, loudness range and gate threshold, from ffmpeg's loudnorm analysis; with
    `before`, of the sound after that filter chain."""
    af = (before + "," if before else "") + "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json"
    p = subprocess.run(["ffmpeg", "-v", "info", "-i", path, "-vn", "-ac", "1", "-af", af, "-f", "null", "-"], capture_output=True, text=True)
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", p.stderr, re.S)
    if not m:
        return {}
    d = json.loads(m.group(0))
    try:
        return {"lufs": float(d["input_i"]), "peak_dbtp": float(d["input_tp"]), "range_lu": float(d["input_lra"]), "thresh": float(d["input_thresh"])}
    except (KeyError, ValueError):
        return {}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--level", default="normal", choices=LEVELS)
    ap.add_argument("--measure", action="store_true", help="print loudness before and after")
    args = ap.parse_args(argv)
    if args.measure:
        print("before:", measure(args.src))
    out = enhance(args.src, args.dst, args.level)
    if args.measure and out != args.src:
        print("after: ", measure(out))
    print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
