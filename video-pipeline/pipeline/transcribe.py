"""Transcribe a recording and make the draft match it, without rendering. Runs in a couple of minutes.

    python -m pipeline.transcribe projects/<name> [--backend faster_whisper|sherpa_onnx] [--model base.en]

Reads the draft (draft.md, else script.md) and the recording (voiceover.*, or pieces / a link sent from the studio).
- When the draft has scenes, they are lined up with the recording and each scene's spoken words are replaced by
  what you actually said (pipeline/sync.py); layouts, numbers, lists and labels are kept.
- When it has only header lines (or there is none), the scenes are built from the recording (pipeline/auto_script.py).
Writes draft.md (with `synced:` in its header), transcript.json, timing.json and voice-preview.mp3. The studio
waits for draft.md to come back synced, loads it with the timings and the voice, and you edit from there; shipping
writes script.md, and the render reuses this transcript.
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import re
import sys

from . import align as al
from .auto_script import script_from_words
from .build import _header_lines, find_audio, transcript_for, unpack_uploads, voice_preview, write_timing
from .script_parser import _parse_tag, parse_script
from .sync import matched_share, rewrite_prose, spoken_by_scene, tagged_from_storyboard


def set_header(md: str, key: str, value: str) -> str:
    """Set `key: value` in the header (the lines above the first tag), replacing an existing one."""
    lines = md.splitlines()
    first_tag = next((i for i, ln in enumerate(lines) if _parse_tag(ln)), len(lines))
    for i in range(first_tag):
        if re.match(rf"^{re.escape(key)}:\s", lines[i]):
            lines[i] = f"{key}: {value}"
            return "\n".join(lines) + "\n"
    at = 1 if lines and lines[0].startswith("# ") else 0
    lines.insert(at, f"{key}: {value}")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("project")
    ap.add_argument("--backend", default="faster_whisper", choices=["faster_whisper", "sherpa_onnx"])
    ap.add_argument("--model", default="base.en")
    ap.add_argument("--retranscribe", action="store_true")
    args = ap.parse_args(argv)
    project = os.path.abspath(args.project)
    if not os.path.isdir(project):
        print(f"{project} is not there (removed in this push?): nothing to transcribe")
        return 0
    for note in unpack_uploads(project):
        print(note)
    audio = find_audio(project)
    if not audio:
        print(f"no recording in {project} yet (pieces still arriving, or it was removed): nothing to transcribe")
        return 0
    draft_path = os.path.join(project, "draft.md")
    src = draft_path if os.path.exists(draft_path) else os.path.join(project, "script.md")
    md = open(src, encoding="utf-8").read() if os.path.exists(src) else ""
    sb = parse_script(md) if md.strip() else None
    total = al.audio_duration(audio)
    wav = al.to_wav16k(audio, os.path.join(project, ".cache", "asr16k.wav"))
    hint = " ".join(sc["narration"] for sc in sb["scenes"]) if sb else ""
    words = transcript_for(project, audio, wav, total, args, hint)
    if not words:
        print("the recording has no words in it that the transcriber could hear", file=sys.stderr)
        return 3
    if sb and sb["scenes"]:
        if not any(_parse_tag(ln) for ln in md.splitlines()):
            md = tagged_from_storyboard(sb, md)
            sb = parse_script(md)
        sb = al.align(sb, words, total)
        new_md, kept = rewrite_prose(md, spoken_by_scene(sb["scenes"], words, matched=matched_share(sb)))
        changed = sum(1 for a, b in zip(sb["scenes"], parse_script(new_md)["scenes"]) if a["narration"].split() != b["narration"].split())
        print(f"matched the draft to the recording: {changed} of {len(sb['scenes'])} scenes now say what you said")
        if kept:
            print("not heard in the recording, kept as written: scene " + ", ".join(map(str, kept)))
    else:
        header = _header_lines(md) if md else {}
        header.setdefault("slug", os.path.basename(project.rstrip(os.sep)))
        new_md = script_from_words(words, header, sb["title"] if sb else None)
        print(f"built {len(parse_script(new_md)['scenes'])} scenes from the recording")
    new_md = set_header(new_md, "synced", dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    with open(draft_path, "w", encoding="utf-8") as f:
        f.write(new_md)
    sb2 = al.align(parse_script(new_md), words, total)
    write_timing(project, sb2, sb2["slug"], voice_preview(project, audio))
    print(al.report(sb2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
