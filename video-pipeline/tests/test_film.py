"""Film kit against recorded Wikidata / Commons / TMDB shapes; no network."""
import os
import tempfile
import unittest
from unittest import mock

from pipeline import film

Q = "Q1150285"
SEARCH = {"search": [{"id": "Q99", "label": "10 Things I Hate About You (TV series)"}, {"id": Q, "label": "10 Things I Hate About You"}]}
ENTS = {"entities": {
    "Q99": {"labels": {"en": {"value": "10 Things I Hate About You"}}, "descriptions": {"en": {"value": "2009 television series"}},
            "claims": {"P31": [{"mainsnak": {"datavalue": {"value": {"id": "Q5398426"}}}}], "P577": [{"mainsnak": {"datavalue": {"value": {"time": "+2009-07-07T00:00:00Z"}}}}]}},
    Q: {"labels": {"en": {"value": "10 Things I Hate About You"}}, "descriptions": {"en": {"value": "1999 film by Gil Junger"}},
        "claims": {
            "P31": [{"mainsnak": {"datavalue": {"value": {"id": "Q11424"}}}}],
            "P577": [{"mainsnak": {"datavalue": {"value": {"time": "+1999-03-31T00:00:00Z"}}}}],
            "P57": [{"mainsnak": {"datavalue": {"value": {"id": "Q3107059"}}}}],
            "P161": [{"mainsnak": {"datavalue": {"value": {"id": "Q187126"}}}}, {"mainsnak": {"datavalue": {"value": {"id": "Q213574"}}}}],
            "P2047": [{"mainsnak": {"datavalue": {"value": {"amount": "+97", "unit": "minute"}}}}],
            "P136": [{"mainsnak": {"datavalue": {"value": {"id": "Q860626"}}}}],
            "P750": [{"mainsnak": {"datavalue": {"value": {"id": "Q1760158"}}}}],
            "P915": [{"mainsnak": {"datavalue": {"value": {"id": "Q7597629"}}}}],
            "P345": [{"mainsnak": {"datavalue": {"value": "tt0147800"}}}],
            "P4947": [{"mainsnak": {"datavalue": {"value": "4951"}}}],
        }},
}}
LABELS = {"entities": {"Q3107059": {"labels": {"en": {"value": "Gil Junger"}}}, "Q187126": {"labels": {"en": {"value": "Heath Ledger"}}}, "Q213574": {"labels": {"en": {"value": "Julia Stiles"}}},
                       "Q860626": {"labels": {"en": {"value": "romantic comedy"}}}, "Q1760158": {"labels": {"en": {"value": "Touchstone Pictures"}}}, "Q7597629": {"labels": {"en": {"value": "Stadium High School"}}}}}
COMMONS = {"query": {"pages": {"1": {"title": "File:Stadium High School Tacoma.jpg", "imageinfo": [{"mime": "image/jpeg", "url": "https://u/s.jpg", "thumburl": "https://u/s-1920.jpg", "descriptionurl": "https://commons/s",
                                                                                                  "extmetadata": {"LicenseShortName": {"value": "CC BY 2.0"}, "Artist": {"value": "Joe"}}}]},
                                "2": {"title": "File:Poster scan.jpg", "imageinfo": [{"mime": "image/jpeg", "url": "https://u/p.jpg", "descriptionurl": "", "extmetadata": {"LicenseShortName": {"value": "Fair use"}}}]}}}}
TMDB = {"tagline": "How do I loathe thee? Let me count the ways.", "runtime": 97, "poster_path": "/p.jpg",
        "videos": {"results": [{"site": "YouTube", "type": "Trailer", "key": "abc123", "official": True, "name": "Official Trailer"}]},
        "images": {"backdrops": [{"file_path": "/b1.jpg"}, {"file_path": "/b2.jpg"}]}}


def fake_get(url, headers=None):
    if "wbsearchentities" in url:
        return SEARCH
    if "wbgetentities" in url and "props=labels" in url and "claims" not in url:
        return LABELS
    if "wbgetentities" in url:
        return ENTS
    if "commons.wikimedia.org" in url:
        return COMMONS
    if "themoviedb.org/3/movie/4951" in url:
        return TMDB
    raise AssertionError("unexpected url " + url)


class FactsTests(unittest.TestCase):
    def test_picks_the_film_not_the_series_and_reads_facts(self):
        f = film.film_facts("10 Things I Hate About You", None, fake_get)
        self.assertEqual(f["qid"], Q)
        self.assertEqual(f["year"], 1999)
        self.assertEqual(f["director"], "Gil Junger")
        self.assertEqual(f["cast"][:2], ["Heath Ledger", "Julia Stiles"])
        self.assertEqual(f["runtime"], "97 min")
        self.assertEqual(f["distributor"], "Touchstone Pictures")
        self.assertEqual(f["locations"], ["Stadium High School"])
        self.assertFalse(f["public_domain"])
        self.assertEqual(f["tmdb"], "4951")

    def test_pre_1930_is_public_domain(self):
        ents = {"entities": {Q: dict(ENTS["entities"][Q])}}
        ents["entities"][Q]["claims"] = dict(ENTS["entities"][Q]["claims"], P577=[{"mainsnak": {"datavalue": {"value": {"time": "+1922-03-04T00:00:00Z"}}}}])
        get = lambda url, headers=None: SEARCH if "wbsearchentities" in url else (LABELS if "props=labels" in url and "claims" not in url else ents)  # noqa: E731
        self.assertTrue(film.film_facts("Nosferatu", 1922, get)["public_domain"])


class KitTests(unittest.TestCase):
    def test_kit_classifies_rights_and_scaffolds_script(self):
        downloads = []

        def fake_download(url, dst, headers=None):
            downloads.append(url)
            open(dst, "wb").close()

        with tempfile.TemporaryDirectory() as d, mock.patch.dict(os.environ, {"TMDB_API_KEY": "k"}):
            report = film.build_kit("10 Things I Hate About You", 1999, os.path.join(d, "ten"), want_trailer=False, dry_run=False, get=fake_get, download=fake_download)
            rights = {it["file"]: it["rights"] for it in report["items"]}
            self.assertEqual(rights["poster.jpg"], "promotional")
            self.assertEqual(rights["still-1.jpg"], "promotional")
            self.assertEqual(rights["trailer.mp4"], "trailer")
            self.assertEqual(rights["free-1.jpg"], "free")
            self.assertNotIn("https://www.youtube.com/watch?v=abc123", downloads)  # trailer needs --trailer
            self.assertIn("https://u/s-1920.jpg", downloads)
            md = open(os.path.join(d, "ten", "script.md")).read()
            self.assertIn("film: 10 Things I Hate About You", md)
            self.assertIn('director="Gil Junger"', md)
            self.assertIn('tagline="How do I loathe thee? Let me count the ways."', md)
            self.assertIn('src="kit/poster.jpg"', md)
            self.assertIn("Official trailer", md)
            self.assertIn("Stadium High School", md)
            self.assertNotIn("rights: public-domain", md)
            src = open(os.path.join(d, "ten", "media", "sources.txt")).read()
            self.assertIn("kit/trailer.mp4 yt:https://www.youtube.com/watch?v=abc123", src)
            rep = open(os.path.join(d, "ten", "footage-report.md")).read()
            self.assertIn("Under copyright", rep)
            self.assertIn("| kit/free-1.jpg | free | CC BY 2.0 |", rep)

    def test_dry_run_writes_nothing(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.dict(os.environ, {"TMDB_API_KEY": "k"}):
            report = film.build_kit("10 Things I Hate About You", 1999, os.path.join(d, "ten"), False, True, get=fake_get, download=lambda *a, **k: (_ for _ in ()).throw(AssertionError("no")))
            self.assertEqual(len(report["items"]), 5)
            self.assertFalse(os.path.exists(os.path.join(d, "ten")))


if __name__ == "__main__":
    unittest.main()
