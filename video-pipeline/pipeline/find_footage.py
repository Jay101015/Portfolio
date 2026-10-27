"""Find free-use footage for a script and write it into the project.

    python -m pipeline.find_footage projects/<name> [--dry-run] [--providers archive,commons,pexels]

For every [clip], [still] or [image] scene whose file is not in media/, the
finder builds a query (search=, else the caption, else the topic or film title) and asks:

  1. Internet Archive   the film itself, only when the header says `rights: public-domain`,
                        or any public-domain / CC item matching the query
  2. Wikimedia Commons  CC0, public-domain, CC BY and CC BY-SA video and images
  3. Pexels             stock b-roll under the Pexels licence (needs PEXELS_API_KEY)
  4. Pixabay            stock b-roll under the Pixabay Content License (needs PIXABAY_API_KEY)

The first usable hit is downloaded into media/, the scene's src= and credit= are
written back into script.md (the fallback= still is kept), and
footage-report.md lists every scene with what was found, its licence, the
attribution line, and what could not be found. Nothing is fetched from
sources whose terms do not allow reuse: trailers and studio clips are never
"free use" and are left for you to decide on.

Set `licenses:` in the script header to narrow what counts as usable
(default: pd, cc0, cc-by, cc-by-sa, pexels, pixabay).
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
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable

from .script_parser import parse_script

UA = "reel-takes-pipeline/1.0 (+https://github.com/)"
DEFAULT_LICENSES = {"pd", "cc0", "cc-by", "cc-by-sa", "pexels", "pixabay"}
STOP = set("the a an and or of in on at to for with from by is it its this that these those as be was were are has have had not no but so into over under about after before while than then there here very just only also".split())


@dataclass
class Hit:
    provider: str
    title: str
    url: str  # download url
    kind: str  # "video" | "image"
    license: str  # normalised key: pd, cc0, cc-by, cc-by-sa, pexels, pixabay
    license_name: str
    author: str
    page: str  # where it came from, for the report
    ext: str
    thumb: str = ""  # a small preview image, for footage-candidates.png
    score: float = 0.0  # the finder's ranking, for the report


# ----------------------------------------------------------------------------- http (swappable for tests)

MAX_DOWNLOAD = 120 * 1024 * 1024  # a clip bigger than this is not b-roll; skip it rather than spend the run on it
DOWNLOAD_WALL = 240.0  # seconds a single download may take in all (the socket timeout only covers a stall)


def _get_json(url: str, headers: dict[str, str] | None = None) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        # Surface the server's own words (Pixabay says '[ERROR 400] "key" is invalid.'), never the key itself.
        body = ""
        try:
            body = e.read().decode("utf-8", "replace").strip()
        except Exception:
            pass
        body = re.sub(r"[0-9a-f]{20,}", "…", body)[:160]
        raise RuntimeError(f"HTTP {e.code} from {urllib.parse.urlsplit(url).netloc}: {body or e.reason}") from None


def _download(url: str, dst: str, headers: dict[str, str] | None = None) -> None:
    import time

    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    started = time.time()
    with urllib.request.urlopen(req, timeout=60) as r, open(dst, "wb") as out:
        length = int(r.headers.get("Content-Length") or 0)
        if length > MAX_DOWNLOAD:
            raise RuntimeError(f"file too big ({length // 1_000_000} MB)")
        got = 0
        for chunk in iter(lambda: r.read(1 << 20), b""):
            out.write(chunk)
            got += len(chunk)
            if got > MAX_DOWNLOAD:
                raise RuntimeError(f"file too big (over {MAX_DOWNLOAD // 1_000_000} MB)")
            if time.time() - started > DOWNLOAD_WALL:
                raise RuntimeError(f"download too slow (over {int(DOWNLOAD_WALL)}s)")
    print(f"  fetched {os.path.basename(dst)} ({os.path.getsize(dst) // 1_000_000} MB)", flush=True)


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
    if h.provider == "pixabay":
        return f"{h.title} by {h.author} via Pixabay"
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


def search_pixabay(query: str, want: str, get: Callable = _get_json) -> list[Hit]:
    """Pixabay: free stock video and photos under the Pixabay Content License (commercial use, no attribution
    required; we credit anyway). Needs PIXABAY_API_KEY, free at pixabay.com/api/docs."""
    key = os.environ.get("PIXABAY_API_KEY")
    if not key:
        return []
    if want == "video":
        url = "https://pixabay.com/api/videos/?" + urllib.parse.urlencode({"key": key, "q": query, "per_page": 20, "safesearch": "true", "video_type": "film"})  # real footage, no cartoons or 3D renders
        data = get(url)
        hits = []
        for v in relevant(data.get("hits", []), query):
            files = v.get("videos", {}) or {}
            f = files.get("medium") or files.get("large") or files.get("small")
            if not f or not f.get("url"):
                continue
            hit = Hit("pixabay", f"Video {v['id']}", f["url"], "video", "pixabay", "Pixabay Content License", str(v.get("user", "")), str(v.get("pageURL", "")), "mp4", thumb=str(f.get("thumbnail") or ""))
            hit.score = rank(v, query, int(f.get("width") or 0), int(f.get("height") or 0))
            hits.append(hit)
        # the best-ranked first: the words in common, then how many people have used it, then a landscape frame
        # and a length that fits a scene; the twentieth result is as welcome as the first if it scores better
        return sorted(hits, key=lambda h: -h.score)
    url = "https://pixabay.com/api/?" + urllib.parse.urlencode({"key": key, "q": query, "per_page": 20, "image_type": "photo", "safesearch": "true"})
    data = get(url)
    return [Hit("pixabay", f"Photo {p['id']}", p.get("largeImageURL") or p.get("webformatURL", ""), "image", "pixabay", "Pixabay Content License", str(p.get("user", "")), str(p.get("pageURL", "")), "jpg") for p in relevant(data.get("hits", []), query) if p.get("largeImageURL") or p.get("webformatURL")]


def _stem(w: str) -> str:
    w = w.lower().strip(".,;:!?\"'()")
    for end in ("ing", "es", "s"):
        if len(w) > len(end) + 2 and w.endswith(end):
            return w[: -len(end)]
    return w


def rank(v: dict[str, Any], query: str, width: int = 0, height: int = 0) -> float:
    """A stock clip's score: three points a word its tags share with the search, up to three for how often it has
    been used (a clip thousands of people chose is rarely an owl), two for a landscape frame, one for a length that
    fits a scene (6 to 40 seconds). The library's own order counts for nothing."""
    import math

    words = {_stem(w) for w in query.split() if len(w) > 2 and w.lower() not in STOP}
    have = {_stem(w) for t in str(v.get("tags", "") or "").split(",") for w in t.split()}
    n = len(words & have)
    if not n:  # nothing in common with the search: it sits below every clip that has something, however popular
        return round(math.log10(1 + float(v.get("downloads") or v.get("views") or 0)) / 20, 2)
    score = 3.0 * n
    score += min(3.0, math.log10(1 + float(v.get("downloads") or v.get("views") or 0)) / 2)
    if width and height and width >= height:
        score += 2.0
    dur = float(v.get("duration") or 0)
    if 6 <= dur <= 40:
        score += 1.0
    return round(score, 2)


def relevant(hits: list[dict[str, Any]], query: str) -> list[dict[str, Any]]:
    """Pixabay matches loosely, so its top hit can be an owl for 'paying bills online laptop'. Keep only hits whose
    tags share a word with the query, most shared words first; a hit without tags keeps its place at the back."""
    words = {_stem(w) for w in query.split() if len(w) > 2 and w.lower() not in STOP}
    scored = []
    for i, h in enumerate(hits):
        tags = str(h.get("tags", "") or "")
        if not tags:
            scored.append((0, i, h))
            continue
        have = {_stem(w) for t in tags.split(",") for w in t.split()}
        n = len(words & have)
        if n:
            scored.append((n, i, h))
    scored.sort(key=lambda x: (-x[0], x[1]))
    return [h for _, _, h in scored]


PROVIDERS = {"archive": search_archive, "commons": search_commons, "pexels": search_pexels, "pixabay": search_pixabay}


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
    """The search query for a scene: its search= hint, else its caption, else the narration's keywords, else the topic."""
    p = scene["props"]
    if p.get("search"):
        return str(p["search"])
    if p.get("caption"):
        return str(p["caption"])
    return keywords(scene["narration"]) or (film or "b-roll")


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
    # `topic:` names what the video is about (a finance explainer); `film:` names a film being reviewed.
    topic = header.get("topic")
    film = header.get("film") or topic
    pd_film = bool(header.get("film")) and header.get("rights", "").lower() in ("public-domain", "public domain", "pd")
    allowed = set(x.strip() for x in header.get("licenses", ",".join(sorted(DEFAULT_LICENSES))).split(","))
    media = os.path.join(project, "media")
    os.makedirs(media, exist_ok=True)
    if not dry_run:
        from .build import fetch_sources

        fetch_sources(project)  # footage you already pointed at (a trailer, your own link) wins over a search

    report: dict[str, Any] = {"film": header.get("film"), "topic": topic, "public_domain_film": pd_film, "scenes": []}
    new_md = md
    # the same clip twice in one video looks cheap: skip any hit whose credit is already on another scene
    used = {str(sc["props"][k]) for sc in sb["scenes"] for k in ("credit", "clip_credit") if sc["props"].get(k)}
    for sc in sb["scenes"]:
        p = sc["props"]
        # b-roll in the picture column of any scene: clip="busy high street" asks for a stock clip beside the words
        if sc["type"] not in ("clip", "still", "image") and p.get("clip"):
            have = p.get("clip_src")
            if have and os.path.exists(os.path.join(media, str(have))):
                report["scenes"].append({"id": sc["id"], "status": "present", "src": have})
                continue
            q = str(p["clip"])
            entry = {"id": sc["id"], "type": "b-roll", "query": q, "status": "not found", "candidates": []}
            chosen = None
            # b-roll wants everyday stock footage: the stock libraries first, the archives (old films) last
            broll_order = [n for n in ("pixabay", "pexels", "commons", "archive") if n in providers]
            answers: list[str] = []  # what each library said, for the report
            usable: list[Hit] = []
            for name in broll_order:
                print(f"scene {sc['id']}: asking {name} for b-roll '{q}'", flush=True)
                if name == "pexels" and not os.environ.get("PEXELS_API_KEY"):
                    answers.append("pexels: no key")
                    continue
                if name == "pixabay" and not os.environ.get("PIXABAY_API_KEY"):
                    answers.append("pixabay: no key")
                    continue
                try:
                    hits = PROVIDERS[name](q, "video", get)
                except Exception as e:  # noqa: BLE001
                    entry["candidates"].append({"provider": name, "error": str(e)})
                    answers.append(f"{name}: error {str(e)[:140]}")
                    continue
                for h in hits:
                    entry["candidates"].append({"provider": h.provider, "title": h.title, "license": h.license_name, "page": h.page, "kind": h.kind})
                ok = [h for h in hits if h.license in allowed and h.kind == "video" and attribution(h) not in used]
                answers.append(f"{name}: {len(ok)} clip(s)")
                if ok:
                    usable = ok
                    break
            entry["answers"] = answers
            # the first hit that downloads: a refused file (too big, too slow) falls through to the next
            fname = f"{sc['id']:02d}-broll-{slugify(q)}"
            for h in usable[:3]:
                full = f"{fname}.{h.ext}"
                if dry_run:
                    entry.update({"status": "dry-run", "src": full, "credit": attribution(h), "license": h.license_name, "page": h.page})
                    break
                try:
                    download(h.url, os.path.join(media, full), {"Authorization": os.environ.get("PEXELS_API_KEY", "")} if h.provider == "pexels" else None)
                except Exception as e:  # noqa: BLE001
                    entry["status"] = f"download failed: {e}"
                    answers.append(f"{h.provider} {h.title}: {str(e)[:50]}")
                    continue
                entry.update({"status": "downloaded", "src": full, "credit": attribution(h), "license": h.license_name, "page": h.page})
                used.add(attribution(h))
                new_md = rewrite_tag(new_md, sc["id"], sb, {"clip_src": full, "clip_credit": attribution(h)})
                break
            report["scenes"].append(entry)
            continue
        if sc["type"] not in ("clip", "still", "image", "broll"):
            continue
        src = p.get("src")
        if src and os.path.exists(os.path.join(media, src)):
            report["scenes"].append({"id": sc["id"], "status": "present", "src": src})
            continue
        want = "video" if sc["type"] in ("clip", "broll") else "image"
        q = query_for(sc, film)
        entry: dict[str, Any] = {"id": sc["id"], "type": sc["type"], "query": q, "status": "not found", "candidates": []}
        chosen: Hit | None = None
        # a full-frame b-roll scene wants everyday stock footage: the stock libraries first, the archives last
        order = [n for n in ("pixabay", "pexels", "commons", "archive") if n in providers] if sc["type"] == "broll" else providers
        for name in order:
            print(f"scene {sc['id']}: asking {name} for '{q}'", flush=True)
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
            usable = [h for h in hits if h.license in allowed and (h.kind == want or want == "image") and attribution(h) not in used]
            if sc["type"] == "broll":
                usable = [h for h in usable if h.kind == "video"]  # the whole frame is the footage: a still will not do
            if usable:
                # pick=2 takes the second candidate (footage-candidates.png shows the first three)
                want_pick = max(1, int(p.get("pick") or 1))
                chosen = usable[min(want_pick, len(usable)) - 1]
                entry["top"] = [{"title": h.title, "page": h.page, "thumb": h.thumb, "credit": attribution(h), "score": h.score} for h in usable[:3]]
                entry["pick"] = min(want_pick, len(usable))
                break
        if not chosen:
            report["scenes"].append(entry)
            continue
        used.add(attribution(chosen))
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
            new_md = rewrite_tag(new_md, sc["id"], sb, {"src": fname, "credit": attribution(chosen)}, to_type=None if sc["type"] == "broll" else ("clip" if chosen.kind == "video" else "still"), drop=("from",))
        report["scenes"].append(entry)

    if not dry_run and new_md != md:
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(new_md)
    write_report(project, report)
    write_credits(project, parse_script(new_md))
    write_check_sheet(project, parse_script(new_md))
    if not dry_run:
        write_candidates_sheet(project, report, download)
    return report


def write_candidates_sheet(project: str, report: dict[str, Any], download: Callable = _download, out_name: str = "footage-candidates.png") -> str | None:
    """footage-candidates.png: for every footage scene the clip that was chosen and the two runners-up, as preview
    frames with their scores, so a wrong choice is fixed with `pick=2` on the scene rather than a new search."""
    rows = [s for s in report["scenes"] if s.get("top")]
    if not rows:
        return None
    tmp = os.path.join(project, ".cache", "footage-candidates")
    shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(tmp, exist_ok=True)
    font = next((f for f in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans.ttf") if os.path.exists(f)), None)
    fontopt = f"fontfile={font}:" if font else ""
    tiles: list[str] = []
    for r, s in enumerate(rows):
        for i in range(3):
            c = s["top"][i] if i < len(s["top"]) else None
            tile = os.path.join(tmp, f"t{r * 3 + i:03d}.png")
            label = f"scene {s['id']} pick={i + 1}" + (" (chosen)" if c and i + 1 == s.get("pick", 1) else "") + (f"  {c['title']}  score {c['score']}" if c else "  (no more candidates)")
            with open(os.path.join(tmp, f"l{r:02d}{i}.txt"), "w", encoding="utf-8") as f:
                f.write(label)
            src = None
            if c and c.get("thumb"):
                src = os.path.join(tmp, f"p{r:02d}{i}.jpg")
                try:
                    download(c["thumb"], src, None)
                except Exception:  # noqa: BLE001
                    src = None
            vf = f"scale=320:180:force_original_aspect_ratio=decrease,pad=320:210:(ow-iw)/2:0:white,drawtext={fontopt}textfile={os.path.join(tmp, f'l{r:02d}{i}.txt')}:fontsize=12:fontcolor=black:x=4:y=186"
            if src:
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-frames:v", "1", "-vf", vf, tile], check=False)
            if not os.path.exists(tile):
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0xdddddd:size=320x180", "-frames:v", "1", "-vf", vf, tile], check=False)
            tiles.append(tile)
    out = os.path.join(project, out_name)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", "1", "-i", os.path.join(tmp, "t%03d.png"), "-vf", f"tile=3x{len(rows)}:padding=4:color=white", "-frames:v", "1", out], check=False)
    return out if os.path.exists(out) else None


def write_check_sheet(project: str, sb: dict[str, Any], out_name: str = "footage-check.png") -> str | None:
    """footage-check.png: one frame from every piece of footage next to the words it plays under, so a clip that does
    not show the idea (a London Eye for "top up your emergency fund") is caught by eye before the video goes out.
    The courier looks at it before sending; a wrong clip is searched again first."""
    media = os.path.join(project, "media")
    tiles: list[tuple[int, str, str, str]] = []  # (scene id, file, caption, words)
    for sc in sb["scenes"]:
        p = sc["props"]
        src = p.get("src") if sc["type"] in ("broll", "clip", "still", "image") else p.get("clip_src")
        if not src or not os.path.exists(os.path.join(media, str(src))):
            continue
        cap = str(p.get("caption") or p.get("board") or p.get("clip") or p.get("search") or "")
        tiles.append((sc["id"], os.path.join(media, str(src)), cap, " ".join(sc["narration"].split())[:90]))
    if not tiles:
        return None
    tmp = os.path.join(project, ".cache", "footage-check")
    shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(tmp, exist_ok=True)
    font = next((f for f in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans.ttf") if os.path.exists(f)), None)
    fontopt = f"fontfile={font}:" if font else ""
    for i, (sid, path, cap, words) in enumerate(tiles):
        with open(os.path.join(tmp, f"t{i}.txt"), "w", encoding="utf-8") as f:
            f.write(f"scene {sid}: {cap}")
        with open(os.path.join(tmp, f"w{i}.txt"), "w", encoding="utf-8") as f:
            f.write(words)
        vf = (
            "scale=480:270:force_original_aspect_ratio=decrease,pad=480:330:(ow-iw)/2:0:white,"
            f"drawtext={fontopt}textfile={os.path.join(tmp, f't{i}.txt')}:fontsize=18:fontcolor=black:x=6:y=276,"
            f"drawtext={fontopt}textfile={os.path.join(tmp, f'w{i}.txt')}:fontsize=13:fontcolor=0x555555:x=6:y=302"
        )
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "1.5", "-i", path, "-frames:v", "1", "-vf", vf, os.path.join(tmp, f"f{i:02d}.png")], check=False)
    made = sorted(fn for fn in os.listdir(tmp) if fn.startswith("f") and fn.endswith(".png"))
    if not made:
        return None
    cols = 3
    rows = (len(made) + cols - 1) // cols
    out = os.path.join(project, out_name)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", "1", "-i", os.path.join(tmp, "f%02d.png"), "-vf", f"tile={cols}x{rows}:padding=6:color=white", "-frames:v", "1", out], check=False)
    return out if os.path.exists(out) else None


def write_credits(project: str, sb: dict[str, Any]) -> None:
    """credits.txt: every piece of footage in the video, one line each, ready to paste into the YouTube description.
    Credits are not drawn on the picture (a line in the corner reads as a watermark); Pixabay and Pexels ask for none,
    and a Creative Commons credit in the description is attribution in a reasonable manner."""
    lines: list[str] = []
    for sc in sb["scenes"]:
        for k in ("credit", "clip_credit"):
            c = str(sc["props"].get(k) or "").strip()
            if c and c not in lines:
                lines.append(c)
    with open(os.path.join(project, "credits.txt"), "w", encoding="utf-8") as f:
        f.write("Footage and images\n" + "".join(f"{c}\n" for c in lines) if lines else "No borrowed footage or images in this video.\n")


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
    elif report.get("topic"):
        out.append(f"Topic: {report['topic']} (free-use b-roll and illustrations only)")
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
    broll = [e for e in report["scenes"] if e.get("answers")]
    if broll:
        out += ["", "## What each library answered for the b-roll", ""]
        for e in broll:
            out.append(f"- scene {e['id']} ({e['query']}): " + "; ".join(e["answers"]))
    out += ["", "## What counts as free use here", "", "Public domain and CC0 (no conditions), CC BY and CC BY-SA (attribution in credits.txt, for the video description), and the Pexels licence. CC BY-NC and CC BY-ND are skipped: a monetised channel is commercial use. Trailers, studio clips, screenshots of paid apps and news footage are never free use; using them is a fair-use judgement and a Content ID question, covered in docs/monetisation-plan.md."]
    with open(os.path.join(project, "footage-report.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("project")
    ap.add_argument("--providers", default="archive,commons,pexels,pixabay")
    ap.add_argument("--dry-run", action="store_true", help="search and report, download nothing, leave the script alone")
    args = ap.parse_args(argv)
    report = find(os.path.abspath(args.project), [p.strip() for p in args.providers.split(",") if p.strip()], args.dry_run)
    found = sum(1 for s in report["scenes"] if s["status"] in ("downloaded", "dry-run"))
    print(f"{found} scene(s) matched, {sum(1 for s in report['scenes'] if s['status'] == 'not found')} not found; see footage-report.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
