"""Real figures and real headlines for the board.

A finance video that says "inflation is high" or "the base rate" should show the real number, with the publisher
and the month it was published, not a guess. This step runs before the render:

    [stat fact="uk.cpi"]              ->  value="3.8%" label="UK inflation (CPI)" source="ONS, September 2026"
    [stat fact="base rate"]           ->  plain words are matched to the catalogue (see `--list`)
    [news search="UK state pension age rise"]
                                      ->  headline="..." outlet="BBC News" date="19 October 2026" url="..."

The figures come from the official series: the Office for National Statistics API, the Bank of England's
statistical database and the St Louis Fed's FRED (which carries the BLS and Federal Reserve series). Allowances and
limits that change once a year (the ISA allowance, the state pension) are fixed here with their tax year, and the
editor's pass checks them each April. Headlines come from the GDELT document index, filtered to reputable outlets.

The report (facts-report.md) lists every figure filled, every headline found, and the sentences that state a
number or a UK/US claim without a source on the board, for the editor's pass to verify (see EDITOR.md).

    python3 -m pipeline.find_facts projects/<slug> [--dry-run] [--list]
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import os
import re
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable

from .find_footage import UA, rewrite_tag
from .script_parser import parse_script


# ----------------------------------------------------------------------------- the catalogue

@dataclass(frozen=True)
class Fact:
    key: str
    label: str  # what goes on the board when the scene gives no label of its own
    source: str  # the publisher, as credited on the board
    kind: str  # ons | boe | fred | fixed
    unit: str = ""  # "%", "£", "$", "" (a plain number), "£/week"
    series: str = ""
    dataset: str = ""  # ONS only
    aliases: tuple[str, ...] = ()
    value: str = ""  # fixed facts: the figure as written
    asof: str = ""  # fixed facts: the tax year or date it applies to
    yoy: bool = False  # FRED index series: report the change over twelve months
    decimals: int = 1
    note: str = ""


CATALOGUE: tuple[Fact, ...] = (
    # --- United Kingdom: live series
    Fact("uk.cpi", "UK inflation (CPI)", "ONS", "ons", "%", "D7G7", "MM23", ("uk inflation", "inflation", "cpi", "inflation rate", "price rises")),
    Fact("uk.cpih", "UK inflation (CPIH)", "ONS", "ons", "%", "L55O", "MM23", ("cpih", "inflation including housing")),
    Fact("uk.base-rate", "Bank of England base rate", "Bank of England", "boe", "%", "IUMABEDR", "", ("base rate", "bank rate", "interest rate", "interest rates", "bank of england rate"), decimals=2),
    Fact("uk.mortgage-2y", "Average 2-year fixed mortgage rate (75% LTV)", "Bank of England", "boe", "%", "IUMBV34", "", ("mortgage rate", "mortgage rates", "2 year fix", "two year fix", "fixed rate mortgage"), decimals=2),
    Fact("uk.unemployment", "UK unemployment rate", "ONS", "ons", "%", "MGSX", "LMS", ("unemployment", "jobless rate", "unemployment rate")),
    Fact("uk.pay-growth", "UK regular pay growth (a year)", "ONS", "ons", "%", "KAI9", "LMS", ("wage growth", "pay growth", "wages", "pay rises", "earnings growth")),
    Fact("uk.gdp-growth", "UK GDP growth (quarter on quarter)", "ONS", "ons", "%", "IHYQ", "PN2", ("gdp", "gdp growth", "economy growth", "growth", "recession")),
    Fact("uk.saving-ratio", "UK households' saving ratio", "ONS", "ons", "%", "DGD8", "UKEA", ("saving ratio", "savings ratio", "savings rate uk", "how much people save")),
    # --- United Kingdom: allowances and limits (checked each April; the asof is the tax year)
    Fact("uk.isa-allowance", "ISA allowance (a year)", "HMRC", "fixed", "£", aliases=("isa allowance", "isa limit", "isa"), value="£20,000", asof="2025/26 tax year", note="unchanged since April 2017; check the Budget"),
    Fact("uk.lisa-bonus", "Lifetime ISA bonus", "HMRC", "fixed", "%", aliases=("lisa bonus", "lifetime isa bonus", "lisa"), value="25%", asof="2025/26 tax year"),
    Fact("uk.lisa-limit", "Lifetime ISA limit (a year)", "HMRC", "fixed", "£", aliases=("lisa limit", "lifetime isa limit", "lisa allowance"), value="£4,000", asof="2025/26 tax year"),
    Fact("uk.jisa-allowance", "Junior ISA allowance (a year)", "HMRC", "fixed", "£", aliases=("junior isa", "jisa"), value="£9,000", asof="2025/26 tax year"),
    Fact("uk.personal-allowance", "Personal allowance (tax-free income)", "HMRC", "fixed", "£", aliases=("personal allowance", "tax free allowance", "tax-free allowance"), value="£12,570", asof="2025/26 tax year", note="frozen until April 2028"),
    Fact("uk.pension-annual-allowance", "Pension annual allowance", "HMRC", "fixed", "£", aliases=("pension annual allowance", "annual allowance", "pension allowance"), value="£60,000", asof="2025/26 tax year"),
    Fact("uk.state-pension", "Full new state pension", "DWP", "fixed", "£/week", aliases=("state pension", "new state pension", "pension a week"), value="£230.25 a week", asof="2025/26 tax year", note="rises each April under the triple lock"),
    # --- United States: live series (FRED carries the BLS and Federal Reserve series)
    Fact("us.cpi", "US inflation (CPI)", "BLS via FRED", "fred", "%", "CPIAUCSL", aliases=("us inflation", "american inflation", "inflation us", "us cpi"), yoy=True),
    Fact("us.fed-rate", "Fed funds rate", "Federal Reserve via FRED", "fred", "%", "FEDFUNDS", aliases=("fed rate", "fed funds", "federal funds rate", "us interest rate", "us interest rates", "the fed"), decimals=2),
    Fact("us.unemployment", "US unemployment rate", "BLS via FRED", "fred", "%", "UNRATE", aliases=("us unemployment", "american unemployment", "us jobless")),
    Fact("us.mortgage-30", "US 30-year mortgage rate", "Freddie Mac via FRED", "fred", "%", "MORTGAGE30US", aliases=("us mortgage rate", "30 year mortgage", "american mortgage rate"), decimals=2),
    Fact("us.saving-rate", "US personal saving rate", "BEA via FRED", "fred", "%", "PSAVERT", aliases=("us saving rate", "us savings rate", "american savings rate", "personal saving rate")),
    Fact("us.median-income", "US median household income", "Census via FRED", "fred", "$", "MEHOINUSA672N", aliases=("us median income", "median household income", "american median income", "median income"), decimals=0),
    Fact("us.10y", "US 10-year Treasury yield", "Federal Reserve via FRED", "fred", "%", "DGS10", aliases=("10 year treasury", "treasury yield", "bond yield"), decimals=2),
    Fact("us.sp500", "S&P 500", "S&P Dow Jones via FRED", "fred", "", "SP500", aliases=("s&p 500", "s&p", "sp500", "stock market", "the market"), decimals=0),
    # --- United States: limits (checked each January)
    Fact("us.401k-limit", "401(k) contribution limit", "IRS", "fixed", "$", aliases=("401k limit", "401(k) limit", "401k"), value="$23,500", asof="2025"),
    Fact("us.ira-limit", "IRA contribution limit", "IRS", "fixed", "$", aliases=("ira limit", "ira", "roth ira limit"), value="$7,000", asof="2025"),
)
BY_KEY = {f.key: f for f in CATALOGUE}

STOP = {"the", "of", "a", "an", "in", "on", "for", "is", "and", "to", "at", "what", "how", "much", "current", "today", "now", "latest", "rate"}
US_WORDS = {"us", "usa", "america", "american", "states", "fed", "federal", "dollar", "dollars", "irs", "401k", "ira", "treasury"}


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9&$£%() ]+", " ", s.lower()).strip()


def resolve(ask: str) -> Fact | None:
    """A catalogue key, or plain words matched to one (`fact="base rate"`). UK wins a tie unless the words say US."""
    q = _norm(ask).replace("uk ", "").strip()
    if ask.strip().lower() in BY_KEY:
        return BY_KEY[ask.strip().lower()]
    qwords = set(q.split())
    wants_us = bool(qwords & US_WORDS)
    best: tuple[int, Fact] | None = None
    for f in CATALOGUE:
        region_ok = f.key.startswith("us.") == wants_us
        score = 0
        for a in f.aliases + (f.label.lower(),):
            a = _norm(a)
            if a == q:
                score = max(score, 100)  # the words are an alias: nothing beats that
            elif len(a) > 3 and a in q:
                score = max(score, 20 + len(a))  # the alias sits inside the words ("the base rate today")
            elif len(q) > 3 and q in a:
                score = max(score, 10 + len(q))  # the words sit inside a longer alias
            else:
                hit = (set(a.split()) & qwords) - STOP
                score = max(score, 3 * len(hit))  # two shared words at least; one ("price") is not a match
        if score < 6:
            continue
        if region_ok:
            score += 5
        if best is None or score > best[0]:
            best = (score, f)
    return best[1] if best else None


# ----------------------------------------------------------------------------- fetching

def _fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


@dataclass
class Obs:
    value: float
    period: str  # as shown on the board: "September 2026", "Q2 2026", "26 September 2026"
    title: str = ""  # the series' own name, for the report


MONTHS = {m.upper(): i for i, m in enumerate(("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"), 1)}
MONTH_NAMES = ("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December")


def _pretty_month(y: int, m: int) -> str:
    return f"{MONTH_NAMES[m - 1]} {y}"


def _ons_period(date: str) -> str:
    # "2026 AUG" -> "August 2026"; "2026 Q2" -> "Q2 2026"; "2025" -> "2025"
    m = re.match(r"^(\d{4})\s+([A-Z]{3})$", date.strip())
    if m:
        return _pretty_month(int(m.group(1)), MONTHS.get(m.group(2), 1))
    m = re.match(r"^(\d{4})\s+(Q\d)$", date.strip())
    if m:
        return f"{m.group(2)} {m.group(1)}"
    return date.strip()


def fetch_ons(f: Fact, fetch: Callable[[str], str]) -> Obs:
    url = f"https://api.ons.gov.uk/timeseries/{f.series.lower()}/dataset/{f.dataset.lower()}/data"
    d = json.loads(fetch(url))
    title = str((d.get("description") or {}).get("title", ""))
    for k in ("months", "quarters", "years"):
        rows = d.get(k) or []
        if rows:
            last = rows[-1]
            return Obs(float(str(last["value"]).replace(",", "")), _ons_period(str(last.get("date", ""))), title)
    raise RuntimeError("the series has no observations")


def fetch_boe(f: Fact, fetch: Callable[[str], str]) -> Obs:
    since = dt.date.today().year - 2
    url = ("https://www.bankofengland.co.uk/boeapps/iadb/fromshowcolumns.asp?csv.x=yes&Datefrom=01/Jan/" + str(since) + "&Dateto=now&SeriesCodes=" + f.series + "&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N")
    rows = [r for r in csv.reader(io.StringIO(fetch(url))) if len(r) >= 2]
    data = [r for r in rows[1:] if re.match(r"^-?\d", r[1].strip())]
    if not data:
        raise RuntimeError("no rows came back for " + f.series)
    day, val = data[-1][0].strip(), float(data[-1][1])
    try:
        d = dt.datetime.strptime(day, "%d %b %Y").date()
        period = f"{d.day} {MONTH_NAMES[d.month - 1]} {d.year}"
    except ValueError:
        period = day
    return Obs(val, period, rows[0][1] if rows else f.series)


def fetch_fred(f: Fact, fetch: Callable[[str], str]) -> Obs:
    url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=" + f.series
    rows = [r for r in csv.reader(io.StringIO(fetch(url))) if len(r) >= 2]
    data = [(r[0].strip(), float(r[1])) for r in rows[1:] if re.match(r"^-?\d", r[1].strip())]
    if not data:
        raise RuntimeError("no rows came back for " + f.series)
    day, val = data[-1]
    d = dt.date.fromisoformat(day)
    daily = len(data) > 2 and (dt.date.fromisoformat(data[-1][0]) - dt.date.fromisoformat(data[-2][0])).days < 20
    period = f"{d.day} {MONTH_NAMES[d.month - 1]} {d.year}" if daily else _pretty_month(d.year, d.month)
    if f.yoy:
        want = f"{d.year - 1}-{d.month:02d}"
        prev = [v for (k, v) in data if k.startswith(want)]
        if not prev:
            raise RuntimeError("no value twelve months earlier to compare with")
        val = (val / prev[-1] - 1.0) * 100.0
    return Obs(val, period, f.series)


def fetch_fixed(f: Fact, fetch: Callable[[str], str]) -> Obs:
    return Obs(float("nan"), f.asof, f.key)


FETCH: dict[str, Callable[[Fact, Callable[[str], str]], Obs]] = {"ons": fetch_ons, "boe": fetch_boe, "fred": fetch_fred, "fixed": fetch_fixed}


def fmt(f: Fact, v: float) -> str:
    if f.kind == "fixed":
        return f.value
    if f.unit == "%":
        return f"{v:.{f.decimals}f}%"
    if f.unit in ("£", "$"):
        return f"{f.unit}{v:,.{f.decimals}f}"
    return f"{v:,.{f.decimals}f}"


# ----------------------------------------------------------------------------- headlines

GOOD_OUTLETS = {
    "bbc.co.uk": "BBC News", "bbc.com": "BBC News", "theguardian.com": "The Guardian", "ft.com": "Financial Times", "reuters.com": "Reuters",
    "bloomberg.com": "Bloomberg", "telegraph.co.uk": "The Telegraph", "thetimes.com": "The Times", "thetimes.co.uk": "The Times",
    "independent.co.uk": "The Independent", "standard.co.uk": "Evening Standard", "sky.com": "Sky News", "news.sky.com": "Sky News",
    "itv.com": "ITV News", "moneysavingexpert.com": "MoneySavingExpert", "which.co.uk": "Which?", "thisismoney.co.uk": "This is Money",
    "cityam.com": "City A.M.", "economist.com": "The Economist", "gov.uk": "GOV.UK", "ons.gov.uk": "ONS", "bankofengland.co.uk": "Bank of England",
    "cnbc.com": "CNBC", "nytimes.com": "The New York Times", "wsj.com": "The Wall Street Journal", "apnews.com": "AP", "washingtonpost.com": "The Washington Post",
    "cnn.com": "CNN", "npr.org": "NPR", "federalreserve.gov": "Federal Reserve", "bls.gov": "BLS", "irs.gov": "IRS", "forbes.com": "Forbes",
    "marketwatch.com": "MarketWatch", "investopedia.com": "Investopedia", "morningstar.co.uk": "Morningstar", "morningstar.com": "Morningstar",
}


def _outlet(domain: str) -> str:
    d = domain.lower().replace("www.", "")
    for k, v in GOOD_OUTLETS.items():
        if d == k or d.endswith("." + k):
            return v
    return d


def _gdelt_date(seen: str) -> str:
    m = re.match(r"^(\d{4})(\d{2})(\d{2})", seen or "")
    if not m:
        return ""
    return f"{int(m.group(3))} {MONTH_NAMES[int(m.group(2)) - 1]} {m.group(1)}"


def find_headline(search: str, fetch: Callable[[str], str], region: str = "uk") -> dict[str, str] | None:
    """The most recent article from a reputable outlet about `search` (GDELT doc index, last six months)."""
    q = f'"{search}"' if " " in search and len(search) < 60 else search
    country = " sourcecountry:UK" if region == "uk" else (" sourcecountry:US" if region == "us" else "")
    url = "https://api.gdeltproject.org/api/v2/doc/doc?" + urllib.parse.urlencode({"query": q + " sourcelang:english" + country, "mode": "ArtList", "format": "json", "maxrecords": 25, "sort": "DateDesc", "timespan": "6m"})
    try:
        d = json.loads(fetch(url) or "{}")
    except json.JSONDecodeError:
        d = {}
    arts = d.get("articles") or []
    if not arts and country:
        return find_headline(search, fetch, region="any")
    good = [a for a in arts if _outlet(str(a.get("domain", ""))) in GOOD_OUTLETS.values()]
    pick = (good or arts or [None])[0]
    if not pick:
        return None
    title = re.sub(r"\s+", " ", str(pick.get("title", ""))).replace('"', "'").strip()[:140]
    return {"headline": title, "outlet": _outlet(str(pick.get("domain", ""))), "date": _gdelt_date(str(pick.get("seendate", ""))), "url": str(pick.get("url", ""))}


# ----------------------------------------------------------------------------- claims that want a source

NUM_RE = re.compile(r"(£|\$|€)\s?\d|\d+(?:\.\d+)?\s?(%|per ?cent)|\b\d{1,3}(?:,\d{3})+\b|\b(thousand|million|billion|grand|trillion)\b", re.I)
REGION_RE = re.compile(r"\b(uk|britain|british|england|scotland|wales|london|hmrc|government|chancellor|the budget|bank of england|america|american|the us|usa|united states|the fed|federal reserve|irs|congress|white house|downing street)\b", re.I)
SENT_RE = re.compile(r"(?<=[.!?])\s+")


def claims(sb: dict[str, Any]) -> list[dict[str, Any]]:
    """Sentences that state a figure or a UK/US claim on a scene with no source on the board."""
    out = []
    for sc in sb["scenes"]:
        p = sc["props"]
        if sc["type"] in ("news", "outro", "recap") or p.get("fact") or p.get("source"):
            continue
        for sent in SENT_RE.split(sc["narration"].strip()):
            sent = sent.strip()
            if len(sent) < 12:
                continue
            has_num, has_region = bool(NUM_RE.search(sent)), bool(REGION_RE.search(sent))
            if has_num and has_region or (has_region and re.search(r"\b(will|going to|plan|planning|rise|rising|cut|cutting|change|changing|announce|from april|next year)\b", sent, re.I)) or (has_num and re.search(r"\b(average|most people|typical|rate|inflation|tax|pension|salary|wage|house price|rent)\b", sent, re.I)):
                out.append({"id": sc["id"], "sentence": sent[:160]})
    return out


# ----------------------------------------------------------------------------- main

def fill(project: str, fetch: Callable[[str], str] = _fetch, dry_run: bool = False) -> dict[str, Any]:
    script_path = os.path.join(project, "script.md")
    with open(script_path, encoding="utf-8") as fh:
        md = fh.read()
    sb = parse_script(md)
    report: dict[str, Any] = {"facts": [], "news": [], "claims": claims(sb), "when": dt.date.today().isoformat()}
    new_md = md
    for sc in sb["scenes"]:
        p = sc["props"]
        if sc["type"] == "stat" and p.get("fact"):
            ask = str(p["fact"])
            f = resolve(ask)
            entry: dict[str, Any] = {"id": sc["id"], "ask": ask, "key": f.key if f else ""}
            if not f:
                entry["status"] = "no match in the catalogue: the editor's pass looks it up and writes value= and source="
                report["facts"].append(entry)
                continue
            print(f"scene {sc['id']}: {ask} -> {f.key} ({f.source})", flush=True)
            try:
                obs = FETCH[f.kind](f, fetch)
            except Exception as e:  # noqa: BLE001
                entry["status"] = f"failed: {str(e)[:120]}"
                report["facts"].append(entry)
                continue
            value = fmt(f, obs.value)
            source = f"{f.source}, {obs.period}" if obs.period else f.source
            updates = {"value": value, "source": source}
            if not p.get("label"):
                updates["label"] = f.label
            entry.update({"status": "filled", "value": value, "source": source, "series": obs.title or f.series or f.key, "note": f.note})
            report["facts"].append(entry)
            if not dry_run:
                new_md = rewrite_tag(new_md, sc["id"], sb, updates)
        elif sc["type"] == "news" and not p.get("headline") and p.get("search"):
            search = str(p["search"])
            region = "us" if re.search(r"\b(us|usa|america|american|fed)\b", search, re.I) else "uk"
            print(f"scene {sc['id']}: looking for a headline about '{search}'", flush=True)
            try:
                hit = find_headline(search, fetch, region)
            except Exception as e:  # noqa: BLE001
                report["news"].append({"id": sc["id"], "search": search, "status": f"failed: {str(e)[:120]}"})
                continue
            if not hit or not hit["headline"]:
                report["news"].append({"id": sc["id"], "search": search, "status": "nothing found: the editor's pass writes headline=, outlet=, date= and url="})
                continue
            report["news"].append({"id": sc["id"], "search": search, "status": "filled", **hit})
            if not dry_run:
                new_md = rewrite_tag(new_md, sc["id"], sb, hit)
    if not dry_run and new_md != md:
        with open(script_path, "w", encoding="utf-8") as fh:
            fh.write(new_md)
    write_report(project, report)
    return report


def write_report(project: str, report: dict[str, Any]) -> None:
    out = ["# Real figures report", "", f"Filled on {report['when']}. Every figure on the board carries its publisher and the month it was published.", ""]
    out += ["## Figures", ""]
    if report["facts"]:
        out += ["| scene | asked for | value | source | series |", "|---|---|---|---|---|"]
        for e in report["facts"]:
            out.append(f"| {e['id']} | {e['ask']} | {e.get('value', '')} | {e.get('source', '')} | {e.get('series', '') or e.get('status', '')}{(' (' + e['note'] + ')') if e.get('note') else ''} |")
        bad = [e for e in report["facts"] if e.get("status") != "filled"]
        if bad:
            out += ["", "Not filled:", ""] + [f"- scene {e['id']} ({e['ask']}): {e['status']}" for e in bad]
    else:
        out.append("No `fact=` on any stat scene.")
    out += ["", "## Headlines", ""]
    if report["news"]:
        for e in report["news"]:
            out.append(f"- scene {e['id']} ({e['search']}): " + (f"{e['headline']} ({e['outlet']}, {e['date']}) {e['url']}" if e.get("status") == "filled" else e["status"]))
    else:
        out.append("No `[news]` scene with a search=.")
    out += ["", "## Claims to verify in the editor's pass", ""]
    if report["claims"]:
        out.append("These sentences state a figure or a UK/US claim and the scene has no source on the board. Give the scene a `[stat fact=...]`, a `source=` with publisher and date, or a `[news]` scene; or leave it as the host's own experience.")
        out.append("")
        out += [f"- scene {c['id']}: {c['sentence']}" for c in report["claims"]]
    else:
        out.append("Nothing to check: every figure has a source.")
    out += ["", "## The catalogue", "", "`fact=` takes a key or plain words (base rate, us inflation):", ""]
    out += [f"- {f.key}: {f.label} ({f.source}{', ' + f.asof if f.asof else ''})" for f in CATALOGUE]
    with open(os.path.join(project, "facts-report.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(out) + "\n")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Fill real figures and headlines into a script")
    ap.add_argument("project", nargs="?")
    ap.add_argument("--dry-run", action="store_true", help="fetch and report, leave the script alone")
    ap.add_argument("--list", action="store_true", help="print the catalogue and exit")
    a = ap.parse_args(argv)
    if a.list or not a.project:
        for f in CATALOGUE:
            print(f"{f.key:30} {f.label} ({f.source}{', ' + f.asof if f.asof else ''}) aliases: {', '.join(f.aliases)}")
        return 0
    r = fill(a.project, dry_run=a.dry_run)
    print(f"{sum(1 for e in r['facts'] if e.get('status') == 'filled')} figure(s) filled, {sum(1 for e in r['news'] if e.get('status') == 'filled')} headline(s), {len(r['claims'])} claim(s) to verify; see facts-report.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
