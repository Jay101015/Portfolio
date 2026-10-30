import numpy as np

from pipeline import sfx


def _sb():
    return {"scenes": [
        {"id": 1, "type": "hook", "start": 0.0, "end": 5.0, "words": [{"w": "Prices", "s": 0.2}, {"w": "up", "s": 0.5}, {"w": "30%.", "s": 0.8}]},
        {"id": 2, "type": "text", "start": 5.0, "end": 9.0, "words": [{"w": "And", "s": 5.2}], "cues": [{"t": 6.0, "do": "card", "text": "x"}]},
        {"id": 3, "type": "stat", "start": 9.0, "end": 15.0, "words": [{"w": "about", "s": 9.3}, {"w": "thirteen", "s": 9.6}, {"w": "hundred", "s": 9.9}]},
        {"id": 4, "type": "stat", "start": 15.0, "end": 20.0, "words": [{"w": "nine", "s": 15.4}]},
    ]}


def test_punch_lands_on_the_first_number_and_keeps_its_distance():
    sb = _sb()
    assert sfx.set_punches(sb, gap=6.0) == 2
    assert sb["scenes"][0]["punch"] == 0.8  # "30%", not "Prices"
    assert sb["scenes"][2]["punch"] == 9.6  # "thirteen"
    assert "punch" not in sb["scenes"][3]  # 5.8 s after the last one: too soon
    assert "punch" not in sb["scenes"][1]  # a text board never punches


def test_events_cover_cuts_cards_writing_and_the_key_number():
    sb = _sb()
    sfx.set_punches(sb)
    kinds = [k for _, k, _ in sfx.events(sb)]
    assert kinds.count("whoosh") == 3  # one per cut, none before the first scene
    assert "pop" in kinds and "ding" in kinds and "scribble" in kinds


def test_off_in_the_header_leaves_the_track_alone(tmp_path):
    sb = _sb()
    sb["sfx"] = False
    assert sfx.lay("voice.wav", sb, str(tmp_path / "out.wav")) == "voice.wav"


def test_sounds_are_short_and_normalised():
    for kind, length in (("whoosh", 0.45), ("pop", 0.12), ("scribble", 0.8), ("ding", 0.9)):
        x = sfx._sound(kind, length)
        assert len(x) == int(sfx.SR * length)
        assert abs(float(np.max(np.abs(x))) - 1.0) < 1e-6


def _w(text, t0=0.0):
    return [{"w": w, "s": round(t0 + i * 0.3, 2)} for i, w in enumerate(text.split())]


def test_key_number_skips_years_and_a_lone_one():
    assert sfx.key_number(_w("Since 2021, prices have gone up about thirty percent."))["w"] == "thirty"
    assert sfx.key_number(_w("Then there's one our parents never paid: nine percent of everything."))["w"] == "nine"
    assert sfx.key_number(_w("Nothing to see here.")) is None


def test_key_number_prefers_the_figure_on_screen():
    words = _w("On the typical salary of thirty-nine thousand three hundred, that's about thirteen hundred pounds a year.")
    assert sfx.key_number(words)["w"] == "thirty-nine"  # the longest run, with nothing to match
    assert sfx.key_number(words, {"value": "£1,300 a year"})["w"] == "thirteen"
    assert sfx.key_number(_w("it's seven point six times a full salary"), {"board": "today: 7.6×"})["w"] == "seven"


def test_spoken_value_reads_british_figures():
    assert sfx.spoken_value(_w("thirty-nine thousand three hundred")) == 39300
    assert sfx.spoken_value(_w("one thousand four hundred and six")) == 1406
    assert sfx.spoken_value(_w("seven point six")) == 7.6
    assert sfx.spoken_value(_w("a hundred")) == 100
    assert sfx.spoken_value(_w("eighty-three grand")) == 83000
    assert sfx.spoken_value(_w("£1,406")) == 1406


def test_a_continued_preview_gets_no_whoosh():
    sb = {"scenes": [
        {"id": 1, "type": "broll", "start": 0.0, "end": 5.0, "props": {"next": "on", "src": "x.mp4"}},
        {"id": 2, "type": "broll", "start": 5.0, "end": 12.0, "props": {"next": "on", "src": "x.mp4", "cont": "on"}},
        {"id": 3, "type": "outro", "start": 12.0, "end": 15.0, "props": {}},
    ]}
    assert [k for _, k, _ in sfx.events(sb)] == ["whoosh"]  # only the cut to the outro
