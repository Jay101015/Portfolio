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
    assert tts.say("It closed at $178.67, and $428 billion went in 2 days. $1 buys less.") == "It closed at one hundred and seventy-eight dollars sixty-seven, and four hundred and twenty-eight billion dollars went in two days. One dollar buys less."
    assert tts.say("worth $4.3 trillion") == "worth four point three trillion dollars"
    assert tts.say("On the 8th, the 21st, the 30th and the 3rd, the S&P 500 fell") == "On the eighth, the twenty-first, the thirtieth and the third, the S and P five hundred fell"
    assert [tts.ordinal(n) for n in (1, 2, 5, 9, 12, 17, 20, 22)] == ["first", "second", "fifth", "ninth", "twelfth", "seventeenth", "twentieth", "twenty-second"]


def test_what_the_voice_would_guess_at_is_found():
    assert tts.leftover("I earn [MY SALARY] and 3× that") == ["3×", "[MY SALARY]"]


def _sb():
    from pipeline.script_parser import parse_script
    return parse_script(SCRIPT)


def test_chunks_never_cut_a_sentence_and_a_section_starts_a_new_one():
    chunks = tts.plan(_sb(), target=1500)
    assert [c["scenes"] for c in chunks] == [[1, 2], [3, 4]]
    assert [c["section"] for c in chunks] == [False, True]
    assert "Fifty thousand pounds" in chunks[0]["text"] and "£" not in chunks[0]["text"]
    small = tts.plan(_sb(), target=60)
    assert all(c["text"][-1] in ".!?" for c in small)  # every chunk ends where a sentence does, however small the target
    assert " ".join(c["text"] for c in small) == " ".join(c["text"] for c in chunks)  # and no word is lost or moved
    assert [c["section"] for c in small].count(True) == 1


def test_recutting_the_scenes_leaves_the_chunks_alone():
    from pipeline.script_parser import parse_script
    recut = SCRIPT.replace("£50,000 a year sounds like a lot. In 2010 it was.", "£50,000 a year sounds like a lot.\n\n[text board=\"2010\"]\nIn 2010 it was.")
    assert recut != SCRIPT
    before, after = tts.plan(_sb(), target=90), tts.plan(parse_script(recut), target=90)
    assert [c["text"] for c in before] == [c["text"] for c in after]  # the same requests, so nothing is paid for again


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


def _yes(project, md=SCRIPT):
    """His yes to the words of `md`, written down the way the --approve step writes it."""
    return tts.approve(str(project), md, "Jeffrey, in the test")


def test_a_take_is_made_and_only_changed_chunks_are_paid_for_again(tmp_path):
    project = tmp_path / "p"
    project.mkdir()
    _yes(project)
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
    _yes(project)
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
    _yes(project)  # the words are approved: it is the recording that stops the run
    (project / "voiceover.mp3").write_bytes(b"his own recording")
    with pytest.raises(SystemExit, match="was not made by this step"):
        _make(project, FakeVoice(str(tmp_path)))
    assert (project / "voiceover.mp3").read_bytes() == b"his own recording"


def test_no_voice_is_made_from_words_he_has_not_approved(tmp_path):
    project = tmp_path / "p"
    project.mkdir()
    fake = FakeVoice(str(tmp_path))
    with pytest.raises(SystemExit, match="these words are not approved: there is no approved.json") as stop:
        _make(project, fake)
    assert "--approve" in str(stop.value) and "Nothing was made and nothing was spent" in str(stop.value)
    assert fake.calls == [] and sorted(p.name for p in project.iterdir()) == []  # nothing sent, nothing written
    out, _ = _make(project, fake, dry=True)  # the dry run is free, approved or not
    assert fake.calls == [] and out["new"] == out["characters"] > 100
    _yes(project)
    rec, _ = _make(project, fake)
    assert len(fake.calls) == 2 and (project / "voiceover.m4a").exists() and rec["credits"] > 0
    # one spoken word changes: it stops again, before anything is sent, and says what it was approved as
    with pytest.raises(SystemExit, match="the spoken words have changed since they were approved") as stop:
        _make(project, fake, md=SCRIPT.replace("Now the rent.", "Now the mortgage."))
    assert "Jeffrey, in the test" in str(stop.value) and "words then" in str(stop.value)
    with pytest.raises(SystemExit, match="have changed since"):  # a word left out is a change too
        _make(project, fake, md=SCRIPT.replace("In 2010 it was.", "In 2010 it."))
    assert len(fake.calls) == 2 and rec["audioHash"] == tts.file_hash(str(project / "voiceover.m4a"))  # the take is as it was
    # a new take of a chunk he approved long ago is new audio too: the approval must still stand
    (project / "approved.json").unlink()
    with pytest.raises(SystemExit, match="not approved"):
        _make(project, fake, redo={1})
    assert len(fake.calls) == 2
    _yes(project)
    _make(project, fake, redo={1})
    assert len(fake.calls) == 3
    # an approval file that cannot be read approves nothing
    (project / "approved.json").write_text("{not json", encoding="utf-8")
    with pytest.raises(SystemExit, match="cannot be read"):
        _make(project, fake, redo={2})
    assert len(fake.calls) == 3


def test_a_tag_a_comma_a_respelling_or_the_chunking_are_not_words(tmp_path):
    project = tmp_path / "p"
    project.mkdir()
    approved = _yes(project)
    assert approved["wordsHash"] == tts.words_hash(_sb())[0] and approved["words"] == 37
    fake = FakeVoice(str(tmp_path))
    _make(project, fake)
    assert len(fake.calls) == 2
    from pipeline.script_parser import parse_script
    tag = SCRIPT.replace('label="a month"', 'label="every month" source="ONS"').replace("[text board=\"Rent\"]", "[stat value=\"£1,406\" label=\"the rent\"]")
    comma = SCRIPT.replace("Now the rent.", "Now, the rent!")
    respelt = SCRIPT.replace("voice: natural\n", "voice: natural\ntts.say: rent=rehnt\n")
    chunked = SCRIPT.replace("voice: natural\n", "voice: natural\ntts.chunk: 60\n")
    for md in (tag, comma, respelt, chunked):
        assert md != SCRIPT and tts.words_hash(parse_script(md)) == tts.words_hash(_sb())
    _make(project, fake, md=tag)
    assert len(fake.calls) == 2  # a tag changes the picture, not the voice: nothing to make
    _make(project, fake, md=comma)
    assert len(fake.calls) == 3 and fake.calls[2]["text"].startswith("Now, the rent!")  # new audio, the same approved words
    _make(project, fake, md=respelt)
    assert len(fake.calls) == 4 and "rehnt" in fake.calls[3]["text"]
    _make(project, fake, md=chunked)
    assert len(fake.calls) > 4
    # and what is a word: one more, one fewer, one changed, two swapped; a figure written another way is the same word
    same = tts.words_hash(_sb())
    for was, now in (("Now the rent.", "Now the rent again."), ("Now the rent.", "The rent."), ("sounds like a lot", "sounds like lots"), ("Now the rent.", "The rent now.")):
        assert tts.words_hash(parse_script(SCRIPT.replace(was, now))) != same
    assert tts.words_hash(parse_script(SCRIPT.replace("£50,000 a year", "£50000 A YEAR"))) == same


def test_the_approve_step_writes_the_hash_the_date_and_the_note_and_reads_no_key(tmp_path, monkeypatch, capsys):
    import re
    project = tmp_path / "p"
    project.mkdir()
    (project / "script.md").write_text(SCRIPT, encoding="utf-8")
    fake = FakeVoice(str(tmp_path))
    asked = []
    monkeypatch.setattr(tts, "read_secret", lambda env, name: asked.append(name) or "not-a-real-one")
    monkeypatch.setattr(tts, "ElevenLabs", lambda key: fake)
    # the command, as it is run: no approval, so it stops before a character is sent
    with pytest.raises(SystemExit, match="not approved"):
        tts.main([str(project)])
    assert fake.calls == [] and not (project / "voiceover.m4a").exists()
    assert tts.main([str(project), "--dry-run"]) == 0 and fake.calls == []  # free, and needs no approval
    del asked[:]
    assert tts.main([str(project), "--approve", "  Jeffrey, by message,\n 14 November "]) == 0
    assert asked == [] and fake.calls == []  # his yes is written down: no key is read and nothing is made
    rec = json.loads((project / "approved.json").read_text(encoding="utf-8"))
    assert sorted(rec) == ["date", "note", "words", "wordsHash"]
    assert rec["wordsHash"] == tts.words_hash(_sb())[0] and rec["words"] == 37 and rec["note"] == "Jeffrey, by message, 14 November"
    assert re.fullmatch(r"20\d\d-\d\d-\d\d", rec["date"])
    said = capsys.readouterr().out
    assert "approved: 37 spoken words" in said and "nothing was made" in said
    assert tts.main([str(project)]) == 0 and len(fake.calls) == 2 and (project / "voiceover.m4a").exists()
    # an empty note is no approval, and neither is a script with no words in it
    with pytest.raises(SystemExit, match="needs a note"):
        tts.main([str(project), "--approve", "  "])
    (project / "script.md").write_text("# Nothing said\n\nslug: t\n\n[title title=\"A card\"]\n", encoding="utf-8")
    with pytest.raises(SystemExit, match="nothing to approve"):
        tts.main([str(project), "--approve", "Jeffrey"])


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
