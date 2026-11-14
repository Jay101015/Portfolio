"""A Short's zones (remotion/src/components/upright.json): every number is a fraction of the frame, the sticker, the
caption, the stage and the cards do not overlap in any variant, EDITOR.md's zone table quotes the same numbers, and the
scenes that are laid in the zones (the caption, the receipt, the stat, the pie, the chart, the compare, the cards, the
photo opener) read them from the file. Also the first scene of a Short (paper/opener.ts) and the pencil bars a header
can ask for. python -m pytest tests/test_upright.py"""
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


def test_the_cards_keep_off_the_drawing_and_the_character():
    z = zones()
    cards, left = z["cards"], z["stage"]["left"]
    # with nothing else in the band the cards may run from the left margin to their right edge
    assert left < cards["right"]
    # beside a drawing or loop they start right of it, and still have a third of the width to be read in
    assert z["drawing"]["right"] <= cards["beside_drawing"] < cards["right"]
    assert cards["right"] - cards["beside_drawing"] >= 0.33
    # beside the character they end left of where he stands: his feet are at the middle of his box, and a standing
    # figure is under half as wide as the box, so the first tenth of the box is bare paper
    box = z["character"]
    assert left < cards["beside_character"] <= box["left"] + (box["right"] - box["left"]) * 0.1
    assert cards["beside_character"] - left >= 0.33
    # with both, the one card goes over the drawing and left of him: there is a gap between his head and its top
    assert z["drawing"]["top"] - z["stage"]["foot"]["character"] >= 0.1


def test_the_photo_openers_number_stays_above_the_title_and_left_of_the_buttons():
    z = zones()
    opener, yt = z["opener"], z["youtube"]
    assert opener["foot"] <= 1 - yt["bottom"]  # its foot is above YouTube's title strip
    assert opener["right"] <= 1 - yt["right"]  # and it ends left of the buttons, which stand beside it
    assert opener["foot"] > yt["right_from"]
    assert opener["foot"] >= 0.75  # low on the photo: the face is above it


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
    assert {k for k, v in cap["at"].items() if v == "set"} == {"set"}  # a compare is laid in the stage: it has the band


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
        "Cards beside a drawing or loop": [z["cards"]["beside_drawing"]],
        "Cards beside the character": [z["cards"]["beside_character"]],
        "Photo opener's number": [z["opener"]["foot"], z["opener"]["right"]],
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
    # the chart and the compare each have a row, in the band, that says they are laid in the stage
    for kind in ("chart", "compare"):
        row = next((cells for cells in rows if re.search(rf"\b{kind}\b", cells[0])), None)
        assert row is not None, kind
        assert f"{pct(cap['top'])}%" in row[1] and "In the stage" in row[2], row


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


def component(source, name):
    """the source of one exported component or helper: from its `export const <name>` to the next top-level one"""
    start = source.index(f"export const {name}")
    rest = source[start + 1:]
    nxt = re.search(r"\n(export const |const [A-Z]|// -{20,})", rest)
    return source[start:start + 1 + (nxt.start() if nxt else len(rest))]


def test_the_stat_the_pie_the_cards_and_the_opener_are_laid_out_from_the_zones():
    scenes = read(SRC, "paper", "scenes.tsx")
    money = read(SRC, "paper", "money.tsx")
    setpiece = read(SRC, "paper", "setpiece.tsx")
    video = read(SRC, "Video.tsx")
    # the stat and the pie ask for the stage, with what stands under it, and no longer hang from 29% of the height
    stat, pie = component(scenes, "PaperStat"), component(money, "PaperPie")
    for src in (stat, pie):
        assert "useUpright()" in src and "up.stage(stageUnder(" in src
        assert "height * 0.29" not in src
    assert "0.78" in stat and "420 * u" in stat and "190 * u" in stat  # fitted to 78% of the stage, 420 px to 190 px
    assert "350 * u" in pie  # the pie's radius at most
    # the cards of a Short's board hang from the zone's right edge, not from a column centred at 73% of the width
    cards = component(setpiece, "FootageCards")
    assert "from '../components/upright.json'" in setpiece
    for key in ("cards.right", "cards.beside_drawing", "cards.beside_character", "cards.bottom"):
        assert key in cards, key
    assert "0.73" not in cards
    assert "cards.right" in component(setpiece, "SetScene")  # a set piece's column on the right stops there too
    # the photo opener: red only for a loss, placed from the file, and the hook sticker off while it is up
    broll = component(scenes, "PaperBroll")
    assert "zones.opener.foot" in broll and "zones.opener.right" in broll
    assert "isLoss(" in broll and "brand.accent2 : NAVY" in broll
    assert "background: brand.accent2, color: '#fff'" not in broll  # the block that was red whatever the figure
    assert "bigOpener(current)" in component_of_banner(video)


def component_of_banner(video):
    """the hook sticker's component in Video.tsx (not exported)"""
    start = video.index("const HookBanner")
    return video[start:video.index("\n};", start)]



def test_the_chart_and_the_compare_are_laid_out_from_the_zones():
    scenes = read(SRC, "paper", "scenes.tsx")
    chart, compare = component(scenes, "PaperChart"), component(scenes, "PaperCompare")
    for src in (chart, compare):
        # they ask for the stage, with what stands under it, and no longer hang from a fraction of the height
        assert "useUpright()" in src and "up.stage(stageUnder(" in src
        assert "height * 0.29" not in src
        # the title, the content and the source line share the stage's height between them
        assert "stage.h - titleH - sourceH" in src
        assert "left: stage.x, top: stage.y, width: stage.w, height: stage.h" in src
    # the chart: the band a third of the height tall is gone, and the plot's width is the stage's
    assert "0.31" not in chart
    assert "W = stage.w" in chart
    # the compare: the fixed 400 px box is gone; the value is fitted to 80% of the box, the items are 50 px
    assert "400 : 480" not in compare and "400 * u" not in compare
    assert "cardW = stage.w" in compare and "(cardW * 0.8) / valueEm" in compare and "50 * u" in compare
    # its caption has the band like every other scene laid in the stage (the 13.5% exception is gone)
    assert "compare" not in zones()["caption"]["at"]
    assert "compare" not in component_of_banner(read(SRC, "Video.tsx"))


def test_the_first_scene_of_a_short_is_posed_on_its_first_frame():
    opener = read(SRC, "paper", "opener.ts")
    assert "export const Opener = React.createContext(false)" in opener
    # Video.tsx sets it for the first scene of a Short and no other
    video = read(SRC, "Video.tsx")
    assert "<Opener.Provider value={!!sb.short && idx === 0}>" in video
    assert video.count("Opener.Provider value") == 1
    # the chart and the compare read it: the title, the axes and the boxes are finished on frame 0
    scenes = read(SRC, "paper", "scenes.tsx")
    for name in ("PaperChart", "PaperCompare"):
        src = component(scenes, name)
        assert "const posed = React.useContext(Opener)" in src, name
        assert "start={posed ? POSED : 4}" in src, name  # the title is already written
    chart = component(scenes, "PaperChart")
    assert "const axes = posed ? 1 :" in chart  # the axes are already drawn
    assert "const pencil = posed || !!brand.pencil" in chart  # and every bar is outlined
    compare = component(scenes, "PaperCompare")
    assert "const box = posed ? 1 :" in compare and "const textAt = posed ? POSED :" in compare


def test_pencil_bars_are_asked_for_in_the_header_and_off_without_it():
    # `brand.pencil: on` in a script header reaches the renderer as brand.pencil; without it the flag is false
    assert "pencil?: boolean" in read(SRC, "types.ts")
    video = read(SRC, "Video.tsx")
    assert "pencil: ['on', 'yes', 'true', '1'].includes(String(flags.pencil ?? 'off').toLowerCase())" in video
    chart = component(read(SRC, "paper", "scenes.tsx"), "PaperChart")
    assert "pencil && grow < 1" in chart  # the outline is drawn only while asked for and until the bar is filled
    md = read(ROOT, "EDITOR.md")
    section = md.split("## A Short's page (vertical)", 1)[1].split("\n## ", 1)[0]
    assert "`brand.pencil: on`" in section


def test_editor_md_no_longer_says_a_chart_is_a_third_of_the_height():
    md = read(ROOT, "EDITOR.md")
    assert "A chart is a third of the height" not in md
    assert "third of the height" not in md.split("## A Short's page (vertical)", 1)[1].split("\n## ", 1)[0]
    section = md.split("## A Short's page (vertical)", 1)[1].split("\n## ", 1)[0]
    assert "A chart is laid in the stage" in section and "A compare is laid in the stage" in section
    assert "The first frame is the Short's picture in the feed" in section
