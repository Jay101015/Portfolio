from pipeline import craft


def _w(text):
    return [{"w": t, "s": i * 0.4, "e": i * 0.4 + 0.3} for i, t in enumerate(text.split())]


def test_a_pause_ends_a_spoken_number():
    words = _w("At 45, a million needs about sixteen hundred a month")
    figs = [craft.figure_text(words, a, b) for a, b in craft.number_runs(words)]
    assert not any(f and "45 million" in f[0] for f in figs)


def test_cards_off_stops_automatic_cards():
    sc = {"type": "compare", "start": 0.0, "end": 14.0, "props": {}, "noAutoCards": True,
          "words": _w("At 45 a million needs about sixteen hundred a month which is a lot")}
    assert craft.auto_cards(sc) == 0 and not sc.get("cues")
