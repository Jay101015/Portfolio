"""The voice, made by ElevenLabs from the script.

    python -m pipeline.tts projects/<name> --dry-run     what would be sent, and how many characters it costs
    python -m pipeline.tts projects/<name> --approve "Jeffrey, by message, 14 November"
                                                         he has said yes to these words: write approved.json
    python -m pipeline.tts projects/<name>               make voiceover.m4a (only the chunks that changed are paid for)
    python -m pipeline.tts projects/<name> --redo 4,7    a new take of chunks 4 and 7

script.md -> each scene's spoken words, figures spelled out the British way -> chunks of a few scenes, cut where a
scene ends -> ElevenLabs text to speech with timestamps, in the cloned voice -> the chunks trimmed, matched in level
and joined with a set pause -> voiceover.m4a for the build, and voice.json (what was made, where each chunk sits).

No voice is made from words he has not approved. `--approve` writes approved.json into the project: the hash of the
script's spoken words in order, how many there are, the date and the note (who said yes, and when). It is run only
after he has said yes. Whenever there is new audio to make, `make` reads that file first and stops, with nothing
made and nothing spent, if it is not there or the words have changed since. Tags, punctuation, respellings and how
the chunks are cut are not words: changing them needs no new approval. `--dry-run` never needs one.

The repo is public, so the key and the voice ID never live in it: ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID in the
environment, or the files ~/.config/everyday-investor/elevenlabs.key and elevenlabs.voice. Neither is ever printed
or written to voice.json.

Header lines in script.md (all optional): tts.model, tts.speed, tts.stability, tts.similarity, tts.style,
tts.gap (seconds between chunks, 0.45), tts.section_gap (before a new section, 0.9), tts.chunk (characters, 1500),
tts.say (respellings: "ISA=eye-sah; HMRC=H M R C"). A script voiced this way carries `voice: natural`.
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
import time
import urllib.error
import urllib.request
from typing import Any

import numpy as np

from . import voice as vo
from .align import normalize
from .script_parser import parse_script

API = "https://api.elevenlabs.io"
CONFIG = os.path.expanduser("~/.config/everyday-investor")
MODEL = "eleven_multilingual_v2"
FORMATS = ("mp3_44100_192", "mp3_44100_128")  # the first needs a Creator plan; the second works on every plan
CHUNK, GAP, SECTION_GAP = 1500, 0.45, 0.9
SECTION_TYPES = {"takeaway", "title"}

# ---------------------------------------------------------------------------------------------- the words, as said

ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def number(n: int | str) -> str:
    """12548 -> "twelve thousand, five hundred and forty-eight" (British: the "and", the comma)."""
    n = int(n)
    if n < 20:
        return ONES[n]
    if n < 100:
        return TENS[n // 10] + ("" if n % 10 == 0 else "-" + ONES[n % 10])
    if n < 1000:
        r = n % 100
        return ONES[n // 100] + " hundred" + ("" if r == 0 else " and " + number(r))
    for big, name in ((10**9, "billion"), (10**6, "million"), (1000, "thousand")):
        if n >= big:
            h, r = divmod(n, big)
            s = number(h) + " " + name
            return s if r == 0 else s + (" and " if r < 100 else ", ") + number(r)
    return str(n)


def decimal(x: str) -> str:
    a, b = x.split(".")
    return number(a) + " point " + " ".join("oh" if c == "0" else ONES[int(c)] for c in b)


def year(y: int | str) -> str:
    y = int(y)
    if 2000 <= y < 2010:
        return "two thousand and " + ONES[y - 2000] if y > 2000 else "two thousand"
    if y % 100 == 0:
        return number(y // 100) + " hundred"
    return number(y // 100) + " " + (number(y % 100) if y % 100 >= 10 else "oh " + ONES[y % 100])


_ORD = {"one": "first", "two": "second", "three": "third", "five": "fifth", "eight": "eighth", "nine": "ninth", "twelve": "twelfth"}


def ordinal(n: int | str) -> str:
    """8 -> "eighth", 21 -> "twenty-first", 30 -> "thirtieth" (dates: "the 8th of November")."""
    words = number(n)
    head, sep, last = words.rpartition("-") if "-" in words.split(" ")[-1] else words.rpartition(" ")
    last = _ORD.get(last) or (last[:-1] + "ieth" if last.endswith("y") else last + "th")
    return head + sep + last


def _amount(num: str) -> str:
    return decimal(num) if "." in num else number(num)


def _money(m: re.Match) -> str:
    """£12,548 / $178.67 / £1.2 million / $4.8 billion, said the British way."""
    unit, cents = ("pound", "pence") if m.group(1) == "£" else ("dollar", "cents")
    num, scale = m.group(2).replace(",", ""), (m.group(3) or "").strip().lower()
    scale = {"k": "thousand", "m": "million", "bn": "billion", "tn": "trillion"}.get(scale, scale)
    if scale:
        return _amount(num) + " " + scale + " " + unit + "s"
    if "." in num:
        whole, part = num.split(".")
        if unit == "pound":
            return number(whole) + " pounds" + (" " + number(int(part)) if int(part) else "")
        return number(whole) + " dollars" + (" " + number(int(part)) if int(part) else "")
    return number(num) + " " + unit + ("" if num == "1" else "s")


def _sub(pattern: str, how, t: str) -> str:
    """re.sub, with a capital on the words that replace a figure at the start of a sentence."""
    def put(m: re.Match) -> str:
        out = how(m)
        first = m.start() == 0 or re.search(r"[.!?]\s+$", m.string[: m.start()])
        return out[:1].upper() + out[1:] if first else out
    return re.sub(pattern, put, t)


def say(text: str, respell: dict[str, str] | None = None) -> str:
    """The narration as it is said: no digits, no £ or %, so the voice cannot read a figure the American way."""
    t = text.replace("GOV.UK", "gov dot UK").replace("S&P", "S and P")
    for word, how in (respell or {}).items():
        t = re.sub(rf"(?<![\w]){re.escape(word)}(?![\w])", how, t)
    t = _sub(r"([£$])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(\s(?:million|billion|trillion|thousand)\b|[Kk]\b|m\b|bn\b|tn\b)?", _money, t)
    t = _sub(r"(\d+(?:\.\d+)?)%", lambda m: _amount(m.group(1)) + " percent", t)
    t = _sub(r"\b(\d+)p\b", lambda m: number(m.group(1)) + " pence", t)
    t = _sub(r"\b((?:19|20)\d\d)[-–](\d\d)\b", lambda m: year(m.group(1)) + " to " + number(m.group(2)), t)  # tax years
    t = _sub(r"\b(19|20)(\d\d)\b", lambda m: year(m.group(0)), t)
    t = _sub(r"\b(\d{1,2})(?:st|nd|rd|th)\b", lambda m: ordinal(m.group(1)), t)
    t = _sub(r"\b(\d+)[Kk]\b", lambda m: number(m.group(1)) + " thousand", t)
    t = _sub(r"\b\d+\.\d+\b", lambda m: decimal(m.group(0)), t)
    t = _sub(r"\b\d{1,3}(?:,\d{3})+\b", lambda m: number(m.group(0).replace(",", "")), t)
    t = _sub(r"\b\d+\b", lambda m: number(m.group(0)), t)
    return re.sub(r"\s+", " ", t).strip()


def leftover(spoken: str) -> list[str]:
    """What the voice would have to guess at: digits and symbols that did not turn into words, unfilled [BRACKETS]."""
    return sorted(set(re.findall(r"\[[^\]]*\]|\S*[\d£%$€×]\S*", spoken)))


def respellings(header: dict[str, str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for part in (header.get("tts.say") or "").split(";"):
        if "=" in part:
            a, b = part.split("=", 1)
            if a.strip() and b.strip():
                out[a.strip()] = b.strip()
    return out


# ------------------------------------------------------------------------------------------------------- the chunks

_SENTENCE = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"'\[])")


def plan(sb: dict[str, Any], target: int = CHUNK, respell: dict[str, str] | None = None) -> list[dict[str, Any]]:
    """The words grouped into chunks of about `target` characters, never cutting inside a sentence; a takeaway or
    title card, or a scene with part="...", always starts a new chunk (and a longer pause). One chunk is one request,
    one cached file, one thing to redo. Chunks are cut by sentence, not by scene, so re-cutting the scenes (a
    paragraph split in two, two merged) leaves every chunk as it was and costs nothing."""
    sections: list[dict[str, Any]] = []
    cur: dict[str, Any] | None = None
    for sc in sb["scenes"]:
        if sc["type"] in SECTION_TYPES or (sc.get("props") or {}).get("part"):
            cur = None
        text = say((sc.get("narration") or "").strip(), respell)
        if not text:
            continue
        if cur is None:
            cur = {"section": bool(sections), "sentences": []}
            sections.append(cur)
        cur["sentences"] += [(sc["id"], t) for t in _SENTENCE.split(text) if t.strip()]
    chunks: list[dict[str, Any]] = []
    for sec in sections:
        first = len(chunks)
        c: dict[str, Any] | None = None
        for scene_id, sentence in sec["sentences"]:
            if c and len(c["text"]) + 1 + len(sentence) > target:
                chunks.append(c)
                c = None
            if c is None:
                c = {"scenes": [], "text": "", "section": False}
            if scene_id not in c["scenes"]:
                c["scenes"].append(scene_id)
            c["text"] = (c["text"] + " " + sentence).strip()
        if c:
            chunks.append(c)
        # a few lines left over at the end of a section join the chunk before: a very short chunk is read in a different voice
        if len(chunks) - first >= 2 and len(chunks[-1]["text"]) < 400 and len(chunks[-2]["text"]) + 1 + len(chunks[-1]["text"]) <= target * 1.35:
            last = chunks.pop()
            chunks[-1]["scenes"] += [i for i in last["scenes"] if i not in chunks[-1]["scenes"]]
            chunks[-1]["text"] += " " + last["text"]
        if len(chunks) > first:
            chunks[first]["section"] = sec["section"]
    for i, c in enumerate(chunks):
        c["n"] = i + 1
    return chunks


def chunk_sha(text: str, voice_id: str, model: str, settings: dict[str, Any] | None) -> str:
    """What a cached chunk is filed under: the words and how they are said. The neighbours' words are left out on
    purpose, so editing one chunk does not pay for the two beside it again."""
    return hashlib.sha1(json.dumps([text, voice_id, model, settings or {}], sort_keys=True).encode()).hexdigest()[:16]


def _tail(text: str, n: int = 400) -> str:
    cut = text[-n:]
    m = re.search(r"[.!?]\s", cut)
    return cut[m.end():] if m and len(text) > n else cut


def _head(text: str, n: int = 400) -> str:
    cut = text[:n]
    ends = [m.end() for m in re.finditer(r"[.!?](?=\s|$)", cut)]
    return cut[:ends[-1]] if ends and len(text) > n else cut


# -------------------------------------------------------------------------------------------------------- ElevenLabs

class TtsError(RuntimeError):
    def __init__(self, status: int, message: str):
        super().__init__(f"ElevenLabs {status}: {message}")
        self.status, self.message = status, message


class ElevenLabs:
    """Text to speech with timestamps. The key goes in one header and nowhere else: not in errors, not in logs."""

    def __init__(self, key: str, base: str = API, tries: int = 4):
        self.key, self.base, self.tries = key, base, tries
        self.format: str | None = None  # the best output format this plan allows, found on the first call
        self.context = True  # previous_text / next_text, until a model refuses them

    def _post(self, url: str, body: dict[str, Any]) -> tuple[dict[str, Any], dict[str, str]]:
        req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST", headers={"xi-api-key": self.key, "Content-Type": "application/json", "Accept": "application/json"})
        for attempt in range(self.tries):
            try:
                with urllib.request.urlopen(req, timeout=300) as r:
                    return json.loads(r.read()), {k.lower(): v for k, v in r.headers.items()}
            except urllib.error.HTTPError as e:
                raw = e.read().decode("utf-8", "replace")
                try:
                    detail = json.loads(raw).get("detail")
                    message = detail.get("message") or detail.get("status") if isinstance(detail, dict) else str(detail)
                except (ValueError, AttributeError):
                    message = raw[:300]
                if e.code in (429, 500, 502, 503, 504) and attempt + 1 < self.tries:
                    time.sleep(2 ** attempt * 3)
                    continue
                raise TtsError(e.code, str(message).replace(self.key, "***")) from None
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                if attempt + 1 < self.tries:
                    time.sleep(2 ** attempt * 3)
                    continue
                raise TtsError(0, f"could not reach {self.base}: {str(e).replace(self.key, '***')}") from None
        raise TtsError(0, "no answer")

    def speak(self, voice_id: str, text: str, model: str = MODEL, previous_text: str = "", next_text: str = "", settings: dict[str, Any] | None = None) -> dict[str, Any]:
        """One chunk: {"audio": mp3 bytes, "chars", "starts", "ends", "cost", "request", "format"}."""
        body: dict[str, Any] = {"text": text, "model_id": model}
        if settings:
            body["voice_settings"] = settings
        formats = [self.format] if self.format else list(FORMATS)
        while True:
            fmt = formats[0]
            send = dict(body)
            if self.context:
                if previous_text:
                    send["previous_text"] = previous_text
                if next_text:
                    send["next_text"] = next_text
            try:
                data, headers = self._post(f"{self.base}/v1/text-to-speech/{voice_id}/with-timestamps?output_format={fmt}", send)
            except TtsError as e:
                low = e.message.lower()
                if len(formats) > 1 and e.status in (400, 401, 403) and ("output_format" in low or "tier" in low or "subscription" in low or "plan" in low):
                    formats.pop(0)  # this plan does not include the higher bitrate
                    continue
                if self.context and e.status in (400, 422) and ("previous_text" in low or "next_text" in low or "context" in low):
                    self.context = False  # this model takes no context: each chunk is read alone
                    continue
                raise
            self.format = fmt
            al = data.get("alignment") or data.get("normalized_alignment") or {}
            return {"audio": base64.b64decode(data["audio_base64"]), "chars": al.get("characters") or [], "starts": al.get("character_start_times_seconds") or [],
                    "ends": al.get("character_end_times_seconds") or [], "cost": int(headers.get("character-cost") or len(text)), "request": headers.get("request-id") or "", "format": fmt}


def read_secret(env: str, name: str) -> str:
    """The key or the voice ID: from the environment, else from a file outside the repo. Never from the repo."""
    v = (os.environ.get(env) or "").strip()
    if v:
        return v
    path = os.path.join(CONFIG, name)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return f.read().strip()
    return ""


# ---------------------------------------------------------------------------------------------- from chunks to a take

def words_of(chars: list[str], starts: list[float], ends: list[float]) -> list[dict[str, Any]]:
    """The alignment's characters as words with times (the spoken forms: "fifty", "thousand", "pounds")."""
    out: list[dict[str, Any]] = []
    cur, s, e = "", 0.0, 0.0
    for ch, a, b in zip(chars, starts, ends):
        if ch.isspace():
            if cur:
                out.append({"w": cur, "s": round(s, 3), "e": round(e, 3)})
                cur = ""
            continue
        if not cur:
            s = a
        cur, e = cur + ch, b
    if cur:
        out.append({"w": cur, "s": round(s, 3), "e": round(e, 3)})
    return out


def speech_rms(x: np.ndarray, sr: int = vo.SR) -> float:
    """Level of the speech itself (the pauses left out), so a chunk with more pauses is not turned up."""
    win = int(sr * 0.05)
    if len(x) < win:
        return float(np.sqrt(np.mean(x ** 2))) if len(x) else 0.0
    frames = x[: len(x) // win * win].reshape(-1, win)
    rms = np.sqrt(np.mean(frames ** 2, axis=1))
    loud = rms[rms > 32768 * 10 ** (-45 / 20)]
    return float(np.sqrt(np.mean(loud ** 2))) if len(loud) else 0.0


def trim(x: np.ndarray, first: float, last: float, sr: int = vo.SR, lead: float = 0.03, tail: float = 0.12) -> tuple[np.ndarray, float]:
    """The chunk from just before its first sound to just after its last, with 5 ms fades; and how much came off the front."""
    a = max(0, int((first - lead) * sr))
    b = min(len(x), int((last + tail) * sr)) if last > 0 else len(x)
    y = x[a:b].copy()
    n = min(int(sr * 0.005), len(y) // 2)
    if n:
        ramp = np.linspace(0.0, 1.0, n)
        y[:n] *= ramp
        y[-n:] *= ramp[::-1]
    return y, a / sr


def assemble(parts: list[dict[str, Any]], gap: float = GAP, section_gap: float = SECTION_GAP, sr: int = vo.SR, match: float = 4.0) -> tuple[np.ndarray, list[dict[str, Any]]]:
    """parts: [{"pcm", "words", "section", ...}] in order -> one take, and where each chunk sits in it. Chunks are
    brought to the same speech level (by at most `match` dB), so the voice does not step up or down at a join."""
    levels = [speech_rms(p["pcm"], sr) for p in parts]
    heard = [v for v in levels if v > 0]
    target = float(np.median(heard)) if heard else 0.0
    out: list[np.ndarray] = []
    placed: list[dict[str, Any]] = []
    t = 0.0
    for i, (p, level) in enumerate(zip(parts, levels)):
        if i:
            pause = section_gap if p.get("section") else gap
            out.append(np.zeros(int(pause * sr)))
            t += int(pause * sr) / sr
        g = 1.0
        if target and level:
            db = float(np.clip(20 * np.log10(target / level), -match, match))
            g = 10 ** (db / 20)
        out.append(p["pcm"] * g)
        dur = len(p["pcm"]) / sr
        placed.append({"start": round(t, 3), "end": round(t + dur, 3), "gainDb": round(20 * np.log10(g), 2),
                       "words": [{"w": w["w"], "s": round(w["s"] + t, 3), "e": round(w["e"] + t, 3)} for w in p.get("words") or []]})
        t += dur
    return (np.concatenate(out) if out else np.zeros(0)), placed


def checks(chunks: list[dict[str, Any]], placed: list[dict[str, Any]]) -> list[str]:
    """What to listen to first: a chunk read much faster or slower than the rest, or with a long hole inside it."""
    notes: list[str] = []
    rates = []
    for c, p in zip(chunks, placed):
        ws = p["words"]
        dur = p["end"] - p["start"]
        rates.append(len(ws) / dur * 60 if dur > 0 and ws else 0.0)
    known = [r for r in rates if r]
    mid = float(np.median(known)) if known else 0.0
    for c, p, r in zip(chunks, placed, rates):
        if mid and r and abs(r - mid) / mid > 0.18:
            notes.append(f"chunk {c['n']} (scenes {c['scenes'][0]}-{c['scenes'][-1]}) is read at {r:.0f} words a minute against {mid:.0f} for the rest")
        for a, b in zip(p["words"], p["words"][1:]):
            if b["s"] - a["e"] > 1.5:
                notes.append(f"chunk {c['n']}: a {b['s'] - a['e']:.1f}s hole after \"{a['w']}\" at {a['e']:.1f}s")
        if abs(p["gainDb"]) >= 3.0:
            notes.append(f"chunk {c['n']} came back {abs(p['gainDb']):.1f} dB {'quieter' if p['gainDb'] > 0 else 'louder'} than the rest (matched)")
    return notes


def file_hash(path: str) -> str:
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()[:16]


def existing_take(project: str) -> str | None:
    hits = [p for p in sorted(glob.glob(os.path.join(project, "voiceover.*"))) if not p.endswith((".url", ".b64"))]
    return hits[0] if hits else None


# ------------------------------------------------------------------------------------------------- his approval

APPROVED = "approved.json"


def words_hash(sb: dict[str, Any]) -> tuple[str, int]:
    """What he approves: the script's spoken words in order, as a hash, and how many there are. The words are read
    as pipeline/align.normalize reads them (lower case, no punctuation), from the script itself and not from what is
    sent to the voice: a tag, a comma, a respelling or another way of cutting the chunks does not change the hash,
    and one word added, dropped, changed or moved does."""
    words = [n for sc in sb["scenes"] for n in (normalize(w) for w in (sc.get("narration") or "").split()) if n]
    return hashlib.sha1(" ".join(words).encode()).hexdigest()[:16], len(words)


def approve(project: str, md: str, note: str) -> dict[str, Any]:
    """Write approved.json for the words `md` (script.md) says now: their hash, how many, today's date and the note
    (who said yes, and when). Only ever run after he has said yes to these words. Returns what was written."""
    note = " ".join(str(note).split())
    if not note:
        raise SystemExit('--approve needs a note: who said yes to these words, and when (for example --approve "Jeffrey, by message, 14 November")')
    sha, count = words_hash(parse_script(md))
    if not count:
        raise SystemExit("no spoken words in the script: there is nothing to approve")
    record = {"wordsHash": sha, "words": count, "date": time.strftime("%Y-%m-%d"), "note": note}
    with open(os.path.join(project, APPROVED), "w", encoding="utf-8") as f:
        json.dump(record, f, indent=1, ensure_ascii=False)
        f.write("\n")
    return record


def unapproved(project: str, sb: dict[str, Any]) -> str:
    """Why these words may not be voiced, or "" when approved.json holds their hash."""
    sha, count = words_hash(sb)
    how = (f'When he has said yes to them, run: python -m pipeline.tts {project} --approve "who said yes, and when". '
           "Nothing was made and nothing was spent.")
    path = os.path.join(project, APPROVED)
    if not os.path.exists(path):
        return f"these words are not approved: there is no {APPROVED} in this project, and no voice is made from words Jeffrey has not said yes to. {how}"
    try:
        with open(path, encoding="utf-8") as f:
            rec = json.load(f)
        was = str(rec.get("wordsHash") or "")
    except (OSError, ValueError, AttributeError):
        return f"{APPROVED} cannot be read, so these words count as not approved. {how}"
    if was != sha:
        return (f"the spoken words have changed since they were approved ({rec.get('date', 'no date')}: {rec.get('note', 'no note')}; {rec.get('words', '?')} words then, {count:,} now), "
                f"and no voice is made from words Jeffrey has not said yes to. Send him the script as it is now. {how}")
    return ""


def make(project: str, client: ElevenLabs | None, voice_id: str, md: str, header: dict[str, str], redo: set[int] | None = None, dry: bool = False, max_credits: int = 20000, log=print) -> dict[str, Any]:
    """The whole job for one project. Returns the record that is written to voice.json."""
    sb = parse_script(md)
    num = lambda k, d: float(header[k]) if header.get(k) else d  # noqa: E731
    model = header.get("tts.model") or MODEL
    settings: dict[str, Any] = {}
    for key, field in (("tts.speed", "speed"), ("tts.stability", "stability"), ("tts.similarity", "similarity_boost"), ("tts.style", "style")):
        if header.get(key):
            settings[field] = float(header[key])
    chunks = plan(sb, int(num("tts.chunk", CHUNK)), respellings(header))
    if not chunks:
        raise SystemExit("no spoken words in the script")
    bad = [(c["n"], leftover(c["text"])) for c in chunks if leftover(c["text"])]
    for n, left in bad:
        log(f"chunk {n}: the voice would have to guess at {', '.join(left)}")
    cache = os.path.join(project, ".cache", "tts")
    record_path = os.path.join(project, "voice.json")
    old: dict[str, Any] = {}
    if os.path.exists(record_path):
        with open(record_path, encoding="utf-8") as f:
            old = json.load(f)
    take = existing_take(project)
    kept = {c["sha"]: c for c in old.get("chunks") or []} if take and old.get("audioHash") == file_hash(take) else {}
    redo = redo or set()
    for c in chunks:
        c["sha"] = chunk_sha(c["text"], voice_id, model, settings)
        cached = os.path.exists(os.path.join(cache, c["sha"] + ".mp3")) and os.path.exists(os.path.join(cache, c["sha"] + ".json"))
        c["from"] = "new" if c["n"] in redo else "cache" if cached else "take" if c["sha"] in kept else "new"
    new_chars = sum(len(c["text"]) for c in chunks if c["from"] == "new")
    total_chars = sum(len(c["text"]) for c in chunks)
    words = sum(len(c["text"].split()) for c in chunks)
    log(f"{len(chunks)} chunks, {total_chars:,} characters, about {words:,} spoken words; to make now: {sum(c['from'] == 'new' for c in chunks)} chunks, {new_chars:,} characters")
    for c in chunks:
        log(f"  {c['n']:>2} {'§' if c['section'] else ' '} scenes {c['scenes'][0]}-{c['scenes'][-1]}  {len(c['text']):>5} chars  {c['from']:<5}  {c['text'][:60]}...")
    if dry:
        return {"chunks": chunks, "characters": total_chars, "new": new_chars}
    if bad:
        raise SystemExit("fix the words above first (digits, symbols or [BRACKETS] left in the narration)")
    if new_chars:
        # new audio costs credits and says words in his voice: only the words he has said yes to (approved.json)
        stop = unapproved(project, sb)
        if stop:
            raise SystemExit(stop)
    if new_chars > max_credits:
        raise SystemExit(f"{new_chars:,} characters is over the limit of {max_credits:,} for one run (--max-credits)")
    if take and not old.get("audioHash"):
        raise SystemExit(f"{os.path.basename(take)} is already here and was not made by this step: move it away first, or pass --replace")
    if new_chars and (client is None or not voice_id):
        raise SystemExit("no ElevenLabs key or voice ID: set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID, or the files in ~/.config/everyday-investor")
    os.makedirs(cache, exist_ok=True)
    whole = vo.read(take) if any(c["from"] == "take" for c in chunks) and take else None
    parts: list[dict[str, Any]] = []
    spent = 0
    for i, c in enumerate(chunks):
        mp3, meta = os.path.join(cache, c["sha"] + ".mp3"), os.path.join(cache, c["sha"] + ".json")
        if c["from"] == "take" and whole is not None:
            k = kept[c["sha"]]
            a, b = int(k["start"] * vo.SR), int(k["end"] * vo.SR)
            parts.append({"pcm": whole[a:b], "section": c["section"], "words": [{"w": w["w"], "s": w["s"] - k["start"], "e": w["e"] - k["start"]} for w in k.get("words") or []], "cost": 0})
            continue
        if c["from"] == "new":
            got = client.speak(voice_id, c["text"], model, _tail(chunks[i - 1]["text"]) if i else "", _head(chunks[i + 1]["text"]) if i + 1 < len(chunks) else "", settings or None)
            with open(mp3, "wb") as f:
                f.write(got["audio"])
            with open(meta, "w", encoding="utf-8") as f:
                json.dump({k: got[k] for k in ("chars", "starts", "ends", "cost", "request", "format")}, f)
            spent += got["cost"]
            log(f"  made chunk {c['n']}: {got['cost']} credits")
        with open(meta, encoding="utf-8") as f:
            al = json.load(f)
        ws = words_of(al["chars"], al["starts"], al["ends"])
        pcm, off = trim(vo.read(mp3), ws[0]["s"] if ws else 0.0, ws[-1]["e"] if ws else 0.0)
        parts.append({"pcm": pcm, "section": c["section"], "words": [{"w": w["w"], "s": max(0.0, w["s"] - off), "e": max(0.0, w["e"] - off)} for w in ws], "cost": al.get("cost", 0)})
    take_pcm, placed = assemble(parts, num("tts.gap", GAP), num("tts.section_gap", SECTION_GAP))
    wav = os.path.join(cache, "take.wav")
    vo.write(wav, take_pcm)
    if take:
        os.makedirs(os.path.join(project, ".cache"), exist_ok=True)
        shutil.move(take, os.path.join(project, ".cache", "voiceover-before" + os.path.splitext(take)[1]))
    out = os.path.join(project, "voiceover.m4a")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-ac", "1", "-c:a", "aac", "-b:a", "192k", out], check=True)
    record = {"made": "elevenlabs", "model": model, "settings": settings, "audio": "voiceover.m4a", "audioHash": file_hash(out), "durationSec": round(len(take_pcm) / vo.SR, 3),
              "characters": total_chars, "credits": spent,
              "chunks": [{"n": c["n"], "scenes": c["scenes"], "section": c["section"], "sha": c["sha"], "chars": len(c["text"]), "start": p["start"], "end": p["end"], "gainDb": p["gainDb"], "words": p["words"]} for c, p in zip(chunks, placed)]}
    with open(record_path, "w", encoding="utf-8") as f:
        json.dump(record, f, separators=(",", ":"))
    notes = checks(chunks, placed)
    spoken = sum(len(p["words"]) for p in placed)
    log(f"voiceover.m4a: {record['durationSec'] / 60:.1f} min ({record['durationSec']:.0f}s), {spoken / record['durationSec'] * 60:.0f} words a minute, {spent:,} credits spent this run")
    for note in notes:
        log("LISTEN: " + note)
    record["notes"] = notes
    return record


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("project")
    ap.add_argument("--dry-run", action="store_true", help="list the chunks and the characters; call nothing")
    ap.add_argument("--approve", default=None, metavar="NOTE", help='he has said yes to the script\'s words as they are now: write approved.json with this note (who said yes, and when) and make nothing')
    ap.add_argument("--redo", default="", help="chunk numbers to make again, e.g. 4,7")
    ap.add_argument("--replace", action="store_true", help="replace a voiceover that this step did not make (the old one is kept in .cache)")
    ap.add_argument("--max-credits", type=int, default=20000)
    args = ap.parse_args(argv)
    project = os.path.abspath(args.project)
    with open(os.path.join(project, "script.md"), encoding="utf-8") as f:
        md = f.read()
    if args.approve is not None:
        # his yes, written down: no key is read, nothing is sent and nothing is made
        rec = approve(project, md, args.approve)
        print(f"approved: {rec['words']:,} spoken words of {os.path.basename(project)} as they are now ({rec['wordsHash']}), {rec['date']}, {rec['note']}. Written to {APPROVED}; nothing was made.")
        return 0
    from .build import _header_lines
    header = _header_lines(md)
    key, voice_id = read_secret("ELEVENLABS_API_KEY", "elevenlabs.key"), read_secret("ELEVENLABS_VOICE_ID", "elevenlabs.voice")
    if args.replace:
        take = existing_take(project)
        if take and not os.path.exists(os.path.join(project, "voice.json")):
            os.makedirs(os.path.join(project, ".cache"), exist_ok=True)
            shutil.move(take, os.path.join(project, ".cache", "voiceover-before" + os.path.splitext(take)[1]))
    try:
        make(project, ElevenLabs(key) if key else None, voice_id, md, header, {int(x) for x in args.redo.split(",") if x.strip()}, args.dry_run, args.max_credits)
    except TtsError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
