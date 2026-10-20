"""Align a storyboard to a recorded voiceover.

1. Transcribe the voiceover with word timestamps (faster-whisper by default, a
   Hugging Face hosted Whisper port; sherpa-onnx as an offline alternative).
2. Match the transcript against the script words with difflib.
3. Every script word gets a timestamp (matched directly, or interpolated from
   its neighbours), and every scene starts where its first word is spoken.

Captions always show the *script* words, so a misheard transcript never leaks
into the video; the transcript only supplies timing.
"""
from __future__ import annotations

import difflib
import json
import os
import re
import subprocess
from typing import Any

Word = dict[str, Any]  # {"w": str, "s": float, "e": float}

_NORM_RE = re.compile(r"[^a-z0-9$%]+")
NUM_WORDS = {
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4", "five": "5", "six": "6",
    "seven": "7", "eight": "8", "nine": "9", "ten": "10", "twenty": "20", "thirty": "30",
    "forty": "40", "fifty": "50", "sixty": "60", "seventy": "70", "eighty": "80", "ninety": "90",
    "hundred": "100", "thousand": "1000", "percent": "%",
}


def normalize(word: str) -> str:
    w = _NORM_RE.sub("", word.lower())
    return NUM_WORDS.get(w, w)


# ---------------------------------------------------------------- audio helpers

def audio_duration(path: str) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", path],
        capture_output=True, text=True, check=True,
    ).stdout
    return float(json.loads(out)["format"]["duration"])


def to_wav16k(src: str, dst: str) -> str:
    os.makedirs(os.path.dirname(dst) or ".", exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", dst], check=True)
    return dst


def mouth_envelope(wav: str, fps: int, total_sec: float) -> list[float]:
    """Per-frame loudness of the narration, 0..1, used to drive the character's mouth."""
    import numpy as np
    import soundfile as sf

    samples, sr = sf.read(wav, dtype="float32", always_2d=True)
    mono = samples.mean(axis=1)
    n_frames = int(total_sec * fps) + 1
    hop = sr / fps
    rms = np.zeros(n_frames, dtype=np.float32)
    for i in range(n_frames):
        a = int(i * hop)
        b = int(min(len(mono), a + hop))
        if b > a:
            rms[i] = float(np.sqrt(np.mean(mono[a:b] ** 2)))
    if rms.max() <= 0:
        return [0.0] * n_frames
    floor = float(np.percentile(rms, 20))
    ceil = float(np.percentile(rms, 97))
    norm = np.clip((rms - floor) / max(1e-6, ceil - floor), 0, 1)
    # light smoothing so the mouth doesn't flicker, then a touch of attack emphasis
    sm = np.convolve(norm, [0.25, 0.5, 0.25], mode="same")
    return [round(float(v), 2) for v in sm]


VISEME = {"a": 1, "e": 2, "i": 2, "o": 3, "u": 3, "y": 2, "m": 4, "b": 4, "p": 4, "f": 5, "v": 5, "l": 6, "th": 6, "w": 3, "q": 3, "r": 0, "s": 2, "z": 2, "c": 2, "t": 2, "d": 2, "n": 2, "k": 1, "g": 1, "h": 1, "j": 2, "x": 2}


def visemes_for_word(word: str) -> list[int]:
    """A crude letter-to-mouth-shape sequence: 0 rest, 1 open (ah), 2 wide (ee), 3 round (oh), 4 closed (m/b/p), 5 teeth-on-lip (f/v), 6 tongue (l/th)."""
    w = re.sub(r"[^a-z]", "", word.lower())
    out: list[int] = []
    i = 0
    while i < len(w):
        if w[i:i + 2] == "th":
            out.append(6)
            i += 2
            continue
        v = VISEME.get(w[i], 0)
        if not out or out[-1] != v:
            out.append(v)
        i += 1
    return out or [1]


def visemes_from_words(scenes: list[dict[str, Any]], fps: int, total_sec: float) -> list[int]:
    """Per-frame viseme ids: each word's shapes are spread across its spoken span; silence is 0."""
    n_frames = int(total_sec * fps) + 1
    out = [0] * n_frames
    for sc in scenes:
        for w in sc.get("words", []):
            a, b = int(w["s"] * fps), max(int(w["s"] * fps) + 1, int(w["e"] * fps))
            seq = visemes_for_word(w["w"])
            span = max(1, b - a)
            for f in range(max(0, a), min(n_frames, b)):
                idx = min(len(seq) - 1, int((f - a) / span * len(seq)))
                out[f] = seq[idx]
            # a closed beat between words keeps the mouth from smearing
            if b < n_frames:
                out[b] = 0
    return out


def mouth_from_words(scenes: list[dict[str, Any]], fps: int, total_sec: float) -> list[float]:
    """No recording yet: flap the mouth while estimated words are being 'spoken'."""
    import math

    n_frames = int(total_sec * fps) + 1
    out = [0.0] * n_frames
    for sc in scenes:
        for w in sc.get("words", []):
            a, b = int(w["s"] * fps), int(w["e"] * fps)
            for f in range(max(0, a), min(n_frames, b + 1)):
                out[f] = round(0.35 + 0.35 * abs(math.sin(f / 2.2)), 2)
    return out


# ---------------------------------------------------------------- ASR backends

def transcribe_faster_whisper(wav: str, model_size: str = "base.en", hint: str = "") -> list[Word]:
    from faster_whisper import WhisperModel  # Hugging Face hosted Systran/faster-whisper-* weights

    device = os.environ.get("WHISPER_DEVICE", "cpu")
    compute = os.environ.get("WHISPER_COMPUTE", "int8" if device == "cpu" else "float16")
    model = WhisperModel(model_size, device=device, compute_type=compute)
    # Hand over samples directly: faster-whisper's own decoder depends on a PyAV API that moves between releases.
    import soundfile as sf

    samples, sr = sf.read(wav, dtype="float32", always_2d=True)
    audio = samples.mean(axis=1)
    if sr != 16000:
        raise SystemExit(f"expected a 16 kHz wav for transcription, got {sr} Hz")
    segments, _info = model.transcribe(
        audio,
        word_timestamps=True,
        vad_filter=True,
        beam_size=5,
        initial_prompt=hint[:600] or None,  # nudges spelling toward the script's vocabulary
    )
    words: list[Word] = []
    for seg in segments:
        for w in seg.words or []:
            words.append({"w": w.word.strip(), "s": float(w.start), "e": float(w.end)})
    return words


def transcribe_sherpa(wav: str, model_dir: str) -> list[Word]:
    """Offline fallback using sherpa-onnx (NeMo CTC or transducer export with token timestamps)."""
    import numpy as np
    import sherpa_onnx
    import soundfile as sf

    files = os.listdir(model_dir)
    tokens = os.path.join(model_dir, "tokens.txt")
    onnx = [f for f in files if f.endswith(".onnx")]
    if any("encoder" in f for f in onnx):
        pick = lambda key: os.path.join(model_dir, sorted(f for f in onnx if key in f)[-1])
        rec = sherpa_onnx.OfflineRecognizer.from_transducer(
            encoder=pick("encoder"), decoder=pick("decoder"), joiner=pick("joiner"), tokens=tokens, num_threads=4,
        )
    else:
        rec = sherpa_onnx.OfflineRecognizer.from_nemo_ctc(model=os.path.join(model_dir, sorted(onnx)[-1]), tokens=tokens, num_threads=4)
    samples, sr = sf.read(wav, dtype="float32", always_2d=True)
    samples = samples.mean(axis=1)
    stream = rec.create_stream()
    stream.accept_waveform(sr, samples)
    rec.decode_stream(stream)
    r = stream.result
    words: list[Word] = []
    cur: list[str] = []
    cur_s = 0.0
    last_t = 0.0
    for tok, t in zip(r.tokens, r.timestamps):
        if tok.startswith("▁") or tok.startswith(" "):
            if cur:
                words.append({"w": "".join(cur), "s": cur_s, "e": max(cur_s + 0.08, t)})
            cur = [tok.lstrip("▁ ")]
            cur_s = float(t)
        else:
            cur.append(tok)
        last_t = float(t)
    if cur:
        words.append({"w": "".join(cur), "s": cur_s, "e": last_t + 0.2})
    return [w for w in words if w["w"]]


def transcribe(wav: str, backend: str = "faster_whisper", model: str = "base.en", hint: str = "") -> list[Word]:
    if backend == "faster_whisper":
        return transcribe_faster_whisper(wav, model, hint)
    if backend == "sherpa_onnx":
        model_dir = model if os.path.isdir(model) else os.environ.get("SHERPA_MODEL_DIR", "")
        if not os.path.isdir(model_dir):
            raise SystemExit("sherpa_onnx backend needs --model <dir> or SHERPA_MODEL_DIR pointing at an extracted model")
        return transcribe_sherpa(wav, model_dir)
    raise SystemExit(f"unknown ASR backend: {backend}")


# ---------------------------------------------------------------- alignment

def _interpolate_missing(times: list[float | None], lo: float, hi: float) -> list[float]:
    """Fill None entries by linear interpolation between known neighbours."""
    n = len(times)
    out: list[float] = [0.0] * n
    known = [i for i, t in enumerate(times) if t is not None]
    if not known:
        return [lo + (hi - lo) * (i + 0.5) / n for i in range(n)]
    for i in range(n):
        if times[i] is not None:
            out[i] = times[i]  # type: ignore[assignment]
            continue
        prev = max((k for k in known if k < i), default=None)
        nxt = min((k for k in known if k > i), default=None)
        if prev is None:
            span = times[nxt] - lo  # type: ignore[operator]
            out[i] = lo + span * (i + 0.5) / (nxt + 0.5)  # type: ignore[operator]
        elif nxt is None:
            span = hi - times[prev]  # type: ignore[operator]
            out[i] = times[prev] + span * (i - prev) / (n - prev)  # type: ignore[operator]
        else:
            frac = (i - prev) / (nxt - prev)
            out[i] = times[prev] + (times[nxt] - times[prev]) * frac  # type: ignore[operator]
    return out


def align(storyboard: dict[str, Any], transcript: list[Word], total_sec: float) -> dict[str, Any]:
    scenes = storyboard["scenes"]
    script_words: list[tuple[int, str]] = []  # (scene idx, original word)
    for si, sc in enumerate(scenes):
        for w in sc["narration"].split():
            if normalize(w):
                script_words.append((si, w))

    a = [normalize(w) for _, w in script_words]
    b = [normalize(w["w"]) for w in transcript]
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    starts: list[float | None] = [None] * len(a)
    ends: list[float | None] = [None] * len(a)
    # A run of one or two matching words is as likely a common word landing where it was not said
    # as a real hit, so once there is enough text only runs of a few words anchor anything.
    min_block = 3 if len(a) >= 20 else 1
    for blk in sm.get_matching_blocks():
        if blk.size < min_block:
            continue
        for k in range(blk.size):
            starts[blk.a + k] = transcript[blk.b + k]["s"]
            ends[blk.a + k] = transcript[blk.b + k]["e"]
    # A scene whose words mostly went unmatched has no anchors of its own: the few that did match are
    # as likely strays as hits, so the whole scene is placed between its neighbours by word count.
    for si in range(len(scenes)):
        idx = [i for i, (sj, _) in enumerate(script_words) if sj == si]
        hit = sum(1 for i in idx if starts[i] is not None)
        if idx and hit / len(idx) < 0.5:
            for i in idx:
                starts[i] = None
                ends[i] = None
    matched = sum(1 for t in starts if t is not None)

    # Unmatched words before the first anchor are spread from the start of the recording, not from
    # the first word the recogniser kept: a recogniser that drops the opening would otherwise push
    # the first scene, and everything on screen with it, to wherever it started listening.
    last_t = transcript[-1]["e"] if transcript else total_sec
    s_times = _interpolate_missing(starts, 0.3, last_t)
    e_times = _interpolate_missing(ends, 0.3, last_t)

    per_scene: list[list[Word]] = [[] for _ in scenes]
    per_scene_matched = [0] * len(scenes)
    for i, (si, w) in enumerate(script_words):
        s = s_times[i]
        e = max(s + 0.06, e_times[i])
        per_scene[si].append({"w": w, "s": round(s, 3), "e": round(e, 3)})
        if starts[i] is not None:
            per_scene_matched[si] += 1

    # Scene boundaries: a spoken scene starts at its first word (with a short visual lead);
    # a silent scene (no narration, e.g. a hero image) takes `dur` seconds just before the
    # next spoken scene, or after the last one. Every scene ends where the next begins.
    LEAD = 0.25
    MIN_SCENE = 0.5
    n = len(scenes)
    starts: list[float | None] = [ws[0]["s"] - LEAD if ws else None for ws in per_scene]
    for si in range(n):
        if starts[si] is not None:
            continue
        dur = float(scenes[si]["props"].get("dur", 3.0))
        nxt = next((starts[j] for j in range(si + 1, n) if starts[j] is not None), None)
        if nxt is not None:
            starts[si] = nxt - dur
        else:
            prev_words = next((per_scene[j] for j in range(si - 1, -1, -1) if per_scene[j]), None)
            starts[si] = (prev_words[-1]["e"] + 0.3) if prev_words else 0.0
    # The first scene is on screen from the first frame whatever the recording does before its first word.
    resolved: list[float] = [0.0]
    for si in range(1, n):
        resolved.append(max(float(starts[si] or 0.0), resolved[si - 1] + MIN_SCENE))
    last_end = total_sec
    if not per_scene[-1]:
        last_end = max(total_sec, resolved[-1] + float(scenes[-1]["props"].get("dur", 3.0)))
    from .script_parser import time_cues

    for si, sc in enumerate(scenes):
        sc["start"] = round(resolved[si], 3)
        sc["end"] = round(resolved[si + 1] if si + 1 < n else max(last_end, resolved[si] + MIN_SCENE), 3)
        sc["words"] = per_scene[si]
        time_cues(sc)

    storyboard["durationSec"] = round(max(scenes[-1]["end"], total_sec) + 0.5, 3)
    storyboard["timing"] = "aligned"
    storyboard["alignment"] = {
        "coverage": round(matched / max(1, len(a)), 3),
        "scriptWords": len(a),
        "transcriptWords": len(b),
        "perScene": [
            {"id": sc["id"], "type": sc["type"], "matched": per_scene_matched[i], "words": len(per_scene[i]), "start": sc["start"], "end": sc["end"]}
            for i, sc in enumerate(scenes)
        ],
    }
    return storyboard


def report(storyboard: dict[str, Any]) -> str:
    al = storyboard.get("alignment")
    if not al:
        return "timing: estimated (no voiceover aligned)"
    lines = [f"alignment coverage: {al['coverage']*100:.0f}% of {al['scriptWords']} script words matched ({al['transcriptWords']} transcribed)"]
    if al["coverage"] < 0.6:
        lines.append("WARNING: low coverage. Check that the recording matches the script, or try a larger Whisper model (--model small.en).")
    lines.append(f"{'scene':>5}  {'type':<8} {'start':>7} {'end':>7}  matched")
    for s in al["perScene"]:
        flag = "" if s["words"] == 0 or s["matched"] / s["words"] >= 0.5 else "  <- weak"
        lines.append(f"{s['id']:>5}  {s['type']:<8} {s['start']:>7.2f} {s['end']:>7.2f}  {s['matched']}/{s['words']}{flag}")
    return "\n".join(lines)
