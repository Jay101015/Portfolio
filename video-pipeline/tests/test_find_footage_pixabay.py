

def test_get_json_reports_server_message(monkeypatch):
    """A refused call must say what the server said (minus anything key-shaped), not just the status code."""
    import io
    import urllib.error

    from pipeline import find_footage as ff

    def boom(req, timeout=0):
        raise urllib.error.HTTPError(req.full_url, 400, "Bad Request", {}, io.BytesIO(b'[ERROR 400] "key" is invalid.'))

    monkeypatch.setattr(ff.urllib.request, "urlopen", boom)
    try:
        ff._get_json("https://pixabay.com/api/videos/?key=58236894-abcdefabcdefabcdefabcdefa&q=x")
    except RuntimeError as e:
        msg = str(e)
    else:
        raise AssertionError("expected RuntimeError")
    assert "HTTP 400 from pixabay.com" in msg
    assert '"key" is invalid' in msg
    assert "abcdefabcdef" not in msg


def test_relevant_drops_off_topic_hits_and_ranks_by_shared_tags():
    from pipeline.find_footage import relevant

    hits = [
        {"id": 1, "tags": "owl, bird, feathers"},
        {"id": 2, "tags": "laptop, computer"},
        {"id": 3, "tags": "bills, paying, laptop, online"},
        {"id": 4},
    ]
    got = [h["id"] for h in relevant(hits, "paying bills online laptop")]
    assert got == [3, 2, 4]


def test_find_never_uses_the_same_clip_twice(tmp_path, monkeypatch):
    from pipeline import find_footage as ff

    proj = tmp_path / "p"
    proj.mkdir()
    (proj / "script.md").write_text(
        "title: T\n\n"
        '[broll search="phone payday" caption="Payday"]\nPayday.\n\n'
        '[broll search="phone calendar" caption="Automatic"]\nSet it up.\n',
        encoding="utf-8",
    )
    monkeypatch.setenv("PIXABAY_API_KEY", "k")

    def get(url, headers=None):
        return {"hits": [
            {"id": 7, "tags": "phone, hand", "user": "a", "pageURL": "p7", "videos": {"medium": {"url": "u7"}}},
            {"id": 8, "tags": "phone, calendar", "user": "b", "pageURL": "p8", "videos": {"medium": {"url": "u8"}}},
        ]}

    rep = ff.find(str(proj), ["pixabay"], dry_run=True, get=get)
    credits = [s["credit"] for s in rep["scenes"]]
    assert credits == ["Video 7 by a via Pixabay", "Video 8 by b via Pixabay"]


def test_pixabay_puts_landscape_clips_before_vertical(monkeypatch):
    from pipeline.find_footage import search_pixabay

    monkeypatch.setenv("PIXABAY_API_KEY", "k")

    def get(url, headers=None):
        return {"hits": [
            {"id": 1, "tags": "car engine", "user": "a", "videos": {"medium": {"url": "u1", "width": 720, "height": 1280}}},
            {"id": 2, "tags": "car engine", "user": "b", "videos": {"medium": {"url": "u2", "width": 1280, "height": 720}}},
        ]}

    assert [h.title for h in search_pixabay("car engine", "video", get)] == ["Video 2", "Video 1"]
