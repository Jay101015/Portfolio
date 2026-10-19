"""Find free-use footage for a script and write it into the project.

    python -m pipeline.find_footage projects/<name> [--dry-run] [--providers archive,commons,pexels]

For every [clip], [still] or [image] scene whose file is not in media/, the
finder builds a query (search=, else the caption, else the film title) and asks:

  1. Internet Archive   the film itself, only when the header says `rights: public-domain`,
                        or any public-domain / CC item matching the query
  2. Wikimedia Commons  CC0, public-domain, CC BY and CC BY-SA video and images
  3. Pexels             stock b-roll under the Pexels licence (needs PEXELS_API_KEY)

The first usable hit is downloaded into media/, the scene's src= and credit= are
written back into script.md (the fallback= still is kept), and
footage-report.md lists every scene with what was found, its licence, the
attribution line, and what could not be found. Nothing is fetched from
sources whose terms do not allow reuse: trailers and studio clips are never
"free use" and are left for you to decide on.

Set `licenses:` in the script header to narrow what counts as usable
(default: pd, cc0, cc-by, cc-by-sa, pexels).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable

from .script_parser import parse_script

UA = "reel-takes-pipeline/1.0 (+https://github.com/)"
DEFAULT_LICENSES = {"pd", "cc0", "cc-by", "cc-by-sa", "pexels"}
STOP = set("the a an and or of in on at to for with from by is it its this that these those as be was were are has have had not no but so into over under about after before while than then there here very just only also".split())


@dataclass
class Hit:
    provider: str
    title: str
    url: str  # download url
    kind: str  # "video" | "image"
    license: str  # normalised key: pd, cc0, cc-by, cc-by-sa, pexels
    license_name: str
    author: str
    page: str  # where it came from, for the report
    ext: str


# ----------------------------------------------------------------------------- http (swappable for tests)

def _get_json(url: str, headers: dict[str, str] | None = None) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def _download(url: str, dst: str, headers: dict[str, str] | None = None) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=300) as r, open(dst, "wb") as out:
        shutil.copyfileobj(r, out)


# ----------------------------------------------------------------------------- licence normalisation

def normalise_license(text: str) -> str | None:
    """Map licence names and URLs to a key; None means not usable for a monetised channel."""
    t = (text or "").lower()
    if re.search(r"by[- ]?nc|noncommercial|non-commercial|by[- ]?nd\b|noderiv", t):
        return None
    if "cc0" in t or "cc-zero" in t or "/publicdomain/zero" in t:
        return "cc0"
    if "public domain" in t or "publicdomain" in t or t.strip() in ("pd", "pdm") or re.search(r"\bpd-", t):
        return "pd"
    if re.search(r"by[- ]sa\b|sharealike|share-alike|/licenses/by-sa/", t):
        return "cc-by-sa"
    if re.search(r"\bcc[- ]by\b|attribution|/licenses/by/", t):
        return "cc-by"
    if "pexels" in t:
        return "pexels"
    return None


def attribution(h: Hit) -> str:
    if h.provider == "pexels":
        return f"{h.title} by {h.author} via Pexels"
    lic = h.license_name or h.license.upper()
    who = f" by {h.author}" if h.author else ""
    return f"{h.title}{who}, {lic}, via {'Wikimedia Commons' if h.provider == 'commons' else 'Internet Archive'}"


# ----------------------------------------------------------------------------- providers

def search_archive(query: str, want: str, get: Callable = _get_json, film: bool = False) -> list[Hit]:
    """Internet Archive advanced search. film=True looks for the feature itself (public-domain collections)."""
    q = f'title:("{query}") AND mediatype:movies' if film else f'({query}) AND mediatype:movies'
    if film:
        q += " AND (collection:feature_films OR collection:moviesandfilms OR collection:prelinger OR collection:opensource_movies)"
    url = "https://archive.org/advancedsearch.php?" + urllib.parse.urlencode({
        "q": q, "fl[]": ["identifier", "title", "licenseurl", "rights", "creator"], "rows": 10, "output": "json", "sort[]": "downloads desc",
    }, doseq=True)
    docs = get(url).get("response", {}).get("docs", [])
    hits: list[Hit] = []
    for d in docs:
        lic_text = " ".join(str(d.get(k, "")) for k in ("licenseurl", "rights"))
        lic = normalise_license(lic_text) or ("pd" if film else None)  # feature_films items are public-domain prints
        if not lic:
            continue
        ident = d["identifier"]
        meta = get(f"https://archive.org/metadata/{ident}")
        files = meta.get("files", [])
        mp4 = [f for f in files if str(f.get("name", "")).lower().endswith(".mp4")]
        mp4.sort(key=lambda f: int(f.get("size", 0) or 0))
        if not mp4:
            continue
        f = mp4[len(mp4) // 2] if film else mp4[0]  # a mid-size derivative for a film, smallest for b-roll
        hits.append(Hit("archive", str(d.get("title", ident)), f"https://archive.org/download/{ident}/{urllib.parse.quote(f['name'])}", "video", lic,
                        "Public domain" if lic == "pd" else lic.upper(), str(d.get("creator", "") or ""), f"https://archive.org/details/{ident}", "mp4"))
        if hits:
            break
    return hits


def search_commons(query: str, want: str, get: Callable = _get_json) -> list[Hit]:
    """Wikimedia Commons: CC0 / PD / CC BY / CC BY-SA video first, then images."""
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
        "action": "query", "format": "json", "generator": "search", "gsrsearch": query + (" filetype:video" if want == "video" else ""),
        "gsrnamespace": 6, "gsrlimit": 15, "prop": "imageinfo", "iiprop": "url|extmetadata|mime", "iiurlwidth": 1920,
    })
    pages = get(url).get("query", {}).get("pages", {})
    hits: list[Hit] = []
    for p in pages.values():
        info = (p.get("imageinfo") or [{}])[0]
        meta = info.get("extmetadata", {})
        lic_text = " ".join(str(meta.get(k, {}).get("value", "")) for k in ("LicenseShortName", "License", "UsageTerms"))
        lic = normalise_license(lic_text)
        if not lic:
            continue
        mime = str(info.get("mime", ""))
        kind = "video" if mime.startswith("video/") else "image" if mime.startswith("image/") else None
        if not kind or (want == "video" and kind != "video" and len(hits) == 0 and False):
            continue
        author = re.sub(r"<[^>]+>", "", str(meta.get("Artist", {}).get("value", ""))).strip()
        dl = info.get("url") if kind == "video" else info.get("thumburl") or info.get("url")
        ext = "webm" if kind == "video" and mime.endswith("webm") else "mp4" if kind == "video" else ("png" if "png" in mime else "jpg")
        title = str(p.get("title", "")).replace("File:", "")
        hits.append(Hit("commons", title, dl, kind, lic, str(meta.get("LicenseShortName", {}).get("value", lic.upper())), author, info.get("descriptionurl", ""), ext))
    hits.sort(key=lambda h: (h.kind != want, {"cc0": 0, "pd": 0, "cc-by": 1, "cc-by-sa": 2}.get(h.license, 3)))
    return hits


def search_pexels(query: str, want: str, get: Callable = _get_json) -> list[Hit]:
    key = os.environ.get("PEXELS_API_KEY")
    if not key:
        return []
    if want == "video":
        url = "https://api.pexels.com/videos/search?" + urllib.parse.urlencode({"query": query, "orientation": "landscape", "per_page": 5})
        data = get(url, {"Authorization": key})
        hits = []
        for v in data.get("videos", []):
            files = [f for f in v.get("video_files", []) if str(f.get("file_type", "")).endswith("mp4") and (f.get("width") or 0) >= 1280]
            files.sort(key=lambda f: f.get("width") or 0)
            if not files:
                continue
            f = files[0]
            hits.append(Hit("pexels", f"Video {v['id']}", f["link"], "video", "pexels", "Pexels licence", v.get("user", {}).get("name", ""), v.get("url", ""), "mp4"))
        return hits
    url = "https://api.pexels.com/v1/search?" + urllib.parse.urlencode({"query": query, "orientation": "landscape", "per_page": 5})
    data = get(url, {"Authorization": key})
    return [Hit("pexels", f"Photo {p['id']}", p["src"]["large2x"], "image", "pexels", "Pexels licence", p.get("photographer", ""), p.get("url", ""), "jpg") for p in data.get("photos", [])]


PROVIDERS = {"archive": search_archive, "commons": search_commons, "pexels": search_pexels}


# ----------------------------------------------------------------------------- queries

def keywords(text: str, n: int = 4) -> str:
    words = [w.strip(".,;:!?\"'()").lower() for w in text.split()]
    words = [w for w in words if len(w) > 3 and w not in STOP and not w.startswith("{")]
    seen: list[str] = []
    for w in words:
        if w not in seen:
            seen.append(w)
    return " ".join(seen[:n])


def query_for(scene: dict[str, Any], film: str | None) -> str:
    p = scene["props"]
    if p.get("search"):
        return str(p["search"])
    if p.get("caption"):
        return str(p["caption"])
    return keywords(scene["narration"]) or (film or "film")


# ----------------------------------------------------------------------------- main

def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40] or "clip"


def find(project: str, providers: list[str], dry_run: bool = False, get: Callable = _get_json, download: Callable = _download) -> dict[str, Any]:
    script_path = os.path.join(project, "script.md")
    with open(script_path, encoding="utf-8") as f:
        md = f.read()
    sb = parse_script(md)
    header = {}
    for line in md.splitlines():
        m = re.match(r"^([\w.]+):\s*(.+)$", line)
        if m:
            header[m.group(1).lower()] = m.group(2).strip()
        if line.startswith("["):
            break
    film = header.get("film")
    pd_film = header.get("rights", "").lower() in ("public-domain", "public domain", "pd")
    allowed = set(x.strip() for x in header.get("licenses", ",".join(sorted(DEFAULT_LICENSES))).split(","))
    media = os.path.join(project, "media")
    os.makedirs(media, exist_ok=True)
    if not dry_run:
        from .build import fetch_sources

        fetch_sources(project)  # footage you already pointed at (a trailer, your own link) wins over a search

    report: dict[str, Any] = {"film": film, "public_domain_film": pd_film, "scenes": []}
    new_md = md
    for sc in sb["scenes"]:
        if sc["type"] not in ("clip", "still", "image"):
            continue
        p = sc["props"]
        src = p.get("src")
        if src and os.path.exists(os.path.join(media, src)):
            report["scenes"].append({"id": sc["id"], "status": "present", "src": src})
            continue
        want = "video" if sc["type"] == "clip" else "image"
        q = query_for(sc, film)
        entry: dict[str, Any] = {"id": sc["id"], "type": sc["type"], "query": q, "status": "not found", "candidates": []}
        chosen: Hit | None = None
        for name in providers:
            try:
                if name == "archive" and pd_film and film:
                    hits = search_archive(film, want, get, film=True)
                else:
                    hits = PROVIDERS[name](q, want, get)
            except Exception as e:  # noqa: BLE001
                entry["candidates"].append({"provider": name, "error": str(e)})
                continue
            for h in hits:
                entry["candidates"].append({"provider": h.provider, "title": h.title, "license": h.license_name, "page": h.page, "kind": h.kind})
            usable = [h for h in hits if h.license in allowed and (h.kind == want or want == "image")]
            if usable:
                chosen = usable[0]
                break
        if not chosen:
            report["scenes"].append(entry)
            continue
        fname = f"{sc['id']:02d}-{slugify(q)}.{chosen.ext}"
        entry.update({"status": "dry-run" if dry_run else "downloaded", "src": fname, "credit": attribution(chosen), "license": chosen.license_name, "page": chosen.page})
        if not dry_run:
            try:
                download(chosen.url, os.path.join(media, fname), {"Authorization": os.environ.get("PEXELS_API_KEY", "")} if chosen.provider == "pexels" else None)
            except Exception as e:  # noqa: BLE001
                entry["status"] = f"download failed: {e}"
                report["scenes"].append(entry)
                continue
            # Replace the footage and its credit; drop a from= offset that was written for a different file.
            new_md = rewrite_tag(new_md, sc["id"], sb, {"src": fname, "credit": attribution(chosen)}, to_type="clip" if chosen.kind == "video" else "still", drop=("from",))
        report["scenes"].append(entry)

    if not dry_run and new_md != md:
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(new_md)
    write_report(project, report)
    return report


def rewrite_tag(md: str, scene_id: int, sb: dict[str, Any], updates: dict[str, str], to_type: str | None = None, drop: tuple[str, ...] = ()) -> str:
    """Replace attributes on the Nth scene tag line (1-based, counting tag lines in order)."""
    lines = md.splitlines(keepends=True)
    n = 0
    for i, line in enumerate(lines):
        m = re.match(r"^\[(\w+)([^\]]*)\]\s*$", line.strip())
        if not m:
            continue
        n += 1
        if n != scene_id:
            continue
        typ, rest = m.group(1), m.group(2)
        if to_type and typ in ("clip", "still", "image") and to_type != typ:
            typ = to_type
        for k in drop:
            rest = re.sub(rf'\s*\b{k}=(?:"[^"]*"|\S+)', "", rest)
        for k, v in updates.items():
            if re.search(rf'\b{k}=', rest):
                rest = re.sub(rf'\b{k}=(?:"[^"]*"|\S+)', f'{k}="{v}"', rest)
            else:
                rest = f'{rest} {k}="{v}"'
        lines[i] = f"[{typ}{rest}]\n"
        break
    return "".join(lines)


def write_report(project: str, report: dict[str, Any]) -> None:
    out = ["# Footage report", ""]
    if report.get("film"):
        out.append(f"Film: {report['film']}" + (" (declared public domain: the feature itself is searched on the Internet Archive)" if report["public_domain_film"] else " (under copyright: only thematic free-use b-roll is searched; trailer or studio clips are your call)"))
        out.append("")
    out.append("| scene | query | result | licence | attribution |")
    out.append("|---|---|---|---|---|")
    for s in report["scenes"]:
        if s["status"] == "present":
            out.append(f"| {s['id']} | | already in media/: {s['src']} | | |")
            continue
        out.append(f"| {s['id']} | {s.get('query','')} | {s['status']}{(' ' + s['src']) if s.get('src') else ''} | {s.get('license','')} | {s.get('credit','')} |")
    missing = [s for s in report["scenes"] if s["status"] == "not found"]
    if missing:
        out += ["", "## Not found", "", "These scenes keep their fallback= still (or show a placeholder). Add a search= hint with different words, or drop a file into media/ yourself:", ""]
        for s in missing:
            cands = ", ".join(f"{c.get('provider')}: {c.get('title', c.get('error', ''))} ({c.get('license', '')})" for c in s["candidates"][:4]) or "no candidates"
            out.append(f"- scene {s['id']} ({s.get('query')}): {cands}")
    out += ["", "## What counts as free use here", "", "Public domain and CC0 (no conditions), CC BY and CC BY-SA (attribution shown on screen, which the credit= tag does), and the Pexels licence. CC BY-NC and CC BY-ND are skipped: a monetised channel is commercial use, and a review is a derivative. Trailers and studio clips are never free use; using them is a fair-use judgement and a Content ID question, covered in docs/monetisation-plan.md."]
    with open(os.path.join(project, "footage-report.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("project")
    ap.add_argument("--providers", default="archive,commons,pexels")
    ap.add_argument("--dry-run", action="store_true", help="search and report, download nothing, leave the script alone")
    args = ap.parse_args(argv)
    report = find(os.path.abspath(args.project), [p.strip() for p in args.providers.split(",") if p.strip()], args.dry_run)
    found = sum(1 for s in report["scenes"] if s["status"] in ("downloaded", "dry-run"))
    print(f"{found} scene(s) matched, {sum(1 for s in report['scenes'] if s['status'] == 'not found')} not found; see footage-report.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
