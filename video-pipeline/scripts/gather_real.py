"""Real material for a news video, fetched on the render machine (the sandbox cannot reach these sites).

    python scripts/gather_real.py projects/<name>

Reads projects/<name>/real/wanted.json:
  {"pages": [{"name": "cnn", "url": "https://..."}],          real article pages, screenshotted as a reader sees them
   "commons": [{"name": "huang", "query": "Jensen Huang", "n": 12}]}   free-licence photos and video from Wikimedia Commons
Writes into projects/<name>/real/: <name>.png (top of the page, 1600 wide) and <name>-full.png; commons files with
their author and licence in sources.json; sheet.png, one labelled contact sheet to choose from by eye.
Only CC0, public domain, CC BY and CC BY-SA files are taken; each one's credit goes in the description.
"""
import json, os, re, subprocess, sys, urllib.parse, urllib.request

UA = {"User-Agent": "everyday-investor-video-pipeline/1.0 (news explainer research)"}
OK = re.compile(r"^(cc0|public domain|pd|cc by(-sa)?( \d\.\d)?)", re.I)


def get_json(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
        return json.load(r)


def commons(query, n):
    api = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
        "action": "query", "format": "json", "generator": "search", "gsrsearch": query + " filetype:bitmap|video", "gsrnamespace": 6, "gsrlimit": 40,
        "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata", "iiurlwidth": 1600})
    out = []
    for p in (get_json(api).get("query", {}).get("pages", {}) or {}).values():
        ii = (p.get("imageinfo") or [{}])[0]
        meta = ii.get("extmetadata") or {}
        lic = (meta.get("LicenseShortName") or {}).get("value", "")
        if not OK.match(lic.strip()) or (ii.get("width") or 0) < 1000:
            continue
        author = re.sub(r"<[^>]+>", "", (meta.get("Artist") or {}).get("value", "")).strip()[:120]
        out.append({"title": p["title"], "url": ii.get("thumburl") if ii.get("mime", "").startswith("image") else ii.get("url"), "page": ii.get("descriptionurl"),
                    "mime": ii.get("mime"), "licence": lic, "author": author, "date": re.sub(r"<[^>]+>", "", (meta.get("DateTimeOriginal") or {}).get("value", ""))[:40],
                    "w": ii.get("width"), "h": ii.get("height")})
    out.sort(key=lambda h: h["date"], reverse=True)
    return out[:n]


def main(project):
    real = os.path.join(project, "real")
    want = json.load(open(os.path.join(real, "wanted.json")))
    sources, tiles = {}, []
    for c in want.get("commons", []):
        try:
            hits = commons(c["query"], int(c.get("n", 10)))
        except Exception as e:  # noqa: BLE001
            print("commons failed:", c["query"], e); hits = []
        for i, h in enumerate(hits, 1):
            ext = ".jpg" if h["mime"] in ("image/jpeg", "image/png", "image/webp", "image/tiff") else os.path.splitext(urllib.parse.urlparse(h["url"]).path)[1] or ".bin"
            name = f"{c['name']}-{i:02d}{ext}"
            try:
                with urllib.request.urlopen(urllib.request.Request(h["url"], headers=UA), timeout=120) as r, open(os.path.join(real, name), "wb") as f:
                    f.write(r.read())
            except Exception as e:  # noqa: BLE001
                print("download failed:", h["title"], e); continue
            sources[name] = h
            if ext == ".jpg":
                tiles.append((name, f"{name}  {h['licence']}  {h['author'][:40]}  {h['date'][:10]}"))
            print("commons:", name, h["licence"], h["author"][:50], h["date"][:10])
    if want.get("pages"):
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            ctx = b.new_context(viewport={"width": 1600, "height": 900}, device_scale_factor=1.5, locale="en-GB",
                                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36")
            for p in want["pages"]:
                page = ctx.new_page()
                try:
                    page.goto(p["url"], wait_until="domcontentloaded", timeout=60000)
                    page.wait_for_timeout(4000)
                    for label in ("Accept all", "Accept All", "I Accept", "Agree", "Accept", "Reject all", "Continue"):  # cookie walls
                        try:
                            page.get_by_role("button", name=label, exact=False).first.click(timeout=1500); page.wait_for_timeout(800); break
                        except Exception:  # noqa: BLE001
                            pass
                    page.screenshot(path=os.path.join(real, p["name"] + ".png"))
                    page.screenshot(path=os.path.join(real, p["name"] + "-full.png"), full_page=True, clip=None)
                    title = page.title()
                    sources[p["name"] + ".png"] = {"url": p["url"], "title": title}
                    tiles.append((p["name"] + ".png", f"{p['name']}  {title[:70]}"))
                    print("page:", p["name"], "|", title[:90])
                except Exception as e:  # noqa: BLE001
                    print("page failed:", p["name"], str(e)[:160])
                page.close()
            b.close()
    json.dump(sources, open(os.path.join(real, "sources.json"), "w"), indent=1)
    if tiles:  # one sheet to choose from
        from PIL import Image, ImageDraw
        cols, tw, th = 4, 480, 300
        rows = (len(tiles) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * tw, rows * th), "white"); d = ImageDraw.Draw(sheet)
        for k, (name, label) in enumerate(tiles):
            try:
                im = Image.open(os.path.join(real, name)).convert("RGB"); im.thumbnail((tw - 8, th - 34))
                x, y = (k % cols) * tw + 4, (k // cols) * th + 4
                sheet.paste(im, (x, y)); d.text((x, y + th - 30), label[:78], fill="black")
            except Exception as e:  # noqa: BLE001
                print("sheet skip", name, e)
        sheet.save(os.path.join(real, "sheet.png"))
    print("done:", len(sources), "items")


if __name__ == "__main__":
    main(sys.argv[1])
