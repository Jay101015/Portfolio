"""A [broll] scene: parsed like a clip, searched stock-first, kept as a full-frame scene by the build."""
import os

from pipeline import find_footage as ff
from pipeline.script_parser import parse_script

SCRIPT = "# B\ntheme: whiteboard\nhost: none\ntopic: fees\n\n[text board=\"Fees\"]\nFees compound.\n\n[broll search=\"crowd busy street\" caption=\"What ignoring it looks like\"]\nEveryone pays and nobody looks.\n\n[news search=\"pension fees\" headline=\"Fees eat a third of pots\" outlet=\"FT\" date=\"1 May 2026\" url=\"https://ft.com/x\"]\nThe papers say so.\n"


def test_parse_broll_and_news():
    sb = parse_script(SCRIPT)
    b = sb["scenes"][1]
    assert b["type"] == "broll" and b["props"]["search"] == "crowd busy street" and b["props"]["caption"] == "What ignoring it looks like"
    n = sb["scenes"][2]
    assert n["type"] == "news" and n["props"]["headline"] == "Fees eat a third of pots" and n["props"]["outlet"] == "FT"


def test_watch_next_broll_keeps_next_and_vol():
    sb = parse_script("# W\ntheme: whiteboard\nhost: none\n\n[broll src=\"next.mp4\" caption=\"Watch next: X\" vol=1 dur=9 next=on]\n")
    p = sb["scenes"][0]["props"]
    assert p["next"] == "on" and p["vol"] == 1.0


def test_broll_asks_the_stock_libraries_first(tmp_path, monkeypatch):
    proj = tmp_path / "p"
    (proj / "media").mkdir(parents=True)
    (proj / "script.md").write_text(SCRIPT, encoding="utf-8")
    monkeypatch.setenv("PIXABAY_API_KEY", "k")
    asked = []

    def get(url, headers=None):
        asked.append(url)
        if "pixabay.com/api/videos" in url:
            return {"hits": [{"id": 7, "user": "someone", "pageURL": "https://pixabay.com/videos/7/", "videos": {"medium": {"url": "https://cdn.pixabay.com/7.mp4"}}}]}
        raise AssertionError("archive must not be asked before the stock libraries: " + url)

    def download(url, dst, headers=None):
        with open(dst, "wb") as f:
            f.write(b"\x00" * 10)

    r = ff.find(str(proj), ["archive", "commons", "pexels", "pixabay"], get=get, download=download)
    md = (proj / "script.md").read_text(encoding="utf-8")
    assert asked and "pixabay.com" in asked[0]
    assert '[broll search="crowd busy street" caption="What ignoring it looks like" src="02-crowd-busy-street.mp4" credit="Video 7 by someone via Pixabay"]' in md
    assert os.path.exists(proj / "media" / "02-crowd-busy-street.mp4")
    assert [s for s in r["scenes"] if s["id"] == 2][0]["status"] == "downloaded"


def test_stock_takes_that_exact_clip_whatever_the_order(tmp_path, monkeypatch):
    proj = tmp_path / "p"
    (proj / "media").mkdir(parents=True)
    (proj / "script.md").write_text('# S\ntheme: whiteboard\nhost: none\n\n[broll search="london skyline" caption="London" stock="9"]\nLondon, honestly.\n', encoding="utf-8")
    monkeypatch.setenv("PIXABAY_API_KEY", "k")
    clip = lambda i, n: {"id": i, "user": "u", "tags": "london, skyline", "downloads": n, "pageURL": f"https://pixabay.com/videos/x-{i}/", "videos": {"medium": {"url": f"https://cdn/{i}.mp4", "width": 1920, "height": 1080}}}

    def get(url, headers=None):
        return {"hits": [clip(8, 100000), clip(9, 10)]} if "pixabay.com/api/videos" in url else {}

    def download(url, dst, headers=None):
        with open(dst, "wb") as f:
            f.write(b"\x00" * 10)

    ff.find(str(proj), ["pixabay"], get=get, download=download)
    assert 'credit="Video 9 by u via Pixabay"' in (proj / "script.md").read_text(encoding="utf-8")


def test_credits_file_lists_every_credit_once(tmp_path):
    from pipeline.find_footage import write_credits
    from pipeline.script_parser import parse_script

    md = (
        "title: T\n\n"
        '[broll search="x" caption="A" src="a.mp4" credit="Video 1 by a via Pixabay"]\nOne.\n\n'
        '[text board="B" clip="y" clip_src="b.mp4" clip_credit="Photo 2 by b, CC BY, via Wikimedia Commons"]\nTwo.\n\n'
        '[broll search="z" caption="C" src="c.mp4" credit="Video 1 by a via Pixabay"]\nThree.\n'
    )
    write_credits(str(tmp_path), parse_script(md))
    text = (tmp_path / "credits.txt").read_text(encoding="utf-8")
    assert text.splitlines() == ["Footage and images", "Video 1 by a via Pixabay", "Photo 2 by b, CC BY, via Wikimedia Commons"]


def test_credits_stay_off_the_picture_unless_asked():
    from pipeline.script_parser import parse_script

    assert "credits" not in parse_script("title: T\n\n[text board=\"B\"]\nOne.\n")["brand"]
    assert parse_script("title: T\ncredits: screen\n\n[text board=\"B\"]\nOne.\n")["brand"]["credits"] == "screen"


def test_check_sheet_puts_each_clip_beside_its_words(tmp_path):
    import os
    import subprocess

    from pipeline.find_footage import write_check_sheet
    from pipeline.script_parser import parse_script

    (tmp_path / "media").mkdir()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=10", "-t", "3", str(tmp_path / "media" / "a.mp4")], check=True)
    md = 'title: T\n\n[broll search="x" caption="Top up" src="a.mp4" credit="c"]\nTop up your fund to three months of costs.\n\n[text board="B"]\nNo footage here.\n'
    out = write_check_sheet(str(tmp_path), parse_script(md))
    assert out and os.path.getsize(out) > 1000


def test_rank_prefers_matching_popular_landscape_clips():
    from pipeline.find_footage import rank

    owl = rank({"tags": "owl, bird", "downloads": 50000, "duration": 12}, "paying bills laptop", 1920, 1080)
    weak = rank({"tags": "laptop, desk", "downloads": 3, "duration": 12}, "paying bills laptop", 720, 1280)
    good = rank({"tags": "laptop, bills, paying", "downloads": 3000, "duration": 15}, "paying bills laptop", 1920, 1080)
    assert good > weak > owl


def test_pick_takes_the_second_candidate_and_lists_the_top_three(tmp_path, monkeypatch):
    from pipeline import find_footage as ff

    proj = tmp_path / "p"
    proj.mkdir()
    (proj / "script.md").write_text('title: T\n\n[broll search="laptop bills" caption="Bills" pick="2"]\nPay them.\n', encoding="utf-8")
    monkeypatch.setenv("PIXABAY_API_KEY", "k")

    def get(url, headers=None):
        return {"hits": [
            {"id": 1, "tags": "laptop, bills", "downloads": 900, "duration": 10, "user": "a", "pageURL": "p1", "videos": {"medium": {"url": "u1", "width": 1920, "height": 1080, "thumbnail": "t1"}}},
            {"id": 2, "tags": "laptop, bills", "downloads": 800, "duration": 10, "user": "b", "pageURL": "p2", "videos": {"medium": {"url": "u2", "width": 1920, "height": 1080, "thumbnail": "t2"}}},
            {"id": 3, "tags": "laptop", "downloads": 10, "duration": 10, "user": "c", "pageURL": "p3", "videos": {"medium": {"url": "u3", "width": 1920, "height": 1080, "thumbnail": "t3"}}},
        ]}

    rep = ff.find(str(proj), ["pixabay"], dry_run=True, get=get)
    s = rep["scenes"][0]
    assert s["credit"] == "Video 2 by b via Pixabay" and s["pick"] == 2
    assert [t["title"] for t in s["top"]] == ["Video 1", "Video 2", "Video 3"]


def test_candidates_sheet_is_written(tmp_path):
    import os
    import subprocess

    from pipeline.find_footage import write_candidates_sheet

    def download(url, dst, headers=None):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=1", "-frames:v", "1", dst], check=True)

    report = {"scenes": [{"id": 3, "pick": 1, "top": [{"title": "Video 1", "page": "p", "thumb": "x", "credit": "c", "score": 9.0}, {"title": "Video 2", "page": "p", "thumb": "x", "credit": "c", "score": 7.0}]}]}
    out = write_candidates_sheet(str(tmp_path), report, download)
    assert out and os.path.getsize(out) > 500


def test_scout_writes_a_wide_candidates_sheet_without_downloading(tmp_path, monkeypatch):
    from pipeline import find_footage as ff
    proj = tmp_path / "scout"
    proj.mkdir()
    (proj / "script.md").write_text('title: T\n\n[broll search="laptop bills" caption="x"]\nScout.\n', encoding="utf-8")
    monkeypatch.setenv("PIXABAY_API_KEY", "k")
    hits = [{"id": i, "tags": "laptop, bills", "downloads": 900 - i, "duration": 10, "user": "u", "pageURL": f"p{i}",
             "videos": {"medium": {"url": f"u{i}", "width": 1920, "height": 1080, "thumbnail": f"t{i}"}}} for i in range(1, 9)]
    fetched = []
    sheets = []
    monkeypatch.setattr(ff, "write_candidates_sheet", lambda project, report, download, per=3, **k: sheets.append((report, per)))
    report = ff.find(str(proj), ["pixabay"], dry_run=True, get=lambda url, headers=None: {"hits": hits},
                     download=lambda *a: fetched.append(a), top_n=6, sheet=True)
    assert not fetched  # a scout downloads no footage
    assert len(report["scenes"][0]["top"]) == 6
    assert sheets and sheets[0][1] == 6
    assert "Scout." in (proj / "script.md").read_text(encoding="utf-8")  # the script is left alone


def test_silent_scenes_after_the_last_word_play_one_after_another():
    from pipeline import align as al
    from pipeline.script_parser import parse_script
    md = ('title: T\ntheme: whiteboard\nsource: voiceover\n\n[text board="One"]\nHello there friend.\n\n'
          '[broll src="next.mp4" caption="Watch next" vol=1 dur=30]\n\n[outro dur=20]\n')
    words = [{"w": "Hello", "s": 0.5, "e": 0.9}, {"w": "there", "s": 1.0, "e": 1.3}, {"w": "friend.", "s": 1.4, "e": 2.0}]
    sb = al.align(parse_script(md), words, 2.5)
    teaser, outro = sb["scenes"][1], sb["scenes"][2]
    assert teaser["props"]["vol"] == 1
    assert abs((teaser["end"] - teaser["start"]) - 30) < 0.01
    assert abs((outro["end"] - outro["start"]) - 20) < 0.01
    assert sb["durationSec"] >= 2.3 + 50


def test_level_audio_brings_a_quiet_video_to_minus_14_lufs(tmp_path):
    import json as _json
    import shutil
    import subprocess as sp
    import pytest
    if not shutil.which("ffmpeg"):
        pytest.skip("ffmpeg not installed")
    from pipeline.build import level_audio
    src = tmp_path / "quiet.mp4"
    sp.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=white:s=320x180:d=6", "-f", "lavfi",
            "-i", "sine=frequency=440:duration=6,volume=0.05", "-shortest", "-c:v", "libx264", "-c:a", "aac", str(src)], check=True)
    note = level_audio(str(src))
    assert note and "-> -14 LUFS" in note
    out = sp.run(["ffmpeg", "-nostdin", "-hide_banner", "-i", str(src), "-af", "loudnorm=print_format=json", "-f", "null", "-"],
                 capture_output=True, text=True).stderr
    m = _json.loads(out[out.rindex("{"): out.rindex("}") + 1])
    assert abs(float(m["input_i"]) + 14) < 1.0


def test_a_broll_scene_can_use_the_footage_library(tmp_path):
    """[broll lib="name"] copies that clip from library/footage into the project and points the scene at it, with
    its credit; a name the library does not have is a warning, not a crash."""
    from pipeline.footage_library import manifest, use_library
    from pipeline.script_parser import parse_script

    name = next(iter(manifest()))
    sb = parse_script(f'# T\nslug: t\n\n[broll lib="{name}" caption="Homes"]\nHouses everywhere.\n\n[broll lib="nope"]\nMore.\n')
    notes = use_library(sb, str(tmp_path))
    p = sb["scenes"][0]["props"]
    assert p["src"] == manifest()[name]["file"] and (tmp_path / "media" / p["src"]).exists() and p["credit"]
    assert any("WARNING" in n and "nope" in n for n in notes)
