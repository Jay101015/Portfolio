"""The real-figures step: catalogue matching, the official feeds (faked), the headline finder, the claims list."""
import json
import os

from pipeline import find_facts as ff
from pipeline.script_parser import parse_script

ONS = json.dumps({"description": {"title": "CPI ANNUAL RATE 00: ALL ITEMS 2015=100"}, "months": [{"date": "2026 JUL", "value": "3.6"}, {"date": "2026 AUG", "value": "3.8"}], "quarters": [], "years": []})
BOE = "DATE,IUMABEDR\n01 Aug 2026,4.25\n26 Sep 2026,4.00\n"
FRED_UNRATE = "observation_date,UNRATE\n2026-08-01,4.3\n2026-09-01,4.4\n"
FRED_CPI = "observation_date,CPIAUCSL\n" + "\n".join(f"2025-{m:02d}-01,{300 + m}" for m in range(1, 13)) + "\n" + "\n".join(f"2026-{m:02d}-01,{309 + m}" for m in range(1, 10)) + "\n"
GDELT = json.dumps({"articles": [
    {"title": "Some blog: pension age to rise", "url": "https://randomblog.example/x", "domain": "randomblog.example", "seendate": "20261020T090000Z"},
    {"title": 'State pension age "will rise to 68 sooner", review says', "url": "https://www.bbc.co.uk/news/business-1", "domain": "bbc.co.uk", "seendate": "20261019T143000Z"},
]})


def fake_fetch(url: str) -> str:
    if "ons.gov.uk" in url:
        return ONS
    if "bankofengland" in url:
        return BOE
    if "fredgraph.csv?id=UNRATE" in url:
        return FRED_UNRATE
    if "fredgraph.csv?id=CPIAUCSL" in url:
        return FRED_CPI
    if "gdeltproject" in url:
        return GDELT
    raise AssertionError("unexpected url " + url)


def test_resolve_keys_and_plain_words():
    assert ff.resolve("uk.cpi").key == "uk.cpi"
    assert ff.resolve("base rate").key == "uk.base-rate"
    assert ff.resolve("the Bank of England base rate").key == "uk.base-rate"
    assert ff.resolve("inflation").key == "uk.cpi"
    assert ff.resolve("US inflation").key == "us.cpi"
    assert ff.resolve("isa allowance").key == "uk.isa-allowance"
    assert ff.resolve("fed funds rate").key == "us.fed-rate"
    assert ff.resolve("state pension").key == "uk.state-pension"
    assert ff.resolve("price of bananas in Peru") is None


def test_feeds_parse_and_format():
    cpi = ff.fetch_ons(ff.BY_KEY["uk.cpi"], fake_fetch)
    assert (cpi.value, cpi.period) == (3.8, "August 2026") and "CPI" in cpi.title
    rate = ff.fetch_boe(ff.BY_KEY["uk.base-rate"], fake_fetch)
    assert (rate.value, rate.period) == (4.0, "26 September 2026")
    assert ff.fmt(ff.BY_KEY["uk.base-rate"], rate.value) == "4.00%"
    un = ff.fetch_fred(ff.BY_KEY["us.unemployment"], fake_fetch)
    assert (un.value, un.period) == (4.4, "September 2026")
    us_cpi = ff.fetch_fred(ff.BY_KEY["us.cpi"], fake_fetch)
    assert round(us_cpi.value, 2) == round((318 / 309 - 1) * 100, 2)  # September 2026 over September 2025
    assert ff.fmt(ff.BY_KEY["uk.isa-allowance"], float("nan")) == "£20,000"


def test_headline_prefers_a_reputable_outlet():
    hit = ff.find_headline("state pension age", fake_fetch)
    assert hit["outlet"] == "BBC News" and hit["date"] == "19 October 2026" and '"' not in hit["headline"]


def test_fill_writes_values_sources_and_headlines(tmp_path):
    proj = tmp_path / "p"
    proj.mkdir()
    (proj / "script.md").write_text(
        "# Facts\ntheme: whiteboard\nhost: none\n\n"
        "[hook board=\"Is inflation beating your savings?\"]\nInflation is eating your savings. In the UK most people keep £10,000 in a current account.\n\n"
        "[stat fact=\"inflation\" sub=\"and rising\"]\nInflation is running at nearly four per cent.\n\n"
        "[stat fact=\"base rate\" label=\"What the Bank pays\"]\nThe base rate is four per cent.\n\n"
        "[stat fact=\"price of bananas\"]\nBananas cost more.\n\n"
        "[news search=\"state pension age\"]\nThe government says the pension age will rise.\n\n"
        "[text board=\"My own numbers\"]\nI put £500 a month into my index fund.\n",
        encoding="utf-8",
    )
    r = ff.fill(str(proj), fetch=fake_fetch)
    md = (proj / "script.md").read_text(encoding="utf-8")
    assert '[stat fact="inflation" sub="and rising" value="3.8%" source="ONS, August 2026" label="UK inflation (CPI)"]' in md
    assert 'label="What the Bank pays" value="4.00%" source="Bank of England, 26 September 2026"' in md
    assert "[stat fact=\"price of bananas\"]" in md  # left alone, flagged
    assert 'outlet="BBC News"' in md and 'date="19 October 2026"' in md and "headline=\"State pension age 'will rise to 68 sooner', review says\"" in md
    assert [e["status"] for e in r["facts"]][:2] == ["filled", "filled"] and "no match" in r["facts"][2]["status"]
    # the hook states a UK figure with no source: it is listed for the editor; the host's own £500 is not
    ids = [c["id"] for c in r["claims"]]
    assert 1 in ids and 6 not in ids
    rep = (proj / "facts-report.md").read_text(encoding="utf-8")
    assert "| 2 | inflation | 3.8% | ONS, August 2026 |" in rep and "BBC News" in rep and "Claims to verify" in rep
    # the filled script still parses and the stat carries the real value
    sb = parse_script(md)
    assert sb["scenes"][1]["props"]["value"] == "3.8%" and sb["scenes"][4]["props"]["outlet"] == "BBC News"


def test_dry_run_leaves_the_script(tmp_path):
    proj = tmp_path / "p"
    proj.mkdir()
    (proj / "script.md").write_text("# F\ntheme: whiteboard\n\n[stat fact=\"uk.cpi\"]\nInflation.\n", encoding="utf-8")
    ff.fill(str(proj), fetch=fake_fetch, dry_run=True)
    assert "value=" not in (proj / "script.md").read_text(encoding="utf-8")
    assert os.path.exists(proj / "facts-report.md")


def test_unfilled_fact_and_headline_become_board_lines():
    from pipeline.build import degrade_unfilled
    sb = parse_script("# F\ntheme: whiteboard\n\n[stat fact=\"base rate\"]\nRates.\n\n[news search=\"pension charge cap\"]\nNews.\n\n[stat fact=\"uk.cpi\" value=\"3.8%\"]\nKept.\n")
    notes = degrade_unfilled(sb)
    assert sb["scenes"][0]["type"] == "text" and sb["scenes"][0]["props"]["board"] == "Bank of England base rate"
    assert sb["scenes"][1]["type"] == "text" and sb["scenes"][1]["props"]["board"] == "Pension charge cap"
    assert sb["scenes"][2]["type"] == "stat" and len(notes) == 2


def test_headline_search_widens_when_the_phrase_finds_nothing():
    calls = []

    def fetch(url):
        calls.append(url)
        if "%22" in url:  # the exact phrase finds nothing
            return json.dumps({"articles": []})
        return GDELT

    notes = []
    hit = ff.find_headline("pension charge cap", fetch, "uk", notes)
    assert hit and hit["outlet"] == "BBC News" and len(calls) >= 3 and any("12m" in n for n in notes)
