import os
import re

import numpy as np
import pytest

from pipeline import gates

H, W = 384, 216  # an upright still at half the proof's size: rows by columns


def page(h=H, w=W):
    """plain paper"""
    return np.full((h, w), 240, np.uint8)


def write(g, top, bottom, share, left=0.1):
    """Ink between two heights (fractions): `share` of every row in that band, from `left` across."""
    r0, r1 = round(top * g.shape[0]), round(bottom * g.shape[0])
    c0 = round(left * g.shape[1])
    g[r0:r1, c0:c0 + round(share * g.shape[1])] = 30
    return g


def sticker(g):
    """the hook sticker: yellow tape (neither ink nor paper) with dark lettering, inside its band"""
    g[round(0.09 * H):round(0.16 * H), 20:196] = 213
    g[round(0.11 * H):round(0.14 * H), 30:150] = 30
    return g


# --- the measures ---------------------------------------------------------------------------------------------------------

def test_ink_is_grey_under_170_and_paper_is_228_and_over():
    g = np.array([[169, 170, 227, 228]], np.uint8)
    assert gates.ink(g) == 0.25 and gates.paper(g) == 0.25
    assert (gates.INK, gates.PAPER) == (170, 228)  # the review kit's own measures (scripts/review-kit.py)


def test_a_band_is_measured_between_two_heights():
    g = write(page(), 0.6, 0.85, 0.5)
    assert gates.ink(g, 0.6, 0.85) == pytest.approx(0.5, abs=0.01)
    assert gates.ink(g, 0.0, 0.6) == 0 and gates.paper(g, 0.0, 0.6) == 1
    assert gates.ink(g) == pytest.approx(0.125, abs=0.01)


def test_a_still_is_read_from_a_file_a_picture_or_an_array_and_a_large_one_is_shrunk(tmp_path):
    from PIL import Image
    big = np.full((1920, 1080, 3), 240, np.uint8)
    big[960:, :, :] = (20, 30, 40)  # the lower half dark
    assert gates.grey(big).shape == (768, 432)  # a full-size frame is measured at the proof's size
    assert gates.ink(big) == pytest.approx(0.5, abs=0.01) and gates.paper(big) == pytest.approx(0.5, abs=0.01)
    path = tmp_path / "still.png"
    Image.fromarray(big).save(path)
    assert gates.ink(str(path)) == pytest.approx(0.5, abs=0.01)
    assert gates.ink(Image.open(path)) == pytest.approx(0.5, abs=0.01)
    assert gates.grey(page()).shape == (H, W)  # a small still is measured as it is


def test_the_tallest_bare_stretch_ignores_a_pale_picture():
    g = write(write(page(), 0.25, 0.40, 0.6), 0.70, 0.85, 0.6)
    tall, at = gates.bare_run(g)
    assert tall == pytest.approx(0.30, abs=0.01) and at == pytest.approx(0.40, abs=0.01)
    g[round(0.5 * H):round(0.52 * H), :] = 200  # a pale photo crosses the gap: no ink in it, but it is not paper
    tall, _ = gates.bare_run(g)
    assert tall == pytest.approx(0.18, abs=0.01)


# --- a Short's first frame -------------------------------------------------------------------------------------------------

def test_a_bare_first_frame_with_only_its_sticker_fails():
    g = sticker(page())
    assert gates.ink(g) > 0.01  # the sticker's lettering is ink, but it is not below the sticker band
    why = gates.first_frame(g)
    assert why and "bare first frame" in why and "0.0% ink below the sticker band" in why


def test_a_first_frame_with_a_drawn_board_passes_and_a_half_written_title_does_not():
    assert gates.first_frame(write(sticker(page()), 0.30, 0.70, 0.5)) is None  # about a quarter of the frame is ink
    assert gates.first_frame(write(sticker(page()), 0.30, 0.33, 0.4)) is not None  # one line: about 1.4%


def test_the_sticker_band_comes_from_the_zone_file():
    foot = gates.zones()["sticker"]["bottom"]
    above = write(page(), foot - 0.10, foot - 0.01, 0.9)  # plenty of ink, all of it above the band's foot
    assert gates.first_frame(above) is not None
    assert gates.first_frame(write(page(), foot + 0.01, foot + 0.10, 0.9)) is None
    assert gates.first_frame(above, sticker_foot=0.0) is None  # the same frame read from the top


def test_footage_fills_a_first_frame_whatever_it_measures():
    bare = sticker(page())
    assert gates.first_frame(bare, footage=True) is None  # the storyboard opens on a photo: a placeholder is not judged
    photo = np.full((H, W), 200, np.uint8)  # a pale picture edge to edge: no ink, and no paper either
    assert gates.ink(photo) == 0 and gates.first_frame(photo) is None


# --- the bare band ----------------------------------------------------------------------------------------------------------

def test_a_chart_in_the_top_third_over_an_empty_lower_band_fails():
    g = write(sticker(page()), 0.30, 0.58, 0.6)
    why = gates.bare_band(g)
    assert why and why.startswith("a bare band: 0.0% ink and 100.0% paper from 60% to 85% down")


def test_cards_in_the_band_do_not_hide_a_tall_empty_stretch_above_them():
    g = write(write(sticker(page()), 0.28, 0.50, 0.6), 0.72, 0.84, 0.45, left=0.5)  # a stat up top, two cards low right
    assert gates.ink(g, *gates.BAND) > gates.BAND_INK  # the band itself reads as used
    why = gates.bare_band(g)
    assert why and "a bare stretch: nothing from 50% to 72% down, 22% of the height" in why


def test_a_board_that_fills_the_stage_passes():
    g = write(write(sticker(page()), 0.26, 0.70, 0.7), 0.73, 0.84, 0.5)
    assert gates.bare_band(g) is None
    assert gates.bare_band(np.full((H, W), 90, np.uint8)) is None  # a photo edge to edge


def test_the_band_thresholds_are_the_ones_written_down():
    assert gates.BAND == (0.60, 0.85) and (gates.BAND_INK, gates.BAND_PAPER) == (0.04, 0.92)
    assert gates.RUN == (0.25, 0.85) and gates.RUN_MOST == 0.12
    just_under = write(page(), 0.60, 0.85, 0.035, left=0.0)
    assert gates.bare_band(just_under) is not None
    just_over = write(write(page(), 0.60, 0.85, 0.045, left=0.0), 0.26, 0.60, 0.3)
    assert gates.bare_band(just_over) is None


# --- a near-empty page ------------------------------------------------------------------------------------------------------

def test_a_page_near_empty_at_1_3_and_5_seconds_fails():
    title = write(page(108, 192), 0.1, 0.15, 0.3)  # a title and nothing else: 1.5% ink
    why = gates.near_empty([title, title, title])
    assert why and "near-empty page for its first 5 seconds" in why
    assert "first 3 seconds" in gates.near_empty([title, title])  # a scene too short for a still at 5 s


def test_a_page_that_fills_by_5_seconds_passes_and_one_still_proves_nothing():
    title = write(page(108, 192), 0.1, 0.15, 0.3)
    full = write(page(108, 192), 0.1, 0.8, 0.5)
    assert gates.near_empty([title, title, full]) is None
    assert gates.near_empty([title]) is None and gates.near_empty([]) is None
    photo = np.full((108, 192), 200, np.uint8)  # no ink, but not paper: footage is not an empty page
    assert gates.near_empty([photo, photo, photo]) is None
    assert gates.EARLY == (1.0, 3.0, 5.0) and (gates.EARLY_INK, gates.EARLY_PAPER) == (0.035, 0.90)


# --- a fading last frame ----------------------------------------------------------------------------------------------------

def test_a_last_frame_with_under_80_percent_of_its_busiest_stills_ink_fails():
    busiest = write(page(), 0.3, 0.7, 0.5)
    faded = write(page(), 0.3, 0.7, 0.05)
    why = gates.fading_end(faded, busiest)
    assert why and "fading last frame" in why and "10% of the" in why
    assert gates.fading_end(busiest, busiest) is None
    assert gates.fading_end(write(page(), 0.3, 0.7, 0.45), busiest) is None  # 90%: a caption word less
    assert gates.END_SHARE == 0.80


# --- the checks over a sheet ------------------------------------------------------------------------------------------------

def tile(frame, scene, why, image, **more):
    return {"frame": frame, "t": frame / 30, "scene": scene, "type": more.pop("type", "chart"), "why": why, "image": image, **more}


def test_a_shorts_sheet_names_the_tile_each_finding_is_on():
    bare = sticker(page())
    chart = write(sticker(page()), 0.30, 0.58, 0.6)  # busiest, and the lower band still empty
    tiles = [
        tile(0, 1, ["first"], bare),
        tile(12, 1, ["start"], bare),
        tile(30, 1, ["at1"], bare), tile(90, 1, ["at3"], bare), tile(150, 1, ["at5"], bare),
        tile(300, 1, ["end"], chart),
        tile(330, 1, ["last"], bare),
    ]
    found = gates.still_gates(tiles, short=True)
    assert [(f["gate"], f["frame"], f["level"]) for f in found] == [
        ("first frame", 0, "FAIL"), ("near-empty page", 150, "FAIL"), ("bare band", 300, "FAIL"), ("last frame", 330, "FAIL")]
    assert all(f["scene"] == 1 and f["type"] == "chart" for f in found)


def test_a_long_videos_findings_are_warnings_and_it_has_no_first_or_last_frame_to_check():
    bare = page(216, 384)
    tiles = [tile(0, 1, ["first"], bare), tile(30, 1, ["at1"], bare), tile(90, 1, ["at3"], bare), tile(150, 1, ["at5"], bare), tile(300, 1, ["last"], bare)]
    found = gates.still_gates(tiles, short=False)
    assert [(f["gate"], f["level"]) for f in found] == [("near-empty page", "warning")]  # landscape: no band check either


def test_a_full_short_passes_and_a_last_frame_with_no_scene_is_said():
    full = write(write(sticker(page()), 0.26, 0.70, 0.7), 0.73, 0.84, 0.5)
    tiles = [tile(0, 1, ["first"], full), tile(30, 1, ["at1"], full), tile(300, 1, ["end"], full), tile(330, 1, ["last"], full)]
    assert gates.still_gates(tiles, short=True) == []
    tiles[-1] = tile(331, None, ["last"], sticker(page()), type=None)  # one frame after the last scene ended
    found = gates.still_gates(tiles, short=True)
    assert [f["gate"] for f in found] == ["last frame"] and "no scene is on screen on the last frame" in found[0]["text"]


def test_footage_the_bundle_does_not_hold_is_not_judged_and_a_moving_picture_is_not_a_fading_end():
    bare = sticker(page())
    tiles = [tile(0, 1, ["first"], bare, footage=True, unseen=True, type="broll"), tile(60, 1, ["end"], bare, footage=True, unseen=True, type="broll")]
    assert gates.still_gates(tiles, short=True, upright=True) == []  # placeholders: the picture is not in the bundle
    dark, light = np.full((H, W), 60, np.uint8), np.full((H, W), 190, np.uint8)  # a clip: one frame dark, the last one pale
    tiles = [tile(0, 1, ["first"], dark, footage=True, type="broll"), tile(60, 1, ["last"], light, footage=True, type="broll")]
    assert gates.still_gates(tiles, short=True) == []
    tiles[-1] = tile(60, 1, ["last"], page(), footage=True, type="broll")  # the picture gone: empty paper on the last frame
    assert [f["gate"] for f in gates.still_gates(tiles, short=True)] == ["last frame"]


# --- from the storyboard alone ----------------------------------------------------------------------------------------------

def scene(i, kind, start, end, cues=(), **props):
    return {"id": i, "type": kind, "start": start, "end": end, "props": props, "cues": [{"t": t, "do": do} for t, do in cues]}


def test_a_page_held_18_seconds_under_cards_is_named_and_one_with_a_mark_is_not():
    cards = [(102.1, "card"), (104.2, "card"), (107.1, "card"), (109.1, "card"), (111.2, "card"), (112.8, "card"), (116.3, "card")]
    sb = {"durationSec": 140.0, "scenes": [
        scene(19, "broll", 100.0, 118.4, cards, src="projects/x/media/real-cnbc-china.jpg"),
        scene(20, "broll", 118.4, 132.0, [(120.0, "mark"), (124.0, "card"), (128.0, "card")], src="projects/x/media/real-nbc.jpg"),
        scene(21, "broll", 132.0, 140.0, src="projects/x/media/real-hq.jpg"),
    ]}
    found = gates.held_stills(sb)
    assert [f["scene"] for f in found] == [19]
    f = found[0]
    assert (f["seconds"], f["marks"], f["cards"], f["quiet"], f["level"]) == (18.4, 0, 7, 3.5, "warning")
    assert "a still on screen for 18.4s (real-cnbc-china.jpg): no mark on it (7 cards beside it" in f["text"]


def test_a_marked_still_that_then_sits_with_nothing_landing_is_named():
    sb = {"durationSec": 20.0, "scenes": [scene(1, "broll", 0.0, 20.0, [(2.0, "mark"), (5.0, "card")], src="a/page.png")]}
    found = gates.held_stills(sb)
    assert len(found) == 1 and found[0]["quiet"] == 15.0 and "15.0s of it with nothing landing" in found[0]["text"]


def test_the_limit_is_8_seconds_in_a_long_video_and_6_in_a_short():
    sb = {"durationSec": 7.0, "scenes": [scene(1, "broll", 0.0, 7.0, src="a/photo.jpg")]}
    assert gates.held_stills(sb) == []
    found = gates.held_stills(sb | {"short": "short-1"})
    assert len(found) == 1 and found[0]["level"] == "FAIL" and "no mark or card lands in that time" in found[0]["text"]
    assert (gates.HELD, gates.HELD_SHORT) == (8.0, 6.0)
    lead_in = {"short": "short-2", "durationSec": 5.5, "scenes": [scene(1, "broll", -0.8, 5.5, src="a/photo.jpg")]}
    assert gates.held_stills(lead_in) == []  # 5.5 s on screen: the lead-in before frame 0 is not seen


def test_a_clip_is_not_a_still_unless_it_is_held_on_its_last_frame():
    sb = {"durationSec": 60.0, "scenes": [
        scene(1, "broll", 0.0, 20.0, src="a/clip.mp4", clipDur=30.0),  # moves all the way
        scene(2, "broll", 20.0, 40.0, src="a/slow.mp4", clipDur=8.2, rate=0.33, hold=True),  # slowed to fill the scene
        scene(3, "broll", 40.0, 54.0, src="a/app.mp4", clipDur=1.3, rate=0.3, hold=True),  # 4.3 s of clip, then frozen
        scene(4, "chart", 54.0, 60.0),
        scene(5, "broll", 54.0, 60.0, search="a street"),  # footage still to be found: nothing to say yet
    ]}
    found = gates.held_stills(sb)
    assert [f["scene"] for f in found] == [3]
    assert found[0]["seconds"] == 9.7 and "a clip held on its last frame on screen for 9.7s (app.mp4)" in found[0]["text"]


def test_the_opening_is_silent_on_a_full_frame_picture_with_one_figure():
    sb = {"durationSec": 10.0, "scenes": [scene(1, "broll", 0.0, 5.0, src="a/real-huang-2.jpg", big="−$400 BILLION | in 2 days")]}
    assert gates.opening(sb) == []


def test_the_opening_reports_a_board_a_picture_with_no_figure_and_is_silent_for_a_short():
    hook = {"durationSec": 10.0, "scenes": [scene(1, "hook", 0.0, 9.5, board="£50,000 a year: still a good salary?", art="payslip")]}
    found = gates.opening(hook)
    assert len(found) == 1 and found[0]["level"] == "warning" and found[0]["scene"] == 1
    assert "opens on a [hook] board ('£50,000 a year: still a good salary?')" in found[0]["text"]
    plain = {"durationSec": 10.0, "scenes": [scene(1, "broll", 0.0, 5.0, src="a/photo.jpg")]}
    assert "a picture with no figure on it" in gates.opening(plain)[0]["text"]
    worded = {"durationSec": 10.0, "scenes": [scene(1, "broll", 0.0, 5.0, src="a/photo.jpg", big="A bad week | for Nvidia")]}
    assert "no number in its first line" in gates.opening(worded)[0]["text"]
    assert gates.opening(hook | {"short": "short-1"}) == []


# --- the rulebook quotes the numbers ----------------------------------------------------------------------------------------

def test_the_rulebook_quotes_the_thresholds():
    doc = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "proof.md")
    text = re.sub(r"\s+", " ", open(doc, encoding="utf-8").read())
    for said in (
        f"grey under {gates.INK}", f"{gates.PAPER} and over",
        f"under {gates.FIRST_INK:.0%} ink below the sticker band",
        f"from {gates.BAND[0]:.0%} to {gates.BAND[1]:.0%} down has under {gates.BAND_INK:.0%} ink and over {gates.BAND_PAPER:.0%} paper",
        f"between {gates.RUN[0]:.0%} and {gates.RUN[1]:.0%} down is taller than {gates.RUN_MOST:.0%} of the height",
        f"under {gates.EARLY_INK:.1%} ink and over {gates.EARLY_PAPER:.0%} paper",
        f"under {gates.END_SHARE:.0%} of the ink",
        f"over {gates.HELD:g} seconds ({gates.HELD_SHORT:g} in a Short)",
    ):
        assert said in text, said
