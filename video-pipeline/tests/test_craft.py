from pipeline import craft


def _w(text, t0=0.0, step=0.3):
    return [{"w": w, "s": round(t0 + i * step, 2), "e": round(t0 + i * step + 0.25, 2)} for i, w in enumerate(text.split())]


def test_figures_are_written_the_way_the_board_writes_them():
    w = _w("prices have gone up about thirty percent since then")
    assert craft.figure_text(w, 5, 6) == ("30%", 30)
    w = _w("you'd need to earn around eighty-three grand a year")
    (i0, i1), = craft.number_runs(w)
    assert craft.figure_text(w, i0, i1) == ("£83,000 a year", 83000)
    w = _w("it's seven point six times a salary and two hundred pounds a month")
    runs = craft.number_runs(w)
    assert craft.figure_text(w, *runs[0]) == ("7.6×", 7.6)
    assert craft.figure_text(w, *runs[1]) == ("£200 a month", 200)
    w = _w("there are two things to do")
    assert craft.figure_text(w, 2, 3) is None  # a small plain count is not a figure
    w = _w("only a few percent higher than it was")
    assert craft.number_runs(w) == []  # "percent" on its own is not a number
    w = _w("a coffee is three pound fifty every working day")
    runs = craft.number_runs(w)
    assert craft.figure_text(w, *runs[0]) == ("£3.50", 3.5)  # the pence read ahead from the pounds
    assert craft.figure_text(w, *runs[1]) is None  # "fifty" on its own is not a second figure
    w = _w("sixteen to twenty-four year olds are out of work")
    assert craft.figure_text(w, 2, 3) is None  # an age range
    w = _w("eighteen years. prices kept moving")
    assert craft.figure_text(w, 0, 1) == ("18 years", 18)  # the unit makes the figure
    w = _w("start at twenty-two and it is two hundred and eight thousand. by sixty")
    runs = craft.number_runs(w)
    assert craft.figure_text(w, *runs[0]) is None  # "22" on its own says nothing
    assert craft.figure_text(w, *runs[1]) == ("208,000", 208000)  # the full stop after "thousand" does not end the number


def test_key_words_skip_the_figure_on_screen_and_the_cards():
    sc = {"type": "stat", "start": 0.0, "end": 12.0, "props": {"value": "£1,406"},
          "words": _w("rent is now one thousand four hundred and six pounds a month up almost four percent in a year and fees cost two hundred pounds"),
          "cues": [{"t": 3.0, "do": "card", "text": "up 4%"}]}
    assert craft.key_words(sc) == 1
    assert sc["keys"][0]["text"] == "£200" and sc["keys"][0]["color"] == "red"  # "fees cost" before it
    sc["props"]["sub"] = "fees: £200"  # now the board says it too
    assert craft.key_words(sc) == 0


def test_auto_cards_fill_a_long_board_and_leave_a_short_one():
    long = {"type": "text", "start": 0.0, "end": 16.0, "props": {},
            "words": _w("in nineteen ninety seven a home cost three point six times a salary and today it is seven point six times and in London ten point six times", step=0.5), "cues": []}
    n = craft.auto_cards(long)
    assert n == 2 and [c["text"] for c in long["cues"]] == ["3.6×", "7.6×"]  # two landings over 16 s, four seconds apart
    short = {"type": "text", "start": 0.0, "end": 5.0, "props": {}, "words": _w("about thirty percent"), "cues": []}
    assert craft.auto_cards(short) == 0


def test_auto_cards_leave_a_loop_board_and_a_turn_of_phrase():
    words = _w("buying your first home one day put four thousand of it in and twenty thousand more the year after", step=0.5)
    loop = {"type": "stat", "start": 0.0, "end": 16.0, "props": {"anim": "deposit-jar"}, "words": words, "cues": []}
    assert craft.auto_cards(loop) == 0  # the loop is the motion on that board
    plain = {"type": "stat", "start": 0.0, "end": 16.0, "props": {}, "words": words, "cues": []}
    craft.auto_cards(plain)
    assert "1 day" not in [c["text"] for c in plain["cues"]]  # "one day" is not a figure
    assert [c["text"] for c in plain["cues"]][:1] == ["4,000"]
    keyed = {"type": "stat", "start": 0.0, "end": 16.0, "props": {}, "words": words, "cues": []}
    craft.key_words(keyed)
    assert "1 day" not in [k["text"] for k in keyed.get("keys", [])]


def test_marks_parse_to_word_indexed_cues():
    sc = {"id": 3, "narration": "look at the price on the right then the total", "words": []}
    bad = craft.plan_marks(sc, {"marks": "circle 62,40@price; green:arrow 30,70@total; note:the bit that matters 50,80@right; squiggle 1,1"})
    assert len(bad) == 1 and "squiggle" in bad[0]
    kinds = [(m["word"], m["mark"]["kind"], m["mark"]["color"]) for m in sc["markWords"]]
    assert kinds == [(3, "circle", "red"), (9, "arrow", "green"), (6, "note", "red")]
    assert sc["markWords"][2]["mark"]["text"] == "the bit that matters"


def test_the_character_is_rationed():
    assert craft.ration({"scenes": [{"type": "set"}, {"type": "text"}]}) is None
    assert "rationed" in craft.ration({"scenes": [{"type": "set"}, {"type": "set"}]})


def test_every_loop_the_parser_allows_is_drawn():
    import os, re
    src = open(os.path.join(os.path.dirname(__file__), "..", "remotion", "src", "paper", "loops.tsx"), encoding="utf-8").read()
    drawn = set(re.findall(r"name === '([a-z-]+)'", src))
    assert craft.LOOPS == drawn
