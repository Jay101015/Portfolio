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
from .enhance import enhance, level_from_header
from .preview import write_preview
from .auto_script import script_from_words
from .script_parser import pace_scenes, parse_script, time_cues
from .voice import fill_gated, snap_cuts, snap_spans, take_words, tighten_pauses
from .footage_library import use_library
from .shorts import SHORT_SPEED, cut_short, cut_spans, plan_shorts, pose_track, speed_up

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
    notes += adopt_recording(project)
    return notes


def rendered_names(project: str) -> set[str]:
    """The files the build itself writes into the project folder (<slug>.mp4 and <slug>-vertical.mp4), which must never
    be mistaken for a recording on the next build."""
    names: set[str] = set()
    script = os.path.join(project, "script.md")
    if os.path.exists(script):
        with open(script, encoding="utf-8") as f:
            md = f.read()
        header = _header_lines(md)
        title = next((l[2:].strip() for l in md.splitlines() if l.startswith("# ")), "")
        slug = header.get("slug") or re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or "video"
        names |= {f"{slug}.mp4", f"{slug}-vertical.mp4"}
        names |= {n for n in os.listdir(project) if re.match(rf"^{re.escape(slug)}-short-\d+\.mp4$", n)}
    return names


def adopt_recording(project: str) -> list[str]:
    """A recording uploaded on GitHub keeps its own name ("New Recording 3.m4a"): any audio file in the project folder
    that is not voiceover.* (or the studio's voice-preview.mp3, or the build's own renders) is a new recording. It
    becomes voiceover.<ext> and replaces the old one; with several, the largest wins."""
    renders = rendered_names(project)
    strays = [
        os.path.join(project, n)
        for n in sorted(os.listdir(project))
        if os.path.isfile(os.path.join(project, n))
        and n.rsplit(".", 1)[-1].lower() in AUDIO_EXT
        and not n.startswith("voiceover.")
        and n != "voice-preview.mp3"
        and n not in renders
    ]
    if not strays:
        return []
    src = max(strays, key=os.path.getsize)
    ext = src.rsplit(".", 1)[-1].lower()
    notes = []
    for old in glob.glob(os.path.join(project, "voiceover.*")):
        if not old.endswith(".b64"):
            os.remove(old)
            notes.append(f"replaced {os.path.basename(old)} with the new recording")
    os.replace(src, os.path.join(project, f"voiceover.{ext}"))
    notes.append(f"{os.path.basename(src)} -> voiceover.{ext}")
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
    head = dur * 0.15 if found else 0.0  # where the slowed clip starts: past a found film's titles
    if dur - margin - head < scene_len and (dur - margin - head) / scene_len >= 0.5:
        # too short from where it was asked to start: the whole clip, played slower to fill the scene (down to half
        # speed, which reads as a slow, deliberate shot; a loop shows as a freeze and a jump back to an earlier frame)
        p["from"] = round(head, 2)
        p["rate"] = round((dur - margin - head) / scene_len, 3)
        p.pop("loop", None)
        notes.append(f"scene {sc['id']}: '{os.path.basename(path)}' is {dur:.1f}s for a {scene_len:.1f}s scene{f' from {start:g}s' if start else ''}; it plays from the start at {p['rate']:.2f}x speed")
    elif dur - margin < scene_len:
        if found:
            start = dur * 0.15
        p["from"] = round(min(start, max(0.0, dur - margin - 1.0)), 2)
        p["loop"] = True
        notes.append(f"WARNING: scene {sc['id']}: '{os.path.basename(path)}' is {dur:.1f}s, under half the scene ({scene_len:.1f}s); it loops, which shows. Use a longer clip or split the scene")
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


def degrade_unfilled(sb: dict) -> list[str]:
    """A stat whose fact= never got its value, or a news scene with no headline, becomes a text scene with the
    board line it can honestly show: the figure's name, or the headline's subject. A blank board or a placeholder
    card never reaches a final."""
    from .find_facts import resolve

    notes = []
    for sc in sb["scenes"]:
        p = sc["props"]
        if sc["type"] == "stat" and p.get("fact") and not p.get("value"):
            f = resolve(str(p["fact"]))
            board = p.get("label") or (f.label if f else str(p["fact"]))
            sc["type"] = "text"
            sc["props"] = {"board": board, **({"art": p["art"]} if p.get("art") else {})}
            notes.append(f"scene {sc['id']}: the real figure for '{p['fact']}' was not filled in; the board shows '{board}' without a number")
        elif sc["type"] == "news" and not p.get("headline"):
            board = p.get("caption") or str(p.get("search", "in the news")).strip().capitalize()
            sc["type"] = "text"
            sc["props"] = {"board": board}
            notes.append(f"scene {sc['id']}: no headline was found for '{p.get('search', '')}'; the board shows '{board}' instead of a clipping")
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
            if sc["type"] in ("clip", "broll") and src and not src.startswith("projects/") and not os.path.exists(os.path.join(src_dir, src)):
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
                if sc["type"] in ("clip", "broll"):
                    notes.extend(fit_clip(sc, os.path.join(src_dir, src)))
                p["src"] = f"projects/{slug}/{folder}/{src}"
            sticker = p.get("sticker")
            if sticker and not str(sticker).startswith("projects/") and os.path.exists(os.path.join(src_dir, sticker)):
                p["sticker"] = f"projects/{slug}/{folder}/{sticker}"
            clip = p.get("clip_src")
            if clip and not str(clip).startswith("projects/") and os.path.exists(os.path.join(src_dir, clip)):
                try:
                    p["clip_dur"] = round(al.audio_duration(os.path.join(src_dir, clip)), 3)
                except Exception:  # noqa: BLE001
                    pass
                p["clip_src"] = f"projects/{slug}/{folder}/{clip}"
    for sc in sb["scenes"]:
        p = sc["props"]
        sticker = p.get("sticker")
        if sticker and not str(sticker).startswith("projects/"):
            notes.append(f"WARNING: scene {sc['id']} sticker '{sticker}' not found in {project}/media; leaving it off")
            p.pop("sticker", None)
        clip = p.get("clip_src")
        if clip and not str(clip).startswith("projects/"):
            notes.append(f"WARNING: scene {sc['id']} clip_src '{clip}' not found in {project}/media; the drawing or the words stand alone")
            p.pop("clip_src", None)
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
            # a broll scene with no footage keeps its type: the frame shows what was asked for, so the cut still reads
    return notes


def level_audio(path: str, target: float = -14.0, peak: float = -1.5) -> str | None:
    """Bring a finished video's sound to the same loudness as every other one: -14 LUFS (where YouTube plays
    everything; it turns loud videos down but never quiet ones up) with peaks under -1.5 dBTP. Two passes of
    ffmpeg's loudnorm, measured then applied as one even gain, so the voice and a "watch next" preview keep
    their balance and every Short lands at the same level as the long video. The picture is copied untouched.
    Returns a one-line report, or None when the file has no sound."""
    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", path], capture_output=True, text=True)
    if not probe.stdout.strip():
        return None
    meas = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-i", path, "-vn", "-af", f"loudnorm=I={target}:TP={peak}:LRA=11:print_format=json", "-f", "null", "-"],
                          capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=900)
    text = meas.stderr
    try:
        m = json.loads(text[text.rindex("{"): text.rindex("}") + 1])
    except ValueError:
        return f"level: could not measure {os.path.basename(path)}; left as it was"
    if float(m.get("input_i", "-70")) < -60:
        return None
    flt = (f"loudnorm=I={target}:TP={peak}:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
           f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    # linear loudnorm is one even gain and cannot hold the peaks down on its own; a limiter after it does, with room for
    # the overshoot the AAC encode adds between samples (a render measured -0.7 dBTP with the ceiling at -1.5)
    flt += f",alimiter=limit={10 ** ((peak - 0.8) / 20):.3f}:level=0:attack=1:release=50"
    tmp = path + ".level.mp4"
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", path, "-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy", "-af", flt,
                    "-ar", "48000", "-c:a", "aac", "-ac", "1", "-b:a", "160k", "-movflags", "+faststart", tmp],
                   check=True, stdin=subprocess.DEVNULL, timeout=900)
    os.replace(tmp, path)
    return f"level: {os.path.basename(path)} {float(m['input_i']):.1f} -> {target:.0f} LUFS"


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
        note = level_audio(out_path)
        if note:
            print(note, flush=True)
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
    # the index (moov) goes at the front and the voice is one channel: a phone streaming the file from a chat or
    # the studio plays the sound straight away instead of waiting for the whole file (with the index at the end it
    # played picture and no sound), and the voice is mono anyway
    # -nostdin and a time limit: a join that stalls (it once sat for an hour after every frame was rendered)
    # fails the run in minutes instead of using up the whole job
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", listing, "-c:v", "copy", "-c:a", "aac", "-ac", "1", "-b:a", "160k", "-movflags", "+faststart", out_path], check=True, stdin=subprocess.DEVNULL, timeout=900)
    print(f"joined {len(parts)} chunks -> {out_path}", flush=True)
    if voice_over_whole(out_path, sb):
        print("audio: the voice laid back over the joined picture in one piece (no gap at the chunk joins)", flush=True)
    note = level_audio(out_path)
    if note:
        print(note, flush=True)


def voice_over_whole(video: str, sb: dict) -> bool:
    """Each render chunk's audio is encoded on its own, and joining them leaves 20 to 40 ms of digital silence at
    every join (every 15 seconds). When the voice is the only sound (footage is muted unless a scene asks for its
    sound with vol=), the joined picture gets the voice file itself as its sound, in one piece, the room's tone carrying
    on under the end card. Returns whether it did."""
    if not sb.get("audio") or any(float(sc.get("props", {}).get(k) or 0) > 0 for sc in sb.get("scenes", []) for k in ("vol", "clip_vol", "sticker_vol")):
        return False
    src = os.path.join(REMOTION, "public", sb["audio"])
    if not os.path.exists(src):
        return False
    dur = al.audio_duration(video)
    padded = video + ".voice.wav"
    filled = video + ".voice-room.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-af", f"apad=whole_dur={dur:.3f}", "-t", f"{dur:.3f}", "-ac", "1", "-ar", "48000", padded], check=True)
    track, _ = fill_gated(padded, filled, tone_from=src)
    tmp = video + ".remux.mp4"
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", video, "-i", track, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-ac", "1", "-b:a", "160k", "-movflags", "+faststart", tmp], check=True, stdin=subprocess.DEVNULL, timeout=900)
    os.replace(tmp, video)
    for p in (padded, filled):
        if os.path.exists(p):
            os.remove(p)
    return True


def keep_spans(src: str, dst: str, spans: list[tuple[float, float]], lead: float, tail: float, speed: float = 1.0) -> None:
    """Write `dst`: `lead` seconds of the room, then the `spans` of `src` (start, end) back to back, each faded in and
    out over 10 ms so a join never clicks, then `tail` of the room, the whole thing played `speed` times faster with
    the pitch kept (atempo). The lead, the tail and any gated silence are the recording's own room tone, never
    digital silence (pipeline/voice.py)."""
    parts = [f"anullsrc=r=48000:cl=mono,atrim=0:{lead:.3f}[l]"]
    labels = ["[l]"]
    for i, (a, b) in enumerate(spans):
        d = max(0.0, b - a)
        parts.append(f"[0:a]atrim=start={a:.3f}:end={b:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.01,afade=t=out:st={max(0.0, d - 0.01):.3f}:d=0.01[s{i}]")
        labels.append(f"[s{i}]")
    parts.append(f"anullsrc=r=48000:cl=mono,atrim=0:{tail:.3f}[t]")
    labels.append("[t]")
    tempo = f",atempo={speed:.4f}" if abs(speed - 1.0) > 1e-6 else ""
    graph = ";".join(parts) + ";" + "".join(labels) + f"concat=n={len(labels)}:v=0:a=1{tempo}[out]"
    raw = dst + ".raw.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-filter_complex", graph, "-map", "[out]", "-ac", "1", "-ar", "48000", raw], check=True)
    filled, _ = fill_gated(raw, dst + ".room.wav", tone_from=src)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", filled, "-codec:a", "libmp3lame", "-q:a", "2", dst], check=True)
    for p in {raw, dst + ".room.wav"}:
        if os.path.exists(p):
            os.remove(p)


def tidy_voice(project: str, audio: str, header: dict[str, str]) -> str:
    """The recording with its gated silences filled with room tone and its long pauses closed up (pipeline/voice.py).
    A project transcribed before this step existed keeps its recording as it was, so its Shorts' cut points (seconds
    in shorts.json) still land where they did; `pauses: tight|keep` in the header decides either way."""
    kept = os.path.join(project, "transcript.json")
    legacy = False
    if os.path.exists(kept):
        with open(kept, encoding="utf-8") as f:
            legacy = json.load(f).get("audio") == "voice-trim.wav"
    mode = header.get("pauses", "keep" if legacy else "tight").strip().lower()
    if mode == "keep":
        return audio
    audio, n = fill_gated(audio, os.path.join(project, ".cache", "voice-filled.wav"))
    if n:
        print(f"voice: {n} patches of digital silence filled with the room's own tone")
    longest = float(header.get("pauses.longest", 0.7))
    audio, gone, _ = tighten_pauses(audio, os.path.join(project, ".cache", "voice-tight.wav"), longest=longest)
    if gone:
        print(f"voice: pauses over {longest:.1f}s closed up to 0.4s ({gone:.1f}s of dead air taken out)")
    return audio


def trim_lead(src: str, dst: str, keep: float = 0.3) -> str:
    """Cut the room tone before the first word down to `keep` seconds: a phone recording starts a second or two before
    the speaker does, and the video should open on the voice."""
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-af", f"silenceremove=start_periods=1:start_threshold=-38dB:start_silence={keep}", "-ac", "1", "-ar", "48000", dst], check=True)
    return dst


def music_for(project: str, header: dict[str, str]) -> str | None:
    """`music: <file or https url>` in the header: a track under the voice. A file is looked for in the project, then in
    library/music/; a URL is downloaded once into .cache/. Nothing set, or not found: no music."""
    want = (header.get("music") or "").strip()
    if not want or want.lower() in ("off", "none", "no"):
        return None
    if want.startswith("http://") or want.startswith("https://"):
        ext = os.path.splitext(want.split("?")[0])[1] or ".mp3"
        dst = os.path.join(project, ".cache", "music" + ext)
        if not os.path.exists(dst):
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            try:
                _download(want, dst)
            except Exception as e:  # noqa: BLE001
                print(f"WARNING: music {want}: {e}", file=sys.stderr)
                return None
        return dst
    for folder in (project, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "library", "music")):
        p = os.path.join(folder, want)
        if os.path.exists(p):
            return p
    print(f"WARNING: music {want} not found in the project or library/music/", file=sys.stderr)
    return None


def mix_music(voice: str, music: str, dst: str, gain_db: float = -20.0) -> str:
    """The voice with a music bed under it: the track loops to the voice's length, fades in and out, sits `gain_db`
    under full level and ducks a little further whenever the voice speaks, so the words always win."""
    dur = al.audio_duration(voice)
    graph = (
        f"[1:a]atrim=0:{dur + 0.5:.3f},asetpts=PTS-STARTPTS,volume={gain_db:.1f}dB,afade=t=in:d=1.5,afade=t=out:st={max(0.0, dur - 3.0):.3f}:d=3[bed];"
        "[bed][0:a]sidechaincompress=threshold=0.02:ratio=6:attack=40:release=700:makeup=1[duck];"
        "[0:a][duck]amix=inputs=2:duration=first:normalize=0[out]"
    )
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", voice, "-stream_loop", "-1", "-i", music, "-filter_complex", graph, "-map", "[out]", "-ac", "1", "-ar", "48000", "-codec:a", "libmp3lame", "-q:a", "2", dst], check=True)
    return dst


def long_scenes(sb: dict, limit: float = 20.0) -> list[str]:
    """Scenes that sit on one board too long for a viewer: anything over `limit` seconds (twice that for a list or a
    recap, which build up as they go). The editor splits them at a sentence or puts a [broll] scene between."""
    out = []
    for sc in sb["scenes"]:
        if sc["type"] in ("outro", "broll", "clip"):
            continue
        run = float(sc["end"]) - float(sc["start"])
        cap = limit * 2 if sc["type"] in ("list", "recap") else limit
        if run > cap:
            out.append(f"LONG SCENE: {sc['id']} ({sc['type']}) runs {run:.0f}s on one board: split it at a sentence, or put a [broll] scene between")
    return out


def render_shorts(project: str, sb: dict, audio: str | None, concurrency: str | None, chunk: int, plan_path: str | None, want: int) -> list[str]:
    """Cut and render the Shorts: the slices in `shorts.json` (the studio's picks, each {scenes, hook, name}), else the
    planner's best `want`. Writes the plan back as shorts-plan.json and renders <slug>-<name>.mp4, vertical, captioned."""
    slug = sb["slug"]
    public_dir = os.path.join(REMOTION, "public", "projects", slug)
    plan = None
    if plan_path and os.path.exists(plan_path):
        with open(plan_path, encoding="utf-8") as f:
            plan = json.load(f)
        if isinstance(plan, dict):
            top_speed = plan.get("speed")
            plan = plan.get("shorts") or []
            if top_speed is not None:
                plan = [dict({"speed": top_speed}, **p) for p in plan]
    default_speed = SHORT_SPEED
    if not plan:
        plan = plan_shorts(sb, want)
    with open(os.path.join(project, "shorts-plan.json"), "w", encoding="utf-8") as f:
        json.dump(plan, f, indent=1)
    made = []
    for k, short in enumerate(plan, 1):
        name = short.get("name") or f"short-{k}"
        ids = [int(x) for x in short.get("scenes", [])]
        if short.get("spans"):
            # cut on sentences: stretches of time, which may start or end inside a scene or skip a middle part
            spans_in = [tuple(x) for x in short["spans"]]
            if audio:
                # each edge on a pause measured in the sound: the transcript's word times can run early
                spans_in = snap_spans(spans_in, audio)
            cut, spans = cut_spans(sb, spans_in, short.get("hook"), name)
        elif ids:
            cut, spans = cut_short(sb, ids, short.get("hook"), name)
        else:
            continue
        # a Short plays a little faster than the long video (shorts.json "speed", per pick or for all; 1 = as recorded)
        speed = float(short.get("speed", default_speed))
        cut = speed_up(cut, speed)
        if short.get("poses"):
            # the character, posing on the words (shorts.json "poses": [[seconds in the long video, pose], ...])
            cut["poses"] = pose_track(short["poses"], spans, 0.4, speed, int(sb.get("fps", 30)))
        if audio:
            os.makedirs(public_dir, exist_ok=True)
            keep_spans(audio, os.path.join(public_dir, f"{name}.mp3"), spans, 0.4, 0.8, speed)
            if sb.get("music"):
                mix_music(os.path.join(public_dir, f"{name}.mp3"), sb["music"], os.path.join(public_dir, f"{name}-mix.mp3"), float(sb.get("musicDb", -20.0)))
                os.replace(os.path.join(public_dir, f"{name}-mix.mp3"), os.path.join(public_dir, f"{name}.mp3"))
            cut["audio"] = f"projects/{slug}/{name}.mp3"
        else:
            cut["audio"] = None
        props = os.path.join(project, ".cache", f"{name}.json")
        os.makedirs(os.path.dirname(props), exist_ok=True)
        with open(props, "w", encoding="utf-8") as f:
            json.dump(cut, f)
        out = os.path.join(project, f"{slug}-{name}.mp4")
        print(f"short {name}: {'spans ' + str(short['spans']) if short.get('spans') else 'scenes ' + str(ids)}, {cut['durationSec']:.0f}s at {speed:g}x, hook: {cut['hook']}")
        render(props, out, "Vertical", concurrency, chunk=chunk)
        made.append(out)
    return made


def insert_silences(src: str, dst: str, silences: list[tuple[float, float]]) -> None:
    """Write `dst`: `src` with silence of each (at, length) inserted at `at` (times in the source's own clock)."""
    cuts = sorted(silences)
    parts: list[str] = []
    labels: list[str] = []
    pos = 0.0
    for i, (at, length) in enumerate(cuts):
        if at > pos + 1e-3:
            parts.append(f"[0:a]atrim=start={pos:.3f}:end={at:.3f},asetpts=PTS-STARTPTS[s{i}]")
            labels.append(f"[s{i}]")
        parts.append(f"anullsrc=r=48000:cl=mono,atrim=0:{length:.3f}[g{i}]")
        labels.append(f"[g{i}]")
        pos = max(pos, at)
    parts.append(f"[0:a]atrim=start={pos:.3f},asetpts=PTS-STARTPTS[tail]")
    labels.append("[tail]")
    graph = ";".join(parts) + ";" + "".join(labels) + f"concat=n={len(labels)}:v=0:a=1[out]"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-filter_complex", graph, "-map", "[out]", "-ac", "1", "-ar", "48000", dst], check=True)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("project", help="project folder containing script.md")
    ap.add_argument("--backend", default="faster_whisper", choices=["faster_whisper", "sherpa_onnx", "none"])
    ap.add_argument("--model", default="base.en", help="faster-whisper size (tiny.en/base.en/small.en/...) or sherpa model dir")
    ap.add_argument("--vertical", action="store_true", help="also render a 9:16 version")
    ap.add_argument("--only-vertical", action="store_true")
    ap.add_argument("--only-shorts", action="store_true", help="skip the main (and vertical) render: just cut and render the Shorts")
    ap.add_argument("--no-render", action="store_true", help="stop after storyboard.json / storyboard.html")
    ap.add_argument("--no-captions", action="store_true")
    ap.add_argument("--concurrency", default=None)
    ap.add_argument("--retranscribe", action="store_true", help="ignore the cached transcript for this voiceover")
    ap.add_argument("--chunk", type=int, default=450, help="frames per render chunk (0 = single pass)")
    ap.add_argument("--shorts", type=int, default=0, help="also cut and render this many Shorts (the project's shorts.json, if present, says which; 0 = only if shorts.json exists)")
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
        # the recording is cleaned up first (voice: raw in the header keeps it as it is)
        level = level_from_header(_header_lines(md).get("voice"))
        audio = enhance(audio, os.path.join(project, ".cache", "voice-clean.mp3"), level)
        print(f"voice: {'as recorded' if level in ('off', 'raw') else 'enhanced (' + level + ')'}")
        before = al.audio_duration(audio)
        audio = trim_lead(audio, os.path.join(project, ".cache", "voice-trim.wav"))
        total = al.audio_duration(audio)
        if before - total > 0.2:
            print(f"trimmed {before - total:.1f}s of room tone before the first word")
        audio = tidy_voice(project, audio, _header_lines(md))
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
    for problem in sb.get("problems") or []:
        print(f"WARNING: {problem}")

    align_report = ""
    public_dir = os.path.join(REMOTION, "public", "projects", slug)
    os.makedirs(public_dir, exist_ok=True)
    if audio:
        if words is not None:
            sb = al.align(sb, words, total)
            align_report = al.report(sb)
            print(align_report)
            # the cuts on the quietest moment between scenes, measured in the sound; captions follow the take
            moved = snap_cuts(sb, wav)
            for sc in sb["scenes"]:
                time_cues(sc)
            changed = take_words(sb, words)
            print(f"cuts: {moved} moved onto the pause between words; captions: {changed} words follow the take, not the script")
            for line in long_scenes(sb):
                print(line)
        else:
            print("WARNING: voiceover present but not transcribed (--backend none, no cache): timings are estimates")
            sb["durationSec"] = round(total + 0.5, 3)
        lead, hold = (sb.get("pace") or {}).get("lead", 0.0), (sb.get("pace") or {}).get("hold", 0.0)
        silences = pace_scenes(sb, lead, hold)
        if silences:
            # the voice moves with the words: the same silences go into the voiceover
            paced = os.path.join(project, ".cache", "voice-paced.wav")
            os.makedirs(os.path.dirname(paced), exist_ok=True)
            insert_silences(audio, paced, silences)
            audio = paced
            wav = al.to_wav16k(audio, os.path.join(project, ".cache", "voice-paced-16k.wav"))
            print(f"pace: {lead:.1f}s before each scene's first word, {hold:.1f}s after its last ({len(silences)} silences in the voice)")
        header = _header_lines(md)
        music = music_for(project, header)
        sb["music"] = music
        sb["musicDb"] = float(header.get("music.volume", -20.0))
        ext = os.path.splitext(audio)[1].lower()
        if music:
            # the voice with the music bed under it, as one track
            ext = ".mp3"
            mix_music(audio, music, os.path.join(public_dir, "voiceover.mp3"), sb["musicDb"])
            print(f"music: {os.path.basename(music)} at {sb['musicDb']:.0f} dB, ducked under the voice")
        elif ext in (".wav", ".mp3"):
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
        lead, hold = (sb.get("pace") or {}).get("lead", 0.0), (sb.get("pace") or {}).get("hold", 0.0)
        if pace_scenes(sb, lead, hold):
            print(f"pace: {lead:.1f}s before each scene's first word, {hold:.1f}s after its last")
        sb["mouth"] = al.mouth_from_words(sb["scenes"], sb["fps"], sb["durationSec"])
        sb["visemes"] = al.visemes_from_words(sb["scenes"], sb["fps"], sb["durationSec"])

    # Footage, stills and posters live in <project>/media (images/ still works for older projects).
    for note in degrade_unfilled(sb):
        print(note)
    for note in use_library(sb, project):
        print(note)
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

    if not args.only_vertical and not args.only_shorts:
        render(sb_path, os.path.join(project, f"{slug}.mp4"), "Main", args.concurrency, chunk=args.chunk)
    if (args.vertical or args.only_vertical) and not args.only_shorts:
        render(sb_path, os.path.join(project, f"{slug}-vertical.mp4"), "Vertical", args.concurrency, chunk=args.chunk)
    plan_path = os.path.join(project, "shorts.json")
    if args.shorts or os.path.exists(plan_path):
        render_shorts(project, sb, audio, args.concurrency, args.chunk, plan_path, args.shorts or 3)
    print("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
