"""One command from script + voiceover to finished video.

    python -m pipeline.build projects/<name> [--vertical] [--no-render] [--backend faster_whisper|sherpa_onnx|none]

Expects in the project folder:
    script.md                     the tagged script; plain paragraphs work too. Optional when there is a voiceover:
                                  with no script, or a script with only header lines, the recording is transcribed
                                  and the scenes are built from your words (pipeline/auto_script.py), and the script
                                  that was built is written back so you can edit it and render again
    voiceover.(wav|mp3|m4a|...)   your recording (optional; estimated timing without it)
    images/                       hero images referenced by [image src=...] (optional)
Writes:
    storyboard.json, storyboard.html, <slug>.mp4 (and <slug>-vertical.mp4)
"""
from __future__ import annotations

import argparse
import base64
import glob
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request

from . import align as al
from .preview import write_preview
from .auto_script import script_from_words
from .script_parser import parse_script

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REMOTION = os.path.join(ROOT, "remotion")
AUDIO_EXT = ("wav", "mp3", "m4a", "aac", "flac", "ogg", "opus", "webm", "weba", "mp4", "mov", "caf")


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


def _join_parts(project: str) -> list[str]:
    """uploads/partNNNN--<name> plus uploads/doneN--<name>: a big file sent from the studio in pieces (the connector
    refuses very large messages, and the studio halves the piece size until one goes through, so pieces vary in
    size). The done marker says how many pieces there are; when every one is there they are joined into <name>.b64
    where the file belongs: the project folder for the recording, media/ for anything else."""
    notes = []
    up = os.path.join(project, "uploads")
    if not os.path.isdir(up):
        return notes
    parts: dict[str, dict[int, str]] = {}
    done: dict[str, int] = {}
    for n in os.listdir(up):
        m = re.match(r"^part(\d+)--(.+)$", n)
        if m:
            parts.setdefault(m.group(2), {})[int(m.group(1))] = os.path.join(up, n)
            continue
        m = re.match(r"^done(\d+)--(.+)$", n)
        if m:
            done[m.group(2)] = int(m.group(1))
    for name, want in done.items():
        have = parts.get(name, {})
        if sorted(have) != list(range(1, want + 1)):
            notes.append(f"WARNING: {name}: {len(have)} of {want} pieces arrived; send it again")
            continue
        dst_dir = project if name.startswith("voiceover.") else os.path.join(project, "media")
        os.makedirs(dst_dir, exist_ok=True)
        with open(os.path.join(dst_dir, name + ".b64"), "w", encoding="ascii") as out:
            for i in range(1, want + 1):
                with open(have[i], encoding="ascii") as f:
                    out.write("".join(f.read().split()))
        notes.append(f"joined {want} pieces of {name}")
    return notes


def _direct_link(url: str) -> str:
    """Share links that point at a page, turned into links to the file itself."""
    url = url.strip()
    m = re.search(r"drive\.google\.com/(?:file/d/|open\?id=|uc\?(?:export=download&)?id=)([\w-]+)", url)
    if m:
        return f"https://drive.google.com/uc?export=download&confirm=t&id={m.group(1)}"
    if "dropbox.com" in url:
        return re.sub(r"([?&])dl=0", r"\1dl=1", url) if "dl=0" in url else url + ("&" if "?" in url else "?") + "dl=1"
    if "1drv.ms" in url or "onedrive.live.com" in url:
        return url + ("&" if "?" in url else "?") + "download=1"
    return url


def fetch_voice_link(project: str) -> list[str]:
    """voiceover.url: a link to the recording (Google Drive, Dropbox, OneDrive or any direct link), for recordings
    too big to send from the phone. Downloaded to voiceover.<ext> unless that recording is already here."""
    notes = []
    link_file = os.path.join(project, "voiceover.url")
    if not os.path.exists(link_file):
        return notes
    with open(link_file, encoding="utf-8") as f:
        text = f.read().strip()
    url = text.split()[0] if text else ""
    if not url:
        return notes
    stamp = os.path.join(project, ".cache", "voiceover-url.txt")
    have = [p for p in glob.glob(os.path.join(project, "voiceover.*")) if not p.endswith((".url", ".b64"))]
    if have and os.path.exists(stamp) and open(stamp, encoding="utf-8").read().strip() == url:
        return notes
    direct = _direct_link(url)
    tmp = os.path.join(project, ".cache", "voiceover.download")
    os.makedirs(os.path.dirname(tmp), exist_ok=True)
    try:
        req = urllib.request.Request(direct, headers={"User-Agent": "Mozilla/5.0 (render-bot)"})
        with urllib.request.urlopen(req, timeout=300) as r, open(tmp, "wb") as out:
            ctype = r.headers.get("Content-Type", "")
            shutil.copyfileobj(r, out)
    except Exception as e:  # noqa: BLE001
        notes.append(f"WARNING: could not download the recording from {url}: {e}")
        return notes
    if ctype.startswith("text/html"):
        notes.append(f"WARNING: {url} gave a web page, not a recording; share it as 'anyone with the link' and send the link again")
        return notes
    ext = {"audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/wav": "wav", "audio/x-wav": "wav", "audio/webm": "webm", "video/mp4": "mp4", "video/quicktime": "mov", "audio/ogg": "ogg", "audio/aac": "aac"}.get(ctype.split(";")[0].strip())
    if not ext:
        m = re.search(r"\.(mp3|m4a|wav|webm|mp4|mov|ogg|aac|caf|flac|opus)(?:\?|$)", url, re.I)
        ext = (m.group(1).lower() if m else "m4a")
    for old in have:
        os.remove(old)
    shutil.move(tmp, os.path.join(project, f"voiceover.{ext}"))
    with open(stamp, "w", encoding="utf-8") as f:
        f.write(url)
    notes.append(f"downloaded the recording from the link as voiceover.{ext}")
    return notes


def unpack_uploads(project: str) -> list[str]:
    """media/<name>.b64: a file sent from the studio on a phone, base64 text (the GitHub connector carries text only).
    Each is decoded to media/<name> before the build; a newer upload replaces an older decoded copy. Big files arrive
    in pieces under uploads/ and are joined first; a recording can also arrive as a link (voiceover.url)."""
    notes = _join_parts(project)
    if glob.glob(os.path.join(project, "voiceover.*.b64")):
        # a recording sent directly supersedes one sent earlier as a link
        link = os.path.join(project, "voiceover.url")
        if os.path.exists(link):
            os.remove(link)
            notes.append("the new recording replaces the linked one")
    else:
        notes += fetch_voice_link(project)
    media = os.path.join(project, "media")
    candidates = []
    if os.path.isdir(media):
        candidates += [os.path.join(media, n) for n in sorted(os.listdir(media)) if n.endswith(".b64")]
    # a recording sent from the studio: voiceover.<ext>.b64 in the project folder
    candidates += sorted(glob.glob(os.path.join(project, "voiceover.*.b64")))
    for src in candidates:
        name = os.path.basename(src)
        dst = src[:-4]
        if name.startswith("voiceover."):
            # the new recording replaces any other voice in the folder
            for old in glob.glob(os.path.join(project, "voiceover.*")):
                if old != src and old != dst and not old.endswith(".b64"):
                    os.remove(old)
                    notes.append(f"replaced {os.path.basename(old)} with the new recording")
        if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
            continue
        try:
            with open(src, "rb") as f:
                raw = base64.b64decode(b"".join(f.read().split()), validate=False)
        except (ValueError, OSError) as e:
            notes.append(f"WARNING: could not decode {name}: {e}")
            continue
        with open(dst, "wb") as f:
            f.write(raw)
        notes.append(f"unpacked {name} -> {name[:-4]} ({len(raw) // 1024} KB)")
    return notes


def _header_lines(md: str) -> dict[str, str]:
    """The `key: value` lines above the first tag, as written (the parser lower-cases and interprets them)."""
    out: dict[str, str] = {}
    for line in md.splitlines():
        if line.startswith("["):
            break
        m = re.match(r"^([\w.]+):\s*(.+)$", line.strip())
        if m and len(line.split()) <= 12:
            out[m.group(1)] = m.group(2).strip()
    return out


def transcript_for(project: str, audio: str, wav: str, total: float, args: argparse.Namespace, hint: str) -> list | None:
    """Words with times for the recording. Kept per recording in transcript.json (on the branch, so a re-render after
    editing the script does not transcribe again) and in .cache; alignment itself is instant and always re-run."""
    h = file_hash(audio)
    kept = os.path.join(project, "transcript.json")
    cache = os.path.join(project, ".cache", f"transcript-{h}.json")
    if not args.retranscribe:
        if os.path.exists(kept):
            with open(kept, encoding="utf-8") as f:
                data = json.load(f)
            if data.get("hash") == h and data.get("words"):
                print("using the kept transcript (transcript.json)")
                return data["words"]
        if os.path.exists(cache):
            with open(cache, encoding="utf-8") as f:
                words = json.load(f)
            print(f"using cached transcript {os.path.basename(cache)}")
            _keep_transcript(kept, audio, h, total, words)
            return words
    if args.backend == "none":
        return None
    print(f"transcribing {os.path.basename(audio)} ({total:.1f}s) with {args.backend}...", flush=True)
    words = al.transcribe(wav, args.backend, args.model, hint)
    os.makedirs(os.path.dirname(cache), exist_ok=True)
    with open(cache, "w", encoding="utf-8") as f:
        json.dump(words, f)
    _keep_transcript(kept, audio, h, total, words)
    return words


def _keep_transcript(path: str, audio: str, h: str, total: float, words: list) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"audio": os.path.basename(audio), "hash": h, "durationSec": round(total, 3), "text": " ".join(w["w"] for w in words), "words": words}, f, separators=(",", ":"))


def voice_preview(project: str, audio: str) -> str:
    """voice-preview.mp3: the recording as a small mono mp3 that plays on every phone (a browser recording is often
    webm, which some phones cannot play), for the studio to play the preview against."""
    dst = os.path.join(project, "voice-preview.mp3")
    if not (os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(audio)):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", audio, "-vn", "-ac", "1", "-ar", "24000", "-b:a", "48k", dst], check=True)
    return "voice-preview.mp3"


def write_timing(project: str, sb: dict, slug: str, audio_name: str | None) -> None:
    """timing.json: the aligned scene and word times, small enough to keep on the branch, so the studio can play the
    preview to the real recording and edit around it."""
    timing = {"slug": slug, "durationSec": sb["durationSec"], "audio": audio_name,
              "scenes": [{"id": sc["id"], "type": sc["type"], "start": sc["start"], "end": sc["end"], "words": sc.get("words") or []} for sc in sb["scenes"]]}
    with open(os.path.join(project, "timing.json"), "w", encoding="utf-8") as f:
        json.dump(timing, f, separators=(",", ":"))


def fit_clip(sc: dict, path: str) -> list[str]:
    """Keep a clip's playback inside the file: a frame requested past the end of a video never returns
    and the render hangs. Pulls the start offset back when the scene would run off the end, and loops
    a file shorter than the scene."""
    notes = []
    try:
        dur = al.audio_duration(path)
    except Exception:  # noqa: BLE001 - ffprobe missing or an unreadable file: leave the clip as written
        return notes
    p = sc["props"]
    p["clipDur"] = round(dur, 3)
    scene_len = float(sc["end"]) - float(sc["start"])
    start = float(p.get("from", 0) or 0)
    margin = 0.3
    # Footage the finder fetched (a search= tag and no from= of its own) opens past the first
    # fifteen percent of the file, so a found film does not play its title cards.
    found = p.get("from") is None and bool(p.get("search"))
    if dur - margin < scene_len:
        if found:
            start = dur * 0.15
        p["from"] = round(min(start, max(0.0, dur - margin - 1.0)), 2)
        p["loop"] = True
        notes.append(f"scene {sc['id']}: '{os.path.basename(path)}' is {dur:.1f}s, shorter than the scene ({scene_len:.1f}s); it loops")
    else:
        if found:
            start = min(dur * 0.15, dur - margin - scene_len)
            notes.append(f"scene {sc['id']}: found footage '{os.path.basename(path)}' starts at {start:.1f}s, past its opening")
        if start + scene_len > dur - margin:
            new_start = max(0.0, dur - margin - scene_len)
            notes.append(f"scene {sc['id']}: from={start:g} would run off the end of '{os.path.basename(path)}' ({dur:.1f}s); starting at {new_start:.1f}s instead")
            start = new_start
        p["from"] = round(start, 2)
    return notes


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
                    if p.get("credit"):
                        # The credit described the missing footage; the still is the project's own art.
                        p["credit"] = "Illustration"
                    p.pop("from", None)
                    p.pop("vol", None)
                    src = fb
            if src and not src.startswith("projects/") and os.path.exists(os.path.join(src_dir, src)):
                if sc["type"] == "clip":
                    notes.extend(fit_clip(sc, os.path.join(src_dir, src)))
                p["src"] = f"projects/{slug}/{folder}/{src}"
            sticker = p.get("sticker")
            if sticker and not str(sticker).startswith("projects/") and os.path.exists(os.path.join(src_dir, sticker)):
                p["sticker"] = f"projects/{slug}/{folder}/{sticker}"
    for sc in sb["scenes"]:
        p = sc["props"]
        sticker = p.get("sticker")
        if sticker and not str(sticker).startswith("projects/"):
            notes.append(f"WARNING: scene {sc['id']} sticker '{sticker}' not found in {project}/media; leaving it off")
            p.pop("sticker", None)
        src = p.get("src")
        if src and not src.startswith("projects/"):
            # A missing file must not fail the render: the scene draws its placeholder
            # (the want= text in an empty frame) and the note says what to drop into media/.
            notes.append(f"WARNING: scene {sc['id']} src '{src}' not found in {project}/media; rendering the placeholder frame")
            p["missing"] = src
            p.pop("src", None)
            if sc["type"] == "clip":
                sc["type"] = "still"
                p.pop("from", None)
                p.pop("vol", None)
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
    # files sent from the studio (pictures, and the voice itself) arrive as <name>.b64; unpack them first
    for note in unpack_uploads(project):
        print(note)
    fetch_sources(project)
    script_path = os.path.join(project, "script.md")
    md = ""
    if os.path.exists(script_path):
        with open(script_path, encoding="utf-8") as f:
            md = f.read()
    sb = parse_script(md) if md.strip() else None
    audio = find_audio(project)
    words = None
    total = 0.0
    wav = None
    if audio:
        total = al.audio_duration(audio)
        wav = al.to_wav16k(audio, os.path.join(project, ".cache", "asr16k.wav"))
        hint = " ".join(sc["narration"] for sc in sb["scenes"]) if sb else ""
        words = transcript_for(project, audio, wav, total, args, hint)
    if sb is None or not sb["scenes"]:
        if not words:
            print(f"no script in {project}, and no voiceover to build one from", file=sys.stderr)
            return 2
        header = {}
        title = None
        if sb is not None:
            title = sb["title"]
            header = {k: v for k, v in _header_lines(md).items()}
        header.setdefault("slug", os.path.basename(project.rstrip(os.sep)))
        md = script_from_words(words, header, title)
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(md)
        sb = parse_script(md)
        print(f"built the script from the voiceover: {len(sb['scenes'])} scenes, written to script.md")
    if args.no_captions:
        sb["captions"] = False
    slug = sb["slug"]
    print(f"storyboard: {len(sb['scenes'])} scenes, estimated {sb['durationSec']:.0f}s")

    align_report = ""
    public_dir = os.path.join(REMOTION, "public", "projects", slug)
    os.makedirs(public_dir, exist_ok=True)
    if audio:
        if words is not None:
            sb = al.align(sb, words, total)
            align_report = al.report(sb)
            print(align_report)
        else:
            print("WARNING: voiceover present but not transcribed (--backend none, no cache): timings are estimates")
            sb["durationSec"] = round(total + 0.5, 3)
        ext = os.path.splitext(audio)[1].lower()
        if ext in (".wav", ".mp3"):
            shutil.copyfile(audio, os.path.join(public_dir, f"voiceover{ext}"))
        else:
            # a browser or phone recording (webm, m4a, mp4...): the renderer's browser cannot play every codec, so it gets an mp3
            ext = ".mp3"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", audio, "-vn", "-ac", "1", "-codec:a", "libmp3lame", "-q:a", "2", os.path.join(public_dir, "voiceover.mp3")], check=True)
        sb["audio"] = f"projects/{slug}/voiceover{ext}"
        sb["mouth"] = al.mouth_envelope(wav, sb["fps"], sb["durationSec"])
        sb["visemes"] = al.visemes_from_words(sb["scenes"], sb["fps"], sb["durationSec"])
    else:
        print("no voiceover.* found: using estimated timing, silent render")
        sb["mouth"] = al.mouth_from_words(sb["scenes"], sb["fps"], sb["durationSec"])
        sb["visemes"] = al.visemes_from_words(sb["scenes"], sb["fps"], sb["durationSec"])

    # Footage, stills and posters live in <project>/media (images/ still works for older projects).
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
    write_timing(project, sb, slug, voice_preview(project, audio) if audio else None)
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
