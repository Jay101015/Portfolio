"""Run with:  . .venv/bin/activate && python -m unittest discover -s tests -v"""
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
