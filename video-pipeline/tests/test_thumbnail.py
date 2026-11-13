import json
import re
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from pipeline import thumbnail as T

ROOT = Path(__file__).resolve().parent.parent
THUMB = ROOT / "remotion" / "thumb"


def _project(tmp_path):
    """A scratch project: a licensed photo, a photo with no licence, a captured page, and media/ crops."""
    p = tmp_path / "projects" / "demo"
    (p / "real").mkdir(parents=True)
    (p / "media").mkdir()
    for name in ("ceo.jpg", "nolicence.jpg", "unlisted.jpg", "page.png"):
        Image.new("RGB", (64, 48), (90, 120, 150)).save(p / "real" / name)
    for name in ("real-ceo.jpg", "real-page.jpg"):
        Image.new("RGB", (64, 36), (90, 120, 150)).save(p / "media" / name)
    (p / "real" / "sources.json").write_text(json.dumps({
        "ceo.jpg": {"licence": "CC BY-SA 4.0", "author": "A Photographer", "page": "https://commons.wikimedia.org/wiki/File:Ceo.jpg"},
        "nolicence.jpg": {"title": "A photo nobody licensed", "author": "Someone"},
        "page.png": {"title": "A headline", "url": "https://www.cityam.com/a-headline/"},
    }))
    return p


def test_never_more_than_two_text_elements_and_a_short_second_line():
    photo = {"data": "data:image/jpeg;base64,AAAA", "w": 1600, "h": 900}
    for layout in T.LAYOUTS:
        props = T.build_props(layout, "−$400BN", "in 2 days", photo)
        assert T.text_elements(props) == ["−$400BN", "in 2 days"]
        # the props carry no other words: every string in them is the layout, a tone, the photo or one of the two
        words = {k for k, v in props.items() if isinstance(v, str) and v} - {"layout", "figureTone", "lineTone", "photo"}
        assert words == {"figure", "line"}
    assert T.text_elements(T.build_props("figure", "£50,000")) == ["£50,000"]
    assert T.build_props("photo", "CEO OUT", "one two three four", photo)["line"] == "one two three four"
    with pytest.raises(T.Refused, match="5 words"):
        T.build_props("photo", "CEO OUT", "one two three four five", photo)
    with pytest.raises(T.Refused, match="third piece"):
        T.build_props("photo", "CEO OUT", "in 2 days\nand more", photo)
    with pytest.raises(T.Refused, match="needs a figure"):
        T.build_props("photo", "  ", "in 2 days", photo)
    # with no photo the only layout is the figure-only one, and with a photo it is never used
    with pytest.raises(T.Refused):
        T.build_props("split", "£50,000")
    with pytest.raises(T.Refused):
        T.build_props("figure", "£50,000", photo=photo)


def test_red_only_with_a_leading_minus():
    photo = {"data": "data:image/jpeg;base64,AAAA", "w": 1600, "h": 900}
    for figure in ("−$400BN", "-$400BN", "–$400BN", "  −7%"):
        assert T.build_props("photo", figure, "in 2 days", photo)["figureTone"] == "loss"
    for figure in ("£50,000", "CEO OUT", "$400BN", "+12%", "400 − 3", "RED ALERT"):
        assert T.build_props("photo", figure, "in 2 days", photo)["figureTone"] == "plain"
    # the second set: a white figure and a red line, because the line is the loss
    props = T.build_props("band", "CEO OUT", "−$400BN", photo)
    assert (props["figureTone"], props["lineTone"]) == ("plain", "loss")
    assert T.build_props("band", "CEO OUT", "in 2 days", photo)["lineTone"] == "plain"
    assert T.build_props("figure", "£50,000")["lineTone"] == "plain"  # no line is never a loss
    # and in the layouts, the red is only ever picked by a tone: no other use, no second red
    src = (THUMB / "Thumb.tsx").read_text()
    uses = re.findall(r"(\w+) \? C\.loss", src)
    assert len(uses) == src.count("C.loss") and set(uses) <= {"loss", "lineLoss", "chip"}
    assert "const loss = p.figureTone === 'loss';" in src and "const lineLoss = p.lineTone === 'loss';" in src and "const chip = lineLoss && !loss;" in src
    assert not re.search(r"#[0-9A-Fa-f]{3,8}\b|['\"]red['\"]|rgba?\(", src)  # every colour comes from brand.ts


def test_a_missing_photo_an_unlicensed_photo_and_an_unnamed_crop_are_refused(tmp_path):
    p = _project(tmp_path)
    ok = T.photo_source(p, "real/ceo.jpg")
    assert ok["credit"] == "Photo: A Photographer, CC BY-SA 4.0, via Wikimedia Commons" and ok["licence"] == "CC BY-SA 4.0"
    assert T.photo_source(p, p / "real" / "ceo.jpg")["name"] == "ceo.jpg"
    with pytest.raises(T.Refused, match="no such photo"):
        T.photo_source(p, "real/missing.jpg")
    with pytest.raises(T.Refused, match="no licence"):
        T.photo_source(p, "real/nolicence.jpg")
    with pytest.raises(T.Refused, match="no licence"):
        T.photo_source(p, "real/unlisted.jpg")
    with pytest.raises(T.Refused, match="no licence"):  # a captured page is not a licensed photo
        T.photo_source(p, "real/page.png")
    with pytest.raises(T.Refused, match="--credit-from"):
        T.photo_source(p, "media/real-ceo.jpg")
    with pytest.raises(T.Refused, match="--credit-from"):
        T.photo_source(p, "media/real-ceo.jpg", credit_from="real/missing.jpg")
    with pytest.raises(T.Refused, match="--credit-from"):
        T.photo_source(p, "media/real-ceo.jpg", credit_from="real/unlisted.jpg")
    crop = T.photo_source(p, "media/real-ceo.jpg", credit_from="real/ceo.jpg")
    assert crop["source"] == "ceo.jpg" and crop["credit"] == ok["credit"]
    page = T.photo_source(p, "media/real-page.jpg", credit_from="page.png")
    assert page["credit"] == "cityam.com" and page["kind"] == "page"
    # a picture from anywhere else is not real material
    stray = tmp_path / "made-up.png"
    Image.new("RGB", (64, 36)).save(stray)
    with pytest.raises(T.Refused, match="only real material"):
        T.photo_source(p, stray)
    # the command refuses before anything is bundled or rendered, and writes nothing
    out = tmp_path / "out"
    assert T.main([str(p), "--photo", "real/nolicence.jpg", "--figure", "-$400BN", "--line", "in 2 days", "--out", str(out)]) == 2
    assert T.main([str(p), "--photo", "real/ceo.jpg", "--figure", "CEO OUT", "--line", "this line is far too long", "--out", str(out)]) == 2
    assert not out.exists()


def test_the_photo_travels_inside_the_props_at_1600_wide(tmp_path):
    big = tmp_path / "big.jpg"
    Image.new("RGB", (3200, 1800), (40, 90, 140)).save(big)
    photo = T.embed_photo(big)
    assert (photo["w"], photo["h"]) == (1600, 900) and photo["data"].startswith("data:image/jpeg;base64,")
    small = tmp_path / "small.png"
    Image.new("RGB", (800, 600)).save(small)
    assert T.embed_photo(small)["w"] == 800  # never enlarged
    props = T.build_props("split", "CEO OUT", "−$400BN", photo, focus=(0.3, 1.7), zoom=0.2)
    assert props["photo"] == photo["data"] and props["focus"] == [0.3, 1.0] and props["zoom"] == 1.0


def test_the_temporary_public_folder_holds_only_the_fonts(tmp_path):
    public = T.make_public(tmp_path / "work")
    assert [p.name for p in public.iterdir()] == ["fonts"]
    faces = {p.name for p in (public / "fonts").iterdir()}
    assert {"caveat-brush-latin-400-normal.woff2", "inter-latin-700-normal.woff2", "inter-latin-800-normal.woff2"} <= faces
    assert (public / "fonts").resolve() == (ROOT / "remotion" / "public" / "fonts").resolve()
    # every face the thumbnail loads is one the folder holds
    assert set(re.findall(r"'([\w-]+\.woff2)'", (THUMB / "brand.ts").read_text())) <= faces
    # making it again, and clearing it, leaves the real fonts where they are
    T.make_public(tmp_path / "work")
    T._clear(public)
    assert not public.exists() and (ROOT / "remotion" / "public" / "fonts" / "inter-latin-800-normal.woff2").is_file()


def test_the_colours_equal_the_theme_and_the_entry_stands_alone():
    brand = (THUMB / "brand.ts").read_text()
    mine = dict(re.findall(r"^\s+(\w+): '(#[0-9A-Fa-f]{6})'", brand, re.M))
    theme = (ROOT / "remotion" / "src" / "theme.ts").read_text()
    board = dict(re.findall(r"^\s+(\w+): '(#[0-9A-Fa-f]{6})'", re.search(r"presets\.whiteboard = \{(.*?)\n\};", theme, re.S).group(1), re.M))
    assert set(mine) == {"navy", "loss", "green", "marker", "paper"}
    assert mine == {"navy": board["text"], "loss": board["accent2"], "green": board["accent"], "marker": board["marker"], "paper": board["bg"]}
    # the thumbnail imports nothing from remotion/src, so it bundles while the renderer is being edited
    for f in ("index.ts", "Thumb.tsx", "brand.ts"):
        for target in re.findall(r"from '([^']+)'", (THUMB / f).read_text()):
            assert target in ("react", "remotion", "@remotion/fonts", "./brand", "./Thumb"), (f, target)
    # one 1280x720 still, and the same duration corner on both sides
    assert f"W = {T.W};" in brand and f"H = {T.H};" in brand
    assert re.search(r"CORNER = \{w: ([\d.]+), h: ([\d.]+)\}", brand).groups() == (str(T.CORNER_W), str(T.CORNER_H))
    assert "id: 'Thumb'" in (THUMB / "index.ts").read_text() and "durationInFrames: 1" in (THUMB / "index.ts").read_text()
    # no ring, highlight, arrow or hand is drawn: the marker yellow is held but never used
    assert "C.marker" not in (THUMB / "Thumb.tsx").read_text()


def test_text_in_the_duration_corner_is_caught(tmp_path):
    plain = np.full((T.H, T.W, 3), 30, np.uint8)
    without = tmp_path / "without.png"
    Image.fromarray(plain).save(without)

    def still(x0, y0, x1, y1):
        a = plain.copy()
        a[y0:y1, x0:x1] = 250
        Image.fromarray(a).save(tmp_path / "with.png")
        return tmp_path / "with.png"

    # the corner is the right 22% and the bottom 18% of the frame: from x 998 and y 590
    assert T.corner_text_pixels(still(40, 420, 940, 700), without) == 0  # bottom left, as the photo layout sets it
    assert T.corner_text_pixels(still(700, 200, 1280, 580), without) == 0  # on the right, but above it
    assert T.text_box(still(40, 420, 940, 700), without) == [40, 420, 940, 700]
    assert T.corner_text_pixels(still(900, 600, 1010, 640), without) == 12 * 40
    assert T.corner_text_pixels(still(1279, 719, 1280, 720), without) == 1  # one pixel is enough
    assert T.text_box(without, without) is None


def test_a_thumbnail_over_two_megabytes_is_brought_under(tmp_path):
    rng = np.random.default_rng(7)
    noisy = tmp_path / "noisy.png"
    Image.fromarray(rng.integers(0, 256, (T.H, T.W, 3), dtype=np.uint8)).save(noisy)
    assert noisy.stat().st_size > T.MAX_BYTES
    how = T.shrink(noisy, tmp_path / "out.png")
    assert how != "as rendered" and (tmp_path / "out.png").stat().st_size < T.MAX_BYTES
    assert Image.open(tmp_path / "out.png").size == (T.W, T.H)
    small = tmp_path / "small.png"
    Image.new("RGB", (T.W, T.H), (4, 27, 60)).save(small)
    assert T.shrink(small, tmp_path / "kept.png") == "as rendered" and (tmp_path / "kept.png").read_bytes() == small.read_bytes()


def test_the_sheet_shows_every_tile_at_320_wide_and_says_what_it_must(tmp_path):
    tiles = []
    for i, (layout, label) in enumerate([("photo", "Set 1"), ("band", "Set 1"), ("split", "Set 1"), ("photo", "Set 2"), ("figure", "£50,000")]):
        name = f"t{i}-{layout}.png"
        Image.new("RGB", (T.W, T.H), (20 + 40 * i, 60, 90)).save(tmp_path / name)
        tiles.append({"file": name, "project": "demo", "label": label, "layout": layout, "photo": "" if layout == "figure" else "ceo.jpg", "note": T.NOTES.get(layout, "")})
    assert T.tile_image(tmp_path / "t0-photo.png").size == (320, 180)
    every = T.record(tmp_path, tiles[:3])
    every = T.record(tmp_path, tiles[2:])  # a second run adds to the sheet, and a tile of the same name is replaced
    assert [t["file"] for t in every] == [t["file"] for t in tiles]
    sheet = Image.open(T.sheet(tmp_path, every))
    assert sheet.width == 3 * 320 + 4 * 16
    # the first tile sits whole, at 320x180, under the first heading
    a = np.asarray(sheet.convert("RGB"))
    ys, xs = np.where((a == (20, 60, 90)).all(axis=2))
    assert (xs.max() - xs.min() + 1, ys.max() - ys.min() + 1) == (320, 180)
    assert T.NOTES["figure"] == "no real picture yet" and "rejected" in T.NOTES["split"]


def test_a_plain_hyphen_figure_is_not_read_as_a_flag():
    assert T._argv(["p", "--figure", "-$400BN", "--line", "in 2 days", "--out", "x"]) == ["p", "--figure=-$400BN", "--line=in 2 days", "--out", "x"]
    assert T.slug("Set 1: −$400BN / in 2 days") == "set-1-400bn-in-2-days"
