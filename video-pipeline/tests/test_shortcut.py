"""pipeline/shortcut: every Short is cut and its two ends checked before anything is rendered."""
import json
import os

import numpy as np
import pytest

from pipeline import build, shortcut, voice
from pipeline.tts import file_hash

# a made-up long video: (scene, a sentence or the part of it in that scene, when its first word starts). Each word is
# 0.3 s of tone and the words of a sentence follow straight on; between sentences there is half a second or more of
# silence. The cut from scene 1 to scene 2 falls inside the second sentence, in sound.
SAID = [
    (1, "Prices fell hard today.", 1.0),
    (1, "And the fund lost", 3.0),
    (2, "a fifth of its value.", 4.2),
    (2, "Savers held on and waited.", 6.5),
    (2, "Nothing has come back so far.", 9.0),
    (3, "But most people never sell at all.", 12.5),
]
SCENES = {1: (0.0, 4.2), 2: (4.2, 12.0), 3: (12.0, 18.0)}
SR = 16000


def _video(folder):
    """(the storyboard, the path of its voice) for the made-up video, the voice written into `folder`."""
    x = np.zeros(SR * 18)
    scenes = {k: {"id": k, "type": "text", "start": a, "end": b, "props": {}, "cues": [], "words": [], "narration": ""} for k, (a, b) in SCENES.items()}
    for sid, text, at in SAID:
        ws = text.split()
        a, b = int(round(at * SR)), int(round((at + 0.3 * len(ws)) * SR))
        x[a:b] = 8000 * np.sin(np.arange(b - a) * 0.2)
        scenes[sid]["words"] += [{"w": w, "s": round(at + 0.3 * i, 3), "e": round(at + 0.3 * (i + 1), 3)} for i, w in enumerate(ws)]
        scenes[sid]["narration"] = (scenes[sid]["narration"] + " " + text).strip()
    wav = os.path.join(str(folder), "voiceover.wav")
    voice.write(wav, x, SR)
    return {"slug": "made-up", "fps": 30, "durationSec": 18.0, "captions": False, "sfx": "light", "scenes": list(scenes.values())}, wav


@pytest.fixture(scope="module")
def video(tmp_path_factory):
    return _video(tmp_path_factory.mktemp("voice"))


def _check(video, pick, made=True, typed=True):
    sb, wav = video
    pick = dict({"name": "short-1", "speed": 1}, **pick)
    sound = shortcut.Sound(wav)
    try:
        cut, _, pieces, _ = shortcut.cut_one(sb, pick, pick["name"], sound)
        return shortcut.check_edges(sb, pick, pick["name"], pieces, cut, sound, made, typed)
    finally:
        sound.close()


def _has(found, *parts):
    return any(all(p in line for p in parts) for line in found)


def test_an_edge_inside_a_word_is_a_fault(video):
    # no pause within reach of 4.05 s (the snap looks 0.8 s on): the end stays inside "lost", 3.9 to 4.2 s
    v = _check(video, {"spans": [[2.9, 4.05]]})
    assert v["pieces"] == [(2.91, 4.05)]
    assert _has(v["faults"], "the end cuts through", '"lost"')
    assert _has(v["faults"], "the end at 4.05 s is in sound")
    assert _has(v["faults"], "ends inside a sentence", '"fund"')


def test_words_of_the_next_sentence_are_a_fault(video):
    v = _check(video, {"spans": [[0.9, 3.7]]})
    assert v["first"] == "Prices fell hard today. And" and v["last"] == "fell hard today. And the"
    assert _has(v["faults"], "ends 2 words into the next sentence", "fell hard today. | And the")


def test_a_first_word_inside_a_sentence_is_a_fault(video):
    # typed half a second late: the snap goes back to the pause it can reach, none, so the Short opens on "fifth"
    v = _check(video, {"spans": [[4.5, 8.2]]})
    assert _has(v["faults"], "starts 5 words into a sentence", "And the fund lost a | fifth of its value.")


def test_an_and_opener_warns_and_prints_the_same_short_one_sentence_later(video):
    v = _check(video, {"spans": [[2.9, 8.2]]})
    assert v["faults"] == []  # it starts on a sentence and ends on one, in the pauses: an opener is never a fault
    assert _has(v["warnings"], 'opens on "And"', 'Ready alternative, one sentence later: "spans": [[6.35, 8.2]]', 'starting "Savers held on and waited."')
    report = "\n".join(shortcut.lines(v))
    assert 'first words: "And the fund lost a"' in report and 'last words:  "Savers held on and waited."' in report
    assert '"spans": [[6.35, 8.2]] (3.0 s)' in report  # the later cut is printed with its seconds; nothing is changed
    assert v["asked"] == [[2.9, 8.2]] and v["pieces"] == [(2.91, 8.19)]


def test_a_so_far_ending_warns(video):
    v = _check(video, {"spans": [[8.9, 11.0]]})
    assert v["faults"] == []
    assert _has(v["warnings"], 'the last sentence says "so far"', "Nothing has come back so far.")
    assert _has(v["warnings"], "only 3.3 s long")  # a short Short is told, not stopped


def test_a_scenes_pick_only_warns(video):
    # scene 1 ends inside a sentence, in sound: typed as spans on a made voice that is a fault; picked by scenes
    # (the long video cuts there too), or on a recording, it is told and nothing is held back
    by_scenes = _check(video, {"scenes": [1]})
    assert by_scenes["faults"] == [] and by_scenes["by"] == "scenes" and by_scenes["pieces"] == [(0.0, 4.2)]
    assert _has(by_scenes["warnings"], "ends 4 words into the next sentence", "And the fund lost")
    assert _has(by_scenes["warnings"], "the end at 4.20 s is in sound")
    by_spans = _check(video, {"spans": [[0.0, 4.2]]})
    assert _has(by_spans["faults"], "ends 4 words into the next sentence") and _has(by_spans["faults"], "the end at 4.20 s is in sound")
    recording = _check(video, {"spans": [[0.0, 4.2]]}, made=False)
    assert recording["faults"] == [] and _has(recording["warnings"], "ends 4 words into the next sentence")
    planned = _check(video, {"spans": [[0.0, 4.2]]}, typed=False)  # the planner's own pick: nobody typed it
    assert planned["faults"] == []


def test_a_short_over_a_minute_is_a_fault(video):
    sb, _ = video
    pick = {"name": "short-1", "spans": [[2.9, 8.2]], "speed": 1}
    cut, _, pieces, _ = shortcut.cut_one(sb, pick, "short-1", None)
    cut["durationSec"] = 61.0
    assert _has(shortcut.check_edges(sb, pick, "short-1", pieces, cut, None, made=True)["faults"], "61.0 s long", "60 s at most")


def test_a_pause_in_the_sound_overrules_a_loose_word_time(video):
    # the transcript's times can sit most of a second early: it lays the next sentence's first word across an end that
    # the sound shows in the middle of a one-second pause (Nvidia's Short 5 after its re-render). The sound is the witness.
    sb, wav = video
    early = json.loads(json.dumps(sb))
    nothing = early["scenes"][1]["words"][10]
    assert nothing["w"] == "Nothing"
    nothing["s"], nothing["e"] = 8.0, 8.4
    v = _check((early, wav), {"spans": [[2.9, 8.2]]})
    assert v["faults"] == [] and v["last"] == "Savers held on and waited."
    # with no sound to ask, the word times are all there is
    cut, _, pieces, _ = shortcut.cut_one(early, {"spans": [[2.9, 8.2]], "speed": 1}, "short-1", None)
    assert _has(shortcut.check_edges(early, {"spans": [[2.9, 8.2]]}, "short-1", pieces, cut, None, made=True)["faults"], "the end cuts through", '"Nothing"')


def test_a_word_copied_from_the_next_scene_is_said_once(video):
    # captions that follow a recording can end a scene on a copy of the next scene's first small word
    sb, _ = video
    took = json.loads(json.dumps(sb))
    took["scenes"][1]["words"].append({"w": "But", "s": 12.2, "e": 12.5})
    said = [w["w"] for w in shortcut.spoken(took)]
    assert said.count("But") == 1 and said[said.index("far.") + 1] == "But"


def test_caption_words_that_are_not_in_the_script_warn_for_a_made_voice(video):
    sb, wav = video
    heard = json.loads(json.dumps(sb))
    heard["scenes"][1]["words"][5]["w"] = "Savours"  # the transcript misheard "Savers"; the script still says it
    assert _has(_check((heard, wav), {"spans": [[6.4, 8.2]]})["warnings"], "caption words that are not in the script", '"Savours"')
    assert not _has(_check((heard, wav), {"spans": [[6.4, 8.2]]}, made=False)["warnings"], "not in the script")


def test_captions_with_no_full_stops_are_not_judged_on_sentences(video):
    # a transcript made into a script has a full stop every 45 words: "inside a sentence" would be said of every cut
    sb, wav = video
    bare = json.loads(json.dumps(sb))
    for sc in bare["scenes"]:
        sc["words"] = [dict(w, w=w["w"].strip(".")) for w in sc["words"]]
    bare["scenes"][2]["words"] += [{"w": "more", "s": 14.6, "e": 14.6}] * 20  # over 40 words, none of them ending a sentence
    v = _check((bare, wav), {"spans": [[0.9, 3.7]]})
    assert not _has(v["faults"], "sentence") and _has(v["faults"], "the end at 3.70 s is in sound")  # the sound is still read
    assert _has(v["warnings"], "cannot be read from them")


def test_the_snap_on_decoded_sound_is_the_snap_on_the_file(video):
    _, wav = video
    spans = [(2.9, 8.2), (0.9, 3.7), (4.5, 8.2), (8.9, 11.0), (12.4, 14.7)]
    sound = shortcut.Sound(wav)
    try:
        assert [sound.snap([s]) for s in spans] == [voice.snap_spans([s], wav) for s in spans]
        # an edge the snap moved sits on a pause by the check's own measure
        (a, b), = sound.snap([(2.9, 8.2)])
        assert not sound.loud(a, True) and not sound.loud(b, False) and sound.pause(a) >= shortcut.PAUSE and sound.pause(b) >= shortcut.PAUSE
        assert sound.loud(4.05, False) and sound.pause(4.05) == 0.0
    finally:
        sound.close()


def _made_project(tmp_path, plan, made=True):
    """A project folder with the made-up video's voice, a plan, and (for a made voice) the voice step's record."""
    project = tmp_path / "proj"
    project.mkdir()
    sb, wav = _video(project)
    (project / "shorts.json").write_text(json.dumps({"shorts": plan}), encoding="utf-8")
    if made:
        (project / "voice.json").write_text(json.dumps({"made": "fake", "audioHash": file_hash(wav)}), encoding="utf-8")
    return str(project), sb, wav


PLAN = [{"name": "short-1", "spans": [[2.9, 8.2]], "hook": "A fifth gone", "speed": 1},
        {"name": "short-2", "spans": [[0.9, 3.7]], "hook": "Prices fell", "speed": 1}]


def test_cut_shorts_cuts_all_checks_all_and_holds_back_the_fault(tmp_path, capsys):
    project, sb, wav = _made_project(tmp_path, PLAN)
    public = str(tmp_path / "public" / "projects" / "made-up")
    cuts = shortcut.cut_shorts(project, sb, wav, os.path.join(project, "shorts.json"), 3, public)
    assert [(c["name"], c["skip"]) for c in cuts] == [("short-1", False), ("short-2", True)]
    for c in cuts:  # the cut is made either way: the props, and the audio the renderer reads
        with open(c["props"], encoding="utf-8") as f:
            cut = json.load(f)
        assert cut["short"] == c["name"] and cut["captions"] is True and cut["audio"] == f"projects/made-up/{c['name']}.mp3"
        assert os.path.exists(os.path.join(public, f"{c['name']}.mp3"))
        assert c["out"] == os.path.join(project, f"made-up-{c['name']}.mp4") and not os.path.exists(c["out"])
    said = capsys.readouterr().out
    assert "SHORTS HELD BACK: short-2" in said and "ends 2 words into the next sentence" in said
    assert 'first words: "And the fund lost a"' in said and "short-1: 6.5 s" in said
    md = open(os.path.join(project, "shorts-check.md"), encoding="utf-8").read()
    assert "Held back: short-2." in md and "## short-2: 4.0 s, FAULT, held back" in md and "## short-1: 6.5 s" in md
    with open(os.path.join(project, "shorts-plan.json"), encoding="utf-8") as f:
        assert json.load(f) == PLAN


def test_force_renders_a_fault_and_pick_cuts_one_short(tmp_path, capsys):
    project, sb, wav = _made_project(tmp_path, PLAN)
    public = str(tmp_path / "public")
    plan_path = os.path.join(project, "shorts.json")
    forced = shortcut.cut_shorts(project, sb, wav, plan_path, 3, public, force=True)
    assert [c["skip"] for c in forced] == [False, False] and forced[1]["check"]["faults"]
    assert "SHORTS WITH A FAULT, NOT HELD BACK (--force-shorts): short-2" in capsys.readouterr().out
    for c in forced:
        os.remove(c["props"])
    one = shortcut.cut_shorts(project, sb, wav, plan_path, 3, public, picks=["short-2"])
    assert [c["name"] for c in one] == ["short-2"]
    assert sorted(n for n in os.listdir(os.path.join(project, ".cache")) if n.endswith(".json")) == ["short-2.json"]
    assert "Only short-2 was asked for" in open(os.path.join(project, "shorts-check.md"), encoding="utf-8").read()
    with pytest.raises(SystemExit, match="short-9"):
        shortcut.cut_shorts(project, sb, wav, plan_path, 3, public, picks=["short-9"])


def test_a_recording_is_never_held_back_and_a_pick_that_cannot_be_cut_is(tmp_path, capsys):
    plan = PLAN + [{"name": "short-3", "scenes": [41, 42], "hook": "Not there"}]
    project, sb, wav = _made_project(tmp_path, plan, made=False)
    cuts = shortcut.cut_shorts(project, sb, wav, os.path.join(project, "shorts.json"), 3, str(tmp_path / "public"), force=True)
    assert [(c["name"], c["skip"]) for c in cuts] == [("short-1", False), ("short-2", False), ("short-3", True)]
    assert cuts[1]["check"]["faults"] == [] and _has(cuts[1]["check"]["warnings"], "ends 2 words into the next sentence")
    assert _has(cuts[2]["check"]["faults"], "could not be cut", "no scenes to cut")  # told, and the others still cut
    assert "SHORTS HELD BACK: short-3" in capsys.readouterr().out


def test_a_check_that_trips_itself_never_costs_a_short(tmp_path, monkeypatch):
    project, sb, wav = _made_project(tmp_path, PLAN)

    def broken(*args, **kwargs):
        raise KeyError("a bug in the check")

    monkeypatch.setattr(shortcut, "check_edges", broken)
    cuts = shortcut.cut_shorts(project, sb, wav, os.path.join(project, "shorts.json"), 3, str(tmp_path / "public"))
    assert [c["skip"] for c in cuts] == [False, False] and all(os.path.exists(c["props"]) for c in cuts)  # cut and rendered as before
    assert _has(cuts[0]["check"]["warnings"], "was not checked", "a bug in the check")


def test_render_shorts_renders_what_the_check_let_through(tmp_path, monkeypatch):
    rendered = []
    monkeypatch.setattr(build, "render", lambda props, out, comp, concurrency, chunk=450: rendered.append((props, out, comp)))
    cuts = [{"name": "short-1", "props": "a.json", "out": "a.mp4", "skip": False, "check": {}},
            {"name": "short-2", "props": "b.json", "out": "b.mp4", "skip": True, "check": {}}]
    assert build.render_shorts(str(tmp_path), {"slug": "x"}, None, None, 450, None, 3, cuts) == ["a.mp4"]
    assert rendered == [("a.json", "a.mp4", "Vertical")]


SCRIPT = """# A tiny test video

slug: tiny-test
theme: whiteboard

[stat value="£400" label="lost in a week"]
Prices fell hard this week. And the fund lost a fifth of its value.

[text]
Savers held on and waited. Nothing has come back so far.

[text]
But most people never sell at all.
"""


def _tiny(tmp_path, monkeypatch):
    """A script-only project with two picks, the public folder pointed away from remotion/public, the renderer off."""
    project = tmp_path / "tiny"
    project.mkdir()
    (project / "script.md").write_text(SCRIPT, encoding="utf-8")
    (project / "shorts.json").write_text(json.dumps({"shorts": [{"name": "short-1", "scenes": [1, 2], "hook": "A fifth gone"}, {"name": "short-2", "scenes": [3], "hook": "Never sell"}]}), encoding="utf-8")
    monkeypatch.setenv("EI_PUBLIC_DIR", str(tmp_path / "public"))
    calls = []
    monkeypatch.setattr(build, "render", lambda *a, **k: calls.append(a))
    return project, calls


def test_no_render_cuts_and_checks_the_shorts_and_renders_nothing(tmp_path, monkeypatch, capsys):
    project, calls = _tiny(tmp_path, monkeypatch)
    assert build.main([str(project), "--no-render"]) == 0
    assert calls == []
    assert sorted(os.listdir(project / ".cache")) == ["short-1.json", "short-2.json"]
    assert "No Short is held back." in (project / "shorts-check.md").read_text(encoding="utf-8")
    assert os.path.isdir(tmp_path / "public" / "projects" / "tiny-test")  # the build's public folder is the one named
    assert "shorts check, before any render:" in capsys.readouterr().out


def test_pick_limits_the_run_and_no_shorts_leaves_them_alone(tmp_path, monkeypatch):
    project, calls = _tiny(tmp_path, monkeypatch)
    assert build.main([str(project), "--no-render", "--no-shorts"]) == 0
    assert not os.path.exists(project / ".cache") and not os.path.exists(project / "shorts-check.md")
    assert build.main([str(project), "--only-shorts", "--pick", "short-2"]) == 0
    assert os.listdir(project / ".cache") == ["short-2.json"]
    assert [(a[1], a[2]) for a in calls] == [(str(project / "tiny-test-short-2.mp4"), "Vertical")]  # only that Short, and no long video
    with pytest.raises(SystemExit, match="short-7"):
        build.main([str(project), "--no-render", "--pick", "short-7"])


def test_a_held_short_leaves_the_long_video_and_the_exit_code_alone_unless_strict(tmp_path, monkeypatch, capsys):
    project, calls = _tiny(tmp_path, monkeypatch)
    real = shortcut.cut_shorts

    def cut_with_a_fault(*args, **kwargs):  # a scenes pick cannot be held back, so the fault is put in by hand
        cuts = real(*args, **kwargs)
        cuts[0]["check"]["faults"] = ["starts 3 words into a sentence"]
        cuts[0]["skip"] = not args[7]  # --force-shorts
        return cuts

    monkeypatch.setattr(shortcut, "cut_shorts", cut_with_a_fault)
    assert build.main([str(project)]) == 0
    assert [a[2] for a in calls] == ["Main", "Vertical"] and calls[1][1].endswith("tiny-test-short-2.mp4")  # the long video and the other Short
    out = capsys.readouterr().out
    assert out.rstrip().endswith("=" * 100) and "SHORTS HELD BACK: short-1" in out.split("done")[-1]  # said again at the very end
    del calls[:]
    assert build.main([str(project), "--strict-shorts"]) == 3 and len(calls) == 2  # the same renders, then the code
    assert build.main([str(project), "--no-render", "--strict-shorts"]) == 3
    del calls[:]
    assert build.main([str(project), "--strict-shorts", "--force-shorts"]) == 0
    assert [os.path.basename(a[1]) for a in calls] == ["tiny-test.mp4", "tiny-test-short-1.mp4", "tiny-test-short-2.mp4"]


def test_the_public_folder_follows_the_environment(tmp_path, monkeypatch):
    monkeypatch.delenv("EI_PUBLIC_DIR", raising=False)
    assert build.public_root() == os.path.join(build.REMOTION, "public")
    said = []
    monkeypatch.setattr(build, "_remotion", lambda args, cwd: said.append(args) or 1)
    props = tmp_path / "p.json"
    props.write_text(json.dumps({"durationSec": 1.0, "fps": 30}), encoding="utf-8")
    with pytest.raises(SystemExit):
        build.render(str(props), str(tmp_path / "o.mp4"), "Main", None)
    assert not any(a.startswith("--public-dir") for a in said[0])  # nothing changes for a build that does not set it
    monkeypatch.setenv("EI_PUBLIC_DIR", str(tmp_path / "pub"))
    assert build.public_root() == str(tmp_path / "pub")
    with pytest.raises(SystemExit):
        build.render(str(props), str(tmp_path / "o.mp4"), "Main", None)
    assert f"--public-dir={tmp_path / 'pub'}" in said[1]  # the renderer reads the folder the build filled


def test_the_check_on_its_own_reads_the_committed_timing_and_changes_nothing(tmp_path, capsys):
    project, sb, wav = _made_project(tmp_path, PLAN)
    timing = {"slug": "made-up", "durationSec": 18.0, "audio": "voiceover.wav",
              "scenes": [{"id": sc["id"], "type": sc["type"], "start": sc["start"], "end": sc["end"], "words": sc["words"]} for sc in sb["scenes"]]}
    with open(os.path.join(project, "timing.json"), "w", encoding="utf-8") as f:
        json.dump(timing, f)
    before = sorted(os.listdir(project))
    out = tmp_path / "listen"
    assert shortcut.main([project, "--out", str(out)]) == 1  # a made voice, seconds typed as spans: short-2 would be held back
    said = capsys.readouterr().out
    assert "SHORTS A BUILD WOULD HOLD BACK: short-2" in said and "a made voice" in said
    assert sorted(os.listdir(out)) == ["short-1.mp3", "short-2.mp3", "shorts-check.md"]
    assert abs(voice.read(str(out / "short-1.mp3"), SR).size / SR - (0.4 + (8.19 - 2.91) + 0.8)) < 0.06  # the cut as the build makes it
    assert sorted(os.listdir(project)) == before  # nothing written into the project
    assert shortcut.main([project, "--pick", "short-1"]) == 0 and not os.path.exists(os.path.join(project, "shorts-check.md"))
    # another plan, by name; a recording gets warnings only
    os.remove(os.path.join(project, "voice.json"))
    other = tmp_path / "other.json"
    other.write_text(json.dumps([{"name": "short-1", "spans": [[0.9, 3.7]], "speed": 1}]), encoding="utf-8")
    assert shortcut.main([project, "--plan", str(other)]) == 0
    assert "a recording" in capsys.readouterr().out
    assert shortcut.main([str(tmp_path / "nowhere")]) == 2
