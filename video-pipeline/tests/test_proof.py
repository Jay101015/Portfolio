import json
import os

import pytest

from pipeline import gates, proof


def scene(i, kind, start, end, cues=(), came_from=None, **props):
    sc = {"id": i, "type": kind, "start": start, "end": end, "props": props, "cues": [{"t": t, "do": do} for t, do in cues],
          "words": [{"w": w, "s": start, "e": end} for w in props.pop("says", "").split()]}
    if came_from is not None:
        sc["src"] = came_from
    return sc


def long_video():
    """Three scenes, 15.8 s: a photo, a chart with a card, a mark and a pose cue, and a card under a second long."""
    return {"slug": "x", "title": "A test video", "fps": 30, "durationSec": 15.8, "scenes": [
        scene(1, "broll", 0.0, 5.0, src="projects/x/media/photo.jpg"),
        scene(2, "chart", 5.0, 15.0, [(7.0, "card"), (9.0, "mark"), (9.5, "pose")]),
        scene(3, "text", 15.0, 15.8),
    ]}


def short_cut(name="short-1", seconds=14.37):
    """One set piece cut from scene 42, with the 0.8 s the build gives a Short before frame 0."""
    return {"slug": "x", "short": name, "fps": 30, "durationSec": seconds, "scenes": [
        scene(1, "set", -0.8, seconds, came_from=42, says="And I try to stick to a plan so I never make that mistake again.")]}


# --- the frame plan ---------------------------------------------------------------------------------------------------------

def test_the_frame_plan_of_a_hand_built_storyboard():
    plan = proof.frame_plan(long_video())
    assert [(t["frame"], t["scene"], t["why"]) for t in plan] == [
        (12, 1, ["start"]),  # 0.4 s after the scene's start
        (132, 1, ["end"]),  # 0.6 s before its end; a photo gets no stills at 1, 3 and 5 s
        (162, 2, ["start"]),
        (180, 2, ["at1"]),  # a scene drawn on paper: 1, 3 and 5 s in, for the near-empty check
        (219, 2, ["cue"]),  # 0.3 s after the card at 7.0 s
        (240, 2, ["at3"]),
        (279, 2, ["cue"]),  # 0.3 s after the mark at 9.0 s; the pose cue at 9.5 s gets none
        (300, 2, ["mid", "at5"]),  # the midpoint of a scene over 8 s, which is also 5 s in: one still
        (432, 2, ["end"]),
        (462, 3, ["start"]),  # a scene under a second: one still, at its middle
    ]
    assert plan[0]["footage"] and plan[0]["file"] == "photo.jpg" and not plan[2]["footage"]
    assert [t["t"] for t in plan[:3]] == [0.4, 4.4, 5.4] and all(t["type"] for t in plan)


def test_a_short_also_gets_frame_0_one_and_a_half_seconds_and_its_last_frame():
    plan = proof.frame_plan(short_cut())
    assert [(t["frame"], t["why"]) for t in plan] == [
        (0, ["first"]), (12, ["start"]), (30, ["at1"]), (45, ["early"]), (90, ["at3"]), (150, ["at5"]), (216, ["mid"]), (413, ["end"]), (431, ["last"])]
    assert all(t["scene"] == 1 and t["src"] == 42 for t in plan[:-1])
    # 14.37 s is 431.1 frames: the render runs 432, the scene 431 of them, so the last frame has no scene on it
    assert plan[-1]["scene"] is None and plan[-1]["type"] is None
    assert not any("first" in t["why"] or "last" in t["why"] for t in proof.frame_plan(long_video()))  # a long video gets neither


def test_the_last_frame_is_the_last_one_a_render_writes():
    assert proof.last_frame({"fps": 30, "durationSec": 14.37}) == 431  # one piece: the composition's length, rounded up
    assert proof.last_frame({"fps": 30, "durationSec": 15.0}) == 449
    assert proof.last_frame({"fps": 30, "durationSec": 27.27}) == 817  # in chunks: round(seconds x rate) frames
    assert proof.last_frame({"fps": 30, "durationSec": 509.62}) == 15288
    longer = proof.frame_plan(short_cut(seconds=27.27))
    assert longer[-1]["frame"] == 817 and longer[-1]["why"] == ["last"] and longer[-1]["scene"] == 1


def test_scenes_keeps_only_the_scenes_asked_for():
    assert {t["scene"] for t in proof.frame_plan(long_video(), only={2})} == {2}
    kept = proof.frame_plan(short_cut(), only={42})  # a cut's scenes go by the scene they were cut from
    assert kept and all(t["scene"] == 1 for t in kept) and kept[0]["why"] == ["first"]
    assert proof.frame_plan(short_cut(), only={7}) == []


def test_a_tiles_stamp_says_scene_type_time_and_what_it_is_for():
    assert proof.stamp({"scene": 19, "src": None, "type": "broll", "t": 156.4, "why": ["start", "cue"]}) == "19 broll 2:36.4 start+cue"
    assert proof.stamp({"scene": 3, "src": 19, "type": "broll", "t": 17.7, "why": ["at1"]}) == "3 (19) broll 0:17.7 1s"
    assert proof.stamp({"scene": None, "src": None, "type": None, "t": 14.37, "why": ["last"]}) == "no scene 0:14.4 last"


# --- the cuts, the recordings, the words ------------------------------------------------------------------------------------

def test_cuts_are_the_json_files_with_a_short_field(tmp_path):
    for name in ("short-10", "short-2"):
        (tmp_path / f"{name}.json").write_text(json.dumps(short_cut(name)))
    (tmp_path / "transcript-43275a95.json").write_text(json.dumps({"words": []}))  # the .cache folder holds these too
    (tmp_path / "broken.json").write_text("{not json")
    (tmp_path / "other.json").write_text(json.dumps(short_cut("short-1") | {"slug": "another-video"}))
    (tmp_path / "notes.txt").write_text("short")
    found = proof.find_cuts(str(tmp_path), "x")
    assert [name for name, _, _ in found] == ["short-2", "short-10"]
    assert found[0][1]["short"] == "short-2" and found[0][2] == str(tmp_path / "short-2.json")
    assert proof.find_cuts(str(tmp_path / "nowhere")) == []


def test_an_app_or_a_screen_recording_is_marked_for_a_look_at_its_balances():
    def is_one(**props):
        return proof.recording({"type": "broll", "props": props})
    assert is_one(src="projects/x/media/clip.mp4", phone="on")
    assert is_one(lib="vuag-holdings-app", src="projects/x/media/vuag-holdings-app.mp4")
    assert is_one(src="projects/x/media/12-man-checking-banking-app-on-phone.mp4")
    assert is_one(search="screen recording of a broker's site")
    assert not is_one(src="projects/x/media/43-stock-market-trading-screen-numbers.mp4")
    assert not is_one(src="projects/x/media/happy-couple.mp4") and not is_one(src="projects/x/media/real-huang-2.jpg")
    assert not proof.recording({"type": "chart", "props": {"title": "The app's users"}})
    cut = {"fps": 30, "durationSec": 6.0, "scenes": [scene(1, "broll", 0.0, 6.0, src="a/app-recording.mp4", phone="on")]}
    assert all(t["balances"] for t in proof.frame_plan(cut))


def test_a_shorts_first_and_last_five_words():
    assert proof.words(short_cut()) == ("And I try to stick", "never make that mistake again.")


def test_the_stills_are_drawn_by_the_browser_a_render_uses(tmp_path, monkeypatch):
    here = tmp_path / "chrome"
    here.write_text("")
    (tmp_path / "remotion.config.ts").write_text(
        "const candidates = [\n  process.env.REMOTION_BROWSER,\n  '/nowhere/headless_shell',\n  '%s',\n].filter(Boolean) as string[];\n" % here)
    monkeypatch.setattr(proof, "REMOTION", str(tmp_path))
    monkeypatch.delenv("REMOTION_BROWSER", raising=False)
    assert proof.browser() == str(here)  # the first Chrome the renderer's own config lists that is on this machine
    here.unlink()
    assert proof.browser() is None  # none of them: Remotion's own
    monkeypatch.setenv("REMOTION_BROWSER", "/opt/some/chrome")
    assert proof.browser() == "/opt/some/chrome"  # the variable wins
    real = proof.REMOTION
    monkeypatch.undo()
    assert real != proof.REMOTION and (proof.browser() is None or os.path.exists(proof.browser()))  # the real config parses


# --- the sheet --------------------------------------------------------------------------------------------------------------

def stills(tmp_path, n, size=(432, 768), fill=(255, 255, 255)):
    from PIL import Image
    out = []
    for k in range(n):
        path = tmp_path / f"still-{k}.png"
        Image.new("RGB", size, fill).save(path)
        out.append(str(path))
    return out


def test_an_upright_sheet_is_tinted_with_youtubes_zones_and_marks_what_to_look_at(tmp_path):
    from PIL import Image
    files = stills(tmp_path, 3)
    tiles = [
        {"frame": 0, "t": 0.0, "scene": 1, "src": None, "type": "broll", "why": ["first"], "image": files[0], "balances": True},
        {"frame": 45, "t": 1.5, "scene": 1, "src": None, "type": "broll", "why": ["early"], "image": files[1], "flags": ["FAIL: bare band"]},
        {"frame": 90, "t": 3.0, "scene": 2, "src": None, "type": "chart", "why": ["start"], "image": None},
        {"frame": 120, "t": 4.0, "scene": 2, "src": None, "type": "chart", "why": ["end"], "image": files[2], "unseen": True},
    ]
    out = tmp_path / "sheet-short-1.png"
    proof.sheet(tiles, str(out), "Vertical", gates.zones())
    page = Image.open(out).convert("RGB")
    tw, th, head = 216, 384, proof.HEAD
    assert page.size == (4 * (tw + 4) + 4, th + head + 4 + 4)
    x, y = 4, 4 + head  # the first tile's picture
    white, tinted = (255, 255, 255), page.getpixel((x + tw // 2, y + round(0.04 * th)))
    assert tinted != white and tinted[2] > tinted[0]  # YouTube's header, the top 8%: blue over the white still
    assert page.getpixel((x + tw // 2, y + th // 2)) == white  # the middle of the frame is clear
    assert page.getpixel((x + tw // 2, y + round(0.92 * th))) == tinted  # the title strip, the bottom 15%
    assert page.getpixel((x + round(0.93 * tw), y + round(0.60 * th))) == tinted  # the buttons, right 15% from 45% down
    assert page.getpixel((x + round(0.93 * tw), y + round(0.30 * th))) == white  # above the buttons
    assert page.getpixel((x + tw - 3, 4 + 16)) == proof.BALANCE_BG  # 'check for balances' on the first tile's label
    x2 = 4 + (tw + 4)
    assert page.getpixel((x2 - 2, y + th // 2)) == proof.GATE_INK  # a frame round the tile a gate names
    x3 = 4 + 2 * (tw + 4)
    assert page.getpixel((x3 + tw - 4, y + th - 4)) == (70, 70, 70)  # a still that was not drawn: a grey tile


def test_a_landscape_sheet_has_no_tint(tmp_path):
    from PIL import Image
    files = stills(tmp_path, 10, size=(768, 432))
    tiles = [{"frame": 30 * k, "t": float(k), "scene": k + 1, "src": None, "type": "text", "why": ["start"], "image": f} for k, f in enumerate(files)]
    out = tmp_path / "sheet-main.png"
    proof.sheet(tiles, str(out), "Main", gates.zones())
    page = Image.open(out).convert("RGB")
    tw, th = 240, 135
    assert page.size == (8 * (tw + 4) + 4, 2 * (th + proof.HEAD + 4) + 4)  # eight to a row
    assert page.getpixel((4 + tw // 2, 4 + proof.HEAD + 3)) == (255, 255, 255)


# --- the command ------------------------------------------------------------------------------------------------------------

@pytest.fixture
def project(tmp_path, monkeypatch):
    """A project folder with a storyboard and one Short's cut in its .cache, a stand-in bundle that holds the photo,
    and a stand-in for the stills renderer (no browser in a unit test): it draws the long video as empty paper, and
    the Short as empty paper that fills from frame 100 and is empty again on its last frame."""
    from PIL import Image, ImageDraw
    folder = tmp_path / "projects" / "x"
    (folder / ".cache").mkdir(parents=True)
    (folder / "storyboard.json").write_text(json.dumps(long_video()))
    (folder / ".cache" / "short-1.json").write_text(json.dumps(short_cut()))
    (folder / ".cache" / "transcript-1.json").write_text("{}")
    bundle = tmp_path / "bundle"
    (bundle / "public" / "projects" / "x" / "media").mkdir(parents=True)
    (bundle / "index.html").write_text("<html></html>")
    (bundle / "public" / "projects" / "x" / "media" / "photo.jpg").write_bytes(b"jpg")
    asked = []

    def draw(bundle_dir, jobs, out, scale=0.4, at_once=1):
        asked.extend(jobs)
        os.makedirs(os.path.join(out, "stills"), exist_ok=True)
        for job in jobs:
            size = (192, 108) if job["comp"] == "Main" else (108, 192)
            for frame in job["frames"]:
                im = Image.new("RGB", size, (240, 240, 240))
                if job["comp"] == "Vertical" and 100 <= frame < 431:
                    ImageDraw.Draw(im).rectangle((10, 50, 80, 161), fill=(30, 30, 30))
                im.save(proof.still_path(out, job["name"], job["comp"], frame))
        return 0, "done"

    monkeypatch.setattr(proof, "render", draw)
    return folder, bundle, tmp_path / "out", asked


def listing(folder):
    return sorted((os.path.relpath(os.path.join(d, f), folder), os.path.getsize(os.path.join(d, f))) for d, _, fs in os.walk(folder) for f in fs)


def test_the_command_writes_the_sheets_and_the_report_into_out_and_nowhere_else(project, capsys):
    folder, bundle, out, asked = project
    before = listing(folder)
    assert proof.main([str(folder), "--bundle", str(bundle), "--out", str(out)]) == 0  # the gates report: they stop nothing
    assert listing(folder) == before  # nothing in the project is touched
    assert [(j["name"], j["comp"]) for j in asked] == [("main", "Main"), ("short-1", "Vertical")]  # the cut in .cache is found
    assert asked[0]["props"] == str(folder / "storyboard.json") and asked[1]["props"] == str(folder / ".cache" / "short-1.json")
    made = set(os.listdir(out))
    assert {"sheet-main.png", "sheet-short-1.png", "proof.md", "proof.json", "stills"} <= made
    md = (out / "proof.md").read_text()
    assert md.index("## Check for balances first") < md.index("## What the gates say") < md.index("## Each Short's first and last five words")
    assert "No tile shows an app or a screen recording." in md
    assert "- FAIL, first frame: scene 1 set at 0:00.0 (frame 0): a bare first frame" in md
    assert "- FAIL, last frame: no scene at 0:14.4 (frame 431)" in md and "no scene is on screen on the last frame" in md
    assert "- warning, near-empty page: scene 2 chart at 0:10.0 (frame 300)" in md  # the long video's are warnings
    assert '- short-1 (14.4 s): starts "And I try to stick", ends "never make that mistake again."' in md
    data = json.loads((out / "proof.json").read_text())
    assert [s["file"] for s in data["sheets"]] == ["sheet-main.png", "sheet-short-1.png"]
    assert [t["frame"] for t in data["sheets"][0]["tiles"]] == [12, 132, 162, 180, 219, 240, 279, 300, 432, 462]
    assert "FAIL, first frame" in capsys.readouterr().out


def test_the_command_takes_a_storyboard_file_a_cuts_folder_scenes_and_upright(project):
    folder, bundle, out, asked = project
    cuts = folder / ".cache"
    assert proof.main([str(folder / "storyboard.json"), "--bundle", str(bundle), "--out", str(out), "--cuts", str(cuts), "--scenes", "2", "--upright"]) == 0
    assert [(j["name"], j["comp"]) for j in asked] == [("main", "Main"), ("upright", "Vertical")]  # no Short was cut from scene 2
    assert all(f in (162, 180, 219, 240, 279, 300, 432) for j in asked for f in j["frames"])
    assert os.path.exists(out / "sheet-upright.png") and not os.path.exists(out / "sheet-short-1.png")
    data = json.loads((out / "proof.json").read_text())
    assert {t["scene"] for s in data["sheets"] for t in s["tiles"]} == {2}


def test_footage_the_bundle_does_not_hold_is_marked_and_not_judged(project):
    folder, bundle, out, _ = project
    os.remove(bundle / "public" / "projects" / "x" / "media" / "photo.jpg")
    assert proof.main([str(folder), "--bundle", str(bundle), "--out", str(out)]) == 0
    data = json.loads((out / "proof.json").read_text())
    assert [t["unseen"] for t in data["sheets"][0]["tiles"][:3]] == [True, True, False]
    assert "2 tiles show footage the bundle does not hold" in (out / "proof.md").read_text()


def test_the_command_fails_without_the_zone_file_or_a_bundle(project, monkeypatch):
    folder, bundle, out, asked = project
    with pytest.raises(SystemExit) as e:
        proof.main([str(folder), "--bundle", str(folder), "--out", str(out)])  # a folder that is not a bundle
    assert "no bundle at" in str(e.value) and not asked
    monkeypatch.setattr(gates, "ZONES", str(folder / "no-upright.json"))
    with pytest.raises(SystemExit) as e:
        proof.main([str(folder), "--bundle", str(bundle), "--out", str(out)])
    assert "no zone file" in str(e.value) and not asked
