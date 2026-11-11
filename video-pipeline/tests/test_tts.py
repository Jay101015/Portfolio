import io
import json
import os
import urllib.error

import numpy as np
import pytest

from pipeline import tts
from pipeline import voice as vo

SCRIPT = """# Is £50,000 Still a Good Salary?

theme: whiteboard
voice: natural
slug: t

[hook board="£50,000?"]
£50,000 a year sounds like a lot. In 2010 it was.

[stat value="£3,293" label="a month"]
After tax, that's about £3,293 a month, or 79% of it.

[takeaway title="The rent" n="1" of="2"]
Now the rent.

[text board="Rent"]
The average rent is £1,406 a month. That's 42p in every pound.
"""


def test_figures_are_said_the_british_way():
    assert tts.say("about £12,548 a year") == "about twelve thousand, five hundred and forty-eight pounds a year"
    assert tts.say("£1.2 million, or 4.5%") == "One point two million pounds, or four point five percent"
    assert tts.say("£50K in 2010 and 2026-27. 4% of it.") == "Fifty thousand pounds in twenty ten and twenty twenty-six to twenty-seven. Four percent of it."
    assert tts.say("42p of every £1, 1 in 10") == "Forty-two pence of every one pound, one in ten"
    assert tts.say("See GOV.UK", {"GOV.UK": "x"}) == "See gov dot UK"
    assert tts.say("an ISA", {"ISA": "eye-sah"}) == "an eye-sah"
    assert tts.leftover(tts.say("£105 and 9 in 10")) == []


def test_what_the_voice_would_guess_at_is_found():
    assert tts.leftover("I earn [MY SALARY] and 3× that") == ["3×", "[MY SALARY]"]


def _sb():
    from pipeline.script_parser import parse_script
    return parse_script(SCRIPT)


def test_chunks_never_cut_a_scene_and_a_section_starts_a_new_one():
    chunks = tts.plan(_sb(), target=1500)
    assert [c["scenes"] for c in chunks] == [[1, 2], [3, 4]]
    assert [c["section"] for c in chunks] == [False, True]
    assert "Fifty thousand pounds" in chunks[0]["text"] and "£" not in chunks[0]["text"]
    small = tts.plan(_sb(), target=60)
    assert [c["scenes"] for c in small] == [[1], [2], [3], [4]]  # each scene whole, however small the target


class FakeVoice:
    """Stands in for ElevenLabs: a tone as long as the words, with a character every 0.05 s."""

    def __init__(self, tmp):
        self.tmp, self.calls = tmp, []

    def speak(self, voice_id, text, model=tts.MODEL, previous_text="", next_text="", settings=None):
        self.calls.append({"text": text, "previous": previous_text, "next": next_text})
        n = len(text)
        dur = 0.2 + n * 0.05 + 0.3
        t = np.arange(int(dur * vo.SR)) / vo.SR
        x = np.sin(2 * np.pi * 220 * t) * 8000 * (0.5 if len(self.calls) % 2 else 1.0)
        x[: int(0.2 * vo.SR)] = 0
        x[int((0.2 + n * 0.05) * vo.SR):] = 0
        path = os.path.join(self.tmp, f"fake{len(self.calls)}.mp3")
        vo.write(path, x)
        with open(path, "rb") as f:
            audio = f.read()
        starts = [0.2 + i * 0.05 for i in range(n)]
        return {"audio": audio, "chars": list(text), "starts": starts, "ends": [s + 0.05 for s in starts], "cost": n, "request": "r", "format": "mp3_44100_128"}


def _make(project, fake, md=SCRIPT, **kw):
    from pipeline.build import _header_lines
    lines = []
    rec = tts.make(str(project), fake, "voice-id-123", md, _header_lines(md), log=lines.append, **kw)
    return rec, lines


def test_a_take_is_made_and_only_changed_chunks_are_paid_for_again(tmp_path):
    project = tmp_path / "p"
    project.mkdir()
    fake = FakeVoice(str(tmp_path))
    rec, _ = _make(project, fake)
    assert (project / "voiceover.m4a").exists() and len(fake.calls) == 2
    assert fake.calls[0]["previous"] == "" and fake.calls[0]["next"].startswith("Now the rent")
    assert fake.calls[1]["previous"].endswith("of it.")
    # the pause before a new section is the long one, and each chunk sits where voice.json says
    a, b = rec["chunks"]
    assert b["start"] - a["end"] == pytest.approx(tts.SECTION_GAP, abs=0.01)
    assert rec["durationSec"] == pytest.approx(b["end"], abs=0.01)
    assert a["words"][0]["w"] == "Fifty" and a["words"][0]["s"] == pytest.approx(0.03, abs=0.02)
    # the two chunks came back 6 dB apart and are matched (by at most 4 dB each)
    assert abs(a["gainDb"] - b["gainDb"]) > 5
    # nothing private in the record
    saved = (project / "voice.json").read_text()
    assert "voice-id-123" not in saved and "key" not in saved.lower()
    assert rec["audioHash"] == tts.file_hash(str(project / "voiceover.m4a")) and rec["credits"] == sum(len(c["text"]) for c in fake.calls)
    # same script again: nothing is sent
    rec2, _ = _make(project, fake)
    assert len(fake.calls) == 2 and rec2["credits"] == 0
    # one scene's words change: one chunk is made again
    rec3, _ = _make(project, fake, md=SCRIPT.replace("Now the rent.", "Now, the rent."))
    assert len(fake.calls) == 3 and fake.calls[2]["text"].startswith("Now, the rent")


def test_without_the_cache_unchanged_chunks_are_cut_from_the_take(tmp_path):
    project = tmp_path / "p"
    project.mkdir()
    fake = FakeVoice(str(tmp_path))
    rec, _ = _make(project, fake)
    for f in (project / ".cache" / "tts").iterdir():
        f.unlink()  # a new container: the cache is gone, voiceover.m4a and voice.json came back from the branch
    rec2, lines = _make(project, fake, md=SCRIPT.replace("Now the rent.", "Now, the rent."))
    assert len(fake.calls) == 3  # only the changed chunk
    assert rec2["chunks"][0]["end"] - rec2["chunks"][0]["start"] == pytest.approx(rec["chunks"][0]["end"] - rec["chunks"][0]["start"], abs=0.02)
    assert any("take" in line for line in lines)


def test_dry_run_calls_nothing_and_brackets_stop_a_real_run(tmp_path):
    project = tmp_path / "p"
    project.mkdir()
    fake = FakeVoice(str(tmp_path))
    out, _ = _make(project, fake, dry=True)
    assert fake.calls == [] and out["new"] == out["characters"] > 100
    with pytest.raises(SystemExit):
        _make(project, fake, md=SCRIPT.replace("Now the rent.", "I earn [MY SALARY]."))
    assert fake.calls == []


def test_a_recording_that_is_not_ours_is_never_overwritten(tmp_path):
    project = tmp_path / "p"
    project.mkdir()
    (project / "voiceover.mp3").write_bytes(b"his own recording")
    with pytest.raises(SystemExit):
        _make(project, FakeVoice(str(tmp_path)))
    assert (project / "voiceover.mp3").read_bytes() == b"his own recording"


def test_the_key_never_reaches_an_error_message(monkeypatch):
    key = "sk_secret_value"

    def refuse(req, timeout=0):
        assert req.get_header("Xi-api-key") == key
        raise urllib.error.HTTPError(req.full_url, 401, "no", {}, io.BytesIO(json.dumps({"detail": {"status": "invalid", "message": f"bad key {key}"}}).encode()))

    monkeypatch.setattr(tts.urllib.request, "urlopen", refuse)
    with pytest.raises(tts.TtsError) as e:
        tts.ElevenLabs(key).speak("v", "hello")
    assert key not in str(e.value) and "401" in str(e.value)


def test_a_plan_without_the_high_bitrate_falls_back(monkeypatch):
    seen = []

    class Reply:
        headers = {"character-cost": "5", "request-id": "abc"}

        def read(self):
            return json.dumps({"audio_base64": "AAAA", "alignment": {"characters": ["h", "i"], "character_start_times_seconds": [0, 0.1], "character_end_times_seconds": [0.1, 0.2]}}).encode()

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    def answer(req, timeout=0):
        seen.append(req.full_url)
        if "mp3_44100_192" in req.full_url:
            raise urllib.error.HTTPError(req.full_url, 403, "no", {}, io.BytesIO(json.dumps({"detail": {"status": "output_format_not_allowed", "message": "Your subscription tier does not include this output_format"}}).encode()))
        return Reply()

    monkeypatch.setattr(tts.urllib.request, "urlopen", answer)
    client = tts.ElevenLabs("k")
    got = client.speak("v", "hi")
    assert got["format"] == "mp3_44100_128" and got["cost"] == 5 and got["chars"] == ["h", "i"]
    client.speak("v", "hi")
    assert len(seen) == 3  # the second call goes straight to the format that worked
