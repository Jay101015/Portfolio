"""Finder logic against recorded responses; no network."""
import os
import tempfile
import unittest

from pipeline import find_footage as ff

COMMONS = {"query": {"pages": {
    "1": {"title": "File:Trex skeleton.jpg", "imageinfo": [{"mime": "image/jpeg", "url": "https://u/trex.jpg", "thumburl": "https://u/trex-1920.jpg", "descriptionurl": "https://commons/trex",
                                                            "extmetadata": {"LicenseShortName": {"value": "CC BY-SA 4.0"}, "Artist": {"value": "<a href=x>Jane Doe</a>"}}}]},
    "2": {"title": "File:Rain forest.webm", "imageinfo": [{"mime": "video/webm", "url": "https://u/rain.webm", "descriptionurl": "https://commons/rain",
                                                          "extmetadata": {"LicenseShortName": {"value": "CC0"}, "Artist": {"value": "Someone"}}}]},
    "3": {"title": "File:Nope.webm", "imageinfo": [{"mime": "video/webm", "url": "https://u/nope.webm", "descriptionurl": "",
                                                   "extmetadata": {"LicenseShortName": {"value": "CC BY-NC 2.0"}, "Artist": {"value": "X"}}}]},
}}}


def fake_get(url, headers=None):
    if "commons.wikimedia.org" in url:
        return COMMONS
    if "advancedsearch" in url:
        return {"response": {"docs": [{"identifier": "night_of_the_living_dead", "title": "Night of the Living Dead", "creator": "George A. Romero"}]}}
    if "archive.org/metadata" in url:
        return {"files": [{"name": "notld.ia.mp4", "size": "200"}, {"name": "notld_512kb.mp4", "size": "100"}, {"name": "notld.ogv", "size": "50"}]}
    raise AssertionError("unexpected url " + url)


class LicenseTests(unittest.TestCase):
    def test_normalise(self):
        self.assertEqual(ff.normalise_license("CC BY-SA 4.0"), "cc-by-sa")
        self.assertEqual(ff.normalise_license("CC0"), "cc0")
        self.assertEqual(ff.normalise_license("Public domain"), "pd")
        self.assertEqual(ff.normalise_license("http://creativecommons.org/licenses/by/3.0/"), "cc-by")
        self.assertIsNone(ff.normalise_license("CC BY-NC 2.0"))
        self.assertIsNone(ff.normalise_license("CC BY-ND 4.0"))
        self.assertIsNone(ff.normalise_license("All rights reserved"))


class ProviderTests(unittest.TestCase):
    def test_commons_prefers_video_and_skips_nc(self):
        hits = ff.search_commons("rain forest", "video", fake_get)
        self.assertEqual([h.title for h in hits], ["Rain forest.webm", "Trex skeleton.jpg"])
        self.assertEqual(hits[0].license, "cc0")
        self.assertEqual(hits[1].author, "Jane Doe")
        self.assertIn("via Wikimedia Commons", ff.attribution(hits[1]))

    def test_archive_film_picks_mid_size_mp4(self):
        hits = ff.search_archive("Night of the Living Dead", "video", fake_get, film=True)
        self.assertEqual(len(hits), 1)
        self.assertTrue(hits[0].url.endswith("notld.ia.mp4") or hits[0].url.endswith("notld_512kb.mp4"))
        self.assertEqual(hits[0].license, "pd")

    def test_pexels_without_key_is_silent(self):
        os.environ.pop("PEXELS_API_KEY", None)
        self.assertEqual(ff.search_pexels("jungle", "video", fake_get), [])


class EndToEndTests(unittest.TestCase):
    def test_find_rewrites_script_and_writes_report(self):
        downloads = []

        def fake_download(url, dst, headers=None):
            downloads.append(url)
            open(dst, "wb").close()

        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, "media"))
            open(os.path.join(d, "media", "art.png"), "wb").close()
            with open(os.path.join(d, "script.md"), "w") as f:
                f.write('# JP\nfilm: Jurassic Park\n\n[avatar]\nHi.\n\n[clip src="trailer.mp4" from=12 fallback="art.png" search="rain forest" credit="old"]\nThe jungle.\n\n[still src="have.png"]\nBye.\n')
            open(os.path.join(d, "media", "have.png"), "wb").close()
            report = ff.find(d, ["commons"], get=fake_get, download=fake_download)
            md = open(os.path.join(d, "script.md")).read()
            self.assertIn('[clip src="02-rain-forest.webm" from=12 fallback="art.png" search="rain forest" credit="Rain forest.webm by Someone, CC0, via Wikimedia Commons"]', md)
            self.assertEqual(downloads, ["https://u/rain.webm"])
            self.assertEqual([s["status"] for s in report["scenes"]], ["downloaded", "present"])
            rep = open(os.path.join(d, "footage-report.md")).read()
            self.assertIn("under copyright", rep)
            self.assertIn("02-rain-forest.webm", rep)

    def test_dry_run_touches_nothing(self):
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "script.md"), "w") as f:
                f.write('# T\n\n[still caption="trex skeleton"]\nLook.\n')
            report = ff.find(d, ["commons"], dry_run=True, get=fake_get, download=lambda *a, **k: (_ for _ in ()).throw(AssertionError("no download in dry run")))
            self.assertEqual(report["scenes"][0]["status"], "dry-run")
            self.assertNotIn("src=", open(os.path.join(d, "script.md")).read())

    def test_keywords_query(self):
        self.assertEqual(ff.keywords("The raptors in the kitchen. Two kids, steel counters, and a claw tapping on tile."), "raptors kitchen kids steel")


if __name__ == "__main__":
    unittest.main()
