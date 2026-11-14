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


def test_snap_spans_keeps_a_reordered_piece(tmp_path):
    import numpy as np
    from pipeline import voice
    sr = 16000
    x = np.zeros(sr * 20, dtype=np.float32)
    for a, b in [(1, 4), (6, 9), (12, 15)]:
        x[int(a * sr):int(b * sr)] = 0.3 * np.sin(np.arange(int((b - a) * sr)) * 0.2)
    p = tmp_path / "v.wav"
    voice.write(str(p), x, sr) if hasattr(voice, "write") else __import__("scipy.io.wavfile", fromlist=["write"]).write(str(p), sr, (x * 32767).astype(np.int16))
    out = voice.snap_spans([(12.0, 15.0), (1.0, 4.0)], str(p))
    assert len(out) == 2 and out[0][0] > 11 and out[1][1] < 5


def test_a_cut_short_has_captions_on_and_its_name_set():
    # the renderer hides the long video's progress line on anything that carries a `short` name, and a Short always
    # shows its captions, whatever the long video's `captions:` line says
    from pipeline import shortcut
    sb = dict(_sb(), captions=False)
    for pick in ({"name": "short-7", "scenes": [1, 2]}, {"name": "short-7", "spans": [[5.5, 11.0]]}):
        cut, spans, pieces, speed = shortcut.cut_one(sb, pick, "short-7", None)
        assert cut["captions"] is True and cut["short"] == "short-7"
        assert speed == 1.2 and cut["speed"] == 1.2  # a Short plays a little faster unless the pick says otherwise
    assert pieces == [(5.5, 11.0)] and spans == [(5.5, 11.0)]
    assert shortcut.cut_one(sb, {"name": "short-7", "scenes": [1, 2]}, "short-7", None)[2] == [(0.0, 12.0)]  # scenes side by side: one stretch, two edges
    assert shortcut.cut_one(sb, {"name": "empty"}, "empty", None) is None
