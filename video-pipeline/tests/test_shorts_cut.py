"""pipeline/shorts.cut_short: a Short's picture runs from its first frame to its last."""
from pipeline.shorts import cut_short


def _sb():
    return {"slug": "x", "fps": 30, "durationSec": 30.0, "scenes": [
        {"id": 1, "type": "hook", "start": 0.0, "end": 5.0, "props": {}, "words": [{"w": "a", "s": 0.5, "e": 0.8}], "cues": []},
        {"id": 2, "type": "stat", "start": 5.0, "end": 12.0, "props": {}, "words": [{"w": "b", "s": 6.0, "e": 6.4}], "cues": [{"do": "card", "t": 7.0}]},
        {"id": 3, "type": "text", "start": 12.0, "end": 20.0, "props": {}, "words": [], "cues": []},
    ]}


def test_first_frame_and_tail_are_picture():
    cut, spans = cut_short(_sb(), [1, 3], "hook")
    assert spans == [(0.0, 5.0), (12.0, 20.0)]
    assert cut["scenes"][0]["start"] == -0.8  # the first frame is already 0.8 s into the first board: ink, not bare paper
    assert cut["scenes"][-1]["end"] == cut["durationSec"]  # the last board holds to the file's end
    assert abs(cut["durationSec"] - (0.4 + 5.0 + 8.0 + 0.8)) < 1e-6


def test_words_and_cues_shift_with_their_scene():
    cut, _ = cut_short(_sb(), [2], "hook")
    sc = cut["scenes"][0]
    assert sc["words"][0]["s"] == 1.4 and sc["cues"][0]["t"] == 2.4
