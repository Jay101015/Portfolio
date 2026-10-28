"""Shorts demo (the £25K rung of the house video), built like the landscape demo: b-roll leads, the character punctuates. A 55-second story cut from the house video's own voice: footage
from the channel's library for the world, four whole-scene set pieces for the moments that matter, numbers that
land on the word, word-by-word captions, page turns, the push-in with a slight pan right. 1920x1080, 30 fps; the
character and the drawn rooms move at 12 drawings a second (stop motion), the footage at full speed."""
import importlib.util, json, math, os, subprocess, sys
import numpy as np
from scipy import ndimage
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps
LIB = '/home/user/Portfolio/video-pipeline'
W, H, FPS, STOP = 1080, 1920, 30, 12
SPEED = 1.2  # Shorts play the voice at 1.2x
INK, GREEN, RED, MARK = (26, 23, 20), (31, 111, 74), (200, 50, 55), (255, 230, 109)
PAPER = np.array([250, 249, 245], np.float32)
brush = lambda n: ImageFont.truetype('caveat-brush-latin-400-normal.ttf', n)
bold = lambda n: ImageFont.truetype('inter-800.ttf', n)
MAN = {e['name']: e for e in json.load(open(f'{LIB}/library/poses/manifest.json'))}
FOOT = {e['name']: e for e in json.load(open(f'{LIB}/library/footage/manifest.json'))}
INB = {}
for e in MAN.values():
    if e.get('into') and not e['name'].startswith('jump-'):
        INB.setdefault(e['into'], []).append(e['name'])
INB = {k: sorted(v) for k, v in INB.items()}
# the storyboard's corrected words with the transcript's measured times (align.py): the storyboard's own word times
# agree on average but can be a second out on single words, which clips words at a cut
WORDS = json.load(open('aligned-words.json'))
for _w in WORDS:  # where the take differs from the script, the captions follow the take
    if _w['w'] == 'per' and 327 < _w['s'] < 328: _w['w'] = 'a'
    if _w['w'] == 'to' and 329.5 < _w['s'] < 330: _w['w'] = 'into'
_i = next(i for i, _w in enumerate(WORDS) if _w['w'] == 'to' and 297 < _w['s'] < 297.4)
WORDS.insert(_i + 1, dict(w='be', s=297.39, e=297.73))

def solid(im):
    a = np.array(im); ink = ndimage.binary_dilation(a[..., 3] > 60, iterations=2)
    inside = ndimage.binary_erosion(ndimage.binary_fill_holes(ink), iterations=1) | (a[..., 3] > 60)
    base = np.zeros_like(a); base[..., :3] = 255; base[..., 3] = inside * 255
    out = Image.fromarray(base, 'RGBA'); out.alpha_composite(im); return out


WORDS = json.load(open('aligned-words.json'))
cache = {}
def pose(n, h, flip=False):
    key = (n, round(h), flip)
    if key not in cache:
        e = MAN[n]; s = h / 800
        im = Image.open(f'{LIB}/remotion/public/poses/solid/{n}.png').convert('RGBA')
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS); fx = e['foot_x'] * s
        if flip: im = ImageOps.mirror(im); fx = im.width - fx
        cache[key] = (im, fx, e['floor_y'] * s)
    return cache[key]
spec = importlib.util.spec_from_file_location('pc', f'{LIB}/scripts/pose-cut.py'); pc = importlib.util.module_from_spec(spec); spec.loader.exec_module(pc)
a = np.array(Image.open(f'{LIB}/library/poses/source/batch-5a-walk.png').convert('L'))
WALK = []
for (x0, y0, x1, y1) in pc.grid(a):
    c, g = pc.cut_panel(a[y0:y1, x0:x1]); d = c < 140; ys, xs = np.nonzero(d); top = ys.min()
    band = d[top + int((g - top) * .25):top + int((g - top) * .45)]; bx = np.nonzero(band.any(axis=0))[0]
    WALK.append((pc.ink(c), (bx.min() + bx.max()) / 2, g))
CYCLE = [0, 3, 1, 4, 7, 5]
def walk(k, h, flip=False):
    key = ('walk', k % 6, round(h), flip)
    if key not in cache:
        im, cx, g = WALK[CYCLE[k % 6]]; s = h / 418
        im = solid(im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)); cx *= s
        if flip: im = ImageOps.mirror(im); cx = im.width - cx
        cache[key] = (im, cx, g * s)
    return cache[key]
props = {}
def prop(n, size):
    if (n, size) not in props:
        im = Image.open(f'{LIB}/remotion/public/props/{n}.png').convert('RGBA'); s = size / max(im.size)
        props[(n, size)] = solid(im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS))
    return props[(n, size)]

def squash(age): return [(1.08, 0.92), (0.95, 1.06), (1.02, 0.98), (1, 1)][min(int(age) // 2, 3)]
def jiggle(k, salt=0):
    r = np.random.default_rng(k * 7 + salt); return r.uniform(-1.4, 1.4), r.uniform(-0.9, 0.9), r.uniform(-0.4, 0.4)
def place(f, im, fx, fy, x, y, sx=1, sy=1, rot=0):
    if (sx, sy) != (1, 1):
        im = im.resize((max(1, round(im.width * sx)), max(1, round(im.height * sy))), Image.BICUBIC); fx *= sx; fy *= sy
    if rot:
        pad = Image.new('RGBA', (im.width * 2, im.height * 2), (0, 0, 0, 0)); ox, oy = round(im.width - fx), round(im.height - fy)
        pad.alpha_composite(im, (ox, oy)); im = pad.rotate(rot, resample=Image.BICUBIC, center=(fx + ox, fy + oy)); fx, fy = fx + ox, fy + oy
    f.alpha_composite(im, (round(x - fx), round(y - fy)))
def shadow(f, x, y, w, lift=0):
    k = max(0.4, 1 - lift / 300); sw, sh = w * 0.62 * k, w * 0.09 * k
    s = Image.new('L', (W, H), 0); ImageDraw.Draw(s).ellipse((x - sw / 2, y - sh / 2, x + sw / 2, y + sh / 2), fill=round(64 * k))
    s = s.filter(ImageFilter.GaussianBlur(7)); layer = Image.new('RGBA', (W, H), INK + (0,)); layer.putalpha(s); f.alpha_composite(layer)

def card(f, txt, col, cx, cy, size, age, tilt):
    """a number on a paper card, landing with squash and stretch"""
    if age < 0: return
    if age == 0: age = 8  # a card due on the very first frame is shown settled
    sx, sy = squash(age); fnt = brush(round(size * sy))
    d0 = ImageDraw.Draw(Image.new('RGB', (1, 1)))
    l, t, r, b = d0.textbbox((0, 0), txt, font=fnt); w, h = r - l + 56, b - t + 36
    im = Image.new('RGBA', (w + 20, h + 20), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle((12, 14, w + 12, h + 14), 18, fill=(0, 0, 0, 50))
    d.rounded_rectangle((6, 6, w + 6, h + 6), 18, fill=(255, 255, 255, 250), outline=INK, width=4)
    d.text((34 - l, 24 - t), txt, font=fnt, fill=col)
    im = im.resize((max(1, round(im.width * sx)), im.height)).rotate(tilt, resample=Image.BICUBIC, expand=True)
    f.alpha_composite(im, (round(cx * W - im.width / 2), round(cy * H - im.height / 2)))
def swap_card(f, old, new, col, cx, cy, size, age, tilt):
    """the old figure struck through in red, an arrow, the new figure: '3 years -> 2 years 9 months'"""
    if age < 0: return
    sx, sy = squash(age); fnt = brush(round(size * sy)); d0 = ImageDraw.Draw(Image.new('RGB', (1, 1)))
    l1, t1, r1, b1 = d0.textbbox((0, 0), old, font=fnt); l2, t2, r2, b2 = d0.textbbox((0, 0), new, font=fnt)
    aw = round(size * 1.1); th = max(b1, b2) - min(t1, t2); top = min(t1, t2)
    w = (r1 - l1) + aw + (r2 - l2) + 56; h = th + 36
    im = Image.new('RGBA', (w + 20, h + 20), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle((12, 14, w + 12, h + 14), 18, fill=(0, 0, 0, 50))
    d.rounded_rectangle((6, 6, w + 6, h + 6), 18, fill=(255, 255, 255, 250), outline=INK, width=4)
    x = 34; d.text((x - l1, 24 - top), old, font=fnt, fill=RED)
    mid = 24 + th / 2
    d.line([(x - 4, mid + 4), (x + r1 - l1 + 4, mid - 2)], fill=RED, width=6)
    x += r1 - l1 + 14; ax = x + aw - 28
    d.line([(x, mid), (ax, mid)], fill=INK, width=6); d.polygon([(ax + 6, mid), (ax - 12, mid - 13), (ax - 12, mid + 13)], fill=INK)
    x += aw; d.text((x - l2, 24 - top), new, font=fnt, fill=col)
    im = im.resize((max(1, round(im.width * sx)), im.height)).rotate(tilt, resample=Image.BICUBIC, expand=True)
    f.alpha_composite(im, (round(cx * W - im.width / 2), round(cy * H - im.height / 2)))
HOLD_IB = 3 / STOP / 1.25
def track(events):
    out = []
    for t, p in events:
        if p == 'jump':
            out += [(t - 2 * HOLD_IB, 'jump-crouch', 'ib'), (t, 'jump-air', 'arc'), (t + 0.42, 'arms-up', 'key')]; continue
        ib = INB.get(p, [])
        out += [(t - HOLD_IB * (len(ib) - k), n, 'ib') for k, n in enumerate(ib)]
        out.append((t, p, 'key'))
    return sorted(out)
HAPPY = {'thumbs-up', 'fist-pump', 'arms-up', 'welcome', 'idea'}

