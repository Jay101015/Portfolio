

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
