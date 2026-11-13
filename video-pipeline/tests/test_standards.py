"""The standard the Nvidia review set (13 November 2026), checked before any render."""
from pipeline import script_parser
from pipeline.preflight import checks

PAGE = '''# T

voice: natural
loudness: -16

[broll src="real-page.jpg" zoom=in caption="CNBC, 10 November 2026" credit="cnbc.com" cards="ink:one@one; ink:two@two; ink:three@three"]
One two three.

[broll src="real-photo.jpg" zoom=in caption="Him" credit="Photo: Someone, CC BY-SA 4.0, via Wikimedia Commons" cards="ink:four@four"]
Four.
'''


def test_preflight_holds_real_pages_to_the_standard(tmp_path):
    msgs = [m for _, m in checks(PAGE, str(tmp_path), True)]
    assert any("brand.pagecards: strip" in m and "2 scene(s)" in m for m in msgs)
    assert any("real-page.jpg: 3 cards on a real page" in m for m in msgs)
    assert any("real-page.jpg: a page with zoom=in" in m for m in msgs)
    assert not any("real-photo.jpg" in m for m in msgs)  # a photograph may push in and carry its cards
    assert any("no `recorded:` line" in m for m in msgs)


def test_a_script_that_meets_the_standard_is_quiet(tmp_path):
    good = (PAGE.replace("loudness: -16\n", "loudness: -16\nbrand.pagecards: strip\nrecorded: 11 November 2026\n")
            .replace('src="real-page.jpg" zoom=in', 'src="real-page.jpg" zoom=none')
            .replace('cards="ink:one@one; ink:two@two; ink:three@three"', 'marks="highlight 1,2,3,4@one" cards="ink:three@three"'))
    msgs = [m for _, m in checks(good, str(tmp_path), True)]
    assert not any("real page" in m or "pagecards" in m or "recorded:" in m or "zoom=in" in m for m in msgs)


def test_recorded_header_dates_the_title_card():
    src = '# T\n\ntheme: whiteboard\nhost: none\nrecorded: 11 November 2026\n\n[hook board="£1"]\nOne.\n\n[title title="T"]\n\n[title kicker="Mine" title="U"]\n'
    titles = [sc for sc in script_parser.parse_script(src)["scenes"] if sc["type"] == "title"]
    assert titles[0]["props"]["kicker"] == "Recorded 11 November 2026"
    assert titles[1]["props"]["kicker"] == "Mine"  # only the first title card, and never over one the script wrote
