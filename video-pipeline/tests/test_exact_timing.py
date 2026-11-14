"""pipeline/exact: with `timing: exact` every word takes the time the voice itself gave it, and a made voice is
never cut or tightened. Nothing here calls the voice API: the FakeVoice of test_tts stands in for it, and the build
tests run on a voice made of tones with a voice.json written by hand."""
import contextlib
import io
import json
import os

import numpy as np
import pytest

from pipeline import align as al
from pipeline import build, exact, shortcut, tts, voice
from pipeline.script_parser import parse_script
from test_tts import FakeVoice

SCRIPT = """# Is £50,000 Still a Good Salary?

theme: whiteboard
voice: natural
timing: exact
slug: t

[hook board="£50,000?"]
£50,000 a year sounds like a lot. In 2010 it was.

[stat value="£3,293" label="a month"]
After tax, that's about £3,293 a month, or 79% of it.

[takeaway title="The rent" n="1" of="2"]
Now the rent.

[text board="Rent"]
The average rent is £1,406 a month. That's 42p in every pound.
"""


def _made(tmp_path, md=SCRIPT):
    """A project whose voice the voice step made, with the FakeVoice: a character every 0.05 s."""
    project = tmp_path / "p"
    project.mkdir()
    (project / "script.md").write_text(md, encoding="utf-8")
    tts.make(str(project), FakeVoice(str(tmp_path)), "voice-id-123", md, build._header_lines(md), log=lambda *_: None)
    return str(project)


def _word(ws, text):
    return next(w for w in ws if w["w"] == text)


def test_every_script_word_takes_the_voices_own_time_and_each_scene_starts_at_its_first_word_minus_the_lead(tmp_path):
    project = _made(tmp_path)
    sb = parse_script(SCRIPT)
    per = exact.exact_words(project, sb, build._header_lines(SCRIPT))
    assert [[w["w"] for w in ws] for ws in per] == [sc["narration"].split() for sc in sb["scenes"]]  # the script's words, every one
    # the voice step's own clock: a chunk starts 0.03 s before its first sound, then a character every 0.05 s
    with open(os.path.join(project, "voice.json"), encoding="utf-8") as f:
        chunks = json.load(f)["chunks"]
    said = tts.say(sb["scenes"][0]["narration"])
    assert said.startswith("Fifty thousand pounds a year")
    at = lambda text: chunks[0]["start"] + 0.03 + said.index(text) * 0.05  # noqa: E731
    first = per[0]
    assert first[0]["w"] == "£50,000" and first[0]["s"] == pytest.approx(at("Fifty"), abs=0.011)
    assert first[0]["e"] == pytest.approx(at("Fifty") + len("Fifty thousand pounds") * 0.05, abs=0.011)  # the figure spans its spoken run
    assert first[1]["w"] == "a" and first[1]["s"] == pytest.approx(at("a year"), abs=0.011)
    assert _word(first, "2010")["s"] == pytest.approx(at("twenty ten"), abs=0.011)
    assert _word(first, "2010")["e"] == pytest.approx(at("twenty ten") + len("twenty ten") * 0.05, abs=0.011)
    # a figure with the sentence's full stop, and the second chunk on its own place in the take (after the section pause)
    rent = tts.say(sb["scenes"][2]["narration"]) + " " + tts.say(sb["scenes"][3]["narration"])
    assert _word(per[3], "£1,406")["s"] == pytest.approx(chunks[1]["start"] + 0.03 + rent.index("one thousand, four hundred") * 0.05, abs=0.011)
    assert chunks[1]["start"] - chunks[0]["end"] == pytest.approx(tts.SECTION_GAP, abs=0.01)
    flat = [w for ws in per for w in ws]
    assert all(b["s"] >= a["s"] for a, b in zip(flat, flat[1:])) and all(w["e"] > w["s"] for w in flat)

    total = chunks[-1]["end"]
    out = exact.place(sb, per, total)
    spoken = [sc for sc in out["scenes"] if sc["words"]]
    assert len(spoken) == 4 and out["scenes"][0]["start"] == 0.0  # the first scene is on screen from the first frame
    for sc in spoken[1:]:
        assert sc["start"] == pytest.approx(sc["words"][0]["s"] - al.LEAD, abs=0.001)
    assert out["clock"] == "exact" and out["timing"] == "aligned" and out["alignment"]["coverage"] == 1.0
    assert al.report(out).startswith(f"timing: exact, all {len(flat)} script words timed from the voice's own timestamps")


def test_two_figures_side_by_side_share_their_run_and_an_added_word_joins_the_one_before():
    run = lambda script, said: exact._runs(script.split(), said.split())  # noqa: E731
    assert run("the S&P 500 fell", tts.say("the S&P 500 fell")) == [[0, 0], [1, 3], [4, 5], [6, 6]]  # "S and P", "five hundred"
    assert tts.say("lost $400 billion in 2 days") == "lost four hundred billion dollars in two days"
    assert run("lost $400 billion in 2 days", "lost four hundred billion dollars in two days") == [[0, 0], [1, 2], [3, 4], [5, 5], [6, 6], [7, 7]]
    assert run("£1 buys less", "One pound buys less") == [[0, 1], [2, 2], [3, 3]]


def test_times_the_sound_contradicts_are_settled_on_the_sound_and_no_others(tmp_path):
    # the take says "one two three." [0.6 s] "Four five.": 0.3 s of tone a word, the words of a phrase back to back
    said = [("one", 1.0), ("two", 1.3), ("three.", 1.6), ("Four", 2.5), ("five.", 2.8)]
    x = np.zeros(int(3.6 * voice.SR))
    for _, t in said:
        a, b = int(round(t * voice.SR)), int(round((t + 0.3) * voice.SR))
        x[a:b] = 8000 * np.sin(np.arange(b - a) * 0.03)
    take = str(tmp_path / "take.wav")
    voice.write(take, x)
    # the times a voice gives: right inside a phrase, on a coarse grid, and late where a phrase ends
    stated = [{"w": "one", "s": 1.0, "e": 1.3},
              {"w": "two", "s": 1.3, "e": 1.52},       # ends a grid step early: 0.08 s like this between words is left alone
              {"w": "three.", "s": 1.92, "e": 2.44},   # placed wholly inside the pause after it: 0.4 s of speech sits in the "gap" before it
              {"w": "Four", "s": 2.62, "e": 2.8},      # the first word after the pause, stated 0.12 s after its sound starts
              {"w": "five.", "s": 2.88, "e": 3.5}]     # a grid step late, and its end 0.4 s after the sound stops
    out, starts, ends = exact.settle(stated, take)
    want = [("one", 1.0, 1.3), ("two", 1.3, 1.52), ("three.", 1.52, 1.9), ("Four", 2.5, 2.8), ("five.", 2.88, 3.1)]
    for got, (w, a, b) in zip(out, want):
        assert got["w"] == w and got["s"] == pytest.approx(a, abs=0.011) and got["e"] == pytest.approx(b, abs=0.011), (got, w, a, b)
    assert (starts, ends) == (2, 2)  # "three." and "Four" started somewhere else; "three." and "five." ended in the pause
    assert stated[2] == {"w": "three.", "s": 1.92, "e": 2.44}  # the stated times themselves are not touched
    # times that agree with the sound stay exactly as stated
    right = [{"w": w, "s": t, "e": t + 0.3} for w, t in said]
    assert exact.settle(right, take) == ([{"w": w, "s": pytest.approx(t, abs=0.011), "e": pytest.approx(t + 0.3, abs=0.011)} for w, t in said], 0, 0)


def test_the_words_move_with_what_the_trim_took_off_the_front(tmp_path):
    per = [[{"w": "So", "s": 1.5, "e": 1.7}], [], [{"w": "there.", "s": 3.0, "e": 3.4}]]
    exact.shift(per, -1.25)
    assert per == [[{"w": "So", "s": 0.25, "e": 0.45}], [], [{"w": "there.", "s": 1.75, "e": 2.15}]]
    # and what the trim took off is counted in the sound: 1.5 s of silence before the first word, 0.3 s of it kept
    x = np.zeros(voice.SR * 3)
    x[int(1.5 * voice.SR):] = 8000 * np.sin(np.arange(len(x) - int(1.5 * voice.SR)) * 0.03)
    src, dst = str(tmp_path / "take.wav"), str(tmp_path / "trim.wav")
    voice.write(src, x)
    build.trim_lead(src, dst)
    assert build.lead_cut(src, dst) == pytest.approx(1.2, abs=0.03)
    assert build.lead_cut(src, src) == 0.0


def test_a_voiceover_whose_hash_no_longer_matches_falls_back_to_the_transcriber_with_a_note(tmp_path):
    project = _made(tmp_path)
    sb, header = parse_script(SCRIPT), build._header_lines(SCRIPT)
    assert exact.wanted(header) == "exact" and exact.choose(project, sb, header, log=pytest.fail) is not None
    with open(os.path.join(project, "voiceover.m4a"), "ab") as f:
        f.write(b" replaced by hand")
    notes = []
    assert exact.choose(project, sb, header, log=notes.append) is None
    assert len(notes) == 1 and "its hash differs" in notes[0] and "The transcriber times this build" in notes[0]
    # a recording has no voice.json at all: the same answer, and its own reason
    os.remove(os.path.join(project, "voice.json"))
    notes = []
    assert exact.choose(project, sb, header, log=notes.append) is None
    assert len(notes) == 1 and "no voice.json" in notes[0] and "transcriber" in notes[0]
    assert exact.choose(project, sb, {"voice": "natural"}, log=pytest.fail) is None  # a recording with no timing: line: nothing is said


def test_a_script_that_no_longer_says_what_the_voice_says_is_not_timed_from_it(tmp_path):
    project = _made(tmp_path)
    header = build._header_lines(SCRIPT)
    # the scenes cut differently, the same words: chunks are cut by sentence, so the voice's times still fit
    recut = SCRIPT.replace("£50,000 a year sounds like a lot. In 2010 it was.", "£50,000 a year sounds like a lot.\n\n[text board=\"2010\"]\nIn 2010 it was.")
    per = exact.exact_words(project, parse_script(recut), header, log=pytest.fail)
    assert [w["w"] for w in per[1]] == ["In", "2010", "it", "was."]
    # a word changed after the voice was made: the voice does not say it
    notes = []
    changed = parse_script(SCRIPT.replace("Now the rent.", "Now the mortgage."))
    assert exact.exact_words(project, changed, header, log=notes.append) is None
    assert "scene 3" in notes[0] and '"mortgage."' in notes[0] and "make the voice again" in notes[0]
    # a made voice from another maker has no timestamps this step reads
    record = os.path.join(project, "voice.json")
    with open(record, encoding="utf-8") as f:
        rec = json.load(f)
    with open(record, "w", encoding="utf-8") as f:
        json.dump(dict(rec, made="fake"), f)
    notes = []
    assert exact.exact_words(project, parse_script(SCRIPT), header, log=notes.append) is None and "'fake'" in notes[0]


def test_the_header_line_is_the_only_switch_and_a_made_voice_without_it_gets_one_note(tmp_path):
    project = _made(tmp_path, SCRIPT.replace("timing: exact\n", ""))
    sb = parse_script(SCRIPT)
    header = build._header_lines(SCRIPT.replace("timing: exact\n", ""))
    with open(os.path.join(project, "voice.json"), encoding="utf-8") as f:
        assert "timing" not in f.read() and "exact" not in json.dumps(sorted(json.load(open(os.path.join(project, "voice.json")))))  # nothing is stamped into voice.json
    notes = []
    assert exact.choose(project, sb, header, log=notes.append) is None
    assert len(notes) == 1 and "`timing: exact`" in notes[0] and "`timing: transcriber`" in notes[0]  # the two choices, named once
    assert exact.choose(project, sb, dict(header, timing="transcriber"), log=pytest.fail) is None  # the answer that silences it
    assert exact.choose(project, sb, dict(header, timing="exact"), log=pytest.fail) is not None
    # exact timing never edits the voice: a header that also asks for an edit gets the transcriber's path, and says so
    for key, value in (("pauses", "tight"), ("restarts", "cut")):
        notes = []
        assert exact.choose(project, sb, dict(header, timing="exact", **{key: value}), log=notes.append) is None
        assert len(notes) == 1 and f"`{key}: {value}`" in notes[0] and "transcriber" in notes[0]
    assert exact.choose(project, sb, dict(header, timing="exact", pauses="keep"), log=pytest.fail) is not None
    notes = []
    assert exact.choose(project, sb, dict(header, timing="quick"), log=notes.append) is None and "is not a choice" in notes[0]


# --- the build, on a voice of tones: each spoken word 0.24 s of tone, the words of a sentence back to back, half a
# second of silence after a sentence, and the designed pause inside "is Nvidia, [0.78 s] Nvidia is"

TINY = """# A tiny exact video

slug: tiny-exact
theme: whiteboard
voice: raw
timing: exact

[text]
He built it from nothing. Jensen is Nvidia, Nvidia is Jensen.

[stat value="£50,000" label="a year"]
£50,000 a year sounds like a lot. In 2010 it was.

[text]
But most people never sell at all.
"""
FIRST, WORD, STOP, DESIGNED = 0.5, 0.24, 0.5, 0.78  # the take's first word, a word, the pause after a sentence, the pause in the script


def _tones(project, md=TINY):
    """voiceover.wav and the voice.json the voice step would have written for it; returns the spoken words with times."""
    os.makedirs(os.path.join(project, ".cache"), exist_ok=True)
    with open(os.path.join(project, "script.md"), "w", encoding="utf-8") as f:
        f.write(md)
    said = [w for sc in parse_script(md)["scenes"] for w in tts.say(sc["narration"]).split()]
    words, t = [], FIRST
    for w in said:
        words.append({"w": w, "s": round(t, 3), "e": round(t + WORD, 3)})
        t += WORD + (DESIGNED if w == "Nvidia," else STOP if w[-1] in ".!?" else 0.0)
    x = np.zeros(int((words[-1]["e"] + 0.2) * voice.SR))
    for w in words:
        a, b = int(round(w["s"] * voice.SR)), int(round(w["e"] * voice.SR))
        x[a:b] = 8000 * np.sin(np.arange(b - a) * 0.03)
    take = os.path.join(project, "voiceover.wav")
    voice.write(take, x)
    with open(os.path.join(project, "voice.json"), "w", encoding="utf-8") as f:
        json.dump({"made": "elevenlabs", "audio": "voiceover.wav", "audioHash": tts.file_hash(take), "durationSec": round(len(x) / voice.SR, 3),
                   "chunks": [{"n": 1, "scenes": [1, 2, 3], "section": False, "start": 0.0, "end": round(len(x) / voice.SR, 3), "words": words}]}, f)
    return words


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    """The tiny video built once with `timing: exact`, a Short picked in seconds with no clock line, no render."""
    root = tmp_path_factory.mktemp("exact")
    project = str(root / "tiny")
    os.makedirs(project)
    said = _tones(project)
    by = {w["w"]: w for w in said}
    span = [round(by["But"]["s"] - (FIRST - 0.3) - 0.2, 2), round(by["all."]["e"] - (FIRST - 0.3) + 0.2, 2)]  # "But most people never sell at all.", on the build's clock
    with open(os.path.join(project, "shorts.json"), "w", encoding="utf-8") as f:
        json.dump({"shorts": [{"name": "short-1", "spans": [span], "hook": "Never sell", "speed": 1}]}, f)
    patch = pytest.MonkeyPatch()
    patch.setenv("EI_PUBLIC_DIR", str(root / "public"))
    patch.setattr(build, "render", lambda *a, **k: pytest.fail("nothing is rendered here"))
    patch.setattr(build, "transcript_for", lambda *a, **k: pytest.fail("exact timing reads no transcript"))
    log = io.StringIO()
    try:
        with contextlib.redirect_stdout(log):
            code = build.main([project, "--no-render", "--backend", "none", "--strict-shorts"])
    finally:
        patch.undo()
    with open(os.path.join(project, "storyboard.json"), encoding="utf-8") as f:
        sb = json.load(f)
    return {"project": project, "public": str(root / "public" / "projects" / "tiny-exact"), "said": said, "span": span, "code": code, "log": log.getvalue(), "sb": sb}


def test_the_build_times_every_word_from_the_voice_and_moves_it_with_the_trim(built):
    sb, said = built["sb"], built["said"]
    assert sb["clock"] == "exact" and sb["alignment"]["source"] == "voice"
    assert "timing: exact, all 29 script words timed from the voice's own timestamps" in built["log"]
    assert "transcrib" not in built["log"].replace("the transcriber's clock", "")  # nothing listened, and nothing says it did
    flat = [w for sc in sb["scenes"] for w in sc["words"]]
    assert [w["w"] for w in flat] == [w for sc in sb["scenes"] for w in sc["narration"].split()]  # captions are the script's words
    # the take opens on half a second of silence and the build keeps 0.3 s of it: every word is 0.2 s earlier than in voice.json
    cut = FIRST - 0.3
    by = {w["w"]: w for w in said}
    assert flat[0]["w"] == "He" and flat[0]["s"] == pytest.approx(by["He"]["s"] - cut, abs=0.03)
    fig = next(w for w in flat if w["w"] == "£50,000")
    assert fig["s"] == pytest.approx(by["Fifty"]["s"] - cut, abs=0.03) and fig["e"] == pytest.approx(by["pounds"]["e"] - cut, abs=0.03)
    # and the sound agrees: in the voice the build made, each of these words starts where its time says
    x = voice.read(os.path.join(built["public"], "voiceover.wav"))
    loud = np.abs(x) > 500
    for w in (flat[0], fig, next(w for w in flat if w["w"] == "But")):
        onset = int(np.argmax(loud[int((w["s"] - 0.25) * voice.SR):])) / voice.SR - 0.25
        assert abs(onset) < 0.03, (w, onset)
    with open(os.path.join(built["project"], "timing.json"), encoding="utf-8") as f:
        assert json.load(f)["clock"] == "exact"  # the check on its own reads the clock from here


def test_a_word_said_twice_in_a_made_voice_is_not_cut_and_the_designed_pause_plays(built):
    sb, said = built["sb"], built["said"]
    # to a transcript check "is Nvidia, [0.78 s] Nvidia is" reads as a restart: the hazard is real
    k = next(i for i, w in enumerate(said) if w["w"] == "Nvidia,")
    assert [w["w"] for w in said[k - 1:k + 3]] == ["is", "Nvidia,", "Nvidia", "is"] and voice.restarts(said[k - 1:k + 3])
    ws = sb["scenes"][0]["words"]
    i = next(i for i, w in enumerate(ws) if w["w"] == "Nvidia,")
    assert [w["w"] for w in ws[i - 1:i + 3]] == ["is", "Nvidia,", "Nvidia", "is"]  # the narration holds both, and so do the captions
    assert ws[i + 1]["s"] - ws[i]["e"] == pytest.approx(DESIGNED, abs=0.02)  # the pause is as long as it was made
    cache = os.listdir(os.path.join(built["project"], ".cache"))
    assert "voice-restarts.wav" not in cache and "voice-tight.wav" not in cache and "restarts cut" not in built["log"] and "closed up" not in built["log"]
    assert not os.path.exists(os.path.join(built["project"], "transcript.json"))
    # nothing came out of the voice: the build's is the take, less the 0.2 s of silence trimmed off its front
    take, made = voice.read(os.path.join(built["project"], "voiceover.wav")), voice.read(os.path.join(built["public"], "voiceover.wav"))
    assert len(made) / voice.SR == pytest.approx(len(take) / voice.SR - (FIRST - 0.3), abs=0.03)
    sentence = [w for w in ws if w["s"] >= next(w for w in ws if w["w"] == "Jensen")["s"]]
    assert sentence[-1]["e"] - sentence[0]["s"] == pytest.approx(6 * WORD + DESIGNED, abs=0.02)  # "Jensen is Nvidia, Nvidia is Jensen.", whole


def test_in_exact_mode_seconds_typed_without_the_clock_line_are_faulted(built, tmp_path, capsys):
    assert built["code"] == 3  # --strict-shorts: the Short was held back
    assert "SHORTS HELD BACK: short-1" in built["log"] and "these seconds were typed on the transcriber's clock" in built["log"]
    md = open(os.path.join(built["project"], "shorts-check.md"), encoding="utf-8").read()
    assert "Held back: short-1." in md and "these seconds were typed on the transcriber's clock" in md and "exact timing from the voice's own timestamps" in md
    assert 'first words: "But most people never sell"' in md  # the check still says what the seconds land on now
    # the check on its own reads the clock from timing.json: the same plan is faulted there, and passes once it says "clock": "exact"
    assert shortcut.main([built["project"]]) == 1
    assert "these seconds were typed on the transcriber's clock" in capsys.readouterr().out
    plan = tmp_path / "exact.json"
    plan.write_text(json.dumps({"clock": "exact", "shorts": [{"name": "short-1", "spans": [built["span"]], "hook": "Never sell", "speed": 1}]}), encoding="utf-8")
    assert shortcut.main([built["project"], "--plan", str(plan)]) == 0
    said = capsys.readouterr().out
    assert "exact timing" in said and "FAULT" not in said and "typed on" not in said


def test_the_clock_rule_touches_only_seconds_typed_for_another_clock(built):
    sb = built["sb"]
    pick = {"name": "short-1", "spans": [built["span"]], "hook": "Never sell", "speed": 1}
    sound = shortcut.Sound(os.path.join(built["public"], "voiceover.wav"))
    try:
        def check(sb, pick, typed=True):
            cut, _, pieces, _ = shortcut.cut_one(sb, pick, pick["name"], sound)
            return shortcut.check_edges(sb, pick, pick["name"], pieces, cut, sound, True, typed)
        assert any("typed on the transcriber's clock" in x for x in check(sb, pick)["faults"])
        assert check(sb, dict(pick, clock="exact"))["faults"] == []
        assert check(sb, {"name": "short-1", "scenes": [3], "hook": "Never sell", "speed": 1})["faults"] == []  # a pick by scenes has no seconds
        assert check(sb, pick, typed=False)["faults"] == []  # the planner's own pick was read from this clock
        # the other way round: seconds marked exact on a video the transcriber timed are other words too
        loose = {k: v for k, v in sb.items() if k != "clock"}
        assert check(loose, pick)["faults"] == []
        assert any("typed on the exact clock" in x for x in check(loose, dict(pick, clock="exact"))["faults"])
    finally:
        sound.close()
    # shorts.json's top line reaches every pick, as its speed does; a plan without one is read as before
    assert shortcut.load_plan(os.path.join(built["project"], "shorts.json"), sb, 0)[0] == [pick]
