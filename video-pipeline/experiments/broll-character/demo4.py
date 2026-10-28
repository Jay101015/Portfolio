"""Demo: b-roll leads, the character punctuates. A 55-second story cut from the house video's own voice: footage
from the channel's library for the world, four whole-scene set pieces for the moments that matter, numbers that
land on the word, word-by-word captions, page turns, the push-in with a slight pan right. 1920x1080, 30 fps; the
character and the drawn rooms move at 12 drawings a second (stop motion), the footage at full speed."""
import importlib.util, json, math, os, subprocess, sys
import numpy as np
from scipy import ndimage
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps
LIB = '/home/user/Portfolio/video-pipeline'
W, H, FPS, STOP = 1920, 1080, 30, 12
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

# ---------------------------------------------------------------- the story: (seconds in the long video, what we see)
# word(t0, text): the time of the first word starting at or after t0 that begins with text
def word(t0, text):
    for w in WORDS:
        if w['s'] >= t0 - 0.02 and w['w'].lower().startswith(text.lower()):
            return w['s']
    raise KeyError(text)
import numpy as _np
from scipy.io import wavfile as _wav
_SR, _X = _wav.read(f'{LIB}/remotion/public/projects/afford-a-home-uk/voiceover.wav')
_X = _X.astype(_np.float32); _X = _X if _X.ndim == 1 else _X.mean(axis=1)
def quiet(t0, t1, w=0.02):
    """the quietest moment between t0 and t1 in the recording: where a cut between two words goes"""
    a, b = int(t0 * _SR), int(t1 * _SR); n = int(w * _SR)
    seg = _X[a:b] ** 2
    if len(seg) <= n: return (t0 + t1) / 2
    r = _np.convolve(seg, _np.ones(n) / n, mode='valid')
    return round((a + int(r.argmin()) + n // 2) / _SR, 3)
def _gated(t0, t1):
    """the runs of digital silence (over 1 ms) between t0 and t1: patches the recording's noise gate zeroed"""
    a = int(t0 * _SR); z = _np.r_[0, (_X[a:int(t1 * _SR)] == 0).astype(int), 0]; d = _np.diff(z)
    return [(a + i, a + j) for i, j in zip(_np.nonzero(d == 1)[0], _np.nonzero(d == -1)[0]) if j - i > _SR // 1000]
def first_sound(t0, t1):
    r = _gated(t0, t1); return round(r[-1][1] / _SR + 0.005, 3) if r else t0
def last_sound(t0, t1):
    r = _gated(t0, t1); return round(r[0][0] / _SR - 0.005, 3) if r else t1
SEGS = [
    dict(kind='broll', a=0.0, b=quiet(4.3, 4.75), clip='tower-bridge-office-window', off=1.5, zoom=1.62, fy=0.12, label='London',
         calls=[(0.0, '£111,000 a year', GREEN, 0.68, 0.36, 118)],
         teaser=(0.3, 'Coming up: the £1,000 a year the government gives you')),
    dict(kind='set', a=quiet(62.05, 62.3), b=quiet(65.85, 66.4), room='estate-agent', top=0.9, x=0.36, floor=0.80, h=0.60, label='London prices',
         walk_in=0.06, events=[(word(62, 'London'), 'point-board'), (word(62, '£550'), 'shocked')],
         calls=[(word(62, '£550'), '£550,000', RED, 0.74, 0.3, 120)], front=[[(0.08, 0.94), (0.95, 0.94), (0.95, 1), (0.08, 1)]]),
    dict(kind='broll', a=first_sound(67.15, 67.75), b=quiet(72.2, 72.6), clip='uk-suburb-drone', off=0.0, label='The whole UK',
         calls=[(word(67, '£273'), '£273,000', GREEN, 0.7, 0.36, 120), (word(67, 'Exactly'), 'exactly half', INK, 0.7, 0.56, 80)]),
    dict(kind='set', a=quiet(288.2, 288.41), b=quiet(300.12, 300.36), room='first-flat', top=0.55, x=0.56, floor=0.79, h=0.62, label='My budget',
         events=[(word(288, 'salary'), 'calculator'), (word(288, '£270'), 'thinking'), (word(288, 'deposit'), 'count-notes'),
                 (word(296, 'budget'), 'explain'), (word(296, '£310'), 'thumbs-up')],
         pops=[(word(296, '£310'), 'house', 0.3, 0.84, 0.3, -6)],
         calls=[(word(288, '£60'), '£60K salary', INK, 0.2, 0.2, 70), (word(288, '£270'), 'bank lends £270K', INK, 0.2, 0.32, 70),
                (word(293, '£30'), '+ £30–40K deposit', INK, 0.2, 0.44, 70), (word(296, '£310'), '£310,000', GREEN, 0.22, 0.6, 110)]),
    dict(kind='broll', a=quiet(306.3, 306.75), b=last_sound(310.9, 311.3), clip='estate-agent-sold', off=0.0, speed=0.8, label='The real wall', tail=0.5,
         calls=[(word(306, 'mortgage'), 'not the mortgage', INK, 0.3, 0.26, 80), (word(306, 'deposit'), 'THE DEPOSIT', RED, 0.3, 0.44, 118)]),
    dict(kind='broll', a=first_sound(311.0, 311.62), b=quiet(320.45, 321.2), clip='uk-suburb-drone', off=5.8, speed=0.45, label='Essex',
         calls=[(word(311, '£36'), '£36,000 deposit', INK, 0.66, 0.3, 96), (word(316, '£1,000'), '£1,000 a month', INK, 0.66, 0.46, 80),
                (word(318, 'three'), '= 3 years', RED, 0.66, 0.6, 104)]),
    dict(kind='set', a=quiet(321.0, 321.4), b=quiet(334.35, 335.0), room='living-room', top=0.35, x=0.43, floor=0.575, h=0.45, label='The fix: a Lifetime ISA',
         events=[(word(321, '£4,000'), 'hand-over'), (word(326, '£1,000'), 'jump'),
                 (word(328, 'two'), 'thumbs-up'), (word(331, 'Free'), 'fist-pump'), (word(333, 'saving'), 'point-board')],
         pops=[(word(326, '£1,000'), 'note-20', 0.14, 0.82, 0.2, 10), (word(327.2, 'a'), 'note-20', 0.14, 0.9, 0.31, -8)],
         calls=[(word(321, '£4,000'), '£4,000 a year', INK, 0.22, 0.2, 80), (word(326, '£1,000'), '+ £1,000 free', GREEN, 0.22, 0.5, 104),
                (word(328, 'two'), ('3 years', '2 years 9 months'), GREEN, 0.28, 0.68, 90)],
         outro=2.2, outro_at=word(333, 'saving')),
]
GAP = 0.12
t = 0.0
for s in SEGS:
    s['T'] = t; s['dur'] = s['b'] - s['a']; s['gap'] = GAP + s.get('tail', 0); t += s['dur'] + s['gap']
TOTAL = t + SEGS[-1].get('outro', 0)

# ---------------------------------------------------------------- audio: the spans back to back, levelled
def build_audio():
    """the spans laid on a continuous bed of the room's own tone (a quiet stretch with no gated silence in it, looped
    with crossfades), each span crossfading in and out of the bed over 30 ms, so the sound never drops to digital
    silence; then levelled to -14 LUFS in two passes"""
    t0, t1 = 306.3, 306.78
    z = _np.r_[0, (_X[int(t0 * _SR):int(t1 * _SR)] == 0).astype(int), 0]; d = _np.diff(z)
    assert ((_np.nonzero(d == -1)[0] - _np.nonzero(d == 1)[0]).max(initial=0)) < _SR // 1000  # no gated silence in it
    tone = _X[int(t0 * _SR):int(t1 * _SR)].astype(_np.float64)
    N = int((TOTAL + 0.2) * _SR); xf = int(0.03 * _SR); bed = _np.zeros(N); pos = 0
    ramp = _np.linspace(0, 1, xf)
    while pos < N:
        piece = tone.copy(); piece[:xf] *= ramp; piece[-xf:] *= ramp[::-1]
        n = min(len(piece), N - pos); bed[pos:pos + n] += piece[:n]; pos += len(piece) - xf
    out = bed.copy()
    for s in SEGS:
        seg = _X[int(s['a'] * _SR):int(s['b'] * _SR)].astype(_np.float64)
        w = _np.ones(len(seg)); w[:xf] = ramp; w[-xf:] = ramp[::-1]
        p = int(s['T'] * _SR); n = min(len(seg), N - p)
        out[p:p + n] = seg[:n] * w[:n] + bed[p:p + n] * (1 - w[:n])
    _wav.write('voice-raw.wav', _SR, out.astype(_np.int16))
    err = subprocess.run(['ffmpeg', '-nostats', '-i', 'voice-raw.wav', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    m = json.loads(err[err.rindex('{'):err.rindex('}') + 1])
    ln = (f"loudnorm=I=-14:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
          f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', 'voice-raw.wav', '-af', ln, '-ar', '48000', '-ac', '1', 'voice.wav'], check=True)

# ---------------------------------------------------------------- rooms and footage
class Room:
    def __init__(self, name, top):
        im = Image.open(f'{LIB}/remotion/public/backgrounds/{name}.png').convert('RGB')
        bh = round(im.width * 9 / 16); y0 = round(top * (im.height - bh))
        im = im.crop((0, y0, im.width, y0 + bh)).resize((W, H), Image.LANCZOS)
        a = np.array(im, np.float32); a = PAPER - (PAPER - a) * 0.72
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        self.boils = []
        for v in range(3):
            r = np.random.default_rng(100 + v)
            dx = ndimage.zoom(ndimage.gaussian_filter(r.normal(size=(H // 24, W // 24)), 1.5), 24, order=1)[:H, :W]
            dy = ndimage.zoom(ndimage.gaussian_filter(r.normal(size=(H // 24, W // 24)), 1.5), 24, order=1)[:H, :W]
            dx *= 1.6 / (np.abs(dx).max() + 1e-6); dy *= 1.6 / (np.abs(dy).max() + 1e-6)
            out = np.stack([ndimage.map_coordinates(a[..., c], [yy + dy, xx + dx], order=1, mode='nearest') for c in range(3)], -1)
            self.boils.append(Image.fromarray(out.clip(0, 255).astype(np.uint8)).convert('RGBA'))
    def frame(self, k): return self.boils[k % 3].copy()
    def front(self, polys, k):
        m = Image.new('L', (W, H), 0); d = ImageDraw.Draw(m)
        for p in polys: d.polygon([(x * W, y * H) for x, y in p], fill=255)
        out = self.frame(k); out.putalpha(m); return out

def footage(seg):
    """the clip's frames for this segment, 1920x1080, cover-cropped (a vertical clip keeps its middle band)"""
    e = FOOT[seg['clip']]; sp = seg.get('speed', 1.0); d = f"frames-{seg['clip']}-{seg['off']}-{sp}"
    if not os.path.isdir(d):
        os.makedirs(d)
        n = math.ceil((seg['dur'] + seg['gap']) * FPS) + 2
        z, fy = seg.get('zoom', 1.0), seg.get('fy', 0.5)
        zw, zh = round(W * z / 2) * 2, round(H * z / 2) * 2
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(seg['off']), '-i', f"{LIB}/library/footage/{e['file']}",
                        '-frames:v', str(n), '-vf', f'setpts=PTS/{sp},fps={FPS},scale={zw}:{zh}:force_original_aspect_ratio=increase,'
                        f'crop={W}:{H}:(iw-{W})/2:(ih-{H})*{fy},eq=saturation=0.92,tpad=stop_mode=clone:stop_duration=5',
                        '-q:v', '3', f'{d}/%04d.jpg'], check=True)
    return sorted(os.listdir(d)), d

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
def chip(f, txt, age):
    if age < 0: return
    sx, sy = squash(age); fnt = brush(round(64 * sy)); d = ImageDraw.Draw(f)
    l, t, r, b = d.textbbox((0, 0), txt, font=fnt); x, y = 64, 52
    d.rounded_rectangle((x + 6, y + 8, x + r - l + 56, y + b - t + 44), 16, fill=(0, 0, 0, 60))
    d.rounded_rectangle((x, y, x + r - l + 50, y + b - t + 36), 16, fill=MARK, outline=INK, width=4)
    d.text((x + 25 - l, y + 18 - t), txt, font=fnt, fill=INK)

# captions: three to five words at a time, the word being said swiped with the marker
CHUNKS = []
for s in SEGS:
    # every word heard in the span, a word the cut starts inside of included from the cut on
    ws = [dict(w, s=s['T'] + max(w['s'], s['a']) - s['a'], e=s['T'] + w['e'] - s['a']) for w in WORDS if w['e'] > s['a'] + 0.1 and w['e'] <= s['b'] + 0.05]
    cur = []
    for w in ws:
        cur.append(w)
        if len(cur) >= 4 or w['w'][-1] in '.,?!':
            CHUNKS.append(cur); cur = []
    if cur: CHUNKS.append(cur)
def teaser(f, txt, age, left):
    """a promise pinned at the top while the hook plays: what the end of the video pays off"""
    if age < 0 or left < 0: return
    fade = min(1.0, left * 3)
    sx, sy = squash(age); fnt = brush(round(58 * sy)); d = ImageDraw.Draw(f)
    l, t, r, b = d.textbbox((0, 0), txt, font=fnt); w = r - l
    x, y = W / 2 - w / 2, 46
    d.rounded_rectangle((x - 30, y - 8, x + w + 30, y + b - t + 26), 18, fill=(26, 23, 20, round(230 * fade)))
    d.text((x - l, y + 8 - t), txt, font=fnt, fill=(255, 255, 255, round(255 * fade)))

def captions(f, t):
    ch = next((c for c in CHUNKS if c[0]['s'] - 0.05 <= t <= c[-1]['e'] + 0.25), None)
    if not ch: return
    fnt = bold(64); d = ImageDraw.Draw(f)
    widths = [d.textlength(w['w'], font=fnt) for w in ch]; gap = 18
    total = sum(widths) + gap * (len(ch) - 1); x = W / 2 - total / 2; y = H * 0.885
    d.rounded_rectangle((x - 32, y - 50, x + total + 32, y + 46), 24, fill=(255, 255, 255, 235))
    for w, wd in zip(ch, widths):
        on = w['s'] - 0.03 <= t <= w['e'] + 0.1
        if on: d.rounded_rectangle((x - 8, y - 40, x + wd + 8, y + 36), 10, fill=MARK)
        d.text((x, y), w['w'], font=fnt, fill=INK, anchor='lm'); x += wd + gap

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

def render_seg(s, rooms):
    n = round(s['dur'] * FPS) + round((s['outro'] if s.get('outro') else s['gap']) * FPS)
    frames = []
    if s['kind'] == 'broll':
        names, d = footage(s)
    else:
        room = rooms[s['room']]; h = s['h'] * H; X, Y = s['x'] * W, s['floor'] * H
        step = 161 / 418 * h / 3
        ins = 0
        if s.get('walk_in') is not None:
            nd = max(1, round(abs(X - s['walk_in'] * W) / step)); ins = nd  # drawings, at 8 a second
        tr = track([(s['T'] + (t - s['a']), p) for t, p in s.get('events', [])])
    for i in range(n):
        t = s['T'] + i / FPS
        k = int(t * STOP)  # the stop-motion clock: 12 a second
        tq = k / STOP
        if s['kind'] == 'broll':
            f = Image.open(f"{d}/{names[min(i, len(names) - 1)]}").convert('RGBA')
        else:
            f = room.frame(k); jx, jy, jr = jiggle(k)
            local = t - s['T']; dk = int(local * 8)
            if ins and dk < ins:
                px = s['walk_in'] * W + (X - s['walk_in'] * W) * min(1, (dk + 1) / ins)
                im, cx, g = walk(dk, h, flip=s['walk_in'] > s['x'])
                shadow(f, px, Y, h * 0.45); place(f, im, cx, g, px + jx, Y + [0, -4, -2][dk % 3] * h / 400 + jy, rot=jr)
            else:
                cur = [e for e in tr if e[0] <= tq + 1e-6]
                name, kind, at = ('stand', 'key', s['T']) if not cur else (cur[-1][1], cur[-1][2], cur[-1][0])
                if not cur and ins: at, name = s['T'] + ins / 8, 'stand-3q'
                age = (tq - at) * STOP
                flip = (name == 'stand-3q' and s['walk_in'] < s['x'])  # drawn facing left
                flip = flip or (name.startswith('point-board') and 'outro_at' in s)  # point at the outro cards on the left
                im, fx, fy = pose(name, h, flip=flip)
                sx, sy = (1, 1) if kind == 'ib' else squash(age)
                lift = 0
                if kind == 'key' and name in HAPPY and age < 8: lift = h * 0.06 * math.sin(math.pi * age / 8)
                if kind == 'arc': lift = h * 0.32 * math.sin(math.pi * min(1, (tq - at + 1 / STOP) / 0.42)); sx, sy = 1, 1
                shadow(f, X, Y, h * 0.45, lift)
                place(f, im, fx, fy, X + jx, Y - lift + jy, sx, sy, jr)
            for pt, pn, ps, ppx, ppy, rot in s.get('pops', []):
                pt = s['T'] + pt - s['a']
                if tq >= pt:
                    pim = prop(pn, round(ps * H)); sx, sy = squash((tq - pt) * STOP); pj = jiggle(k, 5)
                    place(f, pim, pim.width / 2, pim.height, ppx * W + pj[0], ppy * H + pim.height / 2 + pj[1], sx, sy, rot + pj[2] * 2)
            if s.get('front'): f.alpha_composite(room.front(s['front'], k))
        # the push-in with a slight pan right, reset each segment (on the stop-motion clock in the drawn rooms)
        p = ((tq if s['kind'] == 'set' else t) - s['T']) / (n / FPS); p = min(max(p, 0), 1)
        amount = min(0.08, 0.03 + s['dur'] * 0.004)
        z = 1 + amount * (p * (2 - p) * 0.6 + p * 0.4); pan = (z - 1) * (W / 2) * 0.3
        shake = (0.0, 0.0)
        if s['kind'] == 'set':
            for et, en, ek in tr:
                if en in ('shocked', 'bill-shock') and ek == 'key' and 0 <= tq - et < 0.42:
                    amp = 14 * (1 - (tq - et) / 0.42); r = np.random.default_rng(k)
                    shake = (r.uniform(-amp, amp), r.uniform(-amp, amp))
        z = max(z, 1.02) if shake != (0.0, 0.0) else z
        big = f.resize((round(W * z), round(H * z)), Image.BILINEAR)
        L, T = (z - 1) * W / 2 + pan + shake[0], (z - 1) * H * 0.48 + shake[1]
        L = min(max(0, L), big.width - W); T = min(max(0, T), big.height - H)
        g = big.crop((round(L), round(T), round(L) + W, round(T) + H)).convert('RGBA')
        # pinned to the frame, outside the camera: the numbers on the word, the scene's label, the teaser, captions
        clock = tq if s['kind'] == 'set' else t
        rate = STOP if s['kind'] == 'set' else FPS / 2.5
        o_at = s['T'] + s.get('outro_at', s['b']) - s['a'] + 0.05
        in_outro = bool(s.get('outro')) and t > o_at
        for ct, txt, col, cx, cy, size in ([] if in_outro else s.get('calls', [])):
            ct = s['T'] + ct - s['a']
            tilt = (-2.5 if cx < 0.5 else 2) + (jiggle(k, 9)[2] if s['kind'] == 'set' else 0)
            if isinstance(txt, tuple): swap_card(g, *txt, col, cx, cy, size, (clock - ct) * rate, tilt)
            else: card(g, txt, col, cx, cy, size, (clock - ct) * rate, tilt)
        if in_outro: chip(g, 'The Everyday Investor', (t - o_at) * STOP)
        else: chip(g, s['label'], (clock - s['T'] - 0.15) * rate)
        if s.get('teaser'):
            ta, txt = s['teaser']
            teaser(g, txt, (t - s['T'] - ta) * FPS / 2.5, (s['T'] + s['dur'] + s['gap']) - t)
        if in_outro:
            age = (t - o_at) * STOP
            card(g, 'Work out yours:', INK, 0.19, 0.27, 72, age, -1.5)
            card(g, 'what the bank lends', GREEN, 0.19, 0.42, 84, age - 2, -1)
            card(g, '+ your deposit', GREEN, 0.19, 0.57, 84, age - 4, 1)
        captions(g, t)
        frames.append(g.convert('RGB'))
    return frames

def end_card():
    n = round(1.6 * FPS); out = []
    base = Image.new('RGBA', (W, H), tuple(int(v) for v in PAPER) + (255,))
    for i in range(n):
        f = base.copy(); age = i / FPS * STOP
        sx, sy = squash(age); fnt = brush(round(130 * sy)); d = ImageDraw.Draw(f)
        d.text((W / 2, H * 0.44), 'The Everyday Investor', font=fnt, fill=INK, anchor='mm')
        if i > 10:
            d2 = brush(60); d.text((W / 2, H * 0.6), 'money, worked out for real life', font=d2, fill=GREEN, anchor='mm')
        out.append(f.convert('RGB'))
    return out

if __name__ == '__main__':
    build_audio()
    rooms = {s['room']: Room(s['room'], s['top']) for s in SEGS if s['kind'] == 'set'}
    os.makedirs('out', exist_ok=True)
    idx = 0; last = None
    SLIDE = 8
    for si, s in enumerate(SEGS):
        fr = render_seg(s, rooms)
        if last is not None:  # the next page slides over the last frame
            for j in range(min(SLIDE, len(fr))):
                q = (j - j % 2 + 2) / SLIDE; x = round(W * (1 - q) ** 3)
                g = last.copy(); g.paste(fr[j], (x, 0)); ImageDraw.Draw(g).line([(x, 0), (x, H)], fill=INK, width=5); fr[j] = g
        for f in fr:
            f.save(f'out/{idx:05d}.jpg', quality=93); idx += 1
        last = fr[-1]
        print('segment', si + 1, 'frames', len(fr), flush=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-framerate', str(FPS), '-i', 'out/%05d.jpg', '-i', 'voice.wav', '-c:v', 'libx264', '-crf', '19',
                    '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', 'demo4.mp4'], check=True)
    print('total', idx, 'frames')
