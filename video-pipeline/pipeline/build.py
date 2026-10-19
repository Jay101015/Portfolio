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
import urllib.request

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


def _remotion(args: list[str], cwd: str) -> int:
    print("+", " ".join(args), flush=True)
    return subprocess.run(args, cwd=cwd).returncode


def fetch_sources(project: str) -> None:
    """media/sources.txt: `<file name> <https url>` per line. Missing files are downloaded before the build.

    Keeps big footage out of git: commit the URL (your own cloud storage, a direct
    download link), not the file. Lines starting with # are comments.
    """
    listing = os.path.join(project, "media", "sources.txt")
    if not os.path.exists(listing):
        return
    with open(listing, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split(maxsplit=1)
            if len(parts) != 2:
                continue
            name, url = parts
            dst = os.path.join(project, "media", name)
            if os.path.exists(dst):
                continue
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            if url.startswith("yt:"):
                if shutil.which("yt-dlp"):
                    print(f"fetching {name} with yt-dlp", flush=True)
                    r = subprocess.run(["yt-dlp", "--no-playlist", "-f", "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b", "--merge-output-format", "mp4", "-o", dst, url[3:]], capture_output=True, text=True)
                    if r.returncode != 0:
                        print(f"WARNING: yt-dlp could not fetch {name}: {r.stderr.strip()[-300:]}", flush=True)
                else:
                    print(f"WARNING: {name} is a YouTube link and yt-dlp is not installed; the scene will use its fallback", flush=True)
                continue
            print(f"fetching {name} from {url}", flush=True)
            try:
                with urllib.request.urlopen(url, timeout=120) as r, open(dst, "wb") as out:
                    shutil.copyfileobj(r, out)
            except Exception as e:  # noqa: BLE001
                print(f"WARNING: could not fetch {name}: {e}", flush=True)
                if os.path.exists(dst):
                    os.remove(dst)


def resolve_media(sb: dict, project: str, slug: str) -> list[str]:
    """Point every src at the published copy; swap a clip for its fallback still when the footage is not there."""
    notes = []
    for folder in ("media", "images"):
        src_dir = os.path.join(project, folder)
        if not os.path.isdir(src_dir):
            continue
        for sc in sb["scenes"]:
            p = sc["props"]
            src = p.get("src")
            if sc["type"] == "clip" and src and not src.startswith("projects/") and not os.path.exists(os.path.join(src_dir, src)):
                fb = p.get("fallback")
                if fb and os.path.exists(os.path.join(src_dir, fb)):
                    notes.append(f"scene {sc['id']}: footage '{src}' not present, using the fallback still '{fb}'")
                    sc["type"] = "still"
                    p["src"] = fb
                    p.pop("from", None)
                    p.pop("vol", None)
                    src = fb
            if src and not src.startswith("projects/") and os.path.exists(os.path.join(src_dir, src)):
                p["src"] = f"projects/{slug}/{folder}/{src}"
    for sc in sb["scenes"]:
        src = sc["props"].get("src")
        if src and not src.startswith("projects/"):
            notes.append(f"WARNING: scene {sc['id']} src '{src}' not found in {project}/media")
    return notes


def render(props_path: str, out_path: str, composition: str, concurrency: str | None, timeout_ms: int = 120000, chunk: int = 450, retries: int = 2) -> None:
    """Render in frame chunks, retrying a chunk that fails, then join the chunks with ffmpeg.

    Chunking makes a long render robust against a single hung frame (a footage
    frame extraction or font load that never returns) and keeps each browser
    session short. All chunks share the same encoder settings, so a stream copy
    concat is lossless.
    """
    with open(props_path, encoding="utf-8") as f:
        sb = json.load(f)
    total = max(1, int(round(sb["durationSec"] * sb.get("fps", 30))))
    base = ["npx", "remotion", "render", composition, f"--props={props_path}", "--log=warn", f"--timeout={timeout_ms}"]
    if concurrency:
        base.append(f"--concurrency={concurrency}")
    if chunk <= 0 or total <= chunk:
        if _remotion(base[:4] + [out_path] + base[4:], REMOTION) != 0:
            raise SystemExit("render failed")
        return
    tmp = os.path.join(os.path.dirname(out_path), ".cache", "chunks", composition)
    shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(tmp, exist_ok=True)
    parts = []
    for i, start in enumerate(range(0, total, chunk)):
        end = min(total - 1, start + chunk - 1)
        part = os.path.join(tmp, f"part{i:03d}.mp4")
        for attempt in range(retries + 1):
            code = _remotion(base[:4] + [part] + base[4:] + [f"--frames={start}-{end}"], REMOTION)
            if code == 0 and os.path.exists(part):
                break
            print(f"chunk {i} ({start}-{end}) failed (attempt {attempt + 1}/{retries + 1})", flush=True)
        else:
            raise SystemExit(f"render failed: chunk {i} frames {start}-{end} did not render after {retries + 1} attempts")
        parts.append(part)
    listing = os.path.join(tmp, "parts.txt")
    with open(listing, "w", encoding="utf-8") as f:
        for p in parts:
            f.write(f"file '{p}'\n")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", listing, "-c", "copy", out_path], check=True)
    print(f"joined {len(parts)} chunks -> {out_path}", flush=True)


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
    ap.add_argument("--chunk", type=int, default=450, help="frames per render chunk (0 = single pass)")
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
        sb["visemes"] = al.visemes_from_words(sb["scenes"], sb["fps"], sb["durationSec"])
    else:
        print("no voiceover.* found: using estimated timing, silent render")
        sb["mouth"] = al.mouth_from_words(sb["scenes"], sb["fps"], sb["durationSec"])
        sb["visemes"] = al.visemes_from_words(sb["scenes"], sb["fps"], sb["durationSec"])

    # Footage, stills and posters live in <project>/media (images/ still works for older projects).
    fetch_sources(project)
    for note in resolve_media(sb, project, slug):
        print(note)
    for folder in ("media", "images"):
        src_dir = os.path.join(project, folder)
        if os.path.isdir(src_dir):
            dst = os.path.join(public_dir, folder)
            shutil.rmtree(dst, ignore_errors=True)
            shutil.copytree(src_dir, dst)

    sb_path = os.path.join(project, "storyboard.json")
    with open(sb_path, "w", encoding="utf-8") as f:
        json.dump(sb, f, indent=1)
    write_preview(sb, os.path.join(project, "storyboard.html"), align_report)
    print(f"wrote {sb_path} and storyboard.html")
    if args.no_render:
        return 0

    if not args.only_vertical:
        render(sb_path, os.path.join(project, f"{slug}.mp4"), "Main", args.concurrency, chunk=args.chunk)
    if args.vertical or args.only_vertical:
        render(sb_path, os.path.join(project, f"{slug}-vertical.mp4"), "Vertical", args.concurrency, chunk=args.chunk)
    print("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
