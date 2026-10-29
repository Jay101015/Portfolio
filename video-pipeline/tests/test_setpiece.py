"""Set pieces ([set] scenes) and the voice tidy-up: python -m pytest tests/test_setpiece.py"""
import os
import tempfile
import unittest

import numpy as np

from pipeline import setpiece, voice
from pipeline.script_parser import parse_script
from pipeline.shorts import cut_spans
from pipeline.sync import carry_cues

SCRIPT = """# T
theme: whiteboard
host: none

[set room=first-flat walk cards="£12,000 deposit; £125,000; ink:£600 a month; 3 years -> 2 years 9 months"]
Add a {count-notes} £12,000 deposit and your budget is around {fist-pump} £125,000. {prop=keys} That's around £600 a month, and three years becomes {point-board:flip} two.
"""


class SetSceneTest(unittest.TestCase):
    def setUp(self):
        self.sb = parse_script(SCRIPT)
        self.sc = self.sb["scenes"][0]

    def test_cues_leave_the_spoken_words(self):
        self.assertEqual(self.sc["type"], "set")
        self.assertNotIn("{", self.sc["narration"])
        self.assertTrue(self.sc["narration"].startswith("Add a £12,000 deposit"))
        self.assertEqual(self.sb["problems"], [])

    def test_room_staging_and_walk(self):
        p = self.sc["props"]
        self.assertEqual(p["room"], "first-flat")
        self.assertEqual(p["walk"], "right")  # the room's clear side: a walk from the left crosses the footstool
        self.assertAlmostEqual(p["stage"]["land"]["floor"], 0.79, places=2)  # as measured in the demo
        self.assertAlmostEqual(p["stage"]["land"]["h"], 0.62, places=2)
        self.assertEqual(p["art"], "off")

    def test_poses_cards_props_on_their_words(self):
        cues = self.sc["cues"]
        poses = [c["pose"] for c in cues if c["do"] == "pose"]
        self.assertIn("fist-pump-1", poses)  # in-betweens before the key pose
        self.assertEqual(poses[poses.index("fist-pump-1"):poses.index("fist-pump") + 1], ["fist-pump-1", "fist-pump-2", "fist-pump"])
        self.assertTrue(next(c for c in cues if c.get("pose") == "fist-pump").get("hop"))
        self.assertTrue(next(c for c in cues if c.get("pose") == "point-board").get("flip"))
        cards = [c for c in cues if c["do"] == "card"]
        self.assertEqual([c["text"] for c in cards], ["£12,000 deposit", "£125,000", "£600 a month", "2 years 9 months"])
        self.assertEqual(cards[-1]["old"], "3 years")
        self.assertEqual(cards[2]["color"], "ink")
        times = [c["t"] for c in cards]
        self.assertEqual(times, sorted(times))
        words = self.sc["words"]
        three = next(w for w in words if w["w"] == "three")
        self.assertAlmostEqual(cards[-1]["t"], three["s"] - 0.08, places=2)  # "3 years" lands on "three", said as a word
        self.assertTrue(any(c["do"] == "prop" and c["prop"] == "keys" for c in cues))

    def test_unknown_names_are_reported(self):
        sb = parse_script("# T\n\n[set room=nowhere]\nHello {not-a-pose} there.\n")
        self.assertTrue(any("not-a-pose" in p for p in sb["problems"]))
        self.assertTrue(any("nowhere" in p for p in sb["problems"]))

    def test_auto_cards_and_poses(self):
        cards = setpiece.auto_cards("Save £1,000 a month, then pay fees of £200.")
        self.assertEqual([(c["text"], c["color"]) for c in cards], [("£1,000 a month", "green"), ("£200", "red")])
        picks = setpiece.auto_poses("This is how you save money: put £50 away and the government adds free money on top")
        names = [p["pose"] for p in picks]
        self.assertIn("coin-jar", names)  # "save"
        self.assertNotIn("confused", names)  # "how" is too common to act on by itself


class StagingTest(unittest.TestCase):
    def test_every_measured_room_fits_both_frames(self):
        for name, room in setpiece.rooms().items():
            if not room.get("spot"):
                continue
            st = setpiece.stage_for(room)
            self.assertTrue(st["ok"], (name, st["notes"]))
            self.assertLessEqual(st["vert"]["floor"], 0.8 + 1e-6, name)  # feet above the Shorts title
            self.assertGreaterEqual(st["vert"]["floor"] - st["vert"]["h"], 0.26 - 1e-6, name)  # head under the captions
            self.assertLessEqual(st["land"]["floor"], 0.8 + 1e-6, name)


class CarryCuesTest(unittest.TestCase):
    def test_cues_follow_their_words_into_the_take(self):
        out = carry_cues("Add a {count-notes} £12,000 deposit and {fist-pump} £125,000.", "Add a £12,000 deposit and so around £125,000.")
        self.assertEqual(out, "Add a {count-notes} £12,000 deposit and so around {fist-pump} £125,000.")

    def test_no_cues_no_change(self):
        self.assertEqual(carry_cues("plain words", "plain words said"), "plain words said")


def _tone(n, seed=0):
    return np.random.default_rng(seed).normal(0, 60, n)


class VoiceTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()

    def test_gated_silence_is_filled(self):
        sr = 48000
        speech = np.sin(np.arange(sr) * 2 * np.pi * 220 / sr) * 8000
        x = np.concatenate([_tone(sr), speech, np.zeros(sr // 4), speech, _tone(sr, 1)])
        src = os.path.join(self.dir, "in.wav")
        voice.write(src, x)
        path, n = voice.fill_gated(src, os.path.join(self.dir, "out.wav"))
        self.assertEqual(n, 1)
        y = voice.read(path)
        self.assertEqual(len(y), len(x))
        self.assertEqual(voice.zero_runs(y, sr // 1000), [])

    def test_long_pause_is_closed_up(self):
        sr = 48000
        speech = np.sin(np.arange(sr) * 2 * np.pi * 220 / sr) * 8000
        x = np.concatenate([speech, _tone(int(1.5 * sr)), speech])
        src = os.path.join(self.dir, "in.wav")
        voice.write(src, x)
        path, gone, removed = voice.tighten_pauses(src, os.path.join(self.dir, "out.wav"), longest=0.7, keep=0.4)
        self.assertAlmostEqual(gone, 1.1, delta=0.08)
        self.assertAlmostEqual(len(voice.read(path)) / sr, 3.5 - gone, delta=0.03)
        self.assertAlmostEqual(voice.shift_time(3.0, removed), 3.0 - gone, places=2)
        self.assertAlmostEqual(voice.shift_time(0.5, removed), 0.5, places=3)

    def test_captions_follow_small_words_but_keep_figures(self):
        sb = {"scenes": [{"words": [
            {"w": "salary", "s": 0.0, "e": 0.3}, {"w": "£60,000,", "s": 0.4, "e": 0.9},
            {"w": "comes", "s": 1.0, "e": 1.2}, {"w": "to", "s": 1.2, "e": 1.3}, {"w": "around", "s": 1.5, "e": 1.7},
            {"w": "£1,000", "s": 2.0, "e": 2.4}, {"w": "per", "s": 2.5, "e": 2.6}, {"w": "year.", "s": 2.6, "e": 2.9}]}]}
        said = [{"w": "salary", "s": 0.0, "e": 0.3}, {"w": "$60,000,", "s": 0.4, "e": 0.9},
                {"w": "comes", "s": 1.0, "e": 1.2}, {"w": "to", "s": 1.2, "e": 1.3}, {"w": "be", "s": 1.3, "e": 1.45},
                {"w": "around", "s": 1.5, "e": 1.7}, {"w": "£1,000", "s": 2.0, "e": 2.4}, {"w": "a", "s": 2.5, "e": 2.6},
                {"w": "year.", "s": 2.6, "e": 2.9}]
        voice.take_words(sb, said)
        self.assertEqual([w["w"] for w in sb["scenes"][0]["words"]], ["salary", "£60,000,", "comes", "to", "be", "around", "£1,000", "a", "year."])


class ShortCueTest(unittest.TestCase):
    def test_cues_move_with_their_piece_and_skipped_ones_drop(self):
        sb = {"title": "t", "slug": "t", "fps": 30, "durationSec": 20, "brand": {}, "scenes": [
            {"id": 1, "type": "set", "start": 0.0, "end": 20.0, "narration": "", "props": {},
             "words": [{"w": "a", "s": 1.0, "e": 1.2}, {"w": "b", "s": 6.0, "e": 6.2}, {"w": "c", "s": 12.0, "e": 12.2}],
             "cues": [{"t": 1.0, "do": "card", "text": "a"}, {"t": 6.0, "do": "card", "text": "b"}, {"t": 12.0, "do": "card", "text": "c"}]}]}
        cut, _ = cut_spans(sb, [[0.5, 3.0], [11.0, 13.0]], lead=0.4)
        cues = cut["scenes"][0]["cues"]
        self.assertEqual([c["text"] for c in cues], ["a", "c"])  # "b" was in the part the Short skips
        self.assertAlmostEqual(cues[0]["t"], 0.4 + 0.5, places=3)
        self.assertAlmostEqual(cues[1]["t"], 0.4 + 2.5 + 1.0, places=3)  # the second piece starts 2.5 s in


if __name__ == "__main__":
    unittest.main()
