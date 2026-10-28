"""Shorts demo: what £25K a year buys, cut from the house video's own voice at 1.2x. Vertical 1080x1920, 30 fps,
the character and the drawn rooms on the stop-motion clock (12 a second). Footage and the character take turns:
office (his £25K), the handshake (what the bank lends), his first flat (deposit, budget, monthly cost), London (hard
to find), the drone over UK streets (a flat in a small town), the terraced street (where £125K buys a house)."""
from short25_base import *
from scipy.io import wavfile as _wav

SR, X = _wav.read(f'{LIB}/remotion/public/projects/afford-a-home-uk/voiceover.wav')
X = X.astype(np.float32); X = X if X.ndim == 1 else X.mean(axis=1)

def word(t0, text):
    for w in WORDS:
        if w['s'] >= t0 - 0.02 and w['w'].lower().startswith(text.lower()):
            return w['s']
    raise KeyError(text)
def quiet(t0, t1, w=0.02):
    a, b = int(t0 * SR), int(t1 * SR); n = int(w * SR)
    r = np.convolve(X[a:b] ** 2, np.ones(n) / n, mode='valid')
    return round((a + int(r.argmin()) + n // 2) / SR, 3)

TITLE = 'The home £25K a year buys you'
C1 = quiet(81.55, 81.7)    # "salary, | a bank" (no pause: the picture cuts, the voice runs on)
C3 = quiet(93.25, 93.7)    # "a month. | In London"
C5 = quiet(98.86, 99.13)   # "small towns, | or a terraced house" (measured from the sound: the transcript runs early here)
C4 = quiet(96.94, 97.04)   # "Across the UK, | it's a flat"
SEGS = [
    dict(kind='set', a=78.35, b=C1, gap=0, skip=[(79.56, 79.96)], room='office', cx=0.36, x=0.69, floor=0.72, h=0.41,
         events=[(78.35, 'brown-envelope'), (word(80, '4.5'), 'calculator')],
         calls=[(78.35, '£25,000 a year', GREEN, 0.33, 0.29, 104, 0.6), (word(80, '4.5'), '× 4.5', INK, 0.33, 0.4, 96, 0.6)]),
    dict(kind='broll', a=C1, b=quiet(84.97, 85.2), gap=0.06, clip='office-interview-handshake', off=12.8,
         calls=[(word(82, 'lend'), 'the bank lends', INK, 0.5, 0.66, 80, 0.86), (word(82, '£112'), '£112,000', GREEN, 0.5, 0.75, 120, 0.86)]),  # over the table, clear of his face
    dict(kind='set', a=quiet(85.3, 85.55), b=C3, gap=0, skip=[(90.57, 91.02)], room='first-flat', cx=0.6, x=0.68, floor=0.72, h=0.475,
         events=[(85.38, 'count-notes'), (word(88, '£125') + 0.3, 'fist-pump'), (word(90, '£600'), 'calculator')],
         pops=[(word(90, '£600'), 'keys-b', 0.1, 0.2, 0.585, -10)],
         calls=[(word(85, '£12'), '+ £12,000 deposit', INK, 0.3, 0.29, 80, 0.56), (word(88, '£125') + 0.3, '£125,000', GREEN, 0.3, 0.39, 110, 0.56),
                (word(90, '£600'), '£600 a month', GREEN, 0.4, 0.5, 84, 0.46)]),
    dict(kind='broll', a=C3, b=quiet(95.15, 95.5), gap=0.4, clip='tower-bridge-office-window', off=2.3, fx=0.2, zoom=1.45, fy=0.06,
         calls=[(word(93, 'London'), 'London', INK, 0.5, 0.3, 96, 0.86), (word(94, 'hard'), 'very hard to find', RED, 0.5, 0.4, 100, 0.86)]),
    dict(kind='broll', a=quiet(95.8, 96.05), b=C4, gap=0, clip='uk-suburb-drone', off=0.0, calls=[]),
    dict(kind='broll', a=C4, b=C5, gap=0, clip='uk-flats-block-drone', off=0.5, fx=0.5,
         calls=[(word(97, 'flat'), 'a flat in many small towns', INK, 0.5, 0.3, 92, 0.86)]),
    dict(kind='set', a=C5, b=quiet(102.4, 102.49), gap=0.3, room='terraced-street', cx=0.42, x=0.70, floor=0.80, h=0.36, walk_in=0.45,
         events=[(word(99, 'terraced'), 'point-board'), (word(101.5, 'Scotland'), 'thumbs-up')], flip=('point-board',),  # point left, at the houses
         calls=[(word(99, 'terraced'), 'a terraced house', INK, 0.3, 0.29, 96, 0.56), (word(100.8, 'North'), 'North East,', INK, 0.27, 0.375, 76, 0.5),
                (word(101.2, 'Wales'), 'Wales, Scotland', INK, 0.3, 0.45, 76, 0.54)]),
]
t = 0.0
for s in SEGS:  # skip: pauses taken out inside a span (the picture runs on, the voice closes up)
    s.setdefault('skip', [])
    s['T'] = t; s['dur'] = (s['b'] - s['a'] - sum(y - x for x, y in s['skip'])) / SPEED; t += s['dur'] + s['gap']
TOTAL = t
def ot(s, src):
    """a time in the long video -> its time in this Short"""
    gone = sum(min(max(src, x), y) - x for x, y in s['skip'])
    return s['T'] + (src - s['a'] - gone) / SPEED

def build_audio():
    """each span sped to 1.2x on its own, laid on a continuous bed of the room's tone (a quiet stretch with no gated
    silence, looped with crossfades), 20 ms crossfades at every join, levelled to -14 LUFS in two passes"""
    t0, t1 = 95.2, 95.95
    z = np.r_[0, (X[int(t0 * SR):int(t1 * SR)] == 0).astype(int), 0]; d = np.diff(z)
    assert (np.nonzero(d == -1)[0] - np.nonzero(d == 1)[0]).max(initial=0) < SR // 1000
    tone = X[int(t0 * SR):int(t1 * SR)].astype(np.float64)
    N = int((TOTAL + 0.1) * SR); xf = int(0.03 * SR); ramp = np.linspace(0, 1, xf); bed = np.zeros(N); pos = 0
    while pos < N:
        piece = tone.copy(); piece[:xf] *= ramp; piece[-xf:] *= ramp[::-1]
        n = min(len(piece), N - pos); bed[pos:pos + n] += piece[:n]; pos += len(piece) - xf
    out = bed.copy(); xs = int(0.02 * SR); rs = np.linspace(0, 1, xs)
    wav = f'{LIB}/remotion/public/projects/afford-a-home-uk/voiceover.wav'
    for i, s in enumerate(SEGS):
        keep, x0 = [], s['a']
        for x, y in s['skip']: keep.append((x0, x)); x0 = y
        keep.append((x0, s['b']))
        g = ';'.join(f"[0:a]atrim={x:.3f}:{y:.3f},asetpts=PTS-STARTPTS[p{j}]" for j, (x, y) in enumerate(keep))
        g += ';' + ''.join(f'[p{j}]' for j in range(len(keep))) + f"concat=n={len(keep)}:v=0:a=1,atempo={SPEED}[o]"
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', wav, '-filter_complex', g, '-map', '[o]',
                              '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'], capture_output=True, check=True).stdout
        seg = np.frombuffer(raw, np.int16).astype(np.float64)
        w = np.ones(len(seg)); w[:xs] = rs; w[-xs:] = rs[::-1]
        p = int(s['T'] * SR); n = min(len(seg), N - p)
        if i and SEGS[i - 1]['gap'] == 0:  # a join inside running speech: overlap the two edges instead of dipping to room tone
            out[p:p + n] = out[p:p + n] * (1 - w[:n]) + seg[:n] * w[:n]
        else:
            out[p:p + n] = seg[:n] * w[:n] + bed[p:p + n] * (1 - w[:n])
    _wav.write('short25-raw.wav', SR, out.astype(np.int16))
    err = subprocess.run(['ffmpeg', '-nostats', '-i', 'short25-raw.wav', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    m = json.loads(err[err.rindex('{'):err.rindex('}') + 1])
    ln = (f"loudnorm=I=-14:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
          f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', 'short25-raw.wav', '-af', ln, '-ar', '48000', '-ac', '1', 'short25-voice.wav'], check=True)

class Room:
    """a vertical slice of a drawn room (its full height, 9:16 wide, centred at cx), lightened, three boil frames"""
    def __init__(self, name, cx):
        im = Image.open(f'{LIB}/remotion/public/backgrounds/{name}.png').convert('RGB')
        bw = round(im.height * W / H); x0 = min(max(0, round(cx * im.width - bw / 2)), im.width - bw)
        im = im.crop((x0, 0, x0 + bw, im.height)).resize((W, H), Image.LANCZOS)
        a = np.array(im, np.float32); a = PAPER - (PAPER - a) * 0.72
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32); self.boils = []
        for v in range(3):
            r = np.random.default_rng(100 + v)
            dx = ndimage.zoom(ndimage.gaussian_filter(r.normal(size=(H // 24, W // 24)), 1.5), 24, order=1)[:H, :W]
            dy = ndimage.zoom(ndimage.gaussian_filter(r.normal(size=(H // 24, W // 24)), 1.5), 24, order=1)[:H, :W]
            dx *= 1.6 / (np.abs(dx).max() + 1e-6); dy *= 1.6 / (np.abs(dy).max() + 1e-6)
            out = np.stack([ndimage.map_coordinates(a[..., c], [yy + dy, xx + dx], order=1, mode='nearest') for c in range(3)], -1)
            self.boils.append(Image.fromarray(out.clip(0, 255).astype(np.uint8)).convert('RGBA'))
    def frame(self, k): return self.boils[k % 3].copy()

def footage(seg):
    """the clip's frames at its own speed, 1080x1920, cover-cropped (a landscape clip keeps the band at fx)"""
    e = FOOT[seg['clip']]; fx, fy, z = seg.get('fx', 0.5), seg.get('fy', 0.5), seg.get('zoom', 1.0); d = f"vframes-{seg['clip']}-{seg['off']}-{fx}-{z}-{fy}"
    if not os.path.isdir(d):
        os.makedirs(d)
        n = math.ceil((seg['dur'] + seg['gap']) * FPS) + 2
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(seg['off']), '-i', f"{LIB}/library/footage/{e['file']}",
                        '-frames:v', str(n), '-vf', f'fps={FPS},scale={round(W * z / 2) * 2}:{round(H * z / 2) * 2}:force_original_aspect_ratio=increase,'
                        f'crop={W}:{H}:(iw-{W})*{fx}:(ih-{H})*{fy},eq=saturation=0.92,tpad=stop_mode=clone:stop_duration=5',
                        '-q:v', '3', f'{d}/%04d.jpg'], check=True)
    return sorted(os.listdir(d)), d

def fit_card(f, txt, col, cx, cy, size, maxw, age, tilt):
    """a card, its type made smaller until the card fits maxw of the width"""
    d0 = ImageDraw.Draw(Image.new('RGB', (1, 1)))
    while size > 40:
        l, _, r, _ = d0.textbbox((0, 0), txt, font=brush(size))
        if r - l + 76 <= maxw * W: break
        size -= 4
    cx = min(max(cx, (r - l + 90) / 2 / W), 1 - (r - l + 90) / 2 / W)
    card(f, txt, col, cx, cy, size, age, tilt)

def title(f):
    """the Short's question, pinned at the top for the whole Short"""
    fnt = brush(66); d = ImageDraw.Draw(f); l, t, r, b = d.textbbox((0, 0), TITLE, font=fnt); w = r - l
    x, y = W / 2 - w / 2, H * 0.085
    d.rounded_rectangle((x - 30, y - 10, x + w + 30, y + b - t + 26), 20, fill=(26, 23, 20, 235))
    d.text((x - l, y + 8 - t), TITLE, font=fnt, fill=(255, 255, 255, 255))

# captions: up to three words, the word being said swiped with the marker, high in the frame (clear of his head and
# of the Shorts buttons at the foot of the screen)
CHUNKS = []
for s in SEGS:
    ws = [dict(w, s=ot(s, max(w['s'], s['a'])), e=ot(s, w['e'])) for w in WORDS if w['e'] > s['a'] + 0.1 and w['e'] <= s['b'] + 0.05]
    cur = []
    for w in ws:
        cur.append(w)
        if len(cur) >= 3 or w['w'][-1] in '.,?!':
            CHUNKS.append(cur); cur = []
    if cur: CHUNKS.append(cur)
def captions(f, t):
    ch = next((c for c in CHUNKS if c[0]['s'] - 0.05 <= t <= c[-1]['e'] + 0.2), None)
    if not ch: return
    fnt = bold(70); d = ImageDraw.Draw(f)
    widths = [d.textlength(w['w'], font=fnt) for w in ch]; gap = 18
    total = sum(widths) + gap * (len(ch) - 1); x = W / 2 - total / 2; y = H * 0.19
    d.rounded_rectangle((x - 30, y - 52, x + total + 30, y + 48), 24, fill=(255, 255, 255, 240))
    for w, wd in zip(ch, widths):
        if w['s'] - 0.03 <= t <= w['e'] + 0.08: d.rounded_rectangle((x - 8, y - 42, x + wd + 8, y + 38), 10, fill=MARK)
        d.text((x, y), w['w'], font=fnt, fill=INK, anchor='lm'); x += wd + gap

HAPPY = {'thumbs-up', 'fist-pump', 'arms-up', 'welcome', 'idea'}
def render_seg(s, rooms):
    n = round((s['dur'] + s['gap']) * FPS); frames = []
    if s['kind'] == 'broll':
        names, d = footage(s)
    else:
        room = rooms[s['room']]; h = s['h'] * H; X0, Y = s['x'] * W, s['floor'] * H
        step = 161 / 418 * h / 3; ins = 0
        if s.get('walk_in') is not None: ins = max(1, round(abs(X0 - s['walk_in'] * W) / step))
        tr = track([(ot(s, t), p) for t, p in s.get('events', [])])
    for i in range(n):
        t = s['T'] + i / FPS; k = int(t * STOP); tq = k / STOP
        if s['kind'] == 'broll':
            f = Image.open(f"{d}/{names[min(i, len(names) - 1)]}").convert('RGBA')
        else:
            f = room.frame(k); jx, jy, jr = jiggle(k); dk = int((t - s['T']) * 8)
            if ins and dk < ins:
                px = s['walk_in'] * W + (X0 - s['walk_in'] * W) * min(1, (dk + 1) / ins)
                im, cx, g = walk(dk, h, flip=s['walk_in'] > s['x'])
                shadow(f, px, Y, h * 0.45); place(f, im, cx, g, px + jx, Y + [0, -4, -2][dk % 3] * h / 400 + jy, rot=jr)
            else:
                cur = [e for e in tr if e[0] <= tq + 1e-6]
                name, kind, at = ('stand', 'key', s['T']) if not cur else (cur[-1][1], cur[-1][2], cur[-1][0])
                if not cur and ins: at, name = s['T'] + ins / 8, 'stand-3q'
                age = (tq - at) * STOP
                flip = (name == 'stand-3q' and s.get('walk_in', 1) < s['x'])  # drawn facing left
                flip = flip or name.startswith(s.get('flip', ('-',)))  # poses this scene mirrors (in-betweens too)
                im, fx, fy = pose(name, h, flip=flip)
                sx, sy = (1, 1) if kind == 'ib' else squash(age); lift = 0
                if kind == 'key' and name in HAPPY and age < 8: lift = h * 0.06 * math.sin(math.pi * age / 8)
                shadow(f, X0, Y, h * 0.45, lift); place(f, im, fx, fy, X0 + jx, Y - lift + jy, sx, sy, jr)
            for pt, pn, ps, ppx, ppy, rot in s.get('pops', []):
                pt = ot(s, pt)
                if tq >= pt:
                    pim = prop(pn, round(ps * H)); sx, sy = squash((tq - pt) * STOP); pj = jiggle(k, 5)
                    place(f, pim, pim.width / 2, pim.height, ppx * W + pj[0], ppy * H + pim.height / 2 + pj[1], sx, sy, rot + pj[2] * 2)
        # the push-in with a slight pan right (on the stop-motion clock in the drawn rooms)
        p = ((tq if s['kind'] == 'set' else t) - s['T']) / (n / FPS); p = min(max(p, 0), 1)
        amount = min(0.08, 0.04 + s['dur'] * 0.006)
        z = 1 + amount * (p * (2 - p) * 0.6 + p * 0.4); pan = (z - 1) * (W / 2) * 0.3
        big = f.resize((round(W * z), round(H * z)), Image.BILINEAR)
        L, T = min(max(0, (z - 1) * W / 2 + pan), big.width - W), min(max(0, (z - 1) * H * 0.5), big.height - H)
        g = big.crop((round(L), round(T), round(L) + W, round(T) + H)).convert('RGBA')
        clock = tq if s['kind'] == 'set' else t; rate = STOP if s['kind'] == 'set' else FPS / 2.5
        for ct, txt, col, cx, cy, size, maxw in s.get('calls', []):
            tilt = (-2 if cx < 0.45 else 1.5) + (jiggle(k, 9)[2] if s['kind'] == 'set' else 0)
            fit_card(g, txt, col, cx, cy, size, maxw, (clock - ot(s, ct)) * rate, tilt)
        title(g); captions(g, t)
        frames.append(g.convert('RGB'))
    return frames

if __name__ == '__main__':
    for s in SEGS: print(s['kind'], s.get('room', s.get('clip')), s['a'], s['b'], 'T', round(s['T'], 2), 'dur', round(s['dur'], 2))
    print('TOTAL', round(TOTAL, 2))
    build_audio()
    rooms = {s['room']: Room(s['room'], s['cx']) for s in SEGS if s['kind'] == 'set'}
    os.makedirs('sout', exist_ok=True); idx = 0; last = None; SLIDE = 6
    for si, s in enumerate(SEGS):
        fr = render_seg(s, rooms)
        if last is not None:  # the next page slides over the last frame
            for j in range(min(SLIDE, len(fr))):
                q = (j - j % 2 + 2) / SLIDE; x = round(W * (1 - q) ** 3)
                g = last.copy(); g.paste(fr[j], (x, 0)); ImageDraw.Draw(g).line([(x, 0), (x, H)], fill=INK, width=5); fr[j] = g
        for f in fr:
            f.save(f'sout/{idx:05d}.jpg', quality=93); idx += 1
        last = fr[-1]; print('segment', si + 1, 'frames', len(fr), flush=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-framerate', str(FPS), '-i', 'sout/%05d.jpg', '-i', 'short25-voice.wav', '-c:v', 'libx264', '-crf', '19',
                    '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', 'short25.mp4'], check=True)
    print('total', idx, 'frames')
