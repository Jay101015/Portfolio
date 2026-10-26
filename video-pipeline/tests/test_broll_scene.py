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
