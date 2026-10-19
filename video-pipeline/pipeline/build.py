"""One command from script + voiceover to finished video.

    python -m pipeline.build projects/<name> [--vertical] [--no-render] [--backend faster_whisper|sherpa_onnx|none]

Expects in the project folder:
    script.md                     the tagged script (required)
    voiceover.(wav|mp3|m4a|...)   your recording (optional; estimated timing without it)
    images/                       hero images referenced by [image src=...] (optional)
Writes:
    storyboard.json, storyboard.html, <slug>.mp4 (and <slug>-vertical.mp4)
"""
from __future__ import annotations

import argparse
import glob
import hashlib
import json
import os
import shutil
import subprocess
import sys

from . import align as al
from .preview import write_preview
from .script_parser import parse_script

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REMOTION = os.path.join(ROOT, "remotion")
AUDIO_EXT = ("wav", "mp3", "m4a", "aac", "flac", "ogg", "opus")


def find_audio(project: str) -> str | None:
    for ext in AUDIO_EXT:
        hits = sorted(glob.glob(os.path.join(project, f"voiceover.{ext}")))
        if hits:
            return hits[0]
    return None


def file_hash(path: str) -> str:
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


def render(props_path: str, out_path: str, composition: str, concurrency: str | None) -> None:
    cmd = ["npx", "remotion", "render", composition, out_path, f"--props={props_path}", "--log=warn"]
    if concurrency:
        cmd.append(f"--concurrency={concurrency}")
    print("+", " ".join(cmd), flush=True)
    subprocess.run(cmd, cwd=REMOTION, check=True)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("project", help="project folder containing script.md")
    ap.add_argument("--backend", default="faster_whisper", choices=["faster_whisper", "sherpa_onnx", "none"])
    ap.add_argument("--model", default="base.en", help="faster-whisper size (tiny.en/base.en/small.en/...) or sherpa model dir")
    ap.add_argument("--vertical", action="store_true", help="also render a 9:16 version")
    ap.add_argument("--only-vertical", action="store_true")
    ap.add_argument("--no-render", action="store_true", help="stop after storyboard.json / storyboard.html")
    ap.add_argument("--no-captions", action="store_true")
    ap.add_argument("--concurrency", default=None)
    ap.add_argument("--retranscribe", action="store_true", help="ignore the cached transcript for this voiceover")
    args = ap.parse_args(argv)

    project = os.path.abspath(args.project)
    script_path = os.path.join(project, "script.md")
    if not os.path.exists(script_path):
        print(f"no script.md in {project}", file=sys.stderr)
        return 2
    with open(script_path, encoding="utf-8") as f:
        sb = parse_script(f.read())
    if args.no_captions:
        sb["captions"] = False
    slug = sb["slug"]
    print(f"storyboard: {len(sb['scenes'])} scenes, estimated {sb['durationSec']:.0f}s")

    audio = find_audio(project)
    align_report = ""
    public_dir = os.path.join(REMOTION, "public", "projects", slug)
    os.makedirs(public_dir, exist_ok=True)
    if audio:
        total = al.audio_duration(audio)
        wav = al.to_wav16k(audio, os.path.join(project, ".cache", "asr16k.wav"))
        # The transcript is cached per recording, so editing the script or re-rendering never
        # repeats the slow ASR step; alignment itself is instant and always re-run.
        cache = os.path.join(project, ".cache", f"transcript-{file_hash(audio)}.json")
        words = None
        if os.path.exists(cache) and not args.retranscribe:
            with open(cache, encoding="utf-8") as f:
                words = json.load(f)
            print(f"using cached transcript {os.path.basename(cache)}")
        elif args.backend != "none":
            hint = " ".join(sc["narration"] for sc in sb["scenes"])
            print(f"transcribing {os.path.basename(audio)} ({total:.1f}s) with {args.backend}...", flush=True)
            words = al.transcribe(wav, args.backend, args.model, hint)
            os.makedirs(os.path.dirname(cache), exist_ok=True)
            with open(cache, "w", encoding="utf-8") as f:
                json.dump(words, f)
        if words is not None:
            sb = al.align(sb, words, total)
            align_report = al.report(sb)
            print(align_report)
        else:
            print("WARNING: voiceover present but not transcribed (--backend none, no cache): timings are estimates")
            sb["durationSec"] = round(total + 0.5, 3)
        ext = os.path.splitext(audio)[1]
        shutil.copyfile(audio, os.path.join(public_dir, f"voiceover{ext}"))
        sb["audio"] = f"projects/{slug}/voiceover{ext}"
        sb["mouth"] = al.mouth_envelope(wav, sb["fps"], sb["durationSec"])
    else:
        print("no voiceover.* found: using estimated timing, silent render")
        sb["mouth"] = al.mouth_from_words(sb["scenes"], sb["fps"], sb["durationSec"])

    # Footage, stills and posters live in <project>/media (images/ still works for older projects).
    for folder in ("media", "images"):
        src_dir = os.path.join(project, folder)
        if not os.path.isdir(src_dir):
            continue
        dst = os.path.join(public_dir, folder)
        shutil.rmtree(dst, ignore_errors=True)
        shutil.copytree(src_dir, dst)
        for sc in sb["scenes"]:
            src = sc["props"].get("src")
            if src and not src.startswith("projects/") and os.path.exists(os.path.join(src_dir, src)):
                sc["props"]["src"] = f"projects/{slug}/{folder}/{src}"
    for sc in sb["scenes"]:
        src = sc["props"].get("src")
        if src and not src.startswith("projects/"):
            print(f"WARNING: scene {sc['id']} src '{src}' not found in {project}/media")

    sb_path = os.path.join(project, "storyboard.json")
    with open(sb_path, "w", encoding="utf-8") as f:
        json.dump(sb, f, indent=1)
    write_preview(sb, os.path.join(project, "storyboard.html"), align_report)
    print(f"wrote {sb_path} and storyboard.html")
    if args.no_render:
        return 0

    if not args.only_vertical:
        render(sb_path, os.path.join(project, f"{slug}.mp4"), "Main", args.concurrency)
    if args.vertical or args.only_vertical:
        render(sb_path, os.path.join(project, f"{slug}-vertical.mp4"), "Vertical", args.concurrency)
    print("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
