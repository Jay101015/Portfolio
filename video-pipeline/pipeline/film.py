"""Build a film kit from a title: facts, rights status, poster, stills, free photos, trailer, and a script scaffold.

    python -m pipeline.film "10 Things I Hate About You" [--year 1999] [--project projects/10-things] [--trailer] [--dry-run]

What it does, in order:
  1. Wikidata: finds the film and pulls year, director, cast, runtime, genre, distributor,
     filming locations, copyright status and the IMDb / TMDB ids. Free data (CC0).
  2. Decides whether the film is public domain (Wikidata says so, or it was published
     before 1930). If it is, the feature itself is fetched from the Internet Archive.
  3. Wikimedia Commons: CC / public-domain photos of the cast, the director and the
     filming locations. Free to use with the credit the pipeline draws on screen.
  4. TMDB (optional, needs TMDB_API_KEY): tagline, overview, poster, stills, and the
     official trailer's YouTube id. Posters and stills are studio material: the kit
     marks them "promotional" (customary in reviews; a fair-use judgement, not a licence).
  5. Trailer: with --trailer and yt-dlp on the machine, downloads it to media/trailer.mp4.
     Marked "trailer": fair use with commentary, expect a Content ID claim.
  6. Writes script.md (if none exists) with the film card filled in and scene slots that
     point at the kit, media/sources.txt, and footage-report.md with every item's rights.

Everything the kit marks as anything other than "free" is a judgement you make,
not a licence you hold. The report says which is which.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
from typing import Any, Callable

from .find_footage import _download, _get_json, normalise_license, slugify

WD = "https://www.wikidata.org/w/api.php"
P = {"instance": "P31", "published": "P577", "director": "P57", "cast": "P161", "runtime": "P2047", "genre": "P136", "distributor": "P750",
     "location": "P915", "narrative_location": "P840", "copyright": "P6216", "imdb": "P345", "tmdb": "P4947", "commons_cat": "P373", "based_on": "P144", "country": "P495"}
Q_FILM = "Q11424"
Q_PUBLIC_DOMAIN = "Q19652"


# ----------------------------------------------------------------------------- wikidata

def wd_search(title: str, year: int | None, get: Callable = _get_json) -> dict[str, Any] | None:
    data = get(WD + "?" + urllib.parse.urlencode({"action": "wbsearchentities", "search": title, "language": "en", "type": "item", "limit": 10, "format": "json"}))
    cands = data.get("search", [])
    if not cands:
        return None
    ids = [c["id"] for c in cands]
    ents = get(WD + "?" + urllib.parse.urlencode({"action": "wbgetentities", "ids": "|".join(ids), "props": "claims|labels|descriptions", "languages": "en", "format": "json"})).get("entities", {})
    best = None
    for qid in ids:
        e = ents.get(qid, {})
        claims = e.get("claims", {})
        kinds = {c["mainsnak"].get("datavalue", {}).get("value", {}).get("id") for c in claims.get(P["instance"], [])}
        if Q_FILM not in kinds and not any(k and k.startswith("Q") and "film" in str(e.get("descriptions", {}).get("en", {}).get("value", "")).lower() for k in kinds):
            continue
        y = _year(claims)
        score = 0
        if year and y == year:
            score += 10
        if str(e.get("labels", {}).get("en", {}).get("value", "")).lower() == title.lower():
            score += 5
        if best is None or score > best[0]:
            best = (score, qid, e)
    if not best:
        return None
    _, qid, e = best
    return {"qid": qid, "label": e.get("labels", {}).get("en", {}).get("value", title), "claims": e.get("claims", {}), "description": e.get("descriptions", {}).get("en", {}).get("value", "")}


def _year(claims: dict) -> int | None:
    for c in claims.get(P["published"], []):
        t = c["mainsnak"].get("datavalue", {}).get("value", {}).get("time")
        if t:
            return int(t[1:5])
    return None


def _ids(claims: dict, prop: str, limit: int = 50) -> list[str]:
    out = []
    for c in claims.get(prop, [])[:limit]:
        v = c["mainsnak"].get("datavalue", {}).get("value")
        if isinstance(v, dict) and v.get("id"):
            out.append(v["id"])
    return out


def _str(claims: dict, prop: str) -> str | None:
    for c in claims.get(prop, []):
        v = c["mainsnak"].get("datavalue", {}).get("value")
        if isinstance(v, str):
            return v
        if isinstance(v, dict) and "amount" in v:
            return str(v["amount"]).lstrip("+")
    return None


def wd_labels(qids: list[str], get: Callable = _get_json) -> dict[str, str]:
    labels: dict[str, str] = {}
    for i in range(0, len(qids), 50):
        chunk = qids[i:i + 50]
        if not chunk:
            continue
        ents = get(WD + "?" + urllib.parse.urlencode({"action": "wbgetentities", "ids": "|".join(chunk), "props": "labels", "languages": "en", "format": "json"})).get("entities", {})
        for q, e in ents.items():
            labels[q] = e.get("labels", {}).get("en", {}).get("value", q)
    return labels


def film_facts(title: str, year: int | None, get: Callable = _get_json) -> dict[str, Any] | None:
    hit = wd_search(title, year, get)
    if not hit:
        return None
    c = hit["claims"]
    want = {k: _ids(c, P[k], 6 if k == "cast" else 4) for k in ("director", "cast", "genre", "distributor", "location", "narrative_location", "copyright", "country")}
    labels = wd_labels(sorted({q for v in want.values() for q in v}), get)
    name = lambda k: [labels.get(q, q) for q in want[k]]  # noqa: E731
    y = _year(c)
    pd = Q_PUBLIC_DOMAIN in want["copyright"] or (y is not None and y < 1930)
    runtime = _str(c, P["runtime"])
    return {
        "title": hit["label"], "qid": hit["qid"], "year": y, "director": ", ".join(name("director")), "cast": name("cast"), "genre": ", ".join(name("genre")),
        "distributor": ", ".join(name("distributor")), "locations": name("location") + name("narrative_location"), "country": ", ".join(name("country")),
        "runtime": f"{int(float(runtime))} min" if runtime else "", "public_domain": pd, "imdb": _str(c, P["imdb"]), "tmdb": _str(c, P["tmdb"]), "commons_category": _str(c, P["commons_cat"]),
        "description": hit["description"],
    }


# ----------------------------------------------------------------------------- commons photos (free)

def commons_photos(queries: list[tuple[str, str]], per_query: int, get: Callable = _get_json) -> list[dict[str, Any]]:
    """[(label, query)] -> free images with attribution. Skips anything not PD / CC0 / CC BY / CC BY-SA."""
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for label, q in queries:
        url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
            "action": "query", "format": "json", "generator": "search", "gsrsearch": q + " filetype:bitmap", "gsrnamespace": 6, "gsrlimit": 8,
            "prop": "imageinfo", "iiprop": "url|extmetadata|mime", "iiurlwidth": 1920})
        try:
            pages = get(url).get("query", {}).get("pages", {})
        except Exception as e:  # noqa: BLE001
            out.append({"label": label, "query": q, "error": str(e)})
            continue
        n = 0
        for p in pages.values():
            info = (p.get("imageinfo") or [{}])[0]
            meta = info.get("extmetadata", {})
            lic = normalise_license(" ".join(str(meta.get(k, {}).get("value", "")) for k in ("LicenseShortName", "License", "UsageTerms")))
            if not lic or not str(info.get("mime", "")).startswith("image/"):
                continue
            t = str(p.get("title", "")).replace("File:", "")
            if t in seen:
                continue
            seen.add(t)
            author = re.sub(r"<[^>]+>", "", str(meta.get("Artist", {}).get("value", ""))).strip()
            out.append({"label": label, "query": q, "title": t, "url": info.get("thumburl") or info.get("url"), "page": info.get("descriptionurl", ""),
                        "license": str(meta.get("LicenseShortName", {}).get("value", lic.upper())), "rights": "free",
                        "credit": f"{t}{' by ' + author if author else ''}, {meta.get('LicenseShortName', {}).get('value', lic.upper())}, via Wikimedia Commons"})
            n += 1
            if n >= per_query:
                break
    return out


# ----------------------------------------------------------------------------- tmdb (optional)

def tmdb_kit(title: str, year: int | None, tmdb_id: str | None, get: Callable = _get_json) -> dict[str, Any] | None:
    key = os.environ.get("TMDB_API_KEY")
    if not key:
        return None
    h = {"Authorization": f"Bearer {key}"} if key.startswith("ey") else {}
    qs = f"api_key={key}&" if not h else ""
    if not tmdb_id:
        res = get(f"https://api.themoviedb.org/3/search/movie?{qs}" + urllib.parse.urlencode({"query": title, **({"year": year} if year else {})}), h).get("results", [])
        if not res:
            return None
        tmdb_id = str(res[0]["id"])
    m = get(f"https://api.themoviedb.org/3/movie/{tmdb_id}?{qs}append_to_response=videos,images&include_image_language=en,null", h)
    vids = [v for v in m.get("videos", {}).get("results", []) if v.get("site") == "YouTube" and v.get("type") == "Trailer"]
    vids.sort(key=lambda v: (not v.get("official", False), v.get("published_at", "")))
    imgs = m.get("images", {})
    base = "https://image.tmdb.org/t/p/"
    return {
        "id": tmdb_id, "tagline": m.get("tagline", ""), "overview": m.get("overview", ""), "runtime": m.get("runtime"),
        "poster": base + "w780" + m["poster_path"] if m.get("poster_path") else None,
        "backdrops": [base + "w1280" + b["file_path"] for b in imgs.get("backdrops", [])[:4]],
        "trailer": f"https://www.youtube.com/watch?v={vids[0]['key']}" if vids else None,
        "trailer_name": vids[0].get("name") if vids else None,
    }


# ----------------------------------------------------------------------------- kit

def scaffold_script(f: dict[str, Any], kit: dict[str, Any], photos: list[dict[str, Any]], project_slug: str) -> str:
    title = f["title"]
    year = f.get("year") or ""
    tagline = (kit or {}).get("tagline") or ""
    starring = ", ".join(f.get("cast", [])[:3])
    poster = 'src="kit/poster.jpg" ' if (kit or {}).get("poster") else ""
    rights = "rights: public-domain\n" if f["public_domain"] else ""
    lines = [
        f"# {title} ({year}): your take goes here",
        f"slug: {project_slug}",
        f"film: {title}",
        rights + "theme: toon",
        "brand.name: REEL TAKES",
        "",
        f'[avatar headline="{title}" sub="Worth your evening?" pose=wave]',
        f"<!-- Your opening. One sentence on why this film, one on what you thought. -->",
        f"Welcome back. Today, {title}.",
        "",
        f'[poster {poster}title="{title}" year="{year}" director="{f.get("director", "")}" runtime="{f.get("runtime", "")}" genre="{f.get("genre", "")}" starring="{starring}" tagline="{tagline}" pose=point]',
        f"{title}. Directed by {f.get('director', 'its director')}{', ' + str(year) if year else ''}{', ' + f['runtime'] if f.get('runtime') else ''}.",
        "",
    ]
    if f["public_domain"]:
        lines += [
            '[clip src="kit/feature.mp4" from=60 credit="' + f"{title} ({year}), public domain" + '" caption="The opening" pose=idle]',
            "<!-- The film is public domain: cut into it anywhere with from= seconds. -->",
            "It opens like this.",
            "",
        ]
    else:
        shots = (kit or {}).get("backdrops") or []
        for i, _ in enumerate(shots[:2], 1):
            lines += [
                f'[still src="kit/still-{i}.jpg" credit="{title} ({year}), {f.get("distributor") or "the studio"}. Promotional still." caption="" pose=think]',
                "<!-- A studio still: promotional material, customary in reviews. Say what happens here and what you thought of it. -->",
                "This scene.",
                "",
            ]
        if (kit or {}).get("trailer"):
            lines += [
                f'[clip src="kit/trailer.mp4" from=10 fallback="kit/still-1.jpg" credit="{title} ({year}), {f.get("distributor") or "the studio"}. Official trailer." caption="" pose=shocked]',
                "<!-- Trailer footage: fair use with commentary, expect a Content ID claim on this video. Keep it short and talk over it. -->",
                "And then this.",
                "",
            ]
    free = [p for p in photos if p.get("rights") == "free"][:2]
    for i, p in enumerate(free, 1):
        lines += [
            f'[still src="kit/free-{i}.jpg" credit="{p["credit"]}" caption="{p["label"]}" pose=point]',
            f"<!-- Free photo ({p['license']}): {p['label']}. -->",
            f"About {p['label']}.",
            "",
        ]
    lines += [
        '[list title="Why it works"]',
        "- ",
        "- ",
        "- ",
        "<!-- Read the items aloud in the narration so they animate in on your words. -->",
        "Three reasons it works.",
        "",
        '[compare title="What works and what doesn\'t"]',
        "left: What doesn't | | ; ",
        "right: What works | | ; ",
        "Now, what does not work. And what does.",
        "",
        '[score value="7" max="10" label="The verdict" verdict="" pose=thumbsup]',
        "{think} My score. {thumbsup} Seven out of ten.",
        "",
        '[outro title="Watch it tonight." cta="Subscribe for a review every week" pose=wave]',
        f"That is {title}. Subscribe for a new review every week.",
        "",
    ]
    return "\n".join(lines)


def build_kit(title: str, year: int | None, project: str | None, want_trailer: bool, dry_run: bool, get: Callable = _get_json, download: Callable = _download) -> dict[str, Any]:
    facts = film_facts(title, year, get)
    if not facts:
        raise SystemExit(f"could not find a film called {title!r} on Wikidata; try --year or the exact title")
    slug = slugify(f"{facts['title']}-{facts.get('year') or ''}")
    project = project or os.path.join("projects", slug)
    media = os.path.join(project, "media", "kit")
    report: dict[str, Any] = {"facts": facts, "items": [], "project": project}

    kit = None
    try:
        kit = tmdb_kit(facts["title"], facts.get("year"), facts.get("tmdb"), get)
    except Exception as e:  # noqa: BLE001
        report["tmdb_error"] = str(e)
    if kit and kit.get("runtime") and not facts.get("runtime"):
        facts["runtime"] = f"{kit['runtime']} min"

    queries: list[tuple[str, str]] = []
    if facts.get("commons_category"):
        queries.append((facts["title"], f'incategory:"{facts["commons_category"]}"'))
    for who in facts.get("cast", [])[:3]:
        queries.append((who, f"{who} actor"))
    if facts.get("director"):
        queries.append((facts["director"].split(",")[0], f"{facts['director'].split(',')[0]} director"))
    for loc in facts.get("locations", [])[:3]:
        queries.append((loc, loc))
    photos = commons_photos(queries, 1, get)

    items: list[dict[str, Any]] = []
    if facts["public_domain"]:
        from .find_footage import search_archive
        try:
            hits = search_archive(facts["title"], "video", get, film=True)
        except Exception as e:  # noqa: BLE001
            hits = []
            report["archive_error"] = str(e)
        if hits:
            h = hits[0]
            items.append({"file": "feature.mp4", "url": h.url, "rights": "free", "license": "Public domain", "credit": f"{facts['title']} ({facts.get('year')}), public domain, via Internet Archive", "page": h.page})
    if kit:
        if kit.get("poster"):
            items.append({"file": "poster.jpg", "url": kit["poster"], "rights": "promotional", "license": "Studio poster", "credit": f"{facts['title']} poster, {facts.get('distributor') or 'the studio'}", "page": f"https://www.themoviedb.org/movie/{kit['id']}"})
        for i, b in enumerate(kit.get("backdrops", []), 1):
            items.append({"file": f"still-{i}.jpg", "url": b, "rights": "promotional", "license": "Studio still", "credit": f"{facts['title']} ({facts.get('year')}), {facts.get('distributor') or 'the studio'}. Promotional still.", "page": f"https://www.themoviedb.org/movie/{kit['id']}"})
        if kit.get("trailer"):
            items.append({"file": "trailer.mp4", "url": kit["trailer"], "rights": "trailer", "license": "Studio trailer", "credit": f"{facts['title']} ({facts.get('year')}), official trailer", "page": kit["trailer"], "youtube": True})
    for i, p in enumerate([p for p in photos if p.get("rights") == "free"], 1):
        items.append({"file": f"free-{i}.jpg", "url": p["url"], "rights": "free", "license": p["license"], "credit": p["credit"], "page": p["page"], "label": p["label"]})
    report["items"] = items
    report["photo_errors"] = [p for p in photos if p.get("error")]

    if dry_run:
        return report

    os.makedirs(media, exist_ok=True)
    for it in items:
        dst = os.path.join(media, it["file"])
        if os.path.exists(dst):
            it["status"] = "present"
            continue
        if it.get("youtube"):
            if want_trailer and shutil.which("yt-dlp"):
                try:
                    subprocess.run(["yt-dlp", "-f", "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[ext=mp4]", "-o", dst, it["url"]], check=True, capture_output=True)
                    it["status"] = "downloaded"
                except Exception as e:  # noqa: BLE001
                    it["status"] = f"yt-dlp failed: {e}"
            else:
                it["status"] = "listed in media/sources.txt (pass --trailer with yt-dlp installed to fetch)"
            continue
        try:
            download(it["url"], dst)
            it["status"] = "downloaded"
        except Exception as e:  # noqa: BLE001
            it["status"] = f"download failed: {e}"

    with open(os.path.join(project, "media", "sources.txt"), "a", encoding="utf-8") as f:
        f.write(f"\n# {facts['title']} kit\n")
        for it in items:
            f.write(f"kit/{it['file']} {'yt:' if it.get('youtube') else ''}{it['url']}\n")
    script_path = os.path.join(project, "script.md")
    if not os.path.exists(script_path):
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(scaffold_script(facts, kit, photos, slug))
        report["script"] = "written"
    else:
        report["script"] = "kept (already exists)"
    write_kit_report(project, report)
    return report


def write_kit_report(project: str, report: dict[str, Any]) -> None:
    f = report["facts"]
    out = [f"# Film kit: {f['title']} ({f.get('year') or '?'})", ""]
    out.append(f"Director: {f.get('director') or '?'} · Cast: {', '.join(f.get('cast', [])[:5]) or '?'} · Runtime: {f.get('runtime') or '?'} · Genre: {f.get('genre') or '?'} · Distributor: {f.get('distributor') or '?'}")
    out.append(f"Wikidata: https://www.wikidata.org/wiki/{f['qid']}" + (f" · IMDb: https://www.imdb.com/title/{f['imdb']}/" if f.get("imdb") else ""))
    out.append("")
    if f["public_domain"]:
        out.append("**Public domain.** The feature itself is free to use; the script cuts into it with from= offsets.")
    else:
        out.append("**Under copyright.** No footage of the film is free to use. The kit holds free photos (cast, director, locations), studio promotional material, and the trailer, each marked below.")
    out += ["", "| file | rights | licence | status | credit shown on screen | source |", "|---|---|---|---|---|---|"]
    for it in report["items"]:
        out.append(f"| kit/{it['file']} | {it['rights']} | {it['license']} | {it.get('status', 'dry-run')} | {it['credit']} | {it['page']} |")
    out += ["", "## What the rights column means", "",
            "- **free**: public domain or Creative Commons (CC0, BY, BY-SA). Use anywhere; the credit= tag shows the attribution on screen.",
            "- **promotional**: the studio's poster and stills. Reviews use them routinely, but it is a fair-use judgement, not a licence. Keep them brief and talk over them.",
            "- **trailer**: the studio's trailer. Fair use with commentary; expect a Content ID claim that redirects that video's ad revenue. Short cutaways, host on screen.",
            "", "Facts come from Wikidata (CC0). Poster, stills and trailer ids come from TMDB when TMDB_API_KEY is set; TMDB asks for attribution and its API terms treat some commercial uses as needing a licence, so check them before you scale."]
    if report.get("tmdb_error") or report.get("archive_error") or report.get("photo_errors"):
        out += ["", "## Errors", ""]
        for k in ("tmdb_error", "archive_error"):
            if report.get(k):
                out.append(f"- {k}: {report[k]}")
        for p in report.get("photo_errors", []):
            out.append(f"- commons {p.get('query')}: {p.get('error')}")
    with open(os.path.join(project, "footage-report.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(out) + "\n")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("title")
    ap.add_argument("--year", type=int)
    ap.add_argument("--project", help="project folder (default projects/<title-year>)")
    ap.add_argument("--trailer", action="store_true", help="download the official trailer with yt-dlp")
    ap.add_argument("--dry-run", action="store_true", help="look everything up, download nothing, write nothing")
    args = ap.parse_args(argv)
    report = build_kit(args.title, args.year, args.project, args.trailer, args.dry_run)
    f = report["facts"]
    print(f"{f['title']} ({f.get('year')}) dir. {f.get('director')} — {'public domain' if f['public_domain'] else 'under copyright'}")
    for it in report["items"]:
        print(f"  {it['rights']:<12} kit/{it['file']:<14} {it.get('status', 'dry-run')}")
    if not args.dry_run:
        print(f"project: {report['project']}  script: {report['script']}  report: footage-report.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
