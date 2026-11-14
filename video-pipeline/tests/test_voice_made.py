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


def test_a_still_picture_is_not_fitted_like_a_clip(tmp_path):
    # read as a 0.04 s clip, a photo was "held on its last frame" from frame two and never pushed in
    from PIL import Image
    pic = tmp_path / "real-photo.jpg"
    Image.new("RGB", (64, 36), "white").save(pic)
    sc = {"id": 1, "start": 0.0, "end": 5.0, "props": {"src": "real-photo.jpg", "zoom": "in"}}
    assert build.fit_clip(sc, str(pic)) == []
    assert sc["props"] == {"src": "real-photo.jpg", "zoom": "in"}


def test_mute_takes_short_stretches_only():
    assert build.mute_header("388.66-388.78, 12 - 12.4s") == [(388.66, 388.78), (12.0, 12.4)]
    assert build.mute_header("10-12") == []  # two seconds is a word or more: never cut
    assert build.mute_header(None) == [] and build.mute_header("soon") == []


def test_mute_spans_silences_and_keeps_the_length(tmp_path):
    import numpy as np
    from pipeline import voice
    src, dst = str(tmp_path / "a.wav"), str(tmp_path / "b.wav")
    x = np.full(voice.SR, 8000.0)  # the voice module works in 16-bit sample values
    voice.write(src, x)
    voice.mute_spans(src, dst, [(0.4, 0.5)])
    y = voice.read(dst)
    assert len(y) == len(x)
    assert abs(y[int(0.45 * voice.SR)]) < 1 and abs(y[int(0.2 * voice.SR)] - 8000) < 2 and abs(y[int(0.7 * voice.SR)] - 8000) < 2


def test_captions_keep_the_script_order_when_word_times_run_backwards():
    from pipeline import srt
    words = [("So", 0.64, 0.72), ("Nvidia", 0.52, 0.76), ("has", 0.4, 0.8), ("lost", 0.8, 1.5), ("over", 1.5, 1.88), ("$400", 1.88, 2.36),
             ("billion", 2.36, 3.24), ("in", 3.24, 3.5), ("2", 3.5, 3.9), ("days.", 3.9, 4.6), ("And", 5.9, 6.0), ("I'm", 6.0, 6.2)]
    sb = {"scenes": [{"words": [{"w": w, "s": s, "e": e} for w, s, e in words]}]}
    lines = [text for _, _, text in srt.cues(sb)]
    assert lines[0] == "So Nvidia has lost over $400 billion in 2 days."  # in order, and the sentence whole
    starts = [s for s, _, _ in srt.cues(sb)]
    assert starts == sorted(starts)


def test_a_cut_never_lands_in_a_consonant_inside_a_word(tmp_path):
    # "again." with a 40 ms closure in it, then a real pause; the next scene's first word is timed early, inside "again."
    import numpy as np
    from pipeline import voice
    sr = 16000
    rng = np.random.default_rng(1)
    def talk(sec):
        return rng.normal(0, 3000, int(sec * sr))
    def hush(sec):
        return rng.normal(0, 8, int(sec * sr))
    x = np.concatenate([talk(1.0), talk(0.30), hush(0.04), talk(0.30), hush(0.50), talk(1.0)])  # "again" = 1.00 to 1.64, pause 1.64 to 2.14
    wav = str(tmp_path / "v.wav")
    voice.write(wav, x, sr)
    sb = {"scenes": [{"start": 0.0, "end": 1.2, "words": [{"w": "mistake", "s": 0.2, "e": 0.9}, {"w": "again.", "s": 1.0, "e": 1.25}]},
                     {"start": 1.2, "end": 3.1, "words": [{"w": "I", "s": 1.3, "e": 1.4}, {"w": "don't", "s": 2.3, "e": 2.6}]}]}
    assert voice.snap_cuts(sb, wav) == 1
    cut = sb["scenes"][1]["start"]
    assert 1.66 <= cut <= 2.12, cut  # in the pause after the word, not in the 40 ms closure at 1.30 to 1.34


def test_a_cut_already_in_a_pause_stays_where_the_old_rule_put_it(tmp_path):
    import numpy as np
    from pipeline import voice
    sr = 16000
    rng = np.random.default_rng(2)
    x = np.concatenate([rng.normal(0, 3000, sr), rng.normal(0, 8, int(0.4 * sr)), rng.normal(0, 3000, sr)])  # pause 1.0 to 1.4
    wav = str(tmp_path / "v.wav")
    voice.write(wav, x, sr)
    def board():
        return {"scenes": [{"start": 0.0, "end": 1.1, "words": [{"w": "one", "s": 0.1, "e": 0.9}]}, {"start": 1.1, "end": 2.4, "words": [{"w": "two", "s": 1.4, "e": 2.0}]}]}
    sb = board()
    voice.snap_cuts(sb, wav)
    cut = sb["scenes"][1]["start"]
    assert 1.0 <= cut <= 1.4
    # the quietest 30 ms of the search window, exactly as before this guard existed
    xr = voice.read(wav, sr)
    a, b, win = int(0.7 * sr), int(1.45 * sr), int(0.03 * sr)
    e = np.convolve(xr[a:b] ** 2, np.ones(win) / win, mode="valid")
    assert cut == round((a + int(e.argmin()) + win // 2) / sr, 3)
