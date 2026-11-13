"""Thumbnail mock-ups from a real photo: one figure, one short line, three layouts, and a sheet at phone size.

    python -m pipeline.thumbnail projects/<slug> --photo real/<file> --figure '−$400BN' --line 'in 2 days' --out DIR
    python -m pipeline.thumbnail projects/<slug> --figure '£50,000' --line 'still a good salary?' --out DIR

With a photo it writes three 1280x720 PNGs into DIR (layouts `photo`, `band` and `split`, drawn by remotion/thumb);
with none it writes one (`figure`: no real picture yet). Every run adds its tiles to DIR/thumbs.json and redraws
DIR/sheet-320.png, where every tile is 320 px wide: the size a phone shows a thumbnail at. Jeffrey judges there.

The rules live here, in the prop builder, so no layout can break them:
- at most two pieces of text: the figure, and one line of four words or fewer;
- red only for a loss: a figure or a line that starts with a minus;
- a real photo only: a file in the project's real/ folder with a licence in real/sources.json, or a media/ crop
  that names its real/ source with --credit-from. The credit line is printed for the description;
- nothing in the bottom-right corner, where YouTube prints the video's length: each layout is rendered with and
  without its text, and a single differing pixel in that corner fails the run.

The renderer is bundled once into DIR/.work (a temporary public folder holds only a link to remotion/public/fonts)
and the photo travels inside the props, scaled to 1,600 px wide, so the one bundle serves any photo. Nothing is
written into a project folder or into remotion/public unless --out says so. docs/thumbnails.md has the rest.
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
REMOTION = ROOT / "remotion"
THUMB = REMOTION / "thumb"
FONTS = REMOTION / "public" / "fonts"

W, H = 1280, 720
TILE_W = 320  # a phone shows a thumbnail about this wide
PHOTO_W = 1600  # the photo is scaled to this width before it goes into the props
MAX_BYTES = 2_000_000  # YouTube refuses a thumbnail over 2 MB
CORNER_W, CORNER_H = 0.22, 0.18  # the share of the frame YouTube's duration badge can cover (as in thumb/brand.ts)
LAYOUTS = ("photo", "band", "split")
MINUS = "-−–"  # a hyphen, the real minus sign, an en dash: any of them in front of a figure means a loss
MAX_LINE_WORDS = 4
NOTES = {"split": "white ground, like the one he rejected", "figure": "no real picture yet"}


class Refused(ValueError):
    """the thumbnail breaks a rule; the message says which"""


# ---------------------------------------------------------------- the rules

def is_loss(text: str) -> bool:
    """Red is only ever a loss: text that starts with a minus."""
    return text.strip()[:1] in tuple(MINUS)


def check_text(figure: str, line: str = "") -> tuple[str, str]:
    """The figure and the one optional line, or Refused. There is no way to pass a third piece of text."""
    figure, line = (figure or "").strip(), (line or "").strip()
    if not figure:
        raise Refused("a thumbnail needs a figure (--figure)")
    if "\n" in figure or "\n" in line:
        raise Refused("the figure and the line are one line each: a line break would make a third piece of text")
    words = len(line.split())
    if words > MAX_LINE_WORDS:
        raise Refused(f"the second line is {words} words; {MAX_LINE_WORDS} is the most that reads at phone size")
    return figure, line


def build_props(layout: str, figure: str, line: str = "", photo: dict | None = None, focus: tuple[float, float] = (0.5, 0.4), hide_text: bool = False, zoom: float = 1.0) -> dict:
    """The props of one thumbnail (ThumbProps in remotion/thumb/Thumb.tsx). `photo` is what embed_photo returns.
    The tones are decided here and nowhere else: 'loss' (red) only when the text starts with a minus."""
    figure, line = check_text(figure, line)
    if photo is None and layout != "figure":
        raise Refused(f"the '{layout}' layout needs a photo; with none the only layout is 'figure'")
    if photo is not None and layout not in LAYOUTS:
        raise Refused(f"no layout called '{layout}': with a photo it is one of {', '.join(LAYOUTS)}")
    fx, fy = (min(1.0, max(0.0, float(v))) for v in focus)
    return {
        "layout": layout,
        "figure": figure,
        "line": line,
        "figureTone": "loss" if is_loss(figure) else "plain",
        "lineTone": "loss" if line and is_loss(line) else "plain",
        "photo": photo["data"] if photo else "",
        "photoW": photo["w"] if photo else 0,
        "photoH": photo["h"] if photo else 0,
        "focus": [fx, fy],
        "zoom": min(3.0, max(1.0, float(zoom))),
        "hideText": bool(hide_text),
    }


def text_elements(props: dict) -> list[str]:
    """Every piece of text a thumbnail shows: never more than two."""
    return [t for t in (props.get("figure"), props.get("line")) if t]


def credit_line(entry: dict) -> str:
    """The credit for the description, in the words credits.txt uses. A captured page is credited by its outlet."""
    host = urlparse(entry.get("page") or entry.get("url") or "").netloc.removeprefix("www.")
    if not entry.get("licence"):
        return host
    via = "via Wikimedia Commons" if host.endswith("wikimedia.org") else host
    return "Photo: " + ", ".join(p for p in (entry.get("author"), entry["licence"], via) if p)


def photo_source(project: Path, photo: str | Path, credit_from: str | None = None) -> dict:
    """Where the picture came from, or Refused. Only real material is allowed: a file in the project's real/ folder
    with a licence in real/sources.json, or a media/ crop that names its real/ source (--credit-from). A crop of a
    captured page is credited to the page's outlet; a photo always needs its licence."""
    project = Path(project).resolve()
    path = Path(photo)
    if not path.is_absolute() and not path.is_file():
        path = project / path
    if not path.is_file():
        raise Refused(f"no such photo: {photo}")
    path = path.resolve()
    real, media = project / "real", project / "media"
    try:
        sources = json.loads((real / "sources.json").read_text())
    except (OSError, ValueError):
        sources = {}
    if real in path.parents:
        entry = sources.get(path.name) or {}
        if not entry.get("licence"):
            raise Refused(f"{path.name} has no licence in real/sources.json: only a photo with a recorded licence goes on a thumbnail")
        source = path.name
    elif media in path.parents:
        if not credit_from:
            raise Refused(f"{path.name} is a media/ crop: name the real/ file it was cut from with --credit-from")
        source = Path(credit_from).name
        entry = sources.get(source) or {}
        if not (real / source).is_file() or not (entry.get("licence") or entry.get("url")):
            raise Refused(f"--credit-from {credit_from}: no such file in real/ with an entry in real/sources.json")
    else:
        raise Refused(f"{path.name} is not in {project.name}/real/ (or a media/ crop of a real/ file): only real material goes on a thumbnail")
    return {"path": path, "name": path.name, "source": source, "licence": entry.get("licence") or "", "credit": credit_line(entry), "kind": "photo" if entry.get("licence") else "page"}


# ---------------------------------------------------------------- the picture, the bundle, the render

def embed_photo(path: Path) -> dict:
    """The photo as a data: URL, scaled to PHOTO_W wide (never enlarged), so it travels inside the props."""
    from PIL import Image, ImageOps

    im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    if im.width > PHOTO_W:
        im = im.resize((PHOTO_W, round(im.height * PHOTO_W / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=90)
    return {"data": "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii"), "w": im.width, "h": im.height}


def _clear(folder: Path) -> None:
    """Remove a work folder. A link inside it (the fonts) is unlinked, never followed: rmtree does not follow links."""
    if folder.is_symlink():
        folder.unlink()
    elif folder.exists():
        shutil.rmtree(folder)


def make_public(work: Path) -> Path:
    """A temporary public folder holding only a link to remotion/public/fonts: the bundle carries the faces and
    nothing else, and nothing is ever written into remotion/public."""
    public = Path(work) / "public"
    _clear(public)
    public.mkdir(parents=True)
    try:
        (public / "fonts").symlink_to(FONTS, target_is_directory=True)
    except OSError:  # a filesystem with no links: copy the faces
        shutil.copytree(FONTS, public / "fonts")
    return public


def _node(*args: str) -> None:
    subprocess.run(["node", str(THUMB / "render.mjs"), *args], cwd=REMOTION, check=True)


def bundle(work: Path) -> Path:
    """The thumbnail entry, bundled once. It is rebuilt only when a file in remotion/thumb is newer. The bundler
    keeps the public folder's link as a link, so the bundle reads the faces straight from remotion/public/fonts."""
    out, stamp = Path(work) / "bundle", Path(work) / "bundle" / ".built"
    newest = max(p.stat().st_mtime for p in THUMB.iterdir() if p.suffix in (".ts", ".tsx", ".mjs", ".json"))
    if stamp.exists() and (out / "index.html").exists() and stamp.stat().st_mtime >= newest:
        return out
    _clear(out)  # the bundler will not write over an old bundle's link to the fonts
    public = make_public(work)
    _node("bundle", str(public), str(out))
    _clear(public)
    if not any((out / "public" / "fonts").glob("*.woff2")):
        raise RuntimeError(f"the bundle at {out} holds no fonts")
    stamp.write_text(time.strftime("%Y-%m-%d %H:%M:%S"))
    return out


def render(bundle_dir: Path, jobs: list[tuple[dict, Path]], work: Path) -> None:
    """Render each (props, out.png) with one browser."""
    tmp = Path(work) / "props"
    tmp.mkdir(parents=True, exist_ok=True)
    listed = []
    for i, (props, out) in enumerate(jobs):
        f = tmp / f"{i}.json"
        f.write_text(json.dumps(props, ensure_ascii=False))
        listed.append({"props": str(f), "out": str(out)})
    (tmp / "jobs.json").write_text(json.dumps(listed))
    try:
        _node("render", str(bundle_dir), str(tmp / "jobs.json"))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)  # each props file carries the photo


# ---------------------------------------------------------------- the checks on a rendered thumbnail

def _text_mask(with_text: Path, without_text: Path):
    """True where the still with its text differs from the still without it."""
    import numpy as np
    from PIL import Image

    a = np.asarray(Image.open(with_text).convert("RGB"), dtype=np.int16)
    b = np.asarray(Image.open(without_text).convert("RGB"), dtype=np.int16)
    if a.shape != b.shape:
        raise RuntimeError(f"{with_text} and {without_text} are different sizes")
    return (np.abs(a - b) > 8).any(axis=2)


def corner_text_pixels(with_text: Path, without_text: Path) -> int:
    """How many text pixels fall in the bottom-right corner, where YouTube prints the video's length. Must be 0."""
    mask = _text_mask(with_text, without_text)
    h, w = mask.shape
    return int(mask[round(h * (1 - CORNER_H)):, round(w * (1 - CORNER_W)):].sum())


def text_box(with_text: Path, without_text: Path) -> list[int] | None:
    """The box round every text pixel (left, top, right, bottom), or None when the two stills are the same."""
    import numpy as np

    mask = _text_mask(with_text, without_text)
    ys, xs = np.where(mask)
    return [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1] if len(xs) else None


def shrink(src: Path, dst: Path, limit: int = MAX_BYTES) -> str:
    """Save `src` as a PNG under `limit` bytes and say what it took. A photo at 1280x720 can pass 2 MB as rendered:
    it is repacked first, then its colours are thinned a step at a time until it fits."""
    from PIL import Image, ImageOps

    src, dst = Path(src), Path(dst)
    if src.stat().st_size < limit:
        if src != dst:
            shutil.copyfile(src, dst)
        return "as rendered"
    im = Image.open(src).convert("RGB")
    steps = [("repacked", lambda: im), ("6 bits a colour", lambda: ImageOps.posterize(im, 6)), ("5 bits a colour", lambda: ImageOps.posterize(im, 5)),
             ("256 colours", lambda: im.quantize(256, dither=Image.Dither.FLOYDSTEINBERG))]
    for name, make in steps:
        buf = io.BytesIO()
        make().save(buf, "PNG", optimize=True)
        if buf.tell() < limit:
            dst.write_bytes(buf.getvalue())
            return name
    raise RuntimeError(f"{src.name} will not go under {limit} bytes")


# ---------------------------------------------------------------- the record and the sheet

def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "set"


def record(out: Path, tiles: list[dict]) -> list[dict]:
    """Add this run's tiles to DIR/thumbs.json (a tile of the same name is replaced) and return them all."""
    path = Path(out) / "thumbs.json"
    try:
        old = json.loads(path.read_text())
    except (OSError, ValueError):
        old = []
    names = {t["file"] for t in tiles}
    every = [t for t in old if t["file"] not in names and (Path(out) / t["file"]).is_file()] + tiles
    path.write_text(json.dumps(every, indent=1, ensure_ascii=False) + "\n")
    return every


def tile_image(png: Path):
    """A thumbnail at the size a phone shows it: TILE_W wide."""
    from PIL import Image

    im = Image.open(png).convert("RGB")
    return im.resize((TILE_W, round(im.height * TILE_W / im.width)), Image.LANCZOS)


def _face(size: int):
    from PIL import ImageFont

    try:
        return ImageFont.truetype(str(FONTS / "inter-latin-600-normal.woff2"), size)
    except OSError:
        return ImageFont.load_default(size=size)


def sheet(out: Path, tiles: list[dict], cols: int = 3) -> Path:
    """DIR/sheet-320.png: every thumbnail in DIR at 320 px wide, one headed block per project and set of words."""
    from PIL import Image, ImageDraw

    out = Path(out)
    groups: dict[tuple[str, str], list[dict]] = {}
    for t in tiles:
        groups.setdefault((t["project"], t["label"]), []).append(t)
    gap, th, cap, head, top = 16, round(TILE_W * H / W), 44, 46, 64
    rows = sum((len(g) + cols - 1) // cols for g in groups.values())
    width = cols * TILE_W + (cols + 1) * gap
    height = top + len(groups) * head + rows * (th + cap) + gap
    im = Image.new("RGB", (width, height), (24, 24, 24))
    d = ImageDraw.Draw(im)
    d.text((gap, 14), f"Thumbnail mock-ups at phone size: every tile is {TILE_W} px wide", font=_face(17), fill=(255, 255, 255))
    d.text((gap, 38), "Judge by eye at this size. Real photos only. Nothing sits where YouTube prints the length.", font=_face(12), fill=(170, 170, 170))
    y = top
    for (project, label), group in groups.items():
        d.rectangle([0, y + 6, width, y + head - 8], fill=(44, 44, 48))
        d.text((gap, y + 13), f"{project}   ·   {label}", font=_face(15), fill=(255, 255, 255))
        y += head
        for i, t in enumerate(group):
            x = gap + (i % cols) * (TILE_W + gap)
            ty = y + (i // cols) * (th + cap)
            im.paste(tile_image(out / t["file"]), (x, ty))
            d.text((x, ty + th + 5), "  ·  ".join(p for p in (t["layout"], t.get("photo") or "") if p), font=_face(13), fill=(235, 235, 235))
            if t.get("note"):
                d.text((x, ty + th + 23), t["note"], font=_face(12), fill=(255, 196, 92))
        y += ((len(group) + cols - 1) // cols) * (th + cap)
    path = out / "sheet-320.png"
    im.save(path)
    return path


# ---------------------------------------------------------------- the command

def _argv(argv: list[str]) -> list[str]:
    """`--figure -$400BN` typed with a plain hyphen would read as a flag: hand it over as --figure=-$400BN."""
    out, i = [], 0
    while i < len(argv):
        if argv[i] in ("--figure", "--line") and i + 1 < len(argv):
            out.append(f"{argv[i]}={argv[i + 1]}")
            i += 2
        else:
            out.append(argv[i])
            i += 1
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m pipeline.thumbnail", description="Thumbnail mock-ups from a real photo, and a sheet at phone size.")
    ap.add_argument("project", help="the project folder, e.g. projects/nvidia-400-billion")
    ap.add_argument("--photo", help="a file in the project's real/ folder (or a media/ crop, with --credit-from); leave out for a figure-only mock-up")
    ap.add_argument("--figure", required=True, help="the one figure, e.g. '−$400BN'")
    ap.add_argument("--line", default="", help=f"one more line, {MAX_LINE_WORDS} words or fewer")
    ap.add_argument("--out", required=True, help="the folder the PNGs, thumbs.json and sheet-320.png go in")
    ap.add_argument("--credit-from", help="for a media/ crop: the real/ file it was cut from")
    ap.add_argument("--focus", default="0.5,0.4", help="where the subject is in the photo, x,y from the top left, 0 to 1 (default 0.5,0.4)")
    ap.add_argument("--zoom", type=float, default=1.0, help="pull in on the subject: 1 is the whole photo's width or height (default), 1.3 is 30%% closer")
    ap.add_argument("--label", help="the heading of this set on the sheet (default: the figure and the line)")
    ap.add_argument("--layouts", default=",".join(LAYOUTS), help=f"with a photo, which of {','.join(LAYOUTS)} to make (default all)")
    ap.add_argument("--work", help="where the bundle is kept between runs (default: <out>/.work)")
    args = ap.parse_args(_argv(list(sys.argv[1:] if argv is None else argv)))

    try:
        project = Path(args.project) if Path(args.project).is_dir() else ROOT / args.project
        if not project.is_dir():
            raise Refused(f"no such project: {args.project}")
        project = project.resolve()
        figure, line = check_text(args.figure, args.line)
        src = photo_source(project, args.photo, args.credit_from) if args.photo else None
        layouts = [x.strip() for x in args.layouts.split(",") if x.strip()] if src else ["figure"]
        try:
            focus = tuple(float(v) for v in args.focus.split(","))
            assert len(focus) == 2
        except (ValueError, AssertionError):
            raise Refused(f"--focus is two numbers from 0 to 1, e.g. 0.5,0.3 (got {args.focus})")
        photo = embed_photo(src["path"]) if src else None
        # every rule is checked before the browser starts
        props = {layout: (build_props(layout, figure, line, photo, focus, zoom=args.zoom), build_props(layout, figure, line, photo, focus, hide_text=True, zoom=args.zoom)) for layout in layouts}
    except Refused as e:
        print(f"refused: {e}", file=sys.stderr)
        return 2

    out = Path(args.out).resolve()
    work = Path(args.work).resolve() if args.work else out / ".work"
    raw = work / "raw"
    raw.mkdir(parents=True, exist_ok=True)
    label = args.label or (f"{figure} / {line}" if line else figure)
    stem = "-".join(x for x in (project.name, slug(label), Path(src["name"]).stem if src else "") if x)

    t0 = time.time()
    bundle_dir = bundle(work)
    t1 = time.time()
    jobs = []
    for layout, (shown, hidden) in props.items():
        jobs += [(shown, raw / f"{stem}-{layout}.png"), (hidden, raw / f"{stem}-{layout}-notext.png")]
    render(bundle_dir, jobs, work)
    print(f"bundle {t1 - t0:.0f}s, {len(layouts)} thumbnail(s) rendered in {time.time() - t1:.0f}s")

    from PIL import Image

    tiles, failed = [], 0
    for layout in layouts:
        shown, hidden = raw / f"{stem}-{layout}.png", raw / f"{stem}-{layout}-notext.png"
        size = Image.open(shown).size
        corner = corner_text_pixels(shown, hidden)
        box = text_box(shown, hidden)
        if size != (W, H) or corner or box is None:
            failed += 1
            why = f"it is {size[0]}x{size[1]}, not {W}x{H}" if size != (W, H) else f"{corner} text pixels are in the bottom-right corner, where YouTube prints the length" if corner else "it shows no text"
            print(f"FAILED {stem}-{layout}: {why}", file=sys.stderr)
            continue
        name = f"{stem}-{layout}.png"
        how = shrink(shown, out / name)
        tiles.append({"file": name, "project": project.name, "label": label, "layout": layout, "photo": src["name"] if src else "", "credit": src["credit"] if src else "",
                      "licence": src["licence"] if src else "", "note": NOTES.get(layout, ""), "bytes": (out / name).stat().st_size, "saved": how, "text_box": box, "corner_text_pixels": corner})
        print(f"  {name}  {W}x{H}  {(out / name).stat().st_size / 1e6:.2f} MB ({how})  text at {box}, none in the corner")
    shutil.rmtree(raw, ignore_errors=True)
    if tiles:
        every = record(out, tiles)
        print(f"sheet: {sheet(out, every)}  ({len(every)} tiles, each {TILE_W} px wide)")
    if src:
        print(f"credit for the description: {src['credit']}")
        if src["source"] != src["name"]:
            print(f"  ({src['name']} is a crop of real/{src['source']})")
    else:
        print("no real picture yet: this is a figure-only mock-up")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
