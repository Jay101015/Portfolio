"""Run with:  . .venv/bin/activate && python -m unittest discover -s tests -v"""
import json
import os
import unittest

from pipeline.align import align, normalize
from pipeline.script_parser import parse_script

TAGGED = """# Test video
slug: test

[title subtitle="sub"]
One two three four.

[list title="L"]
- Alpha item
- Beta item
Five six alpha item seven beta item.

[image prompt="a tree" dur="2"]

[chart line title="c" y="$"]
data: 0:1, 10:2
Eight nine ten.
"""

MOVIE = """# Movie test
theme: movie
avatar.hair: curly
avatar.shirt_color: #123456

[avatar headline="Hi" pose=wave]
Welcome.

[clip src="a.mp4" from=12 vol=0.2 credit="Film (1968)" pose=shocked pos=corner-left]
Look at this.

[poster title="Film" year="1968" director="Someone"]
The film.

[score value=8.5 max=10 verdict="Good"]
Eight and a half.
"""

PLAIN = """# Plain video

This is the opening paragraph with no tags at all.

Americans hold about $1.1T in credit card debt.

- one
- two
- three
"""


class ParserTests(unittest.TestCase):
    def test_tagged_scenes(self):
        sb = parse_script(TAGGED)
        types = [s["type"] for s in sb["scenes"]]
        self.assertEqual(types, ["title", "list", "image", "chart"])
        self.assertEqual(sb["slug"], "test")
        self.assertEqual(sb["scenes"][1]["props"]["items"], ["Alpha item", "Beta item"])
        self.assertEqual(sb["scenes"][3]["props"]["series"][0]["points"], [[0, 1], [10, 2]])
        self.assertEqual(sb["scenes"][2]["props"]["dur"], 2.0)
        self.assertEqual(sb["scenes"][2]["narration"], "")
        # estimated timings are monotonic and every scene has words (except the silent one)
        for a, b in zip(sb["scenes"], sb["scenes"][1:]):
            self.assertLessEqual(a["end"], b["start"] + 1e-6)
        self.assertTrue(sb["scenes"][0]["words"])

    def test_plain_prose_fallback(self):
        sb = parse_script(PLAIN)
        types = [s["type"] for s in sb["scenes"]]
        self.assertEqual(types, ["title", "stat", "list"])
        self.assertEqual(sb["scenes"][1]["props"]["value"], "$1.1T")


class EnhanceTests(unittest.TestCase):
    def test_the_level_comes_from_the_header(self):
        from pipeline.enhance import chain, level_from_header

        self.assertEqual(level_from_header(None), "normal")
        self.assertEqual(level_from_header("enhance"), "normal")
        self.assertEqual(level_from_header("enhance strong"), "strong")
        self.assertEqual(level_from_header("light"), "light")
        self.assertEqual(level_from_header("raw"), "off")
        self.assertIn("arnndn", chain("strong"))
        self.assertNotIn("arnndn", chain("normal"))
        self.assertIn("loudnorm", chain("light"))

    def test_a_recording_comes_out_louder_and_even(self):
        import os, subprocess, tempfile
        from pipeline.enhance import enhance, measure

        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, "quiet.wav")
            # four seconds of a quiet buzzing voice-like tone with hiss
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=220:d=4", "-f", "lavfi", "-i", "anoisesrc=d=4:c=white:a=0.02", "-filter_complex", "[0]volume=0.05[a];[a][1]amix=inputs=2", "-ac", "1", src], check=True)
            out = enhance(src, os.path.join(d, "clean.mp3"), "normal")
            before, after = measure(src), measure(out)
            self.assertLess(before["lufs"], -25)
            self.assertGreater(after["lufs"], before["lufs"] + 6)
            self.assertEqual(enhance(src, os.path.join(d, "x.mp3"), "raw"), src)


class ArtTests(unittest.TestCase):
    def test_a_drawing_on_a_scene_and_a_drawing_scene_parse(self):
        md = "# T\ntheme: whiteboard\n\n[text headline=\"x\" art=snowball art_at=br art_size=0.4]\nCompound interest.\n\n[art name=rocket headline=\"Lift off\" caption=\"the first 10k\"]\nThen it takes off.\n"
        sb = parse_script(md)
        self.assertEqual([sc["type"] for sc in sb["scenes"]], ["text", "art"])
        self.assertEqual(sb["scenes"][0]["props"]["art"], "snowball")
        self.assertEqual(sb["scenes"][0]["props"]["art_at"], "br")
        self.assertEqual(sb["scenes"][1]["props"]["name"], "rocket")
        self.assertEqual(sb["scenes"][1]["props"]["caption"], "the first 10k")


class MoneyPictureTests(unittest.TestCase):
    def test_money_pictures_and_board_words_parse(self):
        md = ('# T\n\n[text headline="The fee" board="1% fee | a third gone" wrong="Fees are small"]\nA one percent fee sounds like nothing.\n\n'
              '[bite value="£10,000" lose="£2,800" label="A 1% fee" source="illustrative"]\nSay it.\n\n'
              '[grow from="£100" per=month years=30 rate=7%]\nSay it.\n\n[pie value="33%" label="to fees"]\nSay it.\n\n[shrink value="£100" to="£74" years=10]\nSay it.\n')
        sb = parse_script(md)
        self.assertEqual([sc["type"] for sc in sb["scenes"]], ["text", "bite", "grow", "pie", "shrink"])
        self.assertEqual(sb["scenes"][0]["props"]["board"], "1% fee | a third gone")
        self.assertEqual(sb["scenes"][0]["props"]["wrong"], "Fees are small")
        self.assertEqual(sb["scenes"][1]["props"]["lose"], "£2,800")
        self.assertEqual(sb["scenes"][2]["props"]["per"], "month")
        self.assertEqual(sb["scenes"][2]["props"]["rate"], "7%")
        self.assertEqual(sb["scenes"][4]["props"]["to"], "£74")
        kept = parse_script('# T\n\n[stat value="1%"]\nA.\n\n[text keep=strike]\nB.\n')
        self.assertEqual(kept["scenes"][1]["props"]["keep"], "strike")


class PlacementTests(unittest.TestCase):
    def test_free_placement_and_outro_cards_pass_through(self):
        md = ('# T\ntheme: whiteboard\nbrand.corner: off\nbrand.doodles: on\n\n[text sticker="a.gif" sticker_x=0.72 sticker_y=0.3 sticker_size=0.4 art=rocket art_x=0.2 art_y=0.8]\nHi.\n\n[outro cards=on]\nBye.\n')
        sb = parse_script(md)
        props = sb["scenes"][0]["props"]
        self.assertEqual(props["sticker_x"], "0.72")
        self.assertEqual(props["art_y"], "0.8")
        self.assertEqual(sb["scenes"][1]["props"]["cards"], "on")
        self.assertEqual(sb["brand"]["corner"], "off")
        self.assertEqual(sb["brand"]["doodles"], "on")
        self.assertNotIn("cards", parse_script("# T\n\n[outro]\nBye.\n")["scenes"][0]["props"])


class ArtLibraryTests(unittest.TestCase):
    def test_hand_is_off_unless_the_header_asks(self):
        base = "# T\nslug: t\ntheme: whiteboard\n\n[text]\nOne line here.\n"
        self.assertFalse(parse_script(base)["hand"])
        self.assertTrue(parse_script(base.replace("theme: whiteboard\n", "theme: whiteboard\nhand: on\n"))["hand"])

    def test_calm_pace_gives_every_scene_a_lead_and_a_hold(self):
        """The illustrated style defaults to `pace: calm`: each scene starts 1.2s before its first word and keeps 0.6s
        after its last; scenes stay back to back and the words move with them. `pace: tight` changes nothing."""
        from pipeline.script_parser import pace_scenes
        md = "# T\nslug: t\ntheme: whiteboard\nhost: none\nbrand.style: illustrated\n\n[title]\nHi there.\n\n[text]\nOne two three.\n\n[text]\nFour five.\n"
        sb = parse_script(md)
        assert sb["pace"] == {"lead": 1.2, "hold": 0.6}
        before = [(s["start"], s["end"], s["words"][0]["s"]) for s in sb["scenes"]]
        silences = pace_scenes(sb, 1.2, 0.6)
        assert silences[0] == (0.0, 1.2) and len(silences) == 3
        for i, (s, (b0, b1, w0)) in enumerate(zip(sb["scenes"], before)):
            self.assertAlmostEqual(s["words"][0]["s"] - s["start"], w0 - b0 + 1.2, places=2)
            self.assertAlmostEqual(s["end"] - s["words"][-1]["e"], b1 - (s["words"][-1]["e"] - i * 1.8 - 1.2) + 0.6, places=2)
        for a, b in zip(sb["scenes"], sb["scenes"][1:]):
            assert a["end"] == b["start"]
        tight = parse_script(md.replace("brand.style: illustrated", "brand.style: illustrated\npace: tight"))
        assert tight["pace"] == {"lead": 0.0, "hold": 0.0} and pace_scenes(tight, 0.0, 0.0) == []

    def test_the_builds_own_render_is_never_adopted_as_a_recording(self):
        """<slug>.mp4 in the project folder is the last render, not a voiceover somebody uploaded."""
        import tempfile
        from pipeline.build import adopt_recording
        with tempfile.TemporaryDirectory() as d:
            open(os.path.join(d, "script.md"), "w").write("# My video\nslug: my-video\n\n[title]\nHi.\n")
            open(os.path.join(d, "my-video.mp4"), "wb").write(b"x" * 10)
            open(os.path.join(d, "my-video-vertical.mp4"), "wb").write(b"x" * 10)
            open(os.path.join(d, "my-video-short-2.mp4"), "wb").write(b"x" * 10)
            assert adopt_recording(d) == []
            open(os.path.join(d, "New Recording 3.m4a"), "wb").write(b"x" * 10)
            notes = adopt_recording(d)
            assert notes and os.path.exists(os.path.join(d, "voiceover.m4a"))
            assert os.path.exists(os.path.join(d, "my-video.mp4"))

    def test_takeaway_cards_number_themselves(self):
        """`[takeaway title=...]` cards are 1 of N, 2 of N in order unless the tag sets n= or of=."""
        sb = parse_script("# T\nslug: t\ntheme: whiteboard\nhost: none\n\n[title]\nHi.\n\n[takeaway title=\"Fees compound too\"]\nOne.\n\n[text]\nMore.\n\n[takeaway title=\"Time beats timing\" n=\"5\"]\nTwo.\n")
        cards = [s["props"] for s in sb["scenes"] if s["type"] == "takeaway"]
        assert [(c["n"], c["of"], c["title"]) for c in cards] == [("1", "2", "Fees compound too"), ("5", "2", "Time beats timing")]

    def test_shorts_are_planned_and_cut_from_the_storyboard(self):
        """The planner picks non-overlapping 15-60s slices, scored, each with a hook; the cutter re-times them from zero."""
        from pipeline.shorts import plan_shorts, cut_short, caption_line
        md = "# T\nslug: t\ntheme: whiteboard\nhost: none\n\n[title]\nSam lost four thousand pounds in one year without noticing. Here is how and here is what he did about it after.\n\n[takeaway title=\"Rent day is not a surprise\"]\nTakeaway one. Rent day is not a surprise, but Sam treated it like one every single month of the year.\n\n[text]\nThe landlord was at the door and the wallet was empty, because payday money had already gone on everything else that month.\n\n[text]\nThe car dealer offered Sam a brand new car on finance and Sam very nearly signed, before he stopped to scratch his head and walked away.\n\n[outro title=\"X\" cta=\"Y\"]\nThat is it, pick one and fix it this week.\n"
        sb = parse_script(md)
        plan = plan_shorts(sb, 2)
        assert 1 <= len(plan) <= 2
        for c in plan:
            assert 15 <= c["seconds"] <= 60 and c["hook"] and c["score"] > 0 and c["why"]
        ids = [set(c["scenes"]) for c in plan]
        assert all(not (a & b) for a in ids for b in ids if a is not b)
        assert any(c["hook"] == "Rent day is not a surprise" for c in plan)
        cut, spans = cut_short(sb, [2, 3], None, "short-1")
        assert [sc["id"] for sc in cut["scenes"]] == [2, 3] and cut["scenes"][0]["start"] == 0.4 and cut["captions"] is True and cut["hook"]
        assert cut["scenes"][1]["start"] == cut["scenes"][0]["end"] and cut["scenes"][0]["words"][0]["s"] > 0.4
        assert spans == [(sb["scenes"][1]["start"], sb["scenes"][1]["end"]), (sb["scenes"][2]["start"], sb["scenes"][2]["end"])]
        assert caption_line("The car dealer offered Sam a brand new car on finance, and he nearly signed.") == "The car dealer offered Sam a brand new"

    def test_a_recap_lists_the_takeaways_unless_given_its_own_lines(self):
        md = "# T\nslug: t\ntheme: whiteboard\nhost: none\n\n[takeaway title=\"Spend with intention\"]\nOne.\n\n[takeaway title=\"Build a budget\"]\nTwo.\n\n[recap]\nSo, spend with intention and build a budget.\n"
        sb = parse_script(md)
        assert sb["scenes"][-1]["type"] == "recap" and sb["scenes"][-1]["props"]["items"] == ["Spend with intention", "Build a budget"]
        own = parse_script(md.replace("[recap]\n", "[recap title=\"Remember\"]\n- Keep going\n- Save small\n"))
        assert own["scenes"][-1]["props"]["items"] == ["Keep going", "Save small"] and own["scenes"][-1]["props"]["title"] == "Remember"

    def test_a_scene_can_pick_its_transition(self):
        """`transition=wipe|slide|cut` on any scene reaches the storyboard, like `keep=`."""
        sb = parse_script("# T\nslug: t\ntheme: whiteboard\nhost: none\n\n[title]\nHi.\n\n[text transition=slide]\nOne.\n\n[stat value=\"3\" transition=wipe]\nTwo.\n")
        assert [s["props"].get("transition") for s in sb["scenes"]] == [None, "slide", "wipe"]

    def test_the_traced_illustrations_are_in_the_catalogue(self):
        """Every drawing in library/illus/manifest.json has its SVG of pen strokes and sits in the catalogue as kind illus."""
        lib = os.path.join(os.path.dirname(__file__), "..", "library")
        manifest = json.load(open(os.path.join(lib, "illus", "manifest.json"), encoding="utf-8"))
        cat = {d["name"]: d for d in json.load(open(os.path.join(lib, "art", "catalogue.json"), encoding="utf-8"))}
        assert len(manifest) >= 6
        for e in manifest:
            svg = open(os.path.join(lib, "illus", e["name"] + ".svg"), encoding="utf-8").read()
            assert svg.count("<path ") >= 20, e["name"]
            assert cat[e["name"]]["kind"] in ("illus", "reaction")
            assert e["search"] and e["about"]

    def test_the_catalogue_is_large_and_searchable(self):
        import json

        cat = json.load(open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "library", "art", "catalogue.json"), encoding="utf-8"))
        names = [d["name"] for d in cat]
        self.assertGreaterEqual(len(cat), 120)
        self.assertEqual(len(names), len(set(names)))
        for d in cat:
            self.assertTrue(d["about"] and d["tags"], d["name"])
            self.assertIsInstance(d.get("search", []), list)
        # the reaction half carries everyday words for the library search but not as scene triggers
        by = {d["name"]: d for d in cat}
        self.assertIn("lol", by["laugh"]["search"])
        self.assertNotIn("no", by["nope"]["tags"])
        self.assertIn("scam", by["siren"]["tags"])
        self.assertTrue(all(len(t) >= 3 for d in cat for t in d["tags"]), "a two-letter tag would stamp a drawing on every scene")


class MovieParserTests(unittest.TestCase):
    def test_movie_scene_types_and_avatar_config(self):
        sb = parse_script(MOVIE)
        self.assertEqual(sb["theme"], "movie")
        self.assertEqual(sb["avatar"], {"hair": "curly", "shirtColor": "#123456"})
        types = [s["type"] for s in sb["scenes"]]
        self.assertEqual(types, ["avatar", "clip", "poster", "score"])
        clip = sb["scenes"][1]["props"]
        self.assertEqual((clip["src"], clip["from"], clip["vol"], clip["pose"], clip["pos"]), ("a.mp4", 12.0, 0.2, "shocked", "corner-left"))
        self.assertEqual(sb["scenes"][2]["props"]["director"], "Someone")
        self.assertEqual(sb["scenes"][3]["props"]["value"], "8.5")

    def test_inline_cues_are_stripped_and_timed(self):
        from pipeline.script_parser import split_cues

        text, cues = split_cues("Look at {shocked} this. {angry}No way. {wave}")
        self.assertEqual(text, "Look at this. No way.")
        self.assertEqual(cues, [{"word": 2, "pose": "shocked"}, {"word": 3, "face": "angry"}, {"word": 5, "pose": "wave"}])
        sb = parse_script("# T\n\n[avatar]\nOne two {shocked} three four.\n")
        sc = sb["scenes"][0]
        self.assertEqual(sc["narration"], "One two three four.")
        self.assertEqual(len(sc["cues"]), 1)
        self.assertEqual(sc["cues"][0]["pose"], "shocked")
        # fires just before "three" is spoken
        self.assertAlmostEqual(sc["cues"][0]["t"], sc["words"][2]["s"] - 0.08, places=2)

    def test_visemes_follow_letters(self):
        from pipeline.align import visemes_for_word, visemes_from_words

        self.assertEqual(visemes_for_word("map"), [4, 1, 4])
        self.assertEqual(visemes_for_word("the"), [6, 2])
        self.assertEqual(visemes_for_word("---"), [1])
        sb = parse_script(MOVIE)
        v = visemes_from_words(sb["scenes"], 30, sb["durationSec"])
        self.assertEqual(len(v), int(sb["durationSec"] * 30) + 1)
        self.assertEqual(v[0], 0)
        first = sb["scenes"][0]["words"][0]
        self.assertNotEqual(v[int(first["s"] * 30) + 1], 0)

    def test_mouth_from_words_flaps_only_while_speaking(self):
        from pipeline.align import mouth_from_words

        sb = parse_script(MOVIE)
        env = mouth_from_words(sb["scenes"], 30, sb["durationSec"])
        self.assertEqual(len(env), int(sb["durationSec"] * 30) + 1)
        first = sb["scenes"][0]["words"][0]
        self.assertGreater(env[int(first["s"] * 30) + 1], 0.3)
        self.assertEqual(env[0], 0.0)  # lead-in silence


class MediaTests(unittest.TestCase):
    def test_clip_falls_back_to_still_when_footage_missing(self):
        import os, tempfile
        from pipeline.build import resolve_media

        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, "media"))
            open(os.path.join(d, "media", "art.png"), "wb").close()
            sb = parse_script('# T\n\n[clip src="trailer.mp4" from=12 vol=0.2 fallback="art.png" credit="c"]\nHi.\n\n[still src="missing.png"]\nBye.\n')
            notes = resolve_media(sb, d, "t")
            a, b = sb["scenes"]
            self.assertEqual(a["type"], "still")
            self.assertEqual(a["props"]["src"], "projects/t/media/art.png")
            self.assertNotIn("from", a["props"])
            # A still whose file never arrived renders its placeholder instead of failing the render.
            self.assertNotIn("src", b["props"])
            self.assertEqual(b["props"]["missing"], "missing.png")
            self.assertTrue(any("missing.png" in n and "placeholder" in n for n in notes))

    def test_missing_clip_without_fallback_becomes_a_placeholder_still(self):
        import os, tempfile
        from pipeline.build import resolve_media

        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, "media"))
            sb = parse_script('# T\n\n[clip src="gone.mp4" from=3 vol=0.2 want="a phone showing a chart"]\nHi.\n')
            resolve_media(sb, d, "t")
            sc = sb["scenes"][0]
            self.assertEqual(sc["type"], "still")
            self.assertNotIn("src", sc["props"])
            self.assertNotIn("from", sc["props"])

    def test_uploads_from_the_studio_are_unpacked(self):
        import base64, os, tempfile
        from pipeline.build import unpack_uploads

        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, "media"))
            data = bytes(range(256)) * 10
            with open(os.path.join(d, "media", "photo.jpg.b64"), "w") as f:
                f.write(base64.b64encode(data).decode())
            notes = unpack_uploads(d)
            with open(os.path.join(d, "media", "photo.jpg"), "rb") as f:
                self.assertEqual(f.read(), data)
            self.assertTrue(any("photo.jpg" in n for n in notes))
            self.assertEqual(unpack_uploads(d), [])  # already unpacked: nothing to do

    def test_media_edits_and_stickers_reach_the_storyboard(self):
        import os, tempfile
        from pipeline.build import resolve_media

        sb = parse_script('# T\n\n[still src="a.jpg" focus="40 20" mag=1.3 rotate=90 flip=h bright=1.1 bw look=sketch]\nHi.\n\n[text sticker="dance.gif" sticker_at=bl sticker_size=0.4 sticker_bw]\nBye.\n\n[text sticker="gone.gif"]\nEnd.\n')
        p = sb["scenes"][0]["props"]
        self.assertEqual((p["focus"], p["mag"], p["rotate"], p["flip"], p["look"]), ("40 20", "1.3", "90", "h", "sketch"))
        self.assertIs(p["bw"], True)
        q = sb["scenes"][1]["props"]
        self.assertEqual((q["sticker"], q["sticker_at"], q["sticker_size"]), ("dance.gif", "bl", "0.4"))
        self.assertIs(q["sticker_bw"], True)
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, "media"))
            for n in ("a.jpg", "dance.gif"):
                open(os.path.join(d, "media", n), "wb").close()
            notes = resolve_media(sb, d, "t")
            self.assertEqual(sb["scenes"][1]["props"]["sticker"], "projects/t/media/dance.gif")
            self.assertNotIn("sticker", sb["scenes"][2]["props"])
            self.assertTrue(any("gone.gif" in n for n in notes))

    def test_a_written_script_decides_the_scenes(self):
        from pipeline.auto_script import script_from_text

        written = """# What to do with your first £10,000

Hi guys, welcome back. Today: what to do with your first ten grand.

The catch:
A credit card at 24% costs you more than any fund will ever earn. Clear it first.

The order I would go in:
- Build a one-month emergency fund
- Clear any expensive debt
- Take the full employer match

That is the plan. If this helped, subscribe and I will see you next week.
"""
        md = script_from_text(written, {"slug": "x", "request": "r1", "plan": "written.md"})
        sb = parse_script(md)
        self.assertEqual(sb["title"], "What to do with your first £10,000")
        types = [sc["type"] for sc in sb["scenes"]]
        self.assertEqual(types, ["title", "stat", "list", "outro"])
        self.assertEqual(sb["scenes"][1]["props"]["value"], "24%")
        self.assertEqual(sb["scenes"][1]["props"].get("label"), "The catch")
        self.assertEqual(sb["scenes"][2]["props"].get("title"), "The order I would go in")
        self.assertEqual(len(sb["scenes"][2]["props"]["items"]), 3)
        self.assertIn("request: r1", md)
        self.assertIn("plan: written.md", md)
        # the words are the writer's, ready for the recording to replace them
        self.assertTrue(sb["scenes"][0]["narration"].startswith("Hi guys"))

    def test_a_recording_alone_becomes_a_script(self):
        from pipeline.auto_script import script_from_words

        said = ("Hi guys, welcome to the channel. Today: what to do with your first ten thousand pounds. "
                "It took me a while to save it. I made mistakes on the way, and I want you to skip them. "
                "First, build a small emergency fund. Second, clear any expensive debt. Third, take the full employer match. "
                "A credit card at twenty four percent costs you more than any fund will earn. That is why debt comes before investing. "
                "That is the plan for now. If this helped, subscribe and I will see you next week.")
        words, t = [], 0.0
        for w in said.split():
            words.append({"w": w, "s": t, "e": t + 0.3})
            t += 0.38 + (0.9 if w.endswith(".") else 0)
        md = script_from_words(words, {"slug": "x"}, None)
        sb = parse_script(md)
        types = [sc["type"] for sc in sb["scenes"]]
        self.assertEqual(types[0], "title")
        self.assertIn("list", types)
        self.assertIn("stat", types)
        self.assertEqual(types[-1], "outro")
        values = [sc["props"].get("value") for sc in sb["scenes"] if sc["type"] == "stat"]
        self.assertTrue({"£10,000", "24%"} & set(values), values)
        # every word said is in the narration, in order
        self.assertEqual(" ".join(sc["narration"] for sc in sb["scenes"]).split(), said.split())

    def test_a_new_recording_replaces_the_old_voice(self):
        import base64, os, tempfile
        from pipeline.build import find_audio, unpack_uploads

        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "voiceover.mp3"), "wb") as f:
                f.write(b"old")
            with open(os.path.join(d, "voiceover.m4a.b64"), "w") as f:
                f.write(base64.b64encode(b"new").decode())
            notes = unpack_uploads(d)
            self.assertTrue(find_audio(d).endswith("voiceover.m4a"))
            self.assertFalse(os.path.exists(os.path.join(d, "voiceover.mp3")))
            self.assertTrue(any("replaced voiceover.mp3" in n for n in notes))

    def test_a_recording_uploaded_under_its_own_name_becomes_the_voice(self):
        import os, tempfile
        from pipeline.build import find_audio, unpack_uploads

        with tempfile.TemporaryDirectory() as d:
            for name, body in (("voiceover.mp3", b"old"), ("voice-preview.mp3", b"preview"), ("New Recording 3.m4a", b"new take")):
                with open(os.path.join(d, name), "wb") as f:
                    f.write(body)
            notes = unpack_uploads(d)
            self.assertTrue(find_audio(d).endswith("voiceover.m4a"))
            with open(find_audio(d), "rb") as f:
                self.assertEqual(f.read(), b"new take")
            self.assertFalse(os.path.exists(os.path.join(d, "voiceover.mp3")))
            self.assertTrue(os.path.exists(os.path.join(d, "voice-preview.mp3")))  # the studio's copy is not a recording
            self.assertTrue(any("New Recording 3.m4a" in n for n in notes))
            self.assertEqual(unpack_uploads(d), [])  # nothing left to adopt

    def test_a_big_upload_arrives_in_pieces(self):
        import base64, os, tempfile
        from pipeline.build import find_audio, unpack_uploads

        data = os.urandom(9000)
        b = base64.b64encode(data).decode()
        cuts = [0, 4000, 6000, 9000, len(b)]  # pieces of different sizes, as the studio sends them after a refusal
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, "uploads"))
            for i in range(len(cuts) - 1):
                with open(os.path.join(d, "uploads", f"part{i + 1:04d}--voiceover.m4a"), "w") as f:
                    f.write(b[cuts[i]:cuts[i + 1]])
            unpack_uploads(d)
            self.assertIsNone(find_audio(d))  # no done marker yet: nothing joined
            with open(os.path.join(d, "uploads", f"done{len(cuts) - 1}--voiceover.m4a"), "w") as f:
                f.write("")
            unpack_uploads(d)
            with open(find_audio(d), "rb") as f:
                self.assertEqual(f.read(), data)

    def test_share_links_become_download_links(self):
        from pipeline.build import _direct_link

        self.assertEqual(_direct_link("https://drive.google.com/file/d/1AbC-xyz/view?usp=sharing"), "https://drive.google.com/uc?export=download&confirm=t&id=1AbC-xyz")
        self.assertTrue(_direct_link("https://www.dropbox.com/scl/fi/abc/v.m4a?rlkey=x&dl=0").endswith("dl=1"))
        self.assertEqual(_direct_link("https://example.com/a.mp3"), "https://example.com/a.mp3")

    def test_the_draft_is_rewritten_to_what_was_said(self):
        from pipeline import align as al
        from pipeline.sync import matched_share, rewrite_prose, spoken_by_scene

        md = ('# T\nslug: x\n\n[title kicker="Ep one"]\nHi guys, welcome to the channel. Today: your first ten thousand.\n\n'
              '[list title="The order"]\n- Emergency fund\n- Debt\nFirst, a small emergency fund. Second, clear the debt.\n\n'
              '[text headline="Never recorded"]\nThis line was written and never said.\n\n'
              '[stat value="7%"]\nIndex funds have averaged about seven percent a year.\n')
        said = ("Hey everyone, welcome to the channel. Today: what to do with your first ten thousand. "
                "First, build a small emergency fund. Second, clear any expensive debt. "
                "Index funds have averaged roughly seven percent a year over the long run.")
        words, t = [], 0.0
        for w in said.split():
            words.append({"w": w, "s": t, "e": t + 0.3})
            t += 0.36 + (0.6 if w.endswith(".") else 0)
        sb = al.align(parse_script(md), words, t + 0.5)
        new, kept = rewrite_prose(md, spoken_by_scene(sb["scenes"], words, matched=matched_share(sb)))
        sc = parse_script(new)["scenes"]
        self.assertEqual(sc[0]["narration"], "Hey everyone, welcome to the channel. Today: what to do with your first ten thousand.")
        self.assertEqual(sc[1]["narration"], "First, build a small emergency fund. Second, clear any expensive debt.")
        self.assertEqual(sc[2]["narration"], "This line was written and never said.")  # not said: kept as written
        self.assertEqual(kept, [3])
        self.assertTrue(sc[3]["narration"].startswith("Index funds have averaged roughly"))
        # everything that is not spoken words is untouched
        self.assertIn('[title kicker="Ep one"]', new)
        self.assertIn("- Emergency fund\n- Debt", new)
        self.assertIn('[stat value="7%"]', new)
        self.assertTrue(new.startswith("# T\nslug: x\n"))

    def test_spoken_figures(self):
        from pipeline.auto_script import _figure

        self.assertEqual(_figure("your first ten thousand pounds"), "£10,000")
        self.assertEqual(_figure("about twenty four percent"), "24%")
        self.assertEqual(_figure("seven per cent a year"), "7%")
        self.assertEqual(_figure("a hundred thousand invested"), "100,000")
        self.assertEqual(_figure("it costs £2,000 a month"), "£2,000")
        self.assertIsNone(_figure("I was young and in a hurry"))
        self.assertEqual(_figure("If you save 200 pounds a month"), "£200")
        self.assertEqual(_figure("about 1,500 dollars"), "$1,500")

    def test_list_items_end_on_a_real_word(self):
        from pipeline.auto_script import _short

        self.assertEqual(_short("First, work out one month of your bare bones costs."), "Work out one month of your bare bones costs")
        self.assertEqual(_short("Second, open an easy access savings account."), "Open an easy access savings account")
        self.assertEqual(_short("Third, put the money you saved into a fund for the long term."), "Put the money you saved into a fund")

    def test_still_keeps_its_want_text_for_the_placeholder(self):
        sb = parse_script('# T\n\n[still src="x.jpg" want="a phone in a hand"]\nHi.\n')
        self.assertEqual(sb["scenes"][0]["props"]["want"], "a phone in a hand")


class AlignTests(unittest.TestCase):
    def _transcript(self, words, start=0.5, step=0.4):
        return [{"w": w, "s": start + i * step, "e": start + i * step + 0.3} for i, w in enumerate(words)]

    def test_clip_offset_is_pulled_inside_the_file(self):
        import shutil
        import subprocess
        import tempfile
        from pipeline.build import resolve_media
        if not shutil.which("ffmpeg"):
            self.skipTest("ffmpeg not installed")
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, "media"))
            clip = os.path.join(d, "media", "short.mp4")
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=64x64:d=4", "-r", "10", clip], check=True)
            sb = {"scenes": [
                {"id": 1, "type": "clip", "start": 0, "end": 2, "props": {"src": "short.mp4", "from": 3}},
                {"id": 2, "type": "clip", "start": 2, "end": 8, "props": {"src": "short.mp4", "from": 0}},
            ]}
            notes = resolve_media(sb, d, "t")
            p1, p2 = sb["scenes"][0]["props"], sb["scenes"][1]["props"]
            self.assertLess(p1["from"] + 2, p1["clipDur"])
            self.assertTrue(p2.get("loop"))
            self.assertEqual(p2["from"], 0.0)
            self.assertTrue(any("run off the end" in n for n in notes))

    def test_found_footage_skips_its_opening_titles(self):
        import shutil
        import subprocess
        import tempfile
        from pipeline.build import resolve_media
        if not shutil.which("ffmpeg"):
            self.skipTest("ffmpeg not installed")
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, "media"))
            clip = os.path.join(d, "media", "found.mp4")
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=64x64:d=10", "-r", "10", clip], check=True)
            sb = {"scenes": [
                {"id": 1, "type": "clip", "start": 0, "end": 3, "props": {"src": "found.mp4", "search": "a film"}},
                {"id": 2, "type": "clip", "start": 3, "end": 20, "props": {"src": "found.mp4", "search": "a film"}},
                {"id": 3, "type": "clip", "start": 20, "end": 23, "props": {"src": "found.mp4", "search": "a film", "from": 0}},
                {"id": 4, "type": "clip", "start": 23, "end": 26, "props": {"src": "missing.mp4", "fallback": "art.png",
                                                                             "credit": "Studio. Official trailer."}},
            ]}
            open(os.path.join(d, "media", "art.png"), "wb").close()
            resolve_media(sb, d, "t")
            p1, p2, p3, p4 = (sc["props"] for sc in sb["scenes"])
            self.assertAlmostEqual(p1["from"], 1.5, places=1)      # 15% of a 10 s file
            self.assertTrue(p2.get("loop"))
            self.assertAlmostEqual(p2["from"], 1.5, places=1)      # the loop starts past the titles too
            self.assertEqual(p3["from"], 0.0)                      # an explicit from= is kept
            self.assertEqual(sb["scenes"][3]["type"], "still")
            self.assertEqual(p4["credit"], "Illustration")         # the trailer credit does not describe the still

    def test_scene_boundaries_follow_speech(self):
        sb = parse_script(TAGGED)
        # Narrator drops a word, mispronounces one, and the ASR hears an extra filler.
        spoken = "one two three four five six alfa item seven beta item um eight nine ten".split()
        tr = self._transcript(spoken)
        total = tr[-1]["e"] + 1.0
        out = align(sb, tr, total)
        sc = out["scenes"]
        self.assertEqual(out["timing"], "aligned")
        self.assertGreater(out["alignment"]["coverage"], 0.8)
        # the first scene is on screen from the first frame; list starts at "five", chart at "eight"
        self.assertEqual(sc[0]["start"], 0.0)
        self.assertAlmostEqual(sc[1]["start"], tr[4]["s"] - 0.25, places=2)
        self.assertAlmostEqual(sc[3]["start"], tr[12]["s"] - 0.25, places=2)
        # silent image scene borrows its 2s before the chart, and nothing overlaps
        self.assertAlmostEqual(sc[2]["end"] - sc[2]["start"], 2.0, places=2)
        for a, b in zip(sc, sc[1:]):
            self.assertLessEqual(a["end"], b["start"] + 1e-6)
        # captions carry the script's spelling, not the transcript's
        self.assertIn("alpha", [w["w"].lower() for w in sc[1]["words"]])
        self.assertEqual(out["durationSec"], round(total + 0.5, 3))

    def test_first_scene_starts_at_zero_when_the_recogniser_drops_the_opening(self):
        sb = parse_script(TAGGED)
        # The recogniser heard nothing of the title and only the end of the list, starting late.
        spoken = "seven beta item eight nine ten".split()
        tr = self._transcript(spoken)
        tr = [{**w, "s": w["s"] + 19.0, "e": w["e"] + 19.0} for w in tr]
        total = tr[-1]["e"] + 1.0
        out = align(sb, tr, total)
        sc = out["scenes"]
        self.assertEqual(sc[0]["start"], 0.0)
        # the list scene (5 of 7 words unmatched) is spread before its anchored words, not squeezed to a blink
        self.assertGreater(sc[1]["end"] - sc[1]["start"], 2.0)
        self.assertLess(sc[0]["words"][0]["s"], 5.0)
        for a, b in zip(sc, sc[1:]):
            self.assertLessEqual(a["end"], b["start"] + 1e-6)

    def test_short_stray_matches_do_not_anchor_a_long_script(self):
        from pipeline.align import align as align_fn
        words = [f"w{i}" for i in range(30)]
        sb = {"scenes": [
            {"id": 1, "type": "title", "props": {}, "narration": " ".join(words[:10])},
            {"id": 2, "type": "list", "props": {}, "narration": " ".join(words[10:20])},
            {"id": 3, "type": "stat", "props": {}, "narration": " ".join(words[20:])},
        ]}
        # scene 1 is unheard except one stray word late in the recording; scenes 2 and 3 are heard in full
        spoken = words[10:14] + ["w3"] + words[14:]
        tr = self._transcript(spoken)
        tr = [{**w, "s": w["s"] + 10.0, "e": w["e"] + 10.0} for w in tr]
        out = align_fn(sb, tr, tr[-1]["e"] + 1)
        sc = out["scenes"]
        self.assertEqual(sc[0]["start"], 0.0)
        self.assertAlmostEqual(sc[1]["start"], tr[0]["s"] - 0.25, places=2)
        self.assertEqual(out["alignment"]["perScene"][0]["matched"], 0)

    def test_normalize(self):
        self.assertEqual(normalize("Seven,"), "7")
        self.assertEqual(normalize("$10,000."), "$10000")
        self.assertEqual(normalize("percent"), "%")


if __name__ == "__main__":
    unittest.main()
