"""A voice the pipeline made says exactly the approved words: a word said twice in it is the script, not a stumble,
so the build never cuts it (the finished Nvidia video lost a second of "Jensen is Nvidia, Nvidia is Jensen")."""
import json
import os

from pipeline import build
from pipeline.tts import file_hash
from pipeline.voice import restarts


def _project(tmp_path, made=True, match=True):
    take = tmp_path / "voiceover.m4a"
    take.write_bytes(b"not really audio")
    if made:
        (tmp_path / "voice.json").write_text(json.dumps({"made": "elevenlabs", "audioHash": file_hash(str(take)) if match else "0" * 16}))
    return str(tmp_path), str(take)


def test_a_made_voice_is_recognised_only_while_the_file_is_the_one_that_was_made(tmp_path):
    project, take = _project(tmp_path)
    assert build.made_voice(project, take)
    with open(take, "ab") as f:
        f.write(b" replaced by hand")
    assert not build.made_voice(project, take)
    assert not build.made_voice(project, None)


def test_a_recording_has_no_voice_record(tmp_path):
    project, take = _project(tmp_path, made=False)
    assert not build.made_voice(project, take)
    assert build.cut_restarts(project, take, {})


def test_restarts_are_cut_from_a_recording_and_kept_in_a_made_voice(tmp_path):
    # "is Nvidia, [0.78 s] Nvidia is" reads as a restart to the transcript check
    words = [{"w": "is", "s": 10.0, "e": 10.1}, {"w": "Nvidia,", "s": 10.15, "e": 10.6}, {"w": "Nvidia", "s": 11.38, "e": 11.8}, {"w": "is", "s": 11.85, "e": 11.95}]
    assert restarts(words)
    project, take = _project(tmp_path)
    assert not build.cut_restarts(project, take, {})
    stale, old_take = _project(tmp_path / "stale" if (tmp_path / "stale").mkdir() is None else tmp_path, match=False)
    assert build.cut_restarts(stale, old_take, {})


def test_the_script_header_overrides_either_way(tmp_path):
    project, take = _project(tmp_path)
    assert build.cut_restarts(project, take, {"restarts": "cut"})
    rec = tmp_path / "rec"
    rec.mkdir()
    recording, rtake = _project(rec, made=False)
    assert not build.cut_restarts(recording, rtake, {"restarts": "keep"})


def test_no_shorts_flag_is_offered():
    src = open(os.path.join(os.path.dirname(build.__file__), "build.py"), encoding="utf-8").read()
    assert '"--no-shorts"' in src and "not args.no_shorts" in src
