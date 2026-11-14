"""Shorts cut and checked before anything is rendered.

    python -m pipeline.shortcut projects/<name> [--plan FILE] [--pick NAME] [--out DIR]

A Short that started or ended inside a sentence used to be found after the long render, 25 minutes in. Now the build
(pipeline/build.py) cuts every Short straight after the long video is timed and checks each cut's two ends on the
word times and on the sound itself, in seconds: `cut_shorts` is the cut half of what build.render_shorts did (the
plan, the snap onto pauses, the cut, the speed, the poses, the cut audio, the punch-ins and the props JSON in the
project's .cache), `check_edges` is the check, and what it found is written to shorts-check.md beside
shorts-plan.json.

Run on its own, as above, it checks the picks against the files the render run committed, timing.json and
voice-preview.mp3: the runner's clock, which is the one the seconds in shorts.json must be typed on (storyboard.json
is local and its clock can sit seconds away). With --out it also writes each Short's cut audio there to listen to,
with the check's report. It changes nothing in the project. It exits 1 when a Short would be held back.

Who can be held back: a fault stops a Short only when its seconds were typed as spans and the voice was made by the
pipeline (voice.json), where every word said is the script's own. A pick by scenes, and any video built on a
recording, gets warnings only, so nothing already published is ever blocked.

Which clock: a video timed from the voice's own timestamps (`timing: exact` in the script, pipeline/exact.py) has
every word somewhere else than the transcriber put it, by a fraction of a second and by whole seconds where a pause
was left in. Seconds typed for it count only when shorts.json says so at its top, `"clock": "exact"`; without that
line a pick by spans is faulted, "these seconds were typed on the transcriber's clock", whatever they land on.
"""
from __future__ import annotations

import argparse
import difflib
import json
import os
import re
import sys
import tempfile
from typing import Any

import numpy as np

from . import sfx
from .shorts import LEANS_RE, SENT_LEAD, SHORT_SPEED, cut_short, cut_spans, plan_shorts, pose_track, speed_up
from .voice import read, rms_db, snap_spans, write

LEAD, TAIL = 0.4, 0.8  # the room before a Short's first word and after its last (cut_spans, cut_short and the cut audio)
LONGEST, SHORTEST = 60.0, 15.0  # a Short runs a minute at most; under 15 seconds it rarely holds a whole thought
EDGE = 0.04  # this much of the Short, in from each end, must be quiet: a cut in sound clips a word
PAUSE = 0.12  # a pause shorter than this can be the stop inside a word ("six-ty"): worth a listen
NEAR = 0.05  # a word is in a stretch when it lies inside it give or take this (the margin cut_spans keeps words by)
SR, WIN = 16000, 480  # the measure snap_spans uses: 30 ms frames at 16 kHz

END_RE = re.compile(r"[.!?…][\"'”’)]*$")  # a word that ends a sentence (as pipeline/shorts.sentences reads one, and curly quotes)
# a last sentence that was true on the day: a Short is watched for months ("due to" is a reason, not a date)
TIME_RE = re.compile(r"\b(?:so far|today|tonight|tomorrow|yesterday|this (?:week|month|morning|year)|right now|at the moment|yet|as of|due(?! to\b))\b", re.I)


def _n(w: str) -> str:
    return re.sub(r"[^\w']", "", str(w).lower())


def _brief(text: str, head: int = 5, tail: int = 3) -> str:
    """A long run of words by its first and last few, so a line of the report stays a line."""
    ws = text.split()
    return text if len(ws) <= head + tail + 1 else " ".join(ws[:head]) + " ... " + " ".join(ws[-tail:])


class Sound:
    """The voice measured once, exactly as snap_spans measures it: 30 ms frames, quiet under the same threshold. The
    snap and the check then agree on what a pause is, and the file is decoded once, not once per Short."""

    def __init__(self, path: str):
        self.path = path
        self._x = read(path, SR)
        db = rms_db(self._x, WIN)
        self.quiet = db < min(float(np.percentile(db, 10)) + 12, -40)
        self._tmp: tempfile.TemporaryDirectory | None = None

    def snap(self, spans: list[tuple[float, float]]) -> list[tuple[float, float]]:
        """snap_spans on this voice. It reads its file on every call, so it is handed the samples already decoded as
        a small wav: the same samples, so the same answer as on the file itself."""
        if self._tmp is None:
            self._tmp = tempfile.TemporaryDirectory(prefix="shortcut-")
            write(os.path.join(self._tmp.name, "voice-16k.wav"), self._x, SR)
        return snap_spans(spans, os.path.join(self._tmp.name, "voice-16k.wav"))

    def close(self) -> None:
        if self._tmp is not None:
            self._tmp.cleanup()
            self._tmp = None

    def _quiet(self, i: int) -> bool:
        return i < 0 or i >= len(self.quiet) or bool(self.quiet[i])

    def loud(self, t: float, start: bool) -> bool:
        """Whether there is sound in the EDGE seconds of the Short next to the edge at `t` (after a start, before an
        end). An edge the snap moved sits on two quiet frames on that side, so it never reads as loud."""
        n = int(round(t * SR))
        a, b = (n, n + int(EDGE * SR) - 1) if start else (n - int(EDGE * SR), n - 1)
        return any(not self._quiet(i) for i in range(a // WIN, b // WIN + 1))

    def pause(self, t: float, most: float = 1.0) -> float:
        """Seconds of unbroken quiet around `t`, both sides together (0 when `t` is in sound), up to `most` a side."""
        n = int(round(t * SR))
        left, right = (n - 1) // WIN, n // WIN
        if left == right and not self._quiet(left):
            return 0.0
        cap = int(most * SR / WIN)
        before = after = 0
        while before < cap and self._quiet(left - before):
            before += 1
        while after < cap and self._quiet(right + after):
            after += 1
        return round((before + after - (1 if left == right else 0)) * WIN / SR, 3)


def load_plan(plan_path: str | None, sb: dict[str, Any], want: int) -> tuple[list[dict[str, Any]], bool]:
    """The picks to cut: the list in `plan_path` (shorts.json, the studio's picks, each {scenes or spans, hook, name};
    a "speed" at the top is for all of them, and so is a "clock": the clock their seconds were typed on), else the
    planner's best `want`. Also whether a person typed them."""
    plan = None
    if plan_path and os.path.exists(plan_path):
        with open(plan_path, encoding="utf-8") as f:
            plan = json.load(f)
        if isinstance(plan, dict):
            top_speed, top_clock = plan.get("speed"), plan.get("clock")
            plan = plan.get("shorts") or []
            if top_speed is not None:
                plan = [dict({"speed": top_speed}, **p) for p in plan]
            if top_clock is not None:
                plan = [dict({"clock": top_clock}, **p) for p in plan]
    if plan:
        return plan, True
    return plan_shorts(sb, want), False


def picked(plan: list[dict[str, Any]], picks: list[str] | None) -> list[tuple[str, dict[str, Any]]]:
    """(name, pick) for every Short in the plan, or only for the names asked for with --pick. A name that is not in
    the plan stops the run here, before anything is cut or rendered."""
    named = [(short.get("name") or f"short-{k}", short) for k, short in enumerate(plan, 1)]
    if not picks:
        return named
    unknown = [p for p in picks if p not in [n for n, _ in named]]
    if unknown:
        raise SystemExit(f"--pick {', '.join(unknown)}: no Short of that name in the plan (it has {', '.join(n for n, _ in named) or 'none'})")
    return [(n, short) for n, short in named if n in picks]


def runs(spans: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Stretches that follow straight on from each other (scenes side by side) as one: only its two ends are edges."""
    out: list[tuple[float, float]] = []
    for a, b in spans:
        if out and abs(out[-1][1] - a) < 1e-3:
            out[-1] = (out[-1][0], float(b))
        else:
            out.append((float(a), float(b)))
    return out


def cut_one(sb: dict[str, Any], short: dict[str, Any], name: str, sound: Sound | None) -> tuple[dict[str, Any], list[tuple[float, float]], list[tuple[float, float]], float] | None:
    """One pick cut: the Short's storyboard at its speed with its poses, the stretches of the voice to keep, the
    stretches whose ends are the Short's edges (the spans after the snap, or the picked scenes), and the speed.
    None for a pick with neither spans nor scenes."""
    ids = [int(x) for x in short.get("scenes", [])]
    if short.get("spans"):
        # cut on sentences: stretches of time, which may start or end inside a scene or skip a middle part
        spans_in = [tuple(x) for x in short["spans"]]
        if sound:
            # each edge on a pause measured in the sound: the transcript's word times can run early
            spans_in = sound.snap(spans_in)
        cut, spans = cut_spans(sb, spans_in, short.get("hook"), name)
        pieces = [(float(a), float(b)) for a, b in spans_in]
    elif ids:
        cut, spans = cut_short(sb, ids, short.get("hook"), name)
        pieces = runs(spans)
    else:
        return None
    # a Short plays a little faster than the long video (shorts.json "speed", per pick or for all; 1 = as recorded)
    speed = float(short.get("speed", SHORT_SPEED))
    cut = speed_up(cut, speed)
    if short.get("poses"):
        # the character, posing on the words (shorts.json "poses": [[seconds in the long video, pose], ...])
        cut["poses"] = pose_track(short["poses"], spans, LEAD, speed, int(sb.get("fps", 30)))
    return cut, spans, pieces, speed


# --- the check --------------------------------------------------------------------------------------------------------

def spoken(sb: dict[str, Any]) -> list[dict[str, Any]]:
    """Every caption word of the long video in the order it is said, with its scene. When the captions follow a
    recording (voice.take_words), a scene can end on a copy of the next scene's first small word, timed after the
    scene's own end ("...taken 23%. There" then "There are..."): that copy is left out, it is said once."""
    out: list[dict[str, Any]] = []
    scenes = [sc for sc in sb["scenes"] if sc.get("words")]
    for k, sc in enumerate(scenes):
        ws = list(sc["words"])
        nxt = scenes[k + 1]["words"][0] if k + 1 < len(scenes) else None
        if nxt and len(ws) > 1 and float(ws[-1]["e"]) > float(sc["end"]) + 0.2 and _n(ws[-1]["w"]) == _n(nxt["w"]) and not END_RE.search(str(ws[-1]["w"])):
            ws = ws[:-1]
        out += [{"w": str(w["w"]), "s": float(w["s"]), "e": float(w["e"]), "scene": sc["id"]} for w in ws]
    return out


def _off_script(sb: dict[str, Any], cut: dict[str, Any]) -> list[str]:
    """The Short's caption words that the script does not have, scene by scene. A made voice says the script word
    for word, so a caption that differs is the transcript mishearing it ("The The board")."""
    script = {sc["id"]: [_n(w) for w in str(sc.get("narration") or "").split()] for sc in sb["scenes"]}
    odd: list[str] = []
    for c in cut["scenes"]:
        mine = c.get("words") or []
        for op, _, _, j1, j2 in difflib.SequenceMatcher(None, script.get(c.get("src", c["id"]), []), [_n(w["w"]) for w in mine], autojunk=False).get_opcodes():
            if op in ("replace", "insert"):
                odd += [f'"{w["w"]}" ({float(w["s"]):.1f} s into the Short)' for w in mine[j1:j2]]
    return odd


def check_edges(sb: dict[str, Any], short: dict[str, Any], name: str, pieces: list[tuple[float, float]], cut: dict[str, Any],
                sound: Sound | None = None, made: bool = False, typed: bool = True) -> dict[str, Any]:
    """What a viewer gets at each end of a Short, read on the stretches it is cut on (`pieces`: the spans after the
    snap, or the picked scenes) against the long video's words (`sb`: the storyboard, or timing.json) and the sound;
    `cut` is the Short's own storyboard (cut_one).

    Faults: a first word that does not start a sentence, a last word that does not end one, words of the next
    sentence inside the cut, a word an edge cuts through, sound in the 40 ms inside an edge, a length over 60 s.
    Warnings: under 120 ms of quiet at an edge, under 15 s, an opener that leans on what came before (with the same
    Short one sentence later, ready to type), a last sentence that dates ("so far", "today"), and for a made voice
    caption words the script does not have. A fault stays a fault only for seconds typed as spans on a made voice;
    for anything else it is listed with the warnings and nothing is held back.

    Seconds are also only as good as the clock they were typed on. `sb` says which clock the long video is on
    (`clock: exact` when it was timed from the voice's own timestamps, else the transcriber's) and the pick says
    which one its seconds were read from (`"clock"`, from the top of shorts.json). When the two differ the Short is
    faulted whatever its ends land on: the same seconds are other words now.

    The transcript's word times can sit most of a second from the sound. So where the sound itself shows a real
    pause at an edge, a word the transcript lays across that edge is not counted as cut: the sound is the witness."""
    seconds, speed = float(cut["durationSec"]), float(cut.get("speed") or 1.0)
    flat = spoken(sb)
    ends = [bool(END_RE.search(w["w"])) for w in flat]
    # a transcript made into a script has hardly a full stop in it (one in 45 words, where a written script has one
    # in 11): its sentences cannot be read from the captions, so they are not judged
    loose = len(flat) > 40 and len(flat) > 20 * sum(ends)
    if ends:
        ends[-1] = True  # the last word of the video ends its sentence, full stop or not
    by_spans = bool(short.get("spans"))
    ids = {int(x) for x in short.get("scenes", [])}
    where = {sc["id"]: (float(sc["start"]), float(sc["end"])) for sc in sb["scenes"]}
    say = lambda i, j: " ".join(w["w"] for w in flat[max(0, i):max(0, j)])  # noqa: E731
    faults: list[str] = []
    warnings: list[str] = []
    video_exact, typed_exact = str(sb.get("clock") or "").lower() == "exact", str(short.get("clock") or "").lower() == "exact"
    if by_spans and typed and video_exact and not typed_exact:
        faults.append("these seconds were typed on the transcriber's clock, and this video is timed from the voice's own timestamps (timing: exact), "
                      "where every word sits somewhere else. Read the seconds again from this build's words (timing.json, or the first and last words here), "
                      'then put "clock": "exact" at the top of shorts.json')
    elif by_spans and typed and typed_exact and not video_exact:
        faults.append('these seconds were typed on the exact clock (shorts.json says "clock": "exact"), and this video is timed by the transcriber, '
                      "where every word sits somewhere else. Read the seconds again from this build's words, and take the clock line out of shorts.json")
    said: list[int] = []
    tail: tuple[int, int] | None = None  # the first and last word of the last piece that has words
    first = last = ""
    for n, (a, b) in enumerate(pieces):
        tag = "" if len(pieces) == 1 else f"piece {n + 1}: "
        if by_spans:
            inside = [i for i, w in enumerate(flat) if w["s"] >= a - NEAR and w["e"] <= b + NEAR]
        else:
            inside = [i for i, w in enumerate(flat) if w["scene"] in ids and where[w["scene"]][0] >= a - 1e-3 and where[w["scene"]][1] <= b + 1e-3]
        for t, side in ((a, "start"), (b, "end")):
            through = [w for w in flat if w["s"] < t - NEAR and w["e"] > t + NEAR]
            if through and not (sound and sound.pause(t) >= PAUSE):
                faults.append(f'{tag}the {side} cuts through "{through[0]["w"]}" (said from {through[0]["s"]:.2f} to {through[0]["e"]:.2f} s, the cut is at {t:.2f})')
            if sound and sound.loud(t, side == "start"):
                faults.append(f"{tag}the {side} at {t:.2f} s is in sound, not on a pause: the {'first' if side == 'start' else 'last'} {EDGE * 1000:.0f} ms of the Short are not quiet")
            elif sound and sound.pause(t) < PAUSE:
                warnings.append(f"{tag}only {sound.pause(t) * 1000:.0f} ms of quiet at the {side} ({t:.2f} s): a pause that short can be the stop inside a word, listen to it")
        if not inside:
            warnings.append(f"{tag}no words are said between {a:.2f} and {b:.2f} s")
            continue
        i0, i1 = inside[0], inside[-1]
        if i0 > 0 and not ends[i0 - 1] and not loose:
            k = i0
            while k > 0 and not ends[k - 1]:
                k -= 1
            faults.append(f'{tag}starts {i0 - k} word{"s" if i0 - k != 1 else ""} into a sentence: "{say(max(k, i0 - 6), i0)} | {say(i0, i0 + 4)}..."')
        if not ends[i1] and not loose:
            k = i1
            while k >= i0 and not ends[k]:
                k -= 1
            if k >= i0:
                faults.append(f'{tag}ends {i1 - k} word{"s" if i1 - k != 1 else ""} into the next sentence: "...{say(max(i0, k - 2), k + 1)} | {_brief(say(k + 1, i1 + 1))}"')
            else:
                faults.append(f'{tag}ends inside a sentence: its last word "{flat[i1]["w"]}" does not end one (the sentence goes on "{say(i1 + 1, i1 + 4)}...")')
        if not said:
            first = say(i0, min(i0 + 5, i1 + 1))
            # an opener that leans on what came before: someone swiping in has not heard it
            k = next((i for i in range(i0, i1 + 1) if ends[i]), i1)
            lean = LEANS_RE.search(say(i0, k + 1).lstrip("\"'([“‘"))
            if lean:
                warnings.append(f'opens on "{lean.group(0)}", which leans on what came before: a viewer swiping in has not heard it. '
                                + _later(flat, ends, k, i1, pieces, short, sound, seconds, speed))
        last = say(max(i0, i1 - 4), i1 + 1)
        tail = (i0, i1)
        said += inside
    if loose and said:
        warnings.append(f"the captions have about one full stop in {len(flat) // max(1, sum(ends))} words (a transcript made into a script), so whether this Short starts and ends on a sentence cannot be read from them: listen to it")
    if seconds > LONGEST:
        faults.append(f"{seconds:.1f} s long: a Short is {LONGEST:.0f} s at most")
    elif seconds < SHORTEST:
        warnings.append(f"only {seconds:.1f} s long: under {SHORTEST:.0f} s rarely holds a whole thought")
    if tail:
        i0, i1 = tail
        k = i1 - 1
        while k >= i0 and not ends[k]:
            k -= 1
        dated = TIME_RE.search(say(k + 1, i1 + 1))
        if dated:
            warnings.append(f'the last sentence says "{dated.group(0)}" ("{_brief(say(k + 1, i1 + 1), 6, 6)}"): true on the day, and a Short is watched for months')
        if made:
            odd = _off_script(sb, cut)
            if odd:
                warnings.append(f"caption words that are not in the script: {', '.join(odd[:8])}{' and more' if len(odd) > 8 else ''} (a made voice says the script word for word)")
    if not (made and typed and by_spans):
        # a pick by scenes, the planner's own pick, or a video built on a recording: told, never held back
        warnings, faults = faults + warnings, []
    return {"name": name, "asked": short.get("spans") or sorted(ids), "by": "spans" if by_spans else "scenes", "pieces": [(round(a, 3), round(b, 3)) for a, b in pieces],
            "seconds": round(float(seconds), 3), "first": first, "last": last, "faults": faults, "warnings": warnings}


def _later(flat: list[dict[str, Any]], ends: list[bool], k: int, i1: int, pieces: list[tuple[float, float]], short: dict[str, Any],
           sound: Sound | None, seconds: float, speed: float) -> str:
    """The same Short starting one sentence later, ready to type into shorts.json: its seconds and its first five
    words. `k` is the last word of the sentence it opens on now. Nothing is changed."""
    j = k + 1
    if j > i1:
        return "There is no later sentence in it to start on."
    a, b = pieces[0]
    start = round(max(0.0, flat[j]["s"] - SENT_LEAD), 2)
    lands = sound.snap([(start, b)])[0][0] if sound else start
    rest = [list(x) for x in short["spans"]] if short.get("spans") else [[round(x, 2), round(y, 2)] for x, y in pieces]
    alt = [[start, rest[0][1]]] + rest[1:]
    words = [w for w in flat if w["s"] >= lands - NEAR and w["e"] <= b + NEAR]
    through = any(w["s"] < lands - NEAR and w["e"] > lands + NEAR for w in flat) and not (sound and sound.pause(lands) >= PAUSE)
    clean = bool(words) and words[0] is flat[j] and not through and not (sound and sound.loud(lands, True))
    return (f'Ready alternative, one sentence later: "spans": {json.dumps(alt)} ({seconds - (lands - a) / speed:.1f} s), starting "{" ".join(w["w"] for w in flat[j:min(j + 5, i1 + 1)])}".'
            + ("" if clean else " Listen to it first: that start is not on a clean pause."))


def _unchecked(name: str, short: dict[str, Any], pieces: list[tuple[float, float]], cut: dict[str, Any], e: Exception) -> dict[str, Any]:
    """The verdict for a Short the check itself tripped on: it is rendered as it was before there was a check, and
    says so. The check must never cost a Short."""
    return {"name": name, "asked": short.get("spans") or [int(x) for x in short.get("scenes", [])], "by": "spans" if short.get("spans") else "scenes",
            "pieces": [(round(a, 3), round(b, 3)) for a, b in pieces], "seconds": round(float(cut["durationSec"]), 3), "first": "", "last": "",
            "faults": [], "warnings": [f"this Short was not checked: the check itself failed ({type(e).__name__}: {e})"]}


def lines(v: dict[str, Any], held: bool = False) -> list[str]:
    """One Short's verdict as plain lines: its seconds, where it is cut, its first and last five words, what was found."""
    state = ("FAULT, held back" if held else "FAULT") if v["faults"] else (f"{len(v['warnings'])} warning{'s' if len(v['warnings']) != 1 else ''}" if v["warnings"] else "ok")
    if v.get("failed"):
        return [f"{v['name']}: {state}"] + [f"  FAULT: {x}" for x in v["faults"]]
    out = [f"{v['name']}: {v['seconds']:.1f} s, {state}",
           f"  picked by {v['by']} {json.dumps(v['asked'])}, cut on {json.dumps([list(p) for p in v['pieces']])}",
           f'  first words: "{v["first"]}"',
           f'  last words:  "{v["last"]}"']
    out += [f"  FAULT: {x}" for x in v["faults"]] + [f"  warning: {x}" for x in v["warnings"]]
    if v.get("audio"):
        out.append(f"  listen: {v['audio']}")
    return out


def held_back(checks: list[dict[str, Any]], force: bool = False) -> list[str]:
    """The names of the Shorts a build does not render: a fault and no --force-shorts, or a pick that could not be cut."""
    return [v["name"] for v in checks if v["faults"] and (v.get("failed") or not force)]


def summary(checks: list[dict[str, Any]], force: bool = False, alone: bool = False) -> list[str]:
    """The loud lines for the end of a log: which Shorts have a fault, and whether they are held back (not rendered)
    or let through with --force-shorts. `alone` is the check run on its own, where nothing is rendered either way."""
    bad = [v for v in checks if v["faults"]]
    if not bad:
        return []
    bar = "=" * 100
    held, forced = held_back(checks, force), [v["name"] for v in bad if force and not v.get("failed")]
    out = [bar]
    if alone:
        out.append(f"SHORTS A BUILD WOULD HOLD BACK: {', '.join(held)}")
    else:
        out += [f"SHORTS HELD BACK: {', '.join(held)}"] * bool(held) + [f"SHORTS WITH A FAULT, NOT HELD BACK (--force-shorts): {', '.join(forced)}"] * bool(forced)
    out += [f"  {v['name']}: {x}" for v in bad for x in v["faults"]]
    if alone:
        out.append("This was the check on its own: nothing was rendered and nothing in the project was changed. Move the seconds in shorts.json onto whole sentences and check again.")
    elif held:
        out.append("The long video and the other Shorts are not affected. Move the seconds in shorts.json onto whole sentences (shorts-check.md has the detail) and run again with --only-shorts --pick NAME, or render them as they are with --force-shorts.")
    return out + [bar]


def write_check(path: str, slug: str, checks: list[dict[str, Any]], clock: str, force: bool = False, only: list[str] | None = None, alone: bool = False) -> None:
    """shorts-check.md: every checked Short's seconds, its first and last five words and what the check found."""
    held, forced = held_back(checks, force), [v["name"] for v in checks if v["faults"] and force and not v.get("failed")]
    md = [f"# Shorts check: {slug}", "",
          f"Checked before any render, on {clock}. Each Short's two ends are read against the long video's words and the sound itself.", ""]
    if only:
        md += [f"Only {', '.join(only)} was asked for (--pick). The other Shorts were not cut or checked this time.", ""]
    if held:
        md += [f"**{'A build would hold back' if alone else 'Held back'}: {', '.join(held)}.** "
               "Move the seconds in shorts.json onto whole sentences and run again, or render a Short as it is with `--force-shorts`.", ""]
    if forced:
        md += [f"**Has a fault, not held back (--force-shorts): {', '.join(forced)}.**", ""]
    if not held and not forced:
        md += ["No Short is held back.", ""]
    md += ["A fault holds a Short back only when its seconds are typed as spans and the voice was made by the pipeline. "
           "A pick by scenes, and a video built on a recording, gets warnings only.", ""]
    for v in checks:
        rows = lines(v, held=v["name"] in held and not alone)
        md += [f"## {rows[0]}", ""] + [f"- {r.strip()}" for r in rows[1:]] + [""]
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(md))


def cut_shorts(project: str, sb: dict[str, Any], audio: str | None, plan_path: str | None, want: int, public_dir: str,
               picks: list[str] | None = None, force: bool = False) -> list[dict[str, Any]]:
    """Cut the Shorts and check them, rendering nothing: the slices in `shorts.json` (the studio's picks, each {scenes
    or spans, hook, name}), else the planner's best `want`; only the names in `picks` when given. Writes the plan back
    as shorts-plan.json, each Short's audio into `public_dir`, its props as .cache/<name>.json, and what the check
    found as shorts-check.md. Returns one entry per Short cut: {name, props, out, check, skip}; `skip` is set for a
    Short with a fault, unless `force`."""
    from .build import find_audio, keep_spans, made_voice, mix_music  # at call time: build imports this module
    slug = sb["slug"]
    plan, typed = load_plan(plan_path, sb, want)
    with open(os.path.join(project, "shorts-plan.json"), "w", encoding="utf-8") as f:
        json.dump(plan, f, indent=1)
    todo = picked(plan, picks)
    sound = Sound(audio) if audio else None
    made = made_voice(project, find_audio(project))
    cuts: list[dict[str, Any]] = []
    try:
        for name, short in todo:
            props = os.path.join(project, ".cache", f"{name}.json")
            out = os.path.join(project, f"{slug}-{name}.mp4")
            try:
                one = cut_one(sb, short, name, sound)
                if one is None:
                    continue
                cut, spans, pieces, speed = one
                if audio:
                    os.makedirs(public_dir, exist_ok=True)
                    keep_spans(audio, os.path.join(public_dir, f"{name}.mp3"), spans, LEAD, TAIL, speed)
                    if sb.get("music"):
                        mix_music(os.path.join(public_dir, f"{name}.mp3"), sb["music"], os.path.join(public_dir, f"{name}-mix.mp3"), float(sb.get("musicDb", -20.0)))
                        os.replace(os.path.join(public_dir, f"{name}-mix.mp3"), os.path.join(public_dir, f"{name}.mp3"))
                    cut["audio"] = f"projects/{slug}/{name}.mp3"
                else:
                    cut["audio"] = None
                # the punch-ins on the Short's own clock (the long video's times do not carry over); the header's sfx switch carries
                cut["sfx"] = sb.get("sfx", "light")
                sfx.set_punches(cut, gap=4.0)
                os.makedirs(os.path.dirname(props), exist_ok=True)
                with open(props, "w", encoding="utf-8") as f:
                    json.dump(cut, f)
                print(f"short {name}: {'spans ' + str(short['spans']) if short.get('spans') else 'scenes ' + str([int(x) for x in short.get('scenes', [])])}, {cut['durationSec']:.0f}s at {speed:g}x, hook: {cut['hook']}")
            except Exception as e:  # noqa: BLE001
                # a pick that cannot be cut (scenes that are not there, seconds past the end) used to end the build
                # after the long render; cut first, it must not take the long video and the other Shorts with it
                check = {"name": name, "failed": True, "faults": [f"could not be cut ({type(e).__name__}: {e}): look at this pick in shorts.json"], "warnings": []}
            else:
                try:
                    check = check_edges(sb, short, name, pieces, cut, sound, made, typed)
                except Exception as e:  # noqa: BLE001
                    check = _unchecked(name, short, pieces, cut, e)
            cuts.append({"name": name, "props": props, "out": out, "check": check, "skip": bool(check["faults"]) and (check.get("failed") or not force)})
    finally:
        if sound:
            sound.close()
    checks = [c["check"] for c in cuts]
    print("shorts check, before any render:")
    for c in cuts:
        print("\n".join("  " + row for row in lines(c["check"], held=c["skip"])), flush=True)
    clock = "this build's own clock (storyboard.json" + (", exact timing from the voice's own timestamps)" if sb.get("clock") == "exact" else ")")
    write_check(os.path.join(project, "shorts-check.md"), slug, checks, clock, force, picks)
    for row in summary(checks, force):
        print(row, flush=True)
    return cuts


# --- on its own: the picks against the runner's clock ------------------------------------------------------------------

def timed_storyboard(project: str) -> tuple[dict[str, Any], str | None, bool]:
    """The long video as the render run timed it: timing.json's scenes and words in the shape cut_spans and cut_short
    read, each scene with the script's own words beside its captions when script.md still has the same scenes. Also
    the voice on that clock (voice-preview.mp3), and whether the script could be laid beside the captions."""
    with open(os.path.join(project, "timing.json"), encoding="utf-8") as f:
        tm = json.load(f)
    script: dict[int, str] = {}
    path = os.path.join(project, "script.md")
    if os.path.exists(path):
        from .script_parser import parse_script
        with open(path, encoding="utf-8") as f:
            md = f.read()
        parsed = parse_script(md)["scenes"] if md.strip() else []
        if [sc["id"] for sc in parsed] == [sc["id"] for sc in tm["scenes"]]:
            script = {sc["id"]: sc.get("narration", "") for sc in parsed}
    scenes = [dict(sc, props={}, cues=[], words=sc.get("words") or [],
                   narration=script.get(sc["id"], " ".join(str(w["w"]) for w in sc.get("words") or []))) for sc in tm["scenes"]]
    sb = {"slug": tm.get("slug") or os.path.basename(project.rstrip(os.sep)), "fps": 30, "durationSec": tm["durationSec"], "scenes": scenes}
    if tm.get("clock"):
        sb["clock"] = tm["clock"]  # "exact": the run timed the video from the voice's own timestamps (pipeline/exact.py)
    audio = os.path.join(project, tm.get("audio") or "voice-preview.mp3")
    return sb, audio if os.path.exists(audio) else None, bool(script)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("project", help="project folder with timing.json and voice-preview.mp3 (what the render run committed)")
    ap.add_argument("--plan", default=None, metavar="FILE", help="the picks to check (default: the project's shorts.json)")
    ap.add_argument("--pick", action="append", default=[], metavar="NAME", help="only this Short from the plan (repeatable)")
    ap.add_argument("--out", default=None, metavar="DIR", help="folder for each Short's cut audio (<name>.mp3) and shorts-check.md; without it nothing is written")
    args = ap.parse_args(argv)

    project = os.path.abspath(args.project)
    plan_path = args.plan or os.path.join(project, "shorts.json")
    for need in (os.path.join(project, "timing.json"), plan_path):
        if not os.path.exists(need):
            print(f"{need} is not there: nothing to check", file=sys.stderr)
            return 2
    sb, audio, scripted = timed_storyboard(project)
    plan, typed = load_plan(plan_path, sb, 0)
    if not typed:
        print(f"{plan_path} holds no Shorts: nothing to check", file=sys.stderr)
        return 2
    from .build import find_audio, keep_spans, made_voice  # at call time: build imports this module
    made = made_voice(project, find_audio(project))
    if not audio:
        print("no voice-preview.mp3 beside timing.json: the cuts are checked on the word times only, and no audio is cut")
    if args.out:
        os.makedirs(args.out, exist_ok=True)
    sound = Sound(audio) if audio else None
    checks: list[dict[str, Any]] = []
    try:
        for name, short in picked(plan, args.pick):
            try:
                one = cut_one(sb, short, name, sound)
                if one is None:
                    continue
                cut, spans, pieces, speed = one
                listen = os.path.join(os.path.abspath(args.out), f"{name}.mp3") if args.out and audio else None
                if listen:
                    # the cut exactly as the build makes it (the same lead, tail and speed), without the music: to listen to
                    keep_spans(audio, listen, spans, LEAD, TAIL, speed)
            except Exception as e:  # noqa: BLE001
                check = {"name": name, "failed": True, "faults": [f"could not be cut ({type(e).__name__}: {e}): look at this pick in the plan"], "warnings": []}
            else:
                try:
                    check = check_edges(sb, short, name, pieces, cut, sound, made, typed)
                except Exception as e:  # noqa: BLE001
                    check = _unchecked(name, short, pieces, cut, e)
                if listen:
                    check["audio"] = listen
            checks.append(check)
    finally:
        if sound:
            sound.close()
    print(f"shorts check for {sb['slug']} on the render run's clock (timing.json{', exact timing' if sb.get('clock') == 'exact' else ''}), {'a made voice' if made else 'a recording'}:")
    if made and not scripted:
        print("  script.md no longer has the scenes timing.json has: the captions were not laid beside the script")
    for check in checks:
        print("\n".join("  " + row for row in lines(check)), flush=True)
    if args.out:
        write_check(os.path.join(args.out, "shorts-check.md"), sb["slug"], checks, "the render run's clock (timing.json and voice-preview.mp3)", False, args.pick, alone=True)
    for row in summary(checks, alone=True):
        print(row, flush=True)
    return 1 if any(check["faults"] for check in checks) else 0


if __name__ == "__main__":
    raise SystemExit(main())
