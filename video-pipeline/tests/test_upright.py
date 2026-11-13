"""A Short's zones (remotion/src/components/upright.json): every number is a fraction of the frame, the sticker, the
caption, the stage and the cards do not overlap in any variant, and EDITOR.md's zone table quotes the same numbers.
python -m pytest tests/test_upright.py"""
import json
import os
import re

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(ROOT, "remotion", "src")


def zones():
    with open(os.path.join(SRC, "components", "upright.json"), encoding="utf-8") as fh:
        return json.load(fh)


def read(*parts):
    with open(os.path.join(*parts), encoding="utf-8") as fh:
        return fh.read()


def numbers(node, path=""):
    """every number in the file, with the path to it"""
    if isinstance(node, dict):
        for k, v in node.items():
            yield from numbers(v, f"{path}.{k}" if path else k)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from numbers(v, f"{path}[{i}]")
    elif isinstance(node, (int, float)) and not isinstance(node, bool):
        yield path, node


def test_every_number_is_a_fraction_of_the_frame():
    found = list(numbers(zones()))
    assert len(found) >= 25
    for path, v in found:
        assert 0 < v < 1, (path, v)


def test_youtube_sticker_caption_and_stage_run_down_the_frame_in_that_order():
    z = zones()
    assert z["youtube"]["top"] <= z["sticker"]["top"] < z["sticker"]["bottom"]
    assert z["sticker"]["bottom"] <= z["caption"]["top"] < z["caption"]["bottom"]
    assert z["caption"]["bottom"] <= z["stage"]["top"]


def test_the_stage_ends_above_whatever_stands_under_it():
    z = zones()
    foot, strip = z["stage"]["foot"], 1 - z["youtube"]["bottom"]
    assert set(foot) == {"bare", "cards", "drawing", "character"}
    for name, f in foot.items():
        assert z["stage"]["top"] < f <= strip, name
    assert foot["bare"] <= strip  # nothing under it: it stops above YouTube's title strip
    assert foot["cards"] <= z["cards"]["top"]
    assert foot["drawing"] <= z["drawing"]["top"]
    assert foot["character"] <= z["character"]["top"]
    assert foot["character"] <= foot["drawing"] <= foot["cards"] <= foot["bare"]  # the more below, the higher it ends


def test_the_stage_keeps_out_of_the_buttons():
    z = zones()
    s, yt = z["stage"], z["youtube"]
    assert s["left"] < s["narrow_right"] <= s["right"]
    assert s["narrow_right"] <= 1 - yt["right"]  # beside the buttons it stops short of them
    assert s["narrow_from"] <= yt["right_from"]  # and it narrows no lower than they start
    assert s["top"] < s["narrow_from"]


def test_cards_drawing_and_character_stay_out_of_youtube_and_of_each_other():
    z = zones()
    yt = z["youtube"]
    strip, buttons = 1 - yt["bottom"], 1 - yt["right"]
    assert z["cards"]["top"] < z["cards"]["bottom"] <= strip
    assert z["cards"]["right"] <= buttons and z["cards"]["top"] >= yt["right_from"]
    for name in ("drawing", "character"):
        r = z[name]
        assert r["left"] < r["right"] and r["top"] < r["bottom"] <= strip, name
        assert r["left"] >= z["stage"]["left"], name
        assert r["right"] <= buttons, name  # both stand lower than the buttons start
    assert z["drawing"]["right"] <= z["character"]["left"]


def test_the_caption_clears_the_sticker_and_what_is_under_it_wherever_it_sits():
    z = zones()
    cap = z["caption"]
    pill = cap["bottom"] - cap["top"]  # the band is the pill's height (the pill is a shade less)
    # in the middle of a board: under the sticker, over the character's head and the cards
    assert z["sticker"]["bottom"] <= cap["board"]
    assert cap["board"] + pill <= z["character"]["top"]
    assert cap["board"] + pill <= z["cards"]["top"]
    # high on a set piece: the sticker there is in its older, smaller place, and the caption sits under that
    older = z["sticker"]["set"]
    assert older["top"] < older["bottom"] <= cap["set"]
    assert cap["set"] + pill <= z["stage"]["top"]
    # the scene types that carry it somewhere other than the band
    assert set(cap["at"].values()) <= {"board", "set"}
    assert {k for k, v in cap["at"].items() if v == "board"} == {"text", "hook", "takeaway", "recap"}
    assert cap["at"].get("set") == "set"


def pct(v):
    """0.085 -> '8.5', 0.44 -> '44'"""
    return f"{round(v * 100, 1):g}"


def table(heading):
    """the rows of one table in EDITOR.md's Shorts section, the one whose first column is headed `heading`: a list of
    rows, each a list of cells"""
    md = read(ROOT, "EDITOR.md")
    section = md.split("## A Short's page (vertical)", 1)[1].split("\n## ", 1)[0]
    rows = []
    inside = False
    for line in section.splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if line.startswith(f"| {heading} "):
            inside = True
        elif inside and not line.startswith("|"):
            break
        elif inside and len(cells) >= 2 and not set(cells[0]) <= set("-: "):
            rows.append(cells)
    return rows


def zone_table():
    """the zone table: {zone name: the per cents in its 'Where' cell, in order}"""
    return {cells[0]: re.findall(r"(\d+(?:\.\d+)?)%", cells[1]) for cells in table("Zone")}


def test_editor_md_quotes_the_same_numbers():
    z = zones()
    yt, st, cap, stage = z["youtube"], z["sticker"], z["caption"], z["stage"]
    want = {
        "YouTube's header": [yt["top"]],
        "YouTube's title strip": [yt["bottom"]],
        "YouTube's buttons": [yt["right"], yt["right_from"]],
        "Hook sticker": [st["top"], st["bottom"]],
        "Hook sticker on a set piece": [st["set"]["top"], st["set"]["bottom"]],
        "Caption": [cap["top"], cap["bottom"]],
        "Caption on a board": [cap["board"]],
        "Caption on a set piece": [cap["set"]],
        "Stage": [stage["top"], stage["left"], stage["right"], stage["narrow_from"], stage["left"], stage["narrow_right"]],
        "Stage foot": [stage["foot"]["bare"], stage["foot"]["cards"], stage["foot"]["drawing"], stage["foot"]["character"]],
        "Cards": [z["cards"]["top"], z["cards"]["bottom"], z["cards"]["right"]],
        "Drawing or loop": [z["drawing"]["left"], z["drawing"]["right"], z["drawing"]["top"], z["drawing"]["bottom"]],
        "Character": [z["character"]["left"], z["character"]["right"], z["character"]["top"], z["character"]["bottom"]],
    }
    rows = zone_table()
    assert set(rows) == set(want), sorted(set(rows) ^ set(want))
    for name, values in want.items():
        assert rows[name] == [pct(v) for v in values], name
    # and every number in the file is in the table
    quoted = {float(x) for cells in rows.values() for x in cells}
    for path, v in numbers(z):
        assert float(pct(v)) in quoted, path


def test_editor_md_says_where_the_caption_sits_on_each_scene_type():
    z = zones()
    cap = z["caption"]
    rows = table("Scene")
    assert len(rows) >= 4
    # a scene type the file sends to the middle of a board or high on a set piece has a row that gives that height
    for kind, at in cap["at"].items():
        row = next((cells for cells in rows if re.search(rf"\b{kind}\b", cells[0])), None)
        assert row is not None, kind
        assert f"{pct(cap[at])}%" in row[1], (kind, row)
    # every other row has the caption in its band
    named = "|".join(cap["at"])
    for cells in rows:
        if not re.search(rf"\b({named})\b", cells[0]):
            assert f"{pct(cap['top'])}%" in cells[1], cells


def test_the_renderer_reads_the_zones_from_the_file():
    layout = read(SRC, "components", "layout.ts")
    assert "from './upright.json'" in layout
    assert "export const useUpright" in layout and "export const uprightStage" in layout
    # the caption's three places are no longer typed into Captions.tsx
    captions = read(SRC, "components", "Captions.tsx")
    assert "useUpright" in captions
    for literal in ("0.44", "0.135", "0.22"):
        assert literal not in captions, literal
    # the upright receipt starts at the top of the stage, not 20% down
    receipt = read(SRC, "paper", "receipt.tsx")
    assert "useUpright" in receipt and "height * 0.2" not in receipt
