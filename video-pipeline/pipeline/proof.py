"""The proof sheet: a long video and every Short as sheets of small stills, with measured checks, before any render.

    python -m pipeline.proof <project folder or storyboard.json> --bundle DIR --out DIR [--cuts DIR] [--scenes 14,19] [--upright] [--at-once N]

A render takes 25 minutes and a review round another ten; most of what the reviewers find is visible on one still:
a card over a headline, a bare first frame, a chart small in the top half, a page cropped mid-word. This draws the
stills straight from the storyboard, with one browser and one bundle of the renderer, under a second each, lays them
out as sheets and runs the measured checks of pipeline/gates.py over them. It writes only into --out:

    sheet-main.png        the long video (the Main composition, 16:9)
    sheet-<short>.png     one per Short's cut (the Vertical composition), tinted where YouTube draws over the frame
    sheet-upright.png     with --upright: the whole long video in the Vertical composition
    proof.md              tiles to check for balances first, then what the gates say tile by tile, then each
                          Short's first and last five words
    proof.json            the same for a program: every tile and every finding
    stills/               the stills themselves

Which frames (`frame_plan`): each scene 0.4 s after its start, at its midpoint when it runs over 8 s, 0.6 s before
its end, and 0.3 s after every mark and card cue; a scene drawn on paper also at 1, 3 and 5 s, which the near-empty
check reads; each Short also at frame 0, at 1.5 s and on its last frame.

--bundle is a folder made with `npx remotion bundle` (run in remotion/, with --public-dir and --out-dir): bundle once,
use it until the renderer's source changes. Without --bundle the command bundles into --out/bundle first, which
takes a minute or two and about 700 MB. The stills are as true as the bundle: its public folder must hold the
project's media (a build puts it there), or footage shows as a placeholder, and such tiles are marked, not judged.
--cuts is any folder of Shorts' cut JSONs (files with a `short` field); for a project folder it defaults to the
project's .cache, where the build writes them. --scenes keeps only those scenes of the long video.

The gates only report: this command exits 0 whatever they find, and nothing else calls them. See docs/proof.md.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import subprocess
import sys
import time
from typing import Any

from . import gates

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTION = os.path.join(HERE, "remotion")
STILLS = os.path.join(REMOTION, "scripts", "stills.mjs")

AFTER_START = 0.4  # a scene's first still: this long after its start, when its opening move has landed
BEFORE_END = 0.6  # its last still: this long before its end, ahead of the half-second wipe
LONG_SCENE = 8.0  # a scene longer than this gets a still at its midpoint too
AFTER_CUE = 0.3  # a mark or a card is on the page this long after its cue
SHORT_EARLY = 1.5  # a Short is also looked at this far in: what a scroller has seen when they decide
CHUNK = 450  # frames: a render no longer than this is made in one piece (pipeline/build.py render and its --chunk)
SCALE = 0.4  # the stills' share of full size: 768 x 432, and 432 x 768 upright; the gates' thresholds were set at this size
AT_ONCE = min(4, max(1, (os.cpu_count() or 2) - 1))  # stills in the browser together: three on four cores halves the time
TILE = {"Main": (240, 8), "Vertical": (216, 9)}  # a tile's width on the sheet and how many to a row
HEAD = 28  # two lines of lettering above each tile
ZONE_TINT, GATE_INK, BALANCE_BG = (70, 120, 255), (225, 110, 0), (255, 221, 51)
ROLE = {"start": "start", "mid": "mid", "end": "end", "cue": "cue", "at1": "1s", "at3": "3s", "at5": "5s", "first": "first", "early": "1.5s", "last": "last"}


# --- what to draw ---------------------------------------------------------------------------------------------------------

def load(path: str) -> tuple[dict[str, Any], str]:
    """The storyboard and its file: `path` is a project folder (its storyboard.json) or a storyboard JSON."""
    file = os.path.join(path, "storyboard.json") if os.path.isdir(path) else path
    if not os.path.exists(file):
        raise SystemExit(f"no storyboard at {file}: build the project first (python -m pipeline.build <project> --no-render)")
    with open(file, encoding="utf-8") as f:
        return json.load(f), os.path.abspath(file)


def find_cuts(folder: str, slug: str | None = None) -> list[tuple[str, dict[str, Any], str]]:
    """The Shorts' cuts in a folder: every JSON file that is a storyboard with a `short` field, as the build writes
    them into a project's .cache (pipeline/shortcut.py). [(name, cut, file)] in the order of their names; a cut of
    another video (a different slug) is left out."""
    out = []
    for name in sorted(os.listdir(folder)) if os.path.isdir(folder) else []:
        if not name.endswith(".json"):
            continue
        file = os.path.join(folder, name)
        try:
            with open(file, encoding="utf-8") as f:
                cut = json.load(f)
        except (OSError, ValueError):
            continue
        if not isinstance(cut, dict) or not cut.get("short") or not isinstance(cut.get("scenes"), list):
            continue
        if slug and cut.get("slug") and cut["slug"] != slug:
            continue
        out.append((re.sub(r"[^A-Za-z0-9_-]+", "-", str(cut["short"])).strip("-") or os.path.splitext(name)[0], cut, os.path.abspath(file)))
    return sorted(out, key=lambda c: [int(x) if x.isdigit() else x for x in re.split(r"(\d+)", c[0])])


def recording(sc: dict[str, Any]) -> bool:
    """True when the scene's picture is an app or a screen recording: a phone screen (phone=on), footage in a drawn
    laptop (screen=), a library clip tagged as one, or a file or search named for one. Such a tile is looked at for
    balances before anything else: no personal balance or holding value is ever shown."""
    if sc.get("type") not in gates.FOOTAGE:
        return False
    p = sc.get("props") or {}
    if str(p.get("phone") or "").lower() == "on" or p.get("screen") or sc.get("screen"):
        return True
    tags: list[str] = []
    if p.get("lib"):
        try:
            from .footage_library import manifest
            tags = [str(t).lower() for t in (manifest().get(str(p["lib"])) or {}).get("tags", [])]
        except Exception:  # noqa: BLE001 - no library on this machine: the names below still tell
            tags = []
    if "app" in tags or "screen recording" in tags:
        return True
    named = " ".join(str(p.get(k) or "") for k in ("lib", "src", "vsrc", "search", "want", "missing")).lower()
    words = re.split(r"[^a-z0-9]+", named)
    return "app" in words or "screenshot" in words or bool(re.search(r"screen[ _-]?record", named))


def last_frame(sb: dict[str, Any]) -> int:
    """The last frame a render of this storyboard writes. A render in chunks stops at round(seconds x rate) frames
    (pipeline/build.py render); one of 450 frames or fewer is made in one piece and runs the composition's own
    length, which rounds up (remotion/src/Root.tsx). A scene's length is rounded to the nearest frame, so that last
    frame can fall after the last scene has ended: a Short of 15 s or less can end on one frame of empty paper."""
    fps = int(sb.get("fps") or 30)
    n = float(sb["durationSec"]) * fps
    total = max(1, int(round(n)))
    return (max(1, math.ceil(n)) if total <= CHUNK else total) - 1


def frame_plan(sb: dict[str, Any], short: bool | None = None, only: set[int] | None = None) -> list[dict[str, Any]]:
    """The stills to draw for one storyboard, in frame order: [{frame, t, scene, src, type, why, footage, balances,
    file}]. `why` lists what each still is for: 'start' (0.4 s into its scene), 'mid' (the midpoint of a scene over
    8 s), 'end' (0.6 s before its end), 'cue' (0.3 s after a mark or a card), 'at1', 'at3' and 'at5' (1, 3 and 5 s
    into a scene drawn on paper, for the near-empty check) and, on a Short, 'first' (frame 0), 'early' (1.5 s) and
    'last' (the last frame). Two reasons that fall on one frame share its still. `scene` is the scene on screen
    (None when none is, which a Short's last frame can be); `src` is the long video's scene a cut's scene came from.
    `only` keeps the scenes with those ids (a cut's scenes by the scene they came from)."""
    short = bool(sb.get("short")) if short is None else short
    fps = int(sb.get("fps") or 30)
    last = last_frame(sb)
    tiles: dict[int, dict[str, Any]] = {}
    spans = []
    for sc in sb.get("scenes") or []:
        first = round(float(sc["start"]) * fps)
        dur = max(1, round((float(sc["end"]) - float(sc["start"])) * fps))  # as remotion/src/Video.tsx lays a scene
        lo, hi = max(0, first), min(last, first + dur - 1)
        if hi >= lo:
            spans.append((lo, hi, sc))

    def source(sc: dict[str, Any]) -> int:
        return int(sc["src"]) if sc.get("src") is not None else int(sc["id"])

    def add(frame: int, sc: dict[str, Any] | None, why: str) -> None:
        if only is not None and (sc is None or source(sc) not in only):
            return
        t = tiles.setdefault(frame, {
            "frame": frame, "t": round(frame / fps, 3), "scene": sc.get("id") if sc else None, "src": sc.get("src") if sc else None,
            "type": sc.get("type") if sc else None, "why": [], "footage": bool(sc) and gates.is_footage(sc),
            "balances": bool(sc) and recording(sc), "file": os.path.basename(gates.picture(sc)) if sc else ""})
        if why not in t["why"]:
            t["why"].append(why)

    for lo, hi, sc in spans:
        a, b = lo / fps, (hi + 1) / fps

        def at(t: float, why: str, lo: int = lo, hi: int = hi, sc: dict[str, Any] = sc) -> None:
            add(min(hi, max(lo, round(t * fps))), sc, why)

        if b - a <= AFTER_START + BEFORE_END:
            at((a + b) / 2, "start")
        else:
            at(a + AFTER_START, "start")
            at(b - BEFORE_END, "end")
        if b - a > LONG_SCENE:
            at((a + b) / 2, "mid")
        for c in sc.get("cues") or []:
            if c.get("do") in ("mark", "card") and a <= float(c["t"]) < b:
                at(float(c["t"]) + AFTER_CUE, "cue")
        if not gates.is_footage(sc):
            for why, s in zip(("at1", "at3", "at5"), gates.EARLY):
                if a + s <= b - 0.2:
                    at(a + s, why)
    if short:
        def on(frame: int) -> dict[str, Any] | None:
            return next((sc for lo, hi, sc in reversed(spans) if lo <= frame <= hi), None)

        for frame, why in ((0, "first"), (min(last, round(SHORT_EARLY * fps)), "early"), (last, "last")):
            add(frame, on(frame), why)
    return [tiles[f] for f in sorted(tiles)]


def words(cut: dict[str, Any], n: int = 5) -> tuple[str, str]:
    """A Short's first and last `n` words as it says them (its captions' words)."""
    said = [str(w.get("w", "")) for sc in cut.get("scenes") or [] for w in sc.get("words") or []]
    if not said:
        said = " ".join(str(sc.get("narration") or "") for sc in cut.get("scenes") or []).split()
    return " ".join(said[:n]), " ".join(said[-n:])


# --- drawing it -------------------------------------------------------------------------------------------------------------

def public_root() -> str:
    """The renderer's public folder, as pipeline/build.py picks it: remotion/public, or the folder EI_PUBLIC_DIR names."""
    return os.path.abspath(os.environ.get("EI_PUBLIC_DIR") or os.path.join(REMOTION, "public"))


def make_bundle(out: str) -> str:
    """Bundle the renderer into `out`/bundle with the public folder as it stands (about 700 MB, a minute or two)."""
    dst = os.path.join(out, "bundle")
    print(f"no --bundle: bundling the renderer into {dst} (about 700 MB, a minute or two)", flush=True)
    done = subprocess.run(["npx", "remotion", "bundle", f"--public-dir={public_root()}", f"--out-dir={dst}"], cwd=REMOTION, capture_output=True, text=True)
    if done.returncode != 0 or not os.path.exists(os.path.join(dst, "index.html")):
        raise SystemExit("the renderer could not be bundled:\n" + (done.stderr or done.stdout)[-2000:])
    return dst


def browser() -> str | None:
    """The browser a render on this machine uses, so the stills are drawn by the same one: REMOTION_BROWSER when it is
    set, else the first locally installed Chrome that remotion/remotion.config.ts lists and that is there, else None
    (Remotion's own). Two Chromes draw the same page with different pencil hatching, pixel for pixel."""
    if os.environ.get("REMOTION_BROWSER"):
        return os.environ["REMOTION_BROWSER"]
    try:
        with open(os.path.join(REMOTION, "remotion.config.ts"), encoding="utf-8") as f:
            listed = re.findall(r"^\s*'(/[^']+)',\s*$", f.read(), flags=re.M)
    except OSError:
        listed = []
    return next((p for p in listed if os.path.exists(p)), None)


def render(bundle: str, jobs: list[dict[str, Any]], out: str, scale: float = SCALE, at_once: int = 1) -> tuple[int, str]:
    """Draw every job's stills into `out`/stills with remotion/scripts/stills.mjs (one browser), saying each sheet as
    it is done. Returns how many stills failed and the renderer's closing line; a still that failed is simply missing
    from the sheet, and stills.log in `out` holds everything the renderer said."""
    os.makedirs(out, exist_ok=True)
    jobs_file = os.path.join(out, "jobs.json")
    with open(jobs_file, "w", encoding="utf-8") as f:
        json.dump(jobs, f)
    env = dict(os.environ)
    if browser():
        env["REMOTION_BROWSER"] = str(browser())
    proc = subprocess.Popen(["node", STILLS, bundle, jobs_file, os.path.join(out, "stills"), f"{scale:g}", str(at_once)],
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
    said: list[str] = []
    for line in proc.stdout or []:
        said.append(line.rstrip("\n"))
        if re.match(r"FAIL |.+ frames \d+s$", said[-1]):
            print("  " + said[-1], flush=True)
    proc.wait()
    with open(os.path.join(out, "stills.log"), "w", encoding="utf-8") as f:
        f.write("\n".join(said) + "\n")
    done = next((x for x in reversed(said) if re.match(r"done \d+ stills \d+ failed", x)), None)
    if not done:
        raise SystemExit("the stills could not be drawn:\n" + "\n".join(said[-25:]))
    return int(done.split()[3]), done


def still_path(out: str, name: str, comp: str, frame: int) -> str:
    return os.path.join(out, "stills", f"{name}-{comp}-{frame:06d}.png")


def clock(t: float) -> str:
    return f"{int(t // 60)}:{t % 60:04.1f}"


def stamp(t: dict[str, Any]) -> str:
    """A tile's label: scene (and the long video's scene a cut's scene came from), type, time, what the still is for."""
    if t.get("scene") is None:
        scene = "no scene"
    else:
        scene = f"{t['scene']}" + (f" ({t['src']})" if t.get("src") is not None and t["src"] != t["scene"] else "") + f" {t.get('type')}"
    return f"{scene} {clock(t['t'])} " + "+".join(ROLE.get(w, w) for w in t["why"])


def sheet(tiles: list[dict[str, Any]], out: str, comp: str, zones: dict[str, Any] | None = None) -> None:
    """One PNG of a storyboard's tiles, each under its stamp (scene, type, time). A second line carries what to look
    at: 'check for balances' on an app or screen recording, the gate a tile fails, 'not in the bundle' for footage
    the bundle does not hold. An upright sheet is tinted where YouTube draws over a Short (`zones`, from
    remotion/src/components/upright.json: its header, its title strip, its buttons)."""
    from PIL import Image, ImageDraw, ImageFont
    font = ImageFont.load_default()
    tw, cols = TILE[comp]
    th = round(tw * (9 / 16 if comp == "Main" else 16 / 9))
    cols = min(cols, max(1, len(tiles)))
    rows = (len(tiles) + cols - 1) // cols
    page = Image.new("RGB", (cols * (tw + 4) + 4, rows * (th + HEAD + 4) + 4), (38, 38, 38))
    d = ImageDraw.Draw(page)
    for k, t in enumerate(tiles):
        x, y = 4 + (k % cols) * (tw + 4), 4 + (k // cols) * (th + HEAD + 4)
        d.text((x + 2, y + 1), stamp(t)[: tw // 6], fill=(235, 235, 235), font=font)
        flags = list(t.get("flags") or [])
        if t.get("balances"):
            d.rectangle((x, y + 14, x + tw - 1, y + HEAD - 1), fill=BALANCE_BG)
            d.text((x + 2, y + 15), "check for balances", fill=(0, 0, 0), font=font)
        elif flags:
            d.text((x + 2, y + 15), ("; ".join(flags))[: tw // 6], fill=GATE_INK, font=font)
        elif t.get("unseen"):
            d.text((x + 2, y + 15), "not in the bundle", fill=(150, 150, 150), font=font)
        if t.get("image") and os.path.exists(t["image"]):
            im = Image.open(t["image"]).convert("RGB").resize((tw, th), Image.LANCZOS)
            if zones and comp == "Vertical":
                yt = zones["youtube"]
                tint = Image.new("RGB", im.size, ZONE_TINT)
                mask = Image.new("L", im.size, 0)
                md = ImageDraw.Draw(mask)
                md.rectangle((0, 0, tw, round(yt["top"] * th)), fill=70)
                md.rectangle((0, round((1 - yt["bottom"]) * th), tw, th), fill=70)
                md.rectangle((round((1 - yt["right"]) * tw), round(yt["right_from"] * th), tw, round((1 - yt["bottom"]) * th)), fill=70)
                im = Image.composite(tint, im, mask)
            page.paste(im, (x, y + HEAD))
        else:
            d.rectangle((x, y + HEAD, x + tw - 1, y + HEAD + th - 1), fill=(70, 70, 70))
            d.text((x + 6, y + HEAD + 6), "no still", fill=(200, 200, 200), font=font)
        if flags:
            d.rectangle((x - 2, y + HEAD - 2, x + tw + 1, y + HEAD + th + 1), outline=GATE_INK, width=2)
    page.save(out)


def unseen(sc_tile: dict[str, Any], scenes: dict[Any, dict[str, Any]], bundle: str, comp: str) -> bool:
    """True when a footage tile's picture is not in the bundle's public folder: the still shows a placeholder."""
    sc = scenes.get(sc_tile.get("scene"))
    if not sc or not sc_tile.get("footage"):
        return False
    p = sc.get("props") or {}
    src = (p.get("vsrc") if comp == "Vertical" else None) or p.get("src")
    return not src or not os.path.exists(os.path.join(bundle, "public", str(src)))


# --- the report -------------------------------------------------------------------------------------------------------------

def _where(f: dict[str, Any]) -> str:
    scene = "no scene" if f.get("scene") is None else f"scene {f['scene']} {f.get('type')}"
    return f"{scene} at {clock(float(f.get('t') or 0))}" + (f" (frame {f['frame']})" if f.get("frame") is not None else "")


def report(title: str, source: str, bundle: str, sheets: list[dict[str, Any]], took: dict[str, float], failed: int) -> list[str]:
    """proof.md: the tiles to check for balances first, then what the gates say sheet by sheet and tile by tile, then
    each Short's first and last five words."""
    stills = sum(len(s["tiles"]) for s in sheets)
    md = [f"# Proof sheet: {title}", "",
          f"{stills} stills on {len(sheets)} sheet{'s' if len(sheets) != 1 else ''}, drawn in {took['all']:.0f} seconds "
          f"(stills {took['stills']:.0f} s, sheets and checks {took['sheets']:.0f} s" + (f", bundle {took['bundle']:.0f} s" if took.get("bundle") else "") + ").",
          f"Storyboard: {source}", f"Bundle: {bundle}", "",
          "Look at the sheets before any render. The stills are as true as the bundle they come from.", ""]
    if failed:
        md += [f"{failed} still{'s' if failed != 1 else ''} could not be drawn and show as grey tiles (stills.log says why).", ""]
    md += ["## Check for balances first", ""]
    rows = []
    for s in sheets:
        by: dict[Any, list[dict[str, Any]]] = {}
        for t in s["tiles"]:
            if t.get("balances"):
                by.setdefault(t["scene"], []).append(t)
        for scene, ts in by.items():
            rows.append(f"- {s['file']}: scene {scene} ({ts[0].get('file') or ts[0].get('type')}), {len(ts)} tile{'s' if len(ts) != 1 else ''} from {clock(ts[0]['t'])} to {clock(ts[-1]['t'])}")
    md += (["These tiles show an app or a screen recording. No personal balance or holding value may be on screen.", ""] + rows) if rows else ["No tile shows an app or a screen recording."]
    md += ["", "## What the gates say", "",
           "The gates report and stop nothing. A Short's findings are marked FAIL, the long video's are warnings.",
           "The thresholds come from one video and may nag: look at the tile before changing anything.", ""]
    for s in sheets:
        md += [f"### {s['file']}: {s['what']}", ""]
        if s.get("unseen"):
            md += [f"{s['unseen']} tile{'s' if s['unseen'] != 1 else ''} show footage the bundle does not hold (a placeholder): marked 'not in the bundle' and not judged.", ""]
        md += [f"- {f['level']}, {f['gate']}: {_where(f)}: {f['text']}" for f in s["findings"]] or ["- nothing found"]
        md += [""]
    shorts = [s for s in sheets if s.get("words")]
    if shorts:
        md += ["## Each Short's first and last five words", ""]
        md += [f"- {s['name']} ({s['seconds']:.1f} s): starts \"{s['words'][0]}\", ends \"{s['words'][1]}\"" for s in shorts]
        md += [""]
    md += ["## How to read a tile", "",
           "Each tile is stamped with its scene, the scene's type, the time and what the still is for:",
           "start (0.4 s into the scene), mid, end (0.6 s before its end), cue (0.3 s after a mark or card),",
           "1s, 3s and 5s (the near-empty check), and on a Short first (frame 0), 1.5s and last.",
           "On a Short's sheet the blue tint is where YouTube draws over the frame: its header, its title strip and its buttons.", ""]
    return md


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("storyboard", help="a project folder (its storyboard.json) or a storyboard JSON")
    ap.add_argument("--bundle", default=None, metavar="DIR", help="a bundle of the renderer (npx remotion bundle); without it one is made in --out/bundle, about 700 MB")
    ap.add_argument("--out", required=True, metavar="DIR", help="where the sheets, proof.md and the stills go; nothing is written anywhere else")
    ap.add_argument("--cuts", default=None, metavar="DIR", help="a folder of Shorts' cut JSONs (default: the project's .cache)")
    ap.add_argument("--scenes", default=None, metavar="14,19", help="only these scenes of the long video (and what the Shorts cut from them)")
    ap.add_argument("--upright", action="store_true", help="also the whole long video in the Vertical composition (sheet-upright.png)")
    ap.add_argument("--scale", type=float, default=SCALE, help=f"the stills' share of full size (default {SCALE:g}, the size the gates were set at)")
    ap.add_argument("--at-once", type=int, default=AT_ONCE, metavar="N", help=f"stills in the browser together (default {AT_ONCE}: one fewer than this machine's cores, four at most)")
    args = ap.parse_args(argv)

    t0 = time.time()
    try:
        zones = gates.zones()
    except (OSError, ValueError) as e:
        raise SystemExit(f"no zone file ({gates.ZONES}): an upright tile cannot be tinted or measured without it ({e})")
    sb, source = load(args.storyboard)
    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)
    only = {int(x) for x in re.split(r"[,\s]+", args.scenes.strip()) if x} if args.scenes else None
    cuts_dir = args.cuts or (os.path.join(args.storyboard, ".cache") if os.path.isdir(args.storyboard) else None)
    cuts = find_cuts(cuts_dir, sb.get("slug")) if cuts_dir else []
    if args.cuts and not cuts:
        print(f"note: no Short's cut found in {args.cuts} (a cut is a JSON file with a `short` field)", flush=True)

    # one sheet per storyboard: the long video, each Short, and the long video upright when asked for
    sheets: list[dict[str, Any]] = []
    plan = frame_plan(sb, short=False, only=only)
    sheets.append({"name": "main", "file": "sheet-main.png", "comp": "Main", "short": False, "sb": sb, "props": source, "tiles": plan,
                   "what": f"the long video, {float(sb['durationSec']):.0f} s, {len(sb['scenes'])} scenes"})
    for name, cut, file in cuts:
        tiles = frame_plan(cut, short=True, only=only)
        if tiles:
            sheets.append({"name": name, "file": f"sheet-{name}.png", "comp": "Vertical", "short": True, "sb": cut, "props": file, "tiles": tiles,
                           "what": f"the Short {name}, {float(cut['durationSec']):.1f} s", "words": words(cut), "seconds": float(cut["durationSec"])})
    if args.upright:
        sheets.append({"name": "upright", "file": "sheet-upright.png", "comp": "Vertical", "short": False, "sb": sb, "props": source,
                       "tiles": frame_plan(sb, short=False, only=only), "what": "the long video upright, as its scenes would look in a Short"})
    stills = sum(len(s["tiles"]) for s in sheets)
    print(f"{stills} stills to draw: " + ", ".join(f"{s['name']} {len(s['tiles'])}" for s in sheets), flush=True)

    took = {"bundle": 0.0}
    bundle = os.path.abspath(args.bundle) if args.bundle else None
    if not bundle:
        t = time.time()
        bundle = make_bundle(out)
        took["bundle"] = time.time() - t
    if not os.path.exists(os.path.join(bundle, "index.html")):
        raise SystemExit(f"no bundle at {bundle}: make one in remotion/ with npx remotion bundle --public-dir=... --out-dir={bundle}")
    t = time.time()
    failed, tail = render(bundle, [{"name": s["name"], "props": s["props"], "comp": s["comp"], "frames": [x["frame"] for x in s["tiles"]]} for s in sheets if s["tiles"]],
                          out, args.scale, max(1, args.at_once))
    took["stills"] = time.time() - t
    print("  " + tail, flush=True)

    t = time.time()
    for s in sheets:
        scenes = {sc.get("id"): sc for sc in s["sb"].get("scenes") or []}
        for x in s["tiles"]:
            path = still_path(out, s["name"], s["comp"], x["frame"])
            x["image"] = path if os.path.exists(path) else None
            x["unseen"] = unseen(x, scenes, bundle, s["comp"])
        s["unseen"] = sum(1 for x in s["tiles"] if x["unseen"])
        s["findings"] = gates.still_gates(s["tiles"], short=s["short"], upright=s["comp"] == "Vertical")
        if s["name"] != "upright":
            s["findings"] += gates.held_stills(s["sb"]) + gates.opening(s["sb"])
        if only is not None:
            s["findings"] = [f for f in s["findings"] if f.get("frame") is not None or f.get("scene") in {x["scene"] for x in s["tiles"]}]
        by_frame = {x["frame"]: x for x in s["tiles"]}
        for f in s["findings"]:
            if f.get("frame") in by_frame:
                by_frame[f["frame"]].setdefault("flags", []).append(f"{f['level']}: {f['gate']}")
        sheet(s["tiles"], os.path.join(out, s["file"]), s["comp"], zones)
    took["sheets"] = time.time() - t
    took["all"] = time.time() - t0

    title = f"{sb.get('title') or sb.get('slug') or os.path.basename(source)}"
    with open(os.path.join(out, "proof.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(report(title, source, bundle, sheets, took, failed)))
    with open(os.path.join(out, "proof.json"), "w", encoding="utf-8") as f:
        json.dump({"storyboard": source, "bundle": bundle, "seconds": {k: round(v, 1) for k, v in took.items()}, "failed": failed,
                   "sheets": [{k: s[k] for k in ("name", "file", "comp", "short", "what", "props", "tiles", "findings", "unseen") if k in s}
                              | ({"words": list(s["words"])} if s.get("words") else {}) for s in sheets]}, f, indent=1)

    for s in sheets:
        print(f"{s['file']}: {len(s['tiles'])} tiles, {s['what']}" + (f", {s['unseen']} not in the bundle" if s["unseen"] else ""))
        for f in s["findings"]:
            print(f"  {f['level']}, {f['gate']}: {_where(f)}: {f['text']}")
    balances = sum(1 for s in sheets for x in s["tiles"] if x.get("balances"))
    if balances:
        print(f"check for balances: {balances} tiles show an app or a screen recording (listed first in proof.md)")
    print(f"proof sheet: {stills} stills on {len(sheets)} sheets in {took['all']:.0f} s ({took['stills']:.0f} s drawing) -> {out}/proof.md", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
