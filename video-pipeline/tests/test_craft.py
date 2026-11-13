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


def test_card_values_read_units_as_words_not_millions():
    vals = craft._card_values([{"do": "card", "t": 1.0, "text": "open an ISA: 10 minutes"}, {"do": "card", "t": 2.0, "text": "£83K"}, {"do": "card", "t": 3.0, "text": "£1.2m"}])
    assert [v for _, v in vals] == [10.0, 83000.0, 1200000.0]


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


def test_chart_series_take_a_named_colour_and_a_draw_length():
    from pipeline import script_parser
    src = """# T

theme: whiteboard
host: none

[chart line title="Two pots" draw=12]
data: Boring = 2000:1000, 2025:9000
data: Chaser:ink = 2000:1000, 2025:7200
Two pots.
"""
    sb = script_parser.parse_script(src)
    chart = [sc for sc in sb["scenes"] if sc["type"] == "chart"][0]
    names = [(se.get("name"), se.get("color")) for se in chart["props"]["series"]]
    assert names == [("Boring", None), ("Chaser", "ink")]
    assert chart["props"]["drawSeconds"] == 12.0


def test_page_marks_parse_with_their_rectangles_and_default_colours():
    sc = {"id": 4, "narration": "CNBC says China is the problem and analysts agree the shares fell", "words": []}
    bad = craft.plan_marks(sc, {"marks": "highlight 12,18,46,7@China; box 10,52,60,14@analysts; red:underline 12,40,30@fell; circle 62,40@shares"})
    assert bad == []
    got = [(m["word"], m["mark"]) for m in sc["markWords"]]
    assert got[0] == (2, {"kind": "highlight", "x": 12.0, "y": 18.0, "w": 46.0, "h": 7.0, "color": "marker"})
    assert got[1] == (7, {"kind": "box", "x": 10.0, "y": 52.0, "w": 60.0, "h": 14.0, "color": "ink"})
    assert got[2] == (11, {"kind": "underline", "x": 12.0, "y": 40.0, "w": 30.0, "color": "red"})  # red only because the script wrote it
    assert got[3][1] == {"kind": "circle", "x": 62.0, "y": 40.0, "color": "red"}  # the old kinds are untouched


def test_a_page_mark_that_leaves_the_picture_or_is_the_wrong_shape_is_reported():
    sc = {"id": 5, "narration": "one two three", "words": []}
    bad = craft.plan_marks(sc, {"marks": "highlight 70,18,46,7@one; box 10,52,60@two; underline 12,40,30,5@three"})
    assert len(bad) == 3
    assert "leaves the picture" in bad[0] and "x,y,w,h" in bad[1] and "x,y,w@word" in bad[2]
    assert [m["mark"]["kind"] for m in sc["markWords"]] == ["highlight"]  # out of bounds is drawn clamped; the wrong shapes are dropped


def test_page_marks_and_the_card_strip_reach_the_storyboard():
    from pipeline import script_parser
    src = """# T

theme: whiteboard
host: none
brand.pagecards: strip
brand.pencil: on

[broll src="real-page.jpg" caption="CNBC, 10 November 2026" cards_at=strip marks="highlight 12,18,46,7@China; underline 12,40,30@fell"]
CNBC says China is the problem and the shares fell.
"""
    sb = script_parser.parse_script(src)
    sc = sb["scenes"][0]
    assert sc["props"]["cards_at"] == "strip"
    assert sb["brand"]["pagecards"] == "strip" and sb["brand"]["pencil"] == "on"
    words = [{"w": w, "s": 1.0 + i * 0.3, "e": 1.2 + i * 0.3} for i, w in enumerate(sc["narration"].split())]
    sc["start"], sc["end"], sc["words"] = 0.5, 5.0, words
    script_parser.time_cues(sc)
    marks = [c for c in sc["cues"] if c.get("do") == "mark"]
    assert [(c["kind"], c["x"], c["y"], c["w"], c.get("h"), c["color"]) for c in marks] == [("highlight", 12.0, 18.0, 46.0, 7.0, "marker"), ("underline", 12.0, 40.0, 30.0, None, "ink")]
    assert marks[0]["t"] == round(words[2]["s"] - 0.08, 3) and marks[1]["t"] == round(words[9]["s"] - 0.08, 3)
