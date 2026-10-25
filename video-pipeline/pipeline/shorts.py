"""Cut a video into Shorts: the slices most likely to travel, each with a hook, vertical, captioned.

    plan_shorts(storyboard, want=3)  -> the best non-overlapping slices, scored, with a hook line each
    cut_short(storyboard, scene_ids, hook, name) -> a storyboard of just those scenes, re-timed from zero, captions on,
                                                    plus the spans of the original voiceover to keep

What makes a slice likely to be watched through and shared, from what the money channels do: a number in the first
line, a takeaway card, a person in the picture, a curiosity word (mistake, nobody, secret, trap), a question, and a
length of 20 to 45 seconds. A title scene at the start and an outro at the end count against it.
"""
from __future__ import annotations

import copy
import json
import os
import re
from typing import Any

NUMBER_RE = re.compile(r"(?:[£$€]\s?\d[\d,.]*\s?(?:k|m|bn)?|\d[\d,.]*\s?%|\b\d{2,}(?:,\d{3})+\b|\b\d+\s?(?:thousand|million|grand|percent|years?|months?|days?)\b)", re.I)
CURIOSITY = ("mistake", "wrong", "nobody", "secret", "never", "lost", "trap", "truth", "stop", "actually", "biggest", "worst", "hidden", "scam", "lie", "nearly", "without noticing", "most people")
MIN_SEC, MAX_SEC, SWEET_LO, SWEET_HI = 15.0, 60.0, 20.0, 45.0


def _traced_tags() -> list[str]:
    here = os.path.dirname(os.path.abspath(__file__))
    mf = os.path.join(os.path.dirname(here), "library", "illus", "manifest.json")
    if not os.path.exists(mf):
        return []
    tags: list[str] = []
    for e in json.load(open(mf, encoding="utf-8")):
        tags += [t.lower() for t in e.get("tags", [])]
    return tags


def _has_person(sc: dict[str, Any], tags: list[str]) -> bool:
    if sc["type"] == "art" or sc["props"].get("art"):
        return True
    hay = " ".join(str(sc["props"].get(k, "")) for k in ("headline", "title", "label", "sub")) + " " + sc.get("narration", "")
    hay = hay.lower()
    return any(re.search(r"\b" + re.escape(t) + r"\b", hay) for t in tags)


def _first_sentence(text: str) -> str:
    return re.split(r"(?<=[.!?])\s+", text.strip())[0] if text.strip() else ""


def caption_line(text: str, max_words: int = 8) -> str:
    """The first clause of the first sentence, at most `max_words` words, no trailing punctuation."""
    sents = [x for x in re.split(r"(?<=[.!?])\s+", text.strip()) if x.strip()]
    first = next((x for x in sents if len(x.split()) >= 4), sents[0] if sents else "")
    clause = re.split(r",|;|:", first, maxsplit=1)[0] or first
    short = re.split(r"\s+(?:and|but|because|so|which|while)\s+", clause, maxsplit=1, flags=re.I)[0]
    if len(short.split()) >= 4:  # a conjunction cuts the line only when what is left still says something
        clause = short
    words = clause.split()[:max_words]
    return re.sub(r"[.,;:!?]+$", "", " ".join(words))


def hook_for(scenes: list[dict[str, Any]]) -> str:
    """The line at the top of the short: a takeaway's title if the slice has one, else the first scene's board line,
    else the first clause of what is said first."""
    for sc in scenes:
        if sc["type"] == "takeaway" and sc["props"].get("title"):
            return str(sc["props"]["title"])
    first = scenes[0]
    if first["props"].get("board"):
        return str(first["props"]["board"]).split("|")[0].strip()
    if first["type"] == "title" and first["props"].get("title"):
        return str(first["props"]["title"])
    # the first real sentence (not a one-word label like "February."), a sentence with a number preferred
    sents = [x for x in re.split(r"(?<=[.!?])\s+", first.get("narration", "").strip()) if len(x.split()) >= 4]
    pick = next((x for x in sents[:2] if NUMBER_RE.search(x)), sents[0] if sents else first.get("narration", ""))
    line = caption_line(pick, 9)
    return line[:1].upper() + line[1:] if line else "Watch this"


def score_slice(scenes: list[dict[str, Any]], tags: list[str] | None = None) -> tuple[int, list[str]]:
    """0..100 and the reasons, for a run of scenes."""
    tags = _traced_tags() if tags is None else tags
    dur = scenes[-1]["end"] - scenes[0]["start"]
    score, why = 0, []
    if SWEET_LO <= dur <= SWEET_HI:
        score += 25
        why.append(f"{dur:.0f}s, the sweet spot")
    elif MIN_SEC <= dur <= MAX_SEC:
        score += 12
        why.append(f"{dur:.0f}s")
    text0 = " ".join([str(scenes[0]["props"].get("title", "")), str(scenes[0]["props"].get("headline", "")), scenes[0].get("narration", "")])
    if NUMBER_RE.search(text0):
        score += 20
        why.append("opens on a number")
    elif any(NUMBER_RE.search(sc.get("narration", "")) for sc in scenes[1:]):
        score += 8
        why.append("has a number")
    if any(sc["type"] == "takeaway" for sc in scenes):
        score += 15
        why.append("a takeaway card")
    people = sum(1 for sc in scenes if _has_person(sc, tags))
    if people:
        score += min(16, 8 * people)
        why.append("a person in the picture" if people == 1 else f"{people} scenes with people")
    hay = " ".join(sc.get("narration", "") for sc in scenes).lower()
    hits = [w for w in CURIOSITY if w in hay]
    if hits:
        score += 10
        why.append("curiosity: " + hits[0])
    if "?" in _first_sentence(scenes[0].get("narration", "")):
        score += 8
        why.append("opens with a question")
    if any(sc["type"] in ("bite", "grow", "pie", "shrink", "stat", "chart") for sc in scenes):
        score += 8
        why.append("a money picture")
    if scenes[0]["type"] == "title":
        score -= 10
        why.append("starts on the title card")
    if any(sc["type"] == "outro" for sc in scenes):
        score -= 15
        why.append("includes the outro")
    return max(0, min(100, score)), why


def plan_shorts(sb: dict[str, Any], want: int = 3) -> list[dict[str, Any]]:
    """The best `want` non-overlapping slices of one to five scenes, between 15 and 60 seconds, highest score first."""
    scenes = [sc for sc in sb["scenes"]]
    tags = _traced_tags()
    cands = []
    for i in range(len(scenes)):
        for j in range(i, min(len(scenes), i + 5)):
            run = scenes[i : j + 1]
            dur = run[-1]["end"] - run[0]["start"]
            if dur < MIN_SEC or dur > MAX_SEC:
                continue
            if any(sc["type"] == "outro" for sc in run) or all(sc["type"] == "title" for sc in run):
                continue  # the sign-off and the title card are not a Short
            score, why = score_slice(run, tags)
            cands.append({"scenes": [sc["id"] for sc in run], "start": run[0]["start"], "end": run[-1]["end"], "seconds": round(dur, 1), "score": score, "why": why, "hook": hook_for(run)})
    cands.sort(key=lambda c: (-c["score"], c["seconds"]))
    picked: list[dict[str, Any]] = []
    for c in cands:
        if any(set(c["scenes"]) & set(p["scenes"]) for p in picked):
            continue
        picked.append(c)
        if len(picked) >= want:
            break
    picked.sort(key=lambda c: c["start"])
    for k, c in enumerate(picked, 1):
        c["name"] = f"short-{k}"
    return picked


def cut_short(sb: dict[str, Any], scene_ids: list[int], hook: str | None = None, name: str = "short-1", lead: float = 0.4, tail: float = 0.8) -> tuple[dict[str, Any], list[tuple[float, float]]]:
    """A storyboard of just `scene_ids`, re-timed to start at `lead`, captions on, the hook on top. Also the spans of
    the original voiceover (start, end) that make up the short, in order, so the audio can be cut to match."""
    ids = set(scene_ids)
    keep = [copy.deepcopy(sc) for sc in sb["scenes"] if sc["id"] in ids]
    if not keep:
        raise ValueError("no scenes to cut")
    out = {k: copy.deepcopy(v) for k, v in sb.items() if k not in ("scenes", "mouth", "visemes")}
    spans: list[tuple[float, float]] = []
    t = lead
    for sc in keep:
        s0, e0 = sc["start"], sc["end"]
        shift = t - s0
        for w in sc.get("words", []) or []:
            w["s"] = round(w["s"] + shift, 3)
            w["e"] = round(w["e"] + shift, 3)
        for c in sc.get("cues", []) or []:
            if "t" in c:
                c["t"] = round(c["t"] + shift, 3)
        sc["start"] = round(t, 3)
        sc["end"] = round(e0 + shift, 3)
        spans.append((s0, e0))
        t = sc["end"]
    out["scenes"] = keep
    out["durationSec"] = round(t + tail, 3)
    out["captions"] = True
    out["hook"] = hook or hook_for(keep)
    out["short"] = name
    out["mouth"] = []
    out["visemes"] = []
    return out, spans
