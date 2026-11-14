"""Exact timing: every word on the time the voice itself gives it.

    timing: exact          in script.md's header: the build takes its word times from voice.json
    timing: transcriber    the transcriber times the video, as before, and the build's note about the choice goes

A voice the voice step made (pipeline/tts.py) comes back with a time for every character, and voice.json keeps them
as words. A transcriber listening to that same voice afterwards can only guess those times: on the Nvidia video its
word times ran a median 0.18 s early, 31 of the 1,429 script words got no time of their own and 16 were more than
half a second out, so a cut, a card or a caption could land beside its word. With `timing: exact` nothing listens.
Each script word takes the time of the word the voice was asked to say; a figure takes the whole run it is said as
("$400" is said "four hundred", "£50,000" is said "Fifty thousand pounds").

The voice's own times are not all as good as each other. They sit on a grid of 40 to 80 ms and run late where a
phrase ends: on the Nvidia voice the word before a pause was given an end half a second after its sound stopped, one
such word in five was placed wholly inside the pause after it, and the word after a pause started 0.05 to 0.1 s
after its sound did. The sound is the witness there, as it is for the cuts and the Shorts' edges, so `settle` moves
those times, and only those, onto the sound of the take: the first word after a pause starts where the sound starts,
a word before a pause ends where the sound stops, and a word stated after a "gap" that is full of speech starts
where the word before it ends. On that voice 108 of 1,491 starts and 201 ends moved by more than 0.1 s; afterwards
170 of the 176 words that follow a pause sit within 0.1 s of their sound in the finished audio (the worst 0.26 s).
Inside a phrase, where there is no pause to measure, the times stay as the voice gave them.

A made voice says the approved words and nothing else, so in exact mode the build also leaves it alone: no pause is
closed up, no "restart" is cut, no transcript is read. The opt-in is the script's header line and nothing else.
Nothing is written into voice.json, so making one chunk of a published video's voice again cannot switch that video
over. A voice that is not the one voice.json describes (a recording, or a take replaced or edited by hand) is timed
by the transcriber, and the build says why.
"""
from __future__ import annotations

import difflib
import json
import os
import re
import subprocess
from typing import Any

import numpy as np

from . import align as al
from . import tts
from .voice import read, rms_db

Word = dict[str, Any]  # {"w": str, "s": float, "e": float}
UNDER = 30.0  # sound is within this many dB of the voice's loud level (the 95th percentile of its 10 ms frames)
PAUSE = 0.12  # quiet for this long is a pause; shorter can be the stop inside a word (as pipeline/shortcut.py)
GAP = 0.25  # the voice's times sit on a grid of 40 to 80 ms, so a short stated gap between two words means nothing; this long, full of speech, is a word


def wanted(header: dict[str, str]) -> str:
    """What the script's `timing:` line asks for: "exact", "transcriber", "" when there is no such line, or the
    line's own word when it is neither."""
    return str(header.get("timing") or "").strip().lower()


def _n(w: str) -> str:
    return re.sub(r"[^a-z0-9']", "", str(w).lower())


def _runs(script: list[str], said: list[str], respell: dict[str, str] | None = None) -> list[list[int] | None]:
    """For each script word, the run of spoken words it is said as: [first, last] indexes into `said`. Most words are
    said as themselves. A figure is said as several ("$400" as "four hundred"), and where two figures sit side by
    side ("S&P 500", said "S and P five hundred") the run is shared out by how many words each is said as on its own.
    A word the spoken form adds ("dollars" after "$400 billion") joins the word before it. None for a script word
    that is not said at all."""
    out: list[list[int] | None] = [None] * len(script)
    lead: int | None = None  # spoken words before the first script word they could join: they join the next one
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, [_n(w) for w in script], [_n(w) for w in said], autojunk=False).get_opcodes():
        n, m = i2 - i1, j2 - j1
        if op == "insert":
            if i1 > 0 and out[i1 - 1] is not None:
                out[i1 - 1][1] = j2 - 1
            elif lead is None:
                lead = j1
            continue
        if op == "delete":
            continue
        if op == "equal":
            for k in range(n):
                out[i1 + k] = [j1 + k, j1 + k]
        else:
            share = [max(1, len(tts.say(w, respell).split())) for w in script[i1:i2]]
            done = 0
            for k in range(n):
                lo = j1 + done * m // sum(share)
                done += share[k]
                out[i1 + k] = [lo, max(lo, j1 + done * m // sum(share) - 1)]
        if lead is not None:
            out[i1][0] = lead
            lead = None
    return out


def settle(heard: list[Word], take: str) -> tuple[list[Word], int, int]:
    """The voice's own word times with the ones the sound contradicts moved onto the sound of `take`; also how many
    starts and how many ends moved by more than 0.1 s. Three things move, and nothing else:

    - a word stated after a gap of GAP or more that is full of speech was said in that gap: it starts where the word
      before it is stated to end ("single [0.5 s] employee." with no pause in the sound before "employee");
    - the first word after a pause starts where the sound starts, when that is within 0.3 s before its stated start
      or 0.1 s after it;
    - a word ends no later than the next one starts, and before a pause it ends where the sound stops.

    The words keep their order: none starts before the one before it."""
    x = read(take, 16000)
    db = rms_db(x, 160)
    n = len(db)
    top = float(np.percentile(db, 95))
    loud, speech = db >= top - UNDER, db >= top - UNDER + 10  # any sound of the voice; the body of a word (a breath is not)
    at = lambda t: min(n, max(0, int(round(t * 100))))  # noqa: E731
    pause = int(PAUSE * 100)
    out = [dict(w) for w in heard]
    for i, w in enumerate(out):
        s, e = float(heard[i]["s"]), float(heard[i]["e"])
        before = min(s, float(heard[i - 1]["e"])) if i else 0.0
        k = at(s)
        if s - before >= GAP and k > at(before) and speech[at(before):k].mean() >= 0.5:
            s = before
        else:
            # where sound starts after a pause, near the stated start, with the word before it begun before that pause
            first = at(out[i - 1]["s"]) + pause if i else 0
            near = [j for j in range(max(pause, first, at(s - 0.3)), min(n, at(min(s + 0.1, e)) + 1)) if loud[j] and not loud[j - pause:j].any()]
            if near:
                s = min(near, key=lambda j: abs(j - k)) / 100
        w["s"] = round(max(s, out[i - 1]["s"] if i else 0.0), 3)
    for i, w in enumerate(out):
        e = min(float(heard[i]["e"]), out[i + 1]["s"] if i + 1 < len(out) else n / 100)
        m, least = at(e), at(w["s"]) + 6
        while m > least and not loud[m - 1]:
            m -= 1
        w["e"] = round(max(w["s"] + 0.06, m / 100 if m < at(e) else e), 3)
    moved = lambda key: sum(1 for a, b in zip(heard, out) if abs(float(a[key]) - b[key]) > 0.1)  # noqa: E731
    return out, moved("s"), moved("e")


def exact_words(project: str, sb: dict[str, Any], header: dict[str, str], log=print, sound: str | None = None) -> list[list[Word]] | None:
    """Each scene's script words with the times the voice itself gave them: one list per scene in the storyboard's
    order (empty for a scene with nothing said), on the clock of voiceover.*. The times are the chunk words already
    kept in voice.json; the script is matched to them through its spoken form (tts.say), so a figure takes the span
    of the run it is said as. Chunks are cut by sentence, not by scene, so the scenes can have been cut differently
    since the voice was made; the words themselves must be the ones the voice was made from.

    The stated times are settled on the sound of the take where the sound contradicts them (settle, above); `sound`
    is the take as the build hears it, when the script's `mute:` line has silenced a stray sound in it.

    None, with the reason logged, unless voice.json says the voice was made by ElevenLabs and voiceover.* is still
    that file (build.made_voice), and the script still says what the voice says."""
    from .build import find_audio, made_voice  # at call time: build imports this module
    no = lambda why: log(f"timing: exact is not used: {why}. The transcriber times this build")  # noqa: E731
    take = find_audio(project)
    record = os.path.join(project, "voice.json")
    if not take or not os.path.exists(record):
        return no("there is no voice.json beside the voiceover, so this voice was not made by the voice step and has no timestamps of its own")
    if not made_voice(project, take):
        return no(f"{os.path.basename(take)} is not the file voice.json describes any more (a take replaced or edited by hand: its hash differs)")
    with open(record, encoding="utf-8") as f:
        rec = json.load(f)
    if rec.get("made") != "elevenlabs":
        return no(f"voice.json says the voice was made by '{rec.get('made')}', and only ElevenLabs timestamps are read")
    heard = [w for c in rec.get("chunks") or [] for w in c.get("words") or []]
    if not heard:
        return no("voice.json holds no word times")
    try:
        heard, starts, ends = settle(heard, sound or take)
        if starts or ends:
            log(f"timing: exact; of the voice's {len(heard)} word times, {starts} starts and {ends} ends were more than 0.1 s from the sound and were moved onto it")
    except (subprocess.CalledProcessError, OSError, ValueError) as e:
        log(f"timing: exact, on the voice's times as stated: the take could not be read to settle them on the sound ({type(e).__name__})")
    respell = tts.respellings(header)
    out: list[list[Word]] = []
    pos = 0
    for sc in sb["scenes"]:
        text = (sc.get("narration") or "").strip()
        script = text.split()
        said = tts.say(text, respell).split() if script else []
        mine = heard[pos:pos + len(said)]
        if [_n(w["w"]) for w in mine] != [_n(w) for w in said]:
            k = next((i for i, w in enumerate(said) if i >= len(mine) or _n(mine[i]["w"]) != _n(w)), len(said))
            return no(f"the script no longer says what the voice says (scene {sc['id']}: the script has \"{' '.join(said[k:k + 4])}\" where the voice says "
                      f"\"{' '.join(w['w'] for w in heard[pos + k:pos + k + 4]) or 'nothing more'}\"): make the voice again (python -m pipeline.tts)")
        pos += len(said)
        words: list[Word] = []
        last = 0.0
        for w, run in zip(script, _runs(script, said, respell)):
            if run is None:
                s = e = last  # a script word with no spoken form: it sits where the word before it ends
            else:
                s, e = float(mine[run[0]]["s"]), float(mine[run[1]]["e"])
            s = max(s, words[-1]["s"] if words else s)
            last = max(e, s)
            if al.normalize(w):  # as align() does: a lone dash is not a caption word
                words.append({"w": w, "s": round(s, 3), "e": round(max(s + 0.06, e), 3)})
        out.append(words)
    if pos != len(heard):
        return no(f"the voice says {len(heard) - pos} more word(s) than the script has (\"{' '.join(w['w'] for w in heard[pos:pos + 4])}...\"): make the voice again (python -m pipeline.tts)")
    return out


def shift(per_scene: list[list[Word]], by: float) -> None:
    """Every word `by` seconds later (earlier when negative): the build's voice starts after what trim_lead took off
    the front of the take, and the words follow it."""
    if abs(by) < 0.0005:
        return
    for ws in per_scene:
        for w in ws:
            w["s"], w["e"] = round(max(0.0, w["s"] + by), 3), round(max(0.0, w["e"] + by), 3)


def place(sb: dict[str, Any], per_scene: list[list[Word]], total_sec: float) -> dict[str, Any]:
    """The storyboard timed on the exact words, as align() leaves it on the transcript's: the scenes placed by the
    same rules (align.place_scenes), the record the report and the preview read, and `clock: exact`, which the
    Shorts' check (pipeline/shortcut.py) and timing.json carry so seconds typed on another clock are caught."""
    al.place_scenes(sb, per_scene, total_sec)
    sb["alignment"] = {
        "coverage": 1.0,
        "scriptWords": sum(len(ws) for ws in per_scene),
        "source": "voice",
        "perScene": [{"id": sc["id"], "type": sc["type"], "matched": len(ws), "words": len(ws), "start": sc["start"], "end": sc["end"]} for sc, ws in zip(sb["scenes"], per_scene)],
    }
    sb["clock"] = "exact"
    return sb


def choose(project: str, sb: dict[str, Any], header: dict[str, str], log=print, sound: str | None = None) -> list[list[Word]] | None:
    """What times this build: each scene's words on the voice's own timestamps (exact_words) when the script's
    header says `timing: exact` and the voice allows it, else None, and the transcriber does it as before.

    Exact timing never edits the voice, so a header that also asks for an edit (`pauses: tight`, `restarts: cut`)
    gets the transcriber's path, with a note. A made voice with no `timing:` line gets one note naming the two
    choices; `timing: transcriber` is the answer that silences it."""
    from .build import find_audio, made_voice  # at call time: build imports this module
    said = wanted(header)
    if said == "exact":
        for key, value in (("pauses", "tight"), ("restarts", "cut")):
            if str(header.get(key) or "").strip().lower() == value:
                log(f"timing: exact is not used: the header also says `{key}: {value}`, and exact timing never edits a made voice. "
                    f"The transcriber times this build; take the `{key}:` line out for exact timing")
                return None
        return exact_words(project, sb, header, log, sound)
    if said not in ("", "transcriber"):
        log(f"timing: `{header.get('timing')}` is not a choice (`timing: exact` or `timing: transcriber`): the transcriber times this build")
    elif not said and made_voice(project, find_audio(project)):
        log("timing: this voice was made by the voice step, so its own timestamps can time every word. `timing: exact` in the script's header "
            "does that (README, \"Exact timing\"); `timing: transcriber` keeps the transcriber and takes this note away")
    return None
