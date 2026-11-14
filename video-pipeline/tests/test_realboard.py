"""The real-material board: the classes, the verdicts on captured pages, the crop check and the ask list."""
import json
import re
from pathlib import Path

import pytest
from PIL import Image, ImageDraw, ImageFont

from pipeline import preflight
from pipeline import realboard as R

ROOT = Path(__file__).resolve().parent.parent
MARGIN = 120
LINE = "The company said on Monday that its chief executive had stepped down after eleven years."


def _font(size):
    try:
        return ImageFont.truetype(str(ROOT / "remotion" / "public" / "fonts" / "inter-latin-600-normal.woff2"), size)
    except OSError:
        return ImageFont.load_default(size=size)


def _article(body=6):
    """A plain article page as a capture sees it: the site's own bar, a two-line headline, body text, clean margins."""
    im = Image.new("RGB", (1600, 900), "white")
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 1600, 70], fill=(20, 30, 70))
    d.text((MARGIN, 18), "THE DAILY POST", font=_font(30), fill="white")
    y = 150
    for line in ("Acme shares fall ten per cent", "after its chief resigns"):
        d.text((MARGIN, y), line, font=_font(64), fill=(20, 20, 20))
        y += 84
    y += 20
    for _ in range(body):
        d.text((MARGIN, y), LINE, font=_font(24), fill=(60, 60, 60))
        y += 40
    return im


def _wall():
    """A near-empty page: the 'press and hold' wall a site shows a robot."""
    im = Image.new("RGB", (1600, 900), (250, 251, 252))
    d = ImageDraw.Draw(im)
    d.rectangle([560, 300, 1040, 560], fill="white", outline=(232, 232, 232))
    d.text((690, 370), "Before we continue...", font=_font(26), fill=(90, 90, 90))
    return im


def _dialog():
    """A consent dialog over a dimmed page."""
    im = Image.blend(_article(), Image.new("RGB", (1600, 900), "black"), 0.4)
    d = ImageDraw.Draw(im)
    d.rectangle([500, 250, 1100, 650], fill="white")
    d.text((620, 300), "Legal Terms and Privacy", font=_font(30), fill=(10, 10, 10))
    d.rectangle([730, 540, 870, 590], fill=(10, 10, 10))
    return im


def _advert():
    """An article with an empty advert slot: a large flat pale box with a small label."""
    im = _article()
    d = ImageDraw.Draw(im)
    d.rectangle([300, 620, 1300, 840], fill=(238, 241, 244))
    d.text((740, 722), "ADVERTISEMENT", font=_font(14), fill=(120, 120, 120))
    return im


def _banner():
    """An article with a cookie banner along the bottom edge."""
    im = _article()
    d = ImageDraw.Draw(im)
    d.rectangle([0, 770, 1600, 900], fill=(30, 24, 79))
    d.text((MARGIN, 800), "You rely on us for truth and transparency. We process your personal information.", font=_font(22), fill="white")
    d.rectangle([1250, 795, 1450, 835], fill="white")
    return im


SCRIPT = """# Acme Lost Its Chief

theme: whiteboard
host: none
brand.pagecards: strip
recorded: 2 May 2026
slug: acme

[broll src="real-ceo.jpg" zoom=in caption="Dana Reed, Acme's chief until Monday" credit="Photo: A Photographer, CC BY-SA 4.0, via Wikimedia Commons"]
The chief executive of Acme resigned on Monday.

[stat value="10%" label="Acme's fall in a day" source="Office for National Statistics, May 2026"]
The shares dropped ten per cent in a single day.

[broll src="real-daily.jpg" zoom=none caption="Daily Post, 1 May 2026" credit="dailypost.example" cards="ink:one@shares; ink:two@fell; ink:three@day"]
The Daily Post put it on its front page: Acme shares fell hard that day.

[news outlet="The Gazette" date="May 2026" url="https://www.gazette.example/acme-chief-resigns" headline="Acme chief resigns after eleven years"]
The Gazette had reported it first.

[broll search="factory floor robots" caption="Leeds"]
Acme builds its robots in a factory in Leeds.

[broll src="app-clip.mp4" phone=on caption="My app"]
And I hold some of it in my own app.

[text board="What it means"]
So what does it mean for your money?

[list title="Three things"]
- One
- Two
First, second, third.

[chart bar title="The fall" source="Exchange closing prices"]
bars: Friday:10, Monday:9
Here is the fall on a chart.

[text board="What I am doing"]
I am doing nothing at all.
"""


def _project(tmp_path, wanted=True, searches=None):
    """A made-up project: a licensed photo, a clean page, a page that blocked the screenshot, and one search that
    found nothing ("factory": no factory-NN file in real/)."""
    p = tmp_path / "projects" / "acme"
    (p / "real").mkdir(parents=True)
    (p / "media").mkdir()
    (p / "script.md").write_text(SCRIPT, encoding="utf-8")
    Image.new("RGB", (320, 180), (90, 120, 150)).save(p / "real" / "ceo-01.jpg")
    _article().save(p / "real" / "daily.png")
    _wall().save(p / "real" / "gazette.png")
    Image.new("RGB", (320, 180), (90, 120, 150)).save(p / "media" / "real-ceo.jpg")
    _article().crop((0, 100, 1280, 820)).save(p / "media" / "real-daily.jpg", quality=92)
    (p / "real" / "sources.json").write_text(json.dumps({
        "ceo-01.jpg": {"licence": "CC BY-SA 4.0", "author": "A Photographer", "page": "https://commons.wikimedia.org/wiki/File:Ceo.jpg"},
        "daily.png": {"url": "https://www.dailypost.example/acme-shares-fall", "title": "Acme shares fall ten per cent | Daily Post"},
        "gazette.png": {"url": "https://www.gazette.example/acme-chief-resigns", "title": "Access to this page has been denied"},
    }), encoding="utf-8")
    if wanted:
        (p / "real" / "wanted.json").write_text(json.dumps({
            "pages": [{"name": "daily", "url": "https://www.dailypost.example/acme-shares-fall"}, {"name": "gazette", "url": "https://www.gazette.example/acme-chief-resigns"}],
            "commons": [{"name": "ceo", "query": "Acme chief executive", "n": 3}] + (searches if searches is not None else [{"name": "factory", "query": "Acme factory Leeds", "n": 3}]),
        }), encoding="utf-8")
    return p


def _numbered(text):
    return [ln for ln in text.splitlines() if re.match(r"^\d+\. ", ln)]


# ---------------------------------------------------------------- the asks

def test_one_blocked_page_and_one_empty_search_make_two_asks_with_their_scenes(tmp_path):
    rep = R.report(_project(tmp_path))
    assert [(a["about"], a["scene"]) for a in rep["asks"]] == [("gazette.png", 4), ("factory", 5)]
    lines = _numbered(R.asks_md(rep))
    assert len(lines) == 2
    assert lines[0].startswith('1. Scene 4, "The Gazette had reported it first."')
    assert "The Gazette" in lines[0] and "https://www.gazette.example/acme-chief-resigns" in lines[0] and "screenshot of the top of the article" in lines[0]
    assert lines[1].startswith('2. Scene 5, "Acme builds its robots in a factory in Leeds."') and '"Acme factory Leeds"' in lines[1]
    # scene 4 gives the page's link; no scene names the search, so its scene is the nearest by its words, and the ask says so
    assert "nearest scene" in lines[1] and "nearest scene" not in lines[0]


def test_never_more_than_five_asks(tmp_path):
    searches = [{"name": f"thing{i}", "query": f"Acme factory Leeds {i}", "n": 3} for i in range(7)]
    rep = R.report(_project(tmp_path, searches=searches))
    assert len(rep["asks"]) == R.MAX_ASKS == 5 and rep["asks_left_out"] == 3
    assert rep["asks"][0]["about"] == "gazette.png"  # the page a scene cites comes before a search that found nothing
    text = R.asks_md(rep)
    assert len(_numbered(text)) == 5 and "3 more" in text


def test_a_clean_page_and_a_search_that_found_a_photo_are_not_asked_for(tmp_path):
    rep = R.report(_project(tmp_path, searches=[]))
    assert [a["about"] for a in rep["asks"]] == ["gazette.png"]  # daily.png is ok; the "ceo" search has ceo-01.jpg with a licence


def test_no_wanted_json_means_no_asks_and_the_sources_to_gather(tmp_path):
    p = _project(tmp_path, wanted=False)
    for f in list((p / "real").iterdir()) + list((p / "media").iterdir()):
        f.unlink()
    rep = R.report(p)
    assert rep["asks"] == [] and not rep["has_wanted"]
    assert [(g["scene"], g["source"]) for g in rep["gather"]] == [
        (2, "Office for National Statistics, May 2026"), (4, "The Gazette https://www.gazette.example/acme-chief-resigns"), (9, "Exchange closing prices")]
    text = R.asks_md(rep)
    assert "No asks" in text and not _numbered(text) and "- scene 2 [stat]: Office for National Statistics, May 2026" in text


# ---------------------------------------------------------------- the verdicts

def test_verdicts_on_made_up_pages():
    assert R.verdict_image(_article())[0] == "ok"
    verdict, why = R.verdict_image(_wall())
    assert verdict == "blocked" and "near-empty" in why[0]
    verdict, why = R.verdict_image(_dialog())
    assert verdict == "covered" and "dimmed" in why[0]
    verdict, why = R.verdict_image(_advert())
    assert verdict == "advert box" and "flat empty" in why[0]
    verdict, why = R.verdict_image(_banner())
    assert verdict == "banner" and "bottom edge" in why[0]


def test_a_wall_title_blocks_whatever_the_pixels_say():
    verdict, why = R.verdict_image(_article(), "Access to this page has been denied")
    assert verdict == "blocked" and "Access to this page has been denied" in why[0]
    for title in ("Just a moment...", "Attention Required! | Cloudflare", "Access Denied", "403 Forbidden", "Are you a robot?"):
        assert R.BLOCKED_TITLE.match(title), title
    for title in ("Just a moment ago, markets fell", "Nvidia scandal leaves UK savers 'exposed' to fallout", "Access to cash is being denied to millions", ""):
        assert not R.BLOCKED_TITLE.match(title), title


def test_the_worst_verdict_wins_and_the_rest_are_still_said():
    im = _banner()
    ImageDraw.Draw(im).rectangle([300, 520, 1300, 720], fill=(238, 241, 244))
    verdict, why = R.verdict_image(im)
    assert verdict == "banner" and any(w.startswith("advert box:") for w in why)


def test_a_dialog_is_found_over_a_page_of_pictures_and_a_white_column_is_not_one():
    import numpy as np

    rng = np.random.default_rng(7)
    blocks = rng.integers(40, 256, size=(23, 40, 3), dtype=np.uint8).repeat(40, axis=0).repeat(40, axis=1)[:900, :1600]
    im = Image.blend(Image.fromarray(blocks), Image.new("RGB", (1600, 900), "black"), 0.45)  # a dimmed page that is all pictures
    d = ImageDraw.Draw(im)
    d.rectangle([320, 180, 1280, 720], fill="white")  # the dialog is the biggest flat thing in the frame
    d.text((420, 240), "We value your privacy", font=_font(40), fill=(10, 10, 10))
    verdict, why = R.verdict_image(im)
    assert verdict == "covered" and "dimmed" in why[0]

    page = Image.new("RGB", (1600, 900), (205, 205, 205))  # a white column of text on a grey ground: a layout, not a dialog
    page.paste(_article().crop((0, 80, 1000, 900)), (300, 80))
    ImageDraw.Draw(page).rectangle([0, 0, 1600, 80], fill=(40, 40, 40))
    assert R.verdict_image(page)[0] != "covered"


def test_a_smooth_part_of_a_photograph_is_not_an_empty_box():
    import numpy as np

    page = _article()
    sky = 150 + np.linspace(-6, 6, 1000)[None, :] + np.linspace(-3, 3, 220)[:, None]  # a soft sky: near one colour, never flat
    page.paste(Image.fromarray(np.repeat(sky[:, :, None], 3, axis=2).astype(np.uint8)), (300, 620))
    assert R.verdict_image(page)[0] == "ok"
    page.paste(Image.new("RGB", (1000, 220), (150, 150, 150)), (300, 620))  # the same box in one flat colour is an empty box
    assert R.verdict_image(page)[0] == "advert box"


def test_a_sites_own_bar_along_the_top_is_not_a_banner_but_a_notice_bar_above_it_is():
    assert R.verdict_image(_article())[0] == "ok"  # one dark bar along the top edge: the site's header
    im = Image.new("RGB", (1600, 960), "white")
    im.paste(_article(), (0, 60))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 1600, 44], fill=(206, 43, 43))
    d.text((MARGIN, 10), "BREAKING  Another story altogether", font=_font(20), fill="white")
    verdict, why = R.verdict_image(im)
    assert verdict == "banner" and "top edge" in why[0]
    assert R.verdict_image(im, crop=True)[0] == "ok"  # a crop may start inside the header: the top-edge rule is left out


# ---------------------------------------------------------------- the crop check

def test_a_crop_cut_through_a_line_of_text_is_flagged_on_that_edge():
    page = _article()
    whole = R.cut_text(page)
    assert whole == {"left": [], "right": [], "top": []}
    left = R.cut_text(page.crop((MARGIN + 30, 100, MARGIN + 30 + 1280, 820)))
    assert left["left"] and not left["top"]
    assert max(t for _, t in left["left"]) > 0.05  # the headline is among the rows it cuts
    top = R.cut_text(page.crop((0, 185, 1600, 900)))
    assert top["top"] and not top["left"]
    right = R.cut_text(page.crop((0, 100, MARGIN + 520, 820)))
    assert right["right"] and not right["left"]


def test_a_bar_or_a_picture_at_the_edge_is_not_text():
    page = _article()
    d = ImageDraw.Draw(page)
    d.rectangle([0, 700, 300, 860], fill=(180, 60, 40))  # a block of colour that runs off the left edge
    assert R.cut_text(page) == {"left": [], "right": [], "top": []}
    assert R.cut_text(page.crop((0, 10, 1600, 900)))["top"] == []  # the top edge inside the site's bar, above its words
    assert R.cut_text(page.crop((0, 34, 1600, 900)))["top"]  # and through the bar's words: white text on a dark bar is text too


def test_the_crop_table_names_the_edge(tmp_path):
    p = _project(tmp_path)
    _article().crop((MARGIN + 30, 100, MARGIN + 30 + 1280, 820)).save(p / "media" / "real-daily.jpg", quality=92)
    rep = R.report(p)
    assert [c["name"] for c in rep["crops"]] == ["real-daily.jpg"]  # the photo crop is not a page crop
    row = [ln for ln in R.crop_table(rep["crops"]).splitlines() if ln.startswith("| real-daily.jpg")][0]
    cells = [c.strip() for c in row.strip("|").split("|")]
    assert cells[2].startswith("cuts text") and cells[3] == "clear" and cells[4] == "clear" and cells[6] == "3"
    assert next(s for s in rep["scenes"] if s["n"] == 3)["crop_notes"] == ["crop: left edge cuts text"]  # and it is on the scene's tile


# ---------------------------------------------------------------- the board

def test_every_scene_gets_one_class_and_the_heading_counts_the_real_ones(tmp_path):
    rep = R.report(_project(tmp_path))
    assert [s["class"] for s in rep["scenes"]] == ["REAL PHOTO", "BOARD", "REAL PAGE", "BOARD", "STOCK", "APP RECORDING", "BOARD", "BOARD", "BOARD", "BOARD", "BOARD"]
    assert rep["heading"] == "2 of 11 scenes show real material"
    by_n = {s["n"]: s for s in rep["scenes"]}
    assert by_n[1]["detail"] == "A Photographer, CC BY-SA 4.0"  # author and licence, from sources.json
    assert by_n[3]["detail"] == "dailypost.example · capture: ok" and by_n[3]["source"] == "daily.png"
    assert by_n[6]["detail"] == "check for balances"
    assert by_n[4]["detail"] == "a retyped card: The Gazette" and by_n[2]["detail"] == "a figure on paper" and by_n[7]["detail"] == "a drawing"
    assert rep["opening"].startswith("Opens on a real photo")
    capture = {c["name"]: c for c in rep["captures"]}
    assert capture["gazette.png"]["verdict"] == "blocked" and capture["gazette.png"]["cites"] == [4]
    assert capture["daily.png"]["verdict"] == "ok" and capture["daily.png"]["uses"] == [3]


def test_a_long_video_that_opens_on_a_board_is_named(tmp_path):
    p = _project(tmp_path, wanted=False)
    md = (p / "script.md").read_text(encoding="utf-8")
    first = md.index("[broll src=\"real-ceo.jpg\"")
    (p / "script.md").write_text(md[:first] + '[hook board="Acme: what happened?"]\nSo what happened at Acme?\n\n' + md[first:], encoding="utf-8")
    rep = R.report(p)
    assert rep["opening"] == "Opens on a board, not a real picture: scene 1 is a [hook]."
    assert ("warn", rep["opening"]) in rep["lines"]


def test_the_standard_for_pages_is_preflights_own_rule(tmp_path, monkeypatch):
    p = _project(tmp_path)
    rep = R.report(p)
    page = next(s for s in rep["scenes"] if s["n"] == 3)
    assert page["flags"] == ["3 cards and none of the page's own words marked"]
    assert any("scene 3" in s for s in rep["standard"])
    # the board asks preflight; it holds no rule of its own: whatever preflight finds reaches the board
    monkeypatch.setattr(preflight, "real_material", lambda md, h: [("WARN", "real-daily.jpg: a finding the board has never heard of"), ("WARN", "a script-wide finding")])
    rep = R.report(p)
    assert next(s for s in rep["scenes"] if s["n"] == 3)["flags"] == ["a finding the board has never heard of"]
    assert "a script-wide finding" in rep["standard"]


def test_a_real_page_with_cards_and_no_strip_is_named(tmp_path):
    p = _project(tmp_path)
    assert not any("brand.pagecards" in s for s in R.report(p)["standard"])  # the made-up script carries the line
    md = (p / "script.md").read_text(encoding="utf-8")
    (p / "script.md").write_text(md.replace("brand.pagecards: strip\n", "").replace("recorded: 2 May 2026\n", ""), encoding="utf-8")
    standard = R.report(p)["standard"]
    strip = next(s for s in standard if "brand.pagecards" in s)
    assert strip.startswith("2 scenes show a real page or photo") and "real-daily.jpg (scene 3)" in strip and "real-ceo.jpg" not in strip
    assert any("recorded:" in s for s in standard)  # and a news story with no date is said too


def test_a_crop_finds_the_page_it_was_cut_from():
    sources = {
        "cnbc-china.png": {"url": "https://www.cnbc.com/2026/11/10/a.html", "title": "A"},
        "cnbc-succession.png": {"url": "https://www.cnbc.com/2026/11/09/b.html", "title": "B"},
        "yahoo-uk.png": {"url": "https://uk.finance.yahoo.com/news/c.html", "title": "C"},
        "huang-02.jpg": {"licence": "Public domain", "author": "The White House", "page": "https://commons.wikimedia.org/wiki/File:X.jpg"},
        "huang-06.jpg": {"licence": "CC BY-SA 4.0", "author": "Anderseidesvik", "page": "https://commons.wikimedia.org/wiki/File:Y.jpg"},
    }
    assert R.trace("real-cnbc-china.jpg", "cnbc.com", sources) == "cnbc-china.png"  # two pages from one site: the name decides
    assert R.trace("real-cnbc-china-v.jpg", "cnbc.com", sources) == "cnbc-china.png"
    assert R.trace("real-yahoo.jpg", "uk.finance.yahoo.com", sources) == "yahoo-uk.png"
    # a photo goes by its credit, never by a number in its name: real-huang-2.jpg is not huang-02.jpg
    assert R.trace("real-huang-2.jpg", "Photo: Anderseidesvik, CC BY-SA 4.0, via Wikimedia Commons", sources) == "huang-06.jpg"
    assert R.trace("real-other.jpg", "nowhere.example", sources) is None


def test_the_command_writes_four_files_and_nothing_into_the_project(tmp_path, capsys):
    p = _project(tmp_path)
    before = sorted((str(f), f.stat().st_size, f.stat().st_mtime_ns) for f in p.rglob("*"))
    out = tmp_path / "out"
    assert R.main([str(p), "--out", str(out)]) == 0
    assert sorted(f.name for f in out.iterdir()) == ["asks.md", "board.json", "board.png", "verdicts.md"]
    assert sorted((str(f), f.stat().st_size, f.stat().st_mtime_ns) for f in p.rglob("*")) == before
    board = Image.open(out / "board.png")
    assert board.width > 1900 and board.height > 600
    record = json.loads((out / "board.json").read_text(encoding="utf-8"))
    assert record["heading"] == "2 of 11 scenes show real material" and len(record["scenes"]) == 11
    verdicts = (out / "verdicts.md").read_text(encoding="utf-8")
    assert "| gazette.png | blocked |" in verdicts and "| daily.png | ok |" in verdicts and "| real-daily.jpg |" in verdicts
    printed = capsys.readouterr().out
    assert "2 of 11 scenes show real material" in printed and "| crop | size |" in printed


def test_the_command_needs_an_out_folder_and_a_script(tmp_path):
    with pytest.raises(SystemExit):
        R.main([str(_project(tmp_path))])  # no --out: it never picks a folder itself
    assert R.main([str(tmp_path / "nothing-here"), "--out", str(tmp_path / "out")]) == 2
    assert not (tmp_path / "out").exists()
