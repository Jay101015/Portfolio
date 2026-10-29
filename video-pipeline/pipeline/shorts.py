"""Cut a video into Shorts: the slices most likely to travel, each with a hook, vertical, captioned.

    plan_shorts(storyboard, want=3)  -> the best non-overlapping slices, scored, with a hook line each
    cut_short(storyboard, scene_ids, hook, name) -> a storyboard of just those scenes, re-timed from zero, captions on,
                                                    plus the spans of the original voiceover to keep
    cut_spans(storyboard, spans, hook, name)     -> the same for stretches of time (a slice that starts or ends inside
                                                    a scene, or skips a middle part)

What makes a slice likely to be watched through and shared, from what the money channels do: a number in the first
line, a takeaway card, a person in the picture, a curiosity word (mistake, nobody, secret, trap), a question, and a
length of 20 to 45 seconds. A title scene at the start and an outro at the end count against it.

With word timings (a recorded video) the slices are cut on sentences, not scenes: a Short starts on its strongest
sentence and stops when the answer lands. On top of the signals above it must make sense to someone swiping in cold
(no "So...", "Second...", "That's why..." to open, nothing that leans on "as I said"), and it must pay off (end on a
number or a verdict, not on a question or a "but"). A slice may keep a sentence or two of setup, skip the middle and
land on the payoff, the way an editor would.
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
    clause = re.split(r",(?!\d{3})|;|:", first, maxsplit=1)[0] or first
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
    if scenes[0]["type"] == "hook":
        score += 10
        why.append("opens on the hook")
    if scenes[0]["type"] == "title":
        score -= 10
        why.append("starts on the title card")
    if any(sc["type"] == "outro" for sc in scenes):
        score -= 15
        why.append("includes the outro")
    return max(0, min(100, score)), why


def plan_shorts(sb: dict[str, Any], want: int = 3) -> list[dict[str, Any]]:
    """The best `want` slices: cut on sentences when the storyboard has word timings, else on whole scenes."""
    sents = sentences(sb)
    if sents and all(sc.get("words") for sc in sb["scenes"] if sc["type"] not in ("outro", "broll", "clip") and sc.get("narration", "").strip()):
        return plan_sentence_shorts(sb, want, sents)
    return plan_scene_shorts(sb, want)


def plan_scene_shorts(sb: dict[str, Any], want: int = 3) -> list[dict[str, Any]]:
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


# --- cutting on sentences -------------------------------------------------------------------------------------------

# an opening that leans on what came before: someone swiping in has no idea what "that" or "second" refers to
LEANS_RE = re.compile(r"^(?:so|and|but|or|also|then|plus|which|because|that's|that is|this is why|that's why|it's|it|they|"
                      r"he|she|these|those|this|that|there|here|second(?:ly)?|third(?:ly)?|next|another|finally|again|"
                      r"same|now|meanwhile|instead|even|still|on top of that|after that|before that)\b", re.I)
BACKREF_RE = re.compile(r"\b(?:as i said|i mentioned|mentioned earlier|earlier|like before|remember|as we saw|from before|"
                        r"the one above|we just|in this video|this video|later on|stick around|i'll show you|coming up)\b", re.I)
# a sentence that is only a figure ("£100,000.") is the heading of the next part, not an ending
HEADING_RE = re.compile(r"^(?:and now,?\s*)?[£$€]?\s?\d[\d,.]*\s?(?:k|m|million)?[.!]?$", re.I)
# a last sentence that sets something up instead of landing it
SETUP_END_RE = re.compile(r"^(?:now|next|let's|first|so let's|here's|there's one|one more|and then)\b", re.I)
VERDICT_RE = re.compile(r"\b(?:means|that's|so you|you'd need|you need|the answer|which is|works out|comes to|in total|"
                        r"not a|only|just|never|always|enough|worth|still|short of|even then)\b", re.I)
SENT_LEAD, SENT_TAIL = 0.15, 0.3


def sentences(sb: dict[str, Any]) -> list[dict[str, Any]]:
    """Every spoken sentence with its scene and its time span (a little air before the first word and after the last)."""
    out: list[dict[str, Any]] = []
    for sc in sb["scenes"]:
        if sc["type"] == "outro":
            continue
        cur: list[dict[str, Any]] = []
        for w in sc.get("words") or []:
            cur.append(w)
            if re.search(r"[.!?][\"')]*$", str(w["w"])):
                out.append(_sentence(sc, cur))
                cur = []
        if cur:
            out.append(_sentence(sc, cur))
    return out


def _sentence(sc: dict[str, Any], words: list[dict[str, Any]]) -> dict[str, Any]:
    text = " ".join(str(w["w"]) for w in words)
    return {"scene": sc["id"], "type": sc["type"], "text": text, "words": len(words),
            "s": max(sc["start"], words[0]["s"] - SENT_LEAD), "e": min(sc["end"], words[-1]["e"] + SENT_TAIL)}


def score_sentences(parts: list[list[dict[str, Any]]], by_id: dict[int, dict[str, Any]], tags: list[str]) -> tuple[int, list[str]]:
    """0..100 and the reasons, for a slice made of one or two runs of sentences."""
    sents = [x for part in parts for x in part]
    dur = sum(part[-1]["e"] - part[0]["s"] for part in parts)
    scenes = [by_id[i] for i in dict.fromkeys(x["scene"] for x in sents)]
    first, last = sents[0]["text"], sents[-1]["text"]
    score, why = 0, []
    if SWEET_LO <= dur <= SWEET_HI:
        score += 25
        why.append(f"{dur:.0f}s, the sweet spot")
    elif MIN_SEC <= dur <= MAX_SEC:
        score += 12
        why.append(f"{dur:.0f}s")
    if NUMBER_RE.search(first):
        score += 20
        why.append("opens on a number")
    elif any(NUMBER_RE.search(x["text"]) for x in sents[1:]):
        score += 8
        why.append("has a number")
    if "?" in first:
        score += 8
        why.append("opens with a question")
    # makes sense cold
    if LEANS_RE.search(first):
        score -= 20
        why.append(f"opens leaning on what came before (\"{first.split()[0]}\")")
    elif not first[:1].isupper() and not first[:1] in "£$€0123456789":
        score -= 8
        why.append("opens mid-sentence")
    if HEADING_RE.search(first.strip()):
        score -= 10
        why.append("opens on a bare figure")
    if sents[0] is not _first_of(by_id[sents[0]["scene"]], _all_sents(by_id[sents[0]["scene"]])):
        score -= 6
        why.append("starts mid-scene")
    if any(BACKREF_RE.search(x["text"]) for x in sents[:2]):
        score -= 12
        why.append("refers back to the long video")
    # pays off
    if HEADING_RE.search(last.strip()):
        score -= 15
        why.append("ends on the next heading")
    elif last.rstrip().endswith("?"):
        score -= 12
        why.append("ends on a question")
    elif SETUP_END_RE.search(last) or (re.match(r"but\b", last, re.I) and not VERDICT_RE.search(last)):
        score -= 10
        why.append("ends on a setup")
    elif NUMBER_RE.search(last) or VERDICT_RE.search(last) or sents[-1]["type"] == "takeaway":
        score += 12
        why.append("ends on the answer")
    # a takeaway card counts when the slice shows it from its first line, not a stray sentence of its end
    if any(by_id[x["scene"]]["type"] == "takeaway" and x is _first_of(by_id[x["scene"]], _all_sents(by_id[x["scene"]])) for x in sents):
        score += 15
        why.append("a takeaway card")
    people = sum(1 for sc in scenes if _has_person(sc, tags))
    if people:
        score += min(16, 8 * people)
        why.append("a person in the picture" if people == 1 else f"{people} scenes with people")
    hay = " ".join(x["text"] for x in sents).lower()
    hits = [w for w in CURIOSITY if re.search(r"\b" + re.escape(w) + r"\b", hay)]  # "lie" is not in "relief"
    if hits:
        score += 10
        why.append("curiosity: " + hits[0])
    if any(sc["type"] in ("bite", "grow", "pie", "shrink", "stat", "chart", "compare") for sc in scenes):
        score += 8
        why.append("a money picture")
    if scenes[0]["type"] == "hook" and sents[0] is _first_of(scenes[0], sents):
        score += 10
        why.append("opens on the hook")
    if any(sc["type"] == "title" for sc in scenes):
        score -= 10
        why.append("includes the title card")
    # something new on screen at least every ten seconds
    if dur and len(scenes) / dur >= 0.1:
        score += 5
        why.append("the picture keeps changing")
    words = sum(x["words"] for x in sents)
    if dur and words / dur >= 2.6:
        score += 5
        why.append("brisk")
    if len(parts) > 1:
        # only worth it when the setup grabs on its own and the payoff is a real run, not one stray line
        score -= 12
        why.append("skips the middle")
        # every jump lands on something the slice is already about, and a two-part slice's payoff is a real run; a
        # part may open on "But..." when it only trims a sentence or two (under ten seconds), not when it jumps
        # (a bare heading like "£50,000." is read together with what follows it)
        runs: list[list[dict[str, Any]]] = []
        for p in parts:
            if runs and len(runs[-1]) == 1 and HEADING_RE.search(runs[-1][0]["text"].strip()):
                runs[-1] = runs[-1] + p
            else:
                runs.append(list(p))
        jumps_follow = all(_same_subject([x for p in runs[:k] for x in p], runs[k]) for k in range(1, len(runs))
                           if runs[k][0]["s"] - runs[k - 1][-1]["e"] > 10)
        if not (NUMBER_RE.search(first) or "?" in first) or (len(parts) == 2 and len(parts[-1]) < 2) \
                or any(LEANS_RE.search(b[0]["text"]) and b[0]["s"] - a[-1]["e"] > 10 for a, b in zip(parts, parts[1:])) \
                or not jumps_follow:
            score -= 30
            why.append("the jump does not follow")
    return score, why


STOP = {"about", "around", "there", "their", "which", "would", "could", "should", "these", "those", "every", "where",
        "average", "really", "thing", "things", "people", "going", "being", "still", "first", "right", "while"}


def _same_subject(a: list[dict[str, Any]], b: list[dict[str, Any]]) -> bool:
    """a setup and a payoff belong together when they share a figure, or two words that carry meaning"""
    def words(part):
        return {w for x in part for w in re.findall(r"[a-z][a-z'-]{4,}", x["text"].lower())} - STOP
    def figs(part):
        return {m.group(0) for x in part for m in NUMBER_RE.finditer(x["text"])}
    return bool(figs(a) & figs(b)) or len(words(a) & words(b)) >= 2


def _first_of(sc: dict[str, Any], sents: list[dict[str, Any]]) -> dict[str, Any] | None:
    return next((x for x in sents if x["scene"] == sc["id"]), None)


_SENTS: dict[int, list[dict[str, Any]]] = {}


def _all_sents(sc: dict[str, Any]) -> list[dict[str, Any]]:
    """the sentences of one scene (set by the planner for the storyboard it is planning)"""
    return _SENTS.get(sc["id"], [])


def sentence_hook(parts: list[list[dict[str, Any]]], by_id: dict[int, dict[str, Any]]) -> str:
    """A takeaway's title if the slice shows one, else the first sentence (its first clause, at most 9 words)."""
    for x in (x for part in parts for x in part):
        sc = by_id[x["scene"]]
        if sc["type"] == "takeaway" and sc["props"].get("title") and x is _first_of(sc, _all_sents(sc)):
            return str(sc["props"]["title"])
    line = caption_line(parts[0][0]["text"], 9)
    return line[:1].upper() + line[1:] if line else "Watch this"


def _numbers(parts: list[list[dict[str, Any]]]) -> set[str]:
    return {re.sub(r"[^\d.%£$€kmb]", "", m.group(0).lower()) for part in parts for x in part for m in NUMBER_RE.finditer(x["text"])}


def plan_sentence_shorts(sb: dict[str, Any], want: int = 3, sents: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    """The best `want` slices cut on sentences: a run of sentences, or one to three sentences of setup then a later run
    that lands the payoff (the middle skipped). Slices do not overlap in time or rest on the same figures."""
    sents = sents if sents is not None else sentences(sb)
    by_id = {sc["id"]: sc for sc in sb["scenes"]}
    _SENTS.clear()
    for x in sents:
        _SENTS.setdefault(x["scene"], []).append(x)
    tags = _traced_tags()
    n = len(sents)
    cands: list[dict[str, Any]] = []

    def add(parts: list[list[dict[str, Any]]]) -> None:
        dur = sum(p[-1]["e"] - p[0]["s"] for p in parts)
        if not (MIN_SEC <= dur <= MAX_SEC):
            return
        score, why = score_sentences(parts, by_id, tags)
        cands.append({"spans": [[round(p[0]["s"], 3), round(p[-1]["e"], 3)] for p in parts],
                      "scenes": list(dict.fromkeys(x["scene"] for p in parts for x in p)),
                      "seconds": round(dur, 1), "score": score, "why": why, "hook": sentence_hook(parts, by_id),
                      "first": parts[0][0]["text"], "last": parts[-1][-1]["text"], "_parts": parts})

    for i in range(n):
        for j in range(i, n):
            if sents[j]["e"] - sents[i]["s"] > MAX_SEC:
                break
            add([sents[i:j + 1]])
            # setup (i..j, at most three sentences), then a jump to a later run that lands it, within a minute
            if j - i < 3:
                for a in range(j + 2, n):
                    if sents[a]["s"] - sents[j]["e"] > 60:
                        break
                    for b in range(a, n):
                        if (sents[j]["e"] - sents[i]["s"]) + (sents[b]["e"] - sents[a]["s"]) > MAX_SEC:
                            break
                        if b - a < 6:
                            add([sents[i:j + 1], sents[a:b + 1]])
    cands.sort(key=lambda c: (-c["score"], c["seconds"]))
    picked: list[dict[str, Any]] = []
    for c in cands:
        overlap = any(a0 < b1 and b0 < a1 for p in picked for a0, a1 in c["spans"] for b0, b1 in p["spans"])
        if overlap or any(_numbers(c["_parts"]) & _numbers(p["_parts"]) for p in picked):
            continue
        picked.append(c)
        if len(picked) >= want:
            break
    picked.sort(key=lambda c: c["spans"][0][0])
    for k, c in enumerate(picked, 1):
        c["name"] = f"short-{k}"
        c["start"], c["end"] = c["spans"][0][0], c["spans"][-1][1]
        c["score"] = max(0, min(100, c["score"]))
        del c["_parts"]
    return picked


def cut_spans(sb: dict[str, Any], spans: list[list[float]], hook: str | None = None, name: str = "short-1", lead: float = 0.4, tail: float = 0.8) -> tuple[dict[str, Any], list[tuple[float, float]]]:
    """A storyboard of the stretches of time `spans` [(start, end), ...]: every scene they touch, trimmed to the stretch
    and re-timed to follow on from `lead`, captions on, the hook on top. A trimmed scene starts its own animation
    from the cut, and anything cued before the cut appears at once. Two pieces of the same scene in a row (a sentence
    skipped inside it) stay one scene, so its card does not draw itself again; a sliver of a scene under a quarter of
    a second goes to its neighbour. Also the voiceover spans to keep, in order."""
    pieces: list[list[Any]] = []  # [scene, a, b, span index]
    for k, (s0, e0) in enumerate(spans):
        mine = [[sc, max(s0, sc["start"]), min(e0, sc["end"]), k] for sc in sb["scenes"] if min(e0, sc["end"]) - max(s0, sc["start"]) > 0.01]
        for i, p in enumerate(mine):
            if p[2] - p[1] < 0.25 and len(mine) > 1:
                nb = mine[i - 1] if i > 0 else mine[i + 1]
                nb[1], nb[2] = min(nb[1], p[1]), max(nb[2], p[2])
                p[3] = None
        pieces += [p for p in mine if p[3] is not None]
    if not pieces:
        raise ValueError("no scenes to cut")
    out = {k: copy.deepcopy(v) for k, v in sb.items() if k not in ("scenes", "mouth", "visemes")}
    keep: list[dict[str, Any]] = []
    audio: list[tuple[float, float]] = []
    t = lead
    for sc, a, b, _ in pieces:
        shift = t - a
        words = [dict(w, s=round(w["s"] + shift, 3), e=round(w["e"] + shift, 3)) for w in sc.get("words") or [] if w["s"] >= a - 0.05 and w["e"] <= b + 0.05]
        if keep and keep[-1]["src"] == sc["id"]:
            c = keep[-1]
            c["words"] += words
            c["_pieces"].append((a, b, shift))
        else:
            c = copy.deepcopy(sc)
            c["words"] = words
            c["_pieces"] = [(a, b, shift)]
            c["start"] = round(t, 3)
            c["src"] = sc["id"]
            c["id"] = len(keep) + 1
            keep.append(c)
        c["end"] = round(b + shift, 3)
        c["narration"] = " ".join(str(w["w"]) for w in c["words"]) or sc.get("narration", "")
        audio.append((a, b))
        t = c["end"]
    for c in keep:
        # a cue moves with the piece of the scene it falls in; one cued before the cut lands at the cut (at once), one in
        # a part that was skipped or after the last piece is dropped (a card for a sentence the Short leaves out)
        pieces_ = c.pop("_pieces")
        cues = []
        for cue in c.get("cues", []) or []:
            if "t" not in cue:
                cues.append(cue)
                continue
            a0, _, s0 = pieces_[0]
            if cue["t"] < a0:
                cues.append(dict(cue, t=round(a0 + s0, 3)))
                continue
            hit = next(((pa, sh) for pa, pb, sh in pieces_ if pa - 0.05 <= cue["t"] <= pb + 0.05), None)
            if hit:
                cues.append(dict(cue, t=round(max(hit[0], cue["t"]) + hit[1], 3)))
        c["cues"] = cues
    out["scenes"] = keep
    out["durationSec"] = round(t + tail, 3)
    out["captions"] = True
    out["hook"] = hook or hook_for(keep)
    out["short"] = name
    out["mouth"] = []
    out["visemes"] = []
    return out, audio


SHORT_SPEED = 1.2  # Shorts play the voice a little faster than the long video: tighter, and the pitch stays the same


def speed_up(cut: dict[str, Any], speed: float) -> dict[str, Any]:
    """The cut storyboard on a timeline `speed` times faster: every scene, word and cue time divided by it, so the
    pictures land on the words of a voice sped up by the same amount (ffmpeg atempo keeps the pitch)."""
    if abs(speed - 1.0) < 1e-6:
        return cut
    out = copy.deepcopy(cut)
    for sc in out["scenes"]:
        sc["start"], sc["end"] = round(sc["start"] / speed, 3), round(sc["end"] / speed, 3)
        for w in sc.get("words") or []:
            w["s"], w["e"] = round(w["s"] / speed, 3), round(w["e"] / speed, 3)
        for c in sc.get("cues") or []:
            if "t" in c:
                c["t"] = round(c["t"] / speed, 3)
    out["durationSec"] = round(out["durationSec"] / speed, 3)
    out["speed"] = speed
    return out


# --- the character on a Short -----------------------------------------------------------------------------------------

HAPPY = {"thumbs-up", "fist-pump", "arms-up", "jump", "phone-excited", "relieved", "idea"}  # these land with a little hop
FOOTAGE = {"broll", "clip", "still", "image"}


def short_time(t: float, spans: list[tuple[float, float]], lead: float = 0.4, speed: float = 1.0) -> float | None:
    """where a moment of the long video (seconds) falls in the Short cut from `spans`, or None if it was cut out"""
    at = lead
    for a, b in spans:
        if a - 0.05 <= t <= b + 0.05:
            return round((at + max(0.0, t - a)) / speed, 3)
        at += b - a
    return None


def _inbetweens() -> dict[str, list[str]]:
    here = os.path.dirname(os.path.abspath(__file__))
    mf = os.path.join(os.path.dirname(here), "library", "poses", "manifest.json")
    out: dict[str, list[str]] = {}
    if os.path.exists(mf):
        for e in json.load(open(mf, encoding="utf-8")):
            if e.get("into") and e["name"] != "jump-air" and e["name"] != "jump-crouch":
                out.setdefault(e["into"], []).append(e["name"])
    return {k: sorted(v) for k, v in out.items()}


def pose_track(cues: list[list[Any]], spans: list[tuple[float, float]], lead: float = 0.4, speed: float = 1.0, fps: int = 30) -> list[dict[str, Any]]:
    """The character's track for a Short from `cues` [[seconds in the long video, pose], ...]: each pose lands on its
    word, the in-between drawings of that pose (fist-pump-1, -2, ...) play on twos just before it, `jump` is a crouch,
    a leap and a landing with arms up, and happy poses land with a hop. Cues in a part that was cut out are dropped."""
    ib = _inbetweens()
    step = 4 / fps  # each in-between held four frames: two drawings on twos
    track: list[dict[str, Any]] = []
    for t, pose in sorted(cues, key=lambda c: c[0]):
        at = short_time(float(t), spans, lead, speed)
        if at is None:
            continue
        if pose == "jump":
            track += [{"t": round(max(0.0, at - step), 3), "pose": "jump-crouch", "ib": True},
                      {"t": at, "pose": "jump-air", "ib": True, "arc": round(0.4, 3)},
                      {"t": round(at + 0.4, 3), "pose": "arms-up", "hop": False}]
            continue
        before = ib.get(pose, [])
        for k, name in enumerate(before):
            track.append({"t": round(max(0.0, at - step * (len(before) - k)), 3), "pose": name, "ib": True})
        track.append({"t": at, "pose": pose, "hop": pose in HAPPY})
    track.sort(key=lambda c: c["t"])
    # an in-between pushed before the previous key would undo it: keep the order of the words
    out: list[dict[str, Any]] = []
    for c in track:
        if out and c["t"] <= out[-1]["t"]:
            c = dict(c, t=round(out[-1]["t"] + 1 / fps, 3))
        out.append(c)
    return out
