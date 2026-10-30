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
