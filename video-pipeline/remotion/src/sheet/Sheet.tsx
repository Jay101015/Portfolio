import React from 'react';
import {AbsoluteFill, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import '../fonts';

// "One sheet, 25 to 67": retire-a-millionaire-uk as a single chart on a plain page. The camera travels over it and
// never cuts to a fresh page; every figure is a mark on the chart with its label attached. No boards, no cards, no
// doodles, no sound effects. Times are the made voice's word times (storyboard.json, timing: exact).

const INK = '#14213d';
const GREEN = '#1a8f55';
const GREENLT = '#bfe6cf';
const RED = '#c8372d';
const PAPER = '#f7f4ea';
const MARK = '#ffd84d';
const SOFT = '#e9edf5';
const GREY = '#8a93a6';
const NUM = 'Fraunces';
const TXT = 'Inter';

// world: 100 px a year, 1600 px a million
const X = (age: number) => 400 + (age - 25) * 100;
const Y = (v: number) => 2200 - (v / 1e6) * 1600;
const BASE = 3010; // the "a month" bars stand here
const BAR = 0.38; // px per pound a month
const BW = 70; // bar width
const pot = (age: number, monthly = 329, from = 25, rate = 0.07, start = 0) => {
  const r = rate / 12;
  const n = Math.max(0, (age - from) * 12);
  return start * Math.pow(1 + r, n) + (monthly * (Math.pow(1 + r, n) - 1)) / r;
};
const line = (fn: (a: number) => number, from: number, to: number, step = 0.5) => {
  const pts: string[] = [];
  for (let a = from; a < to - 1e-6; a += step) pts.push(`${X(a).toFixed(1)},${Y(fn(a)).toFixed(1)}`);
  pts.push(`${X(to).toFixed(1)},${Y(fn(to)).toFixed(1)}`);
  return pts;
};
const P = (pts: string[]) => 'M' + pts.join(' L');
const main = line((a) => pot(a), 25, 67);
const fee = line((a) => pot(a, 329, 25, 0.06), 25, 67);
const from35 = line((a) => pot(a, 700, 35), 35, 67);
const from45 = line((a) => pot(a, 1601, 45), 45, 67);
const half45 = line((a) => pot(a, 800, 45), 45, 67);
const real = line((a) => pot(a) / Math.pow(1.02, a - 25), 25, 67);
const mine = line((a) => pot(a, 500, 27, 0.07, 4000), 27, 67);
// the same pot as a real market draws it: it wobbles, and it drops
const bumpy = (a: number) => pot(a) * (1 + 0.1 * Math.sin(a * 2.1) + 0.07 * Math.sin(a * 5.3 + 1) - 0.22 * Math.exp(-Math.pow((a - 44) / 1.6, 2)) - 0.25 * Math.exp(-Math.pow((a - 58) / 1.8, 2)));
const jag = line(bumpy, 25, 67, 0.25);
const bust = `M${X(22)},${Y(0)} L${X(22.6)},${Y(22000)} L${X(23.1)},${Y(15000)} L${X(23.7)},${Y(46000)} L${X(24.1)},${Y(38000)} L${X(24.5)},${Y(60000)}`;
const bustDrop = `M${X(24.5)},${Y(60000)} L${X(24.8)},${Y(21000)} L${X(25.0)},${Y(26000)} L${X(25.4)},${Y(0)}`;

const ease = (p: number) => (p <= 0 ? 0 : p >= 1 ? 1 : p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const span = (t: number, a: number, b: number) => ease((t - a) / (b - a));
const out = (p: number) => (p <= 0 ? 0 : p >= 1 ? 1 : 1 - Math.pow(1 - p, 3));
const pop = (t: number, at: number, d = 0.35) => {
  const p = (t - at) / d;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  return 1 + 0.18 * Math.sin(p * Math.PI) * (1 - p) - Math.pow(1 - p, 3);
};
const vis = (t: number, a: number, b = 1e9, f = 0.4) => out((t - a) / f) * (1 - out((t - b) / f));
const count = (t: number, at: number, d: number, n: number) => (t < at ? n : t > at + d ? n : Math.round(n * out((t - at) / d)));
const money = (n: number) => '£' + Math.round(n).toLocaleString('en-GB');

// the camera: where it looks (world) and how close. It holds on a key until the next one starts moving.
type Pose = {cx: number; cy: number; s: number};
type Key = {t: number; d: number} & (Pose | {ride: [number, number]; dy: number; s: number});
const WIDE: Pose = {cx: 2500, cy: 1640, s: 0.315};
const BARS: Pose = {cx: X(37.5), cy: 2640, s: 0.62};
const KEYS: Key[] = [
  {t: 0, d: 0, ...WIDE},
  {t: 3.0, d: 1.5, cx: 560, cy: 2948, s: 3.5}, // "you need about £329": down to the bar at 25
  {t: 7.4, d: 2.4, cx: 527, cy: 2948, s: 4.1}, // "the bit nobody tells you": closer
  {t: 13.1, d: 2.9, ride: [29, 63], dy: -260, s: 0.9}, // "a million sounds like a lottery number": ride the line up
  {t: 19.2, d: 1.6, ...WIDE}, // "when you break it down": the whole sheet
  {t: 41.3, d: 2.2, cx: X(47), cy: 1560, s: 0.6}, // "7% a year"
  {t: 51.6, d: 1.6, ...BARS}, // 25, 35, 45
  {t: 73.0, d: 2.2, cx: 3150, cy: 1500, s: 0.47}, // what goes in, what grows
  {t: 86.8, d: 1.8, cx: X(33), cy: 2020, s: 0.95}, // the first hundred grand
  {t: 94.6, d: 2.6, ride: [40, 65.2], dy: -40, s: 1.25}, // up to the last one
  {t: 101.4, d: 2.0, ...WIDE},
  {t: 107.2, d: 2.2, cx: X(74), cy: 1000, s: 0.5}, // what a million pays, after 67
  {t: 120.9, d: 2.4, cx: 640, cy: 2940, s: 3.2}, // "still a lot when you're 25"
  {t: 127.6, d: 1.6, cx: 437, cy: 2948, s: 5.4}, // who pays
  {t: 156.2, d: 1.6, cx: 500, cy: 2940, s: 4.4}, // the match
  {t: 168.4, d: 2.2, cx: X(46), cy: 2700, s: 0.46}, // start lower: the staircase
  {t: 183.6, d: 1.6, ...WIDE},
  {t: 185.4, d: 1.8, cx: X(34), cy: 2880, s: 0.95}, // "you never see the money"
  {t: 193.9, d: 2.0, cx: 1650, cy: 800, s: 0.85}, // the ISA page
  {t: 208.9, d: 2.0, cx: X(44), cy: 1700, s: 0.62}, // one cheap tracker
  {t: 219.4, d: 2.0, cx: X(42), cy: 1750, s: 0.48}, // not 25
  {t: 228.2, d: 1.8, cx: X(52), cy: 2250, s: 0.42},
  {t: 240.9, d: 1.8, cx: 5600, cy: 600, s: 1.15}, // the State Pension page
  {t: 253.9, d: 2.0, cx: X(68), cy: 1250, s: 0.46},
  {t: 264.3, d: 1.8, ...WIDE}, // the bit that ruins it
  {t: 276.4, d: 2.0, cx: X(64.5), cy: 900, s: 0.82},
  {t: 285.4, d: 2.4, cx: X(30.2), cy: Y(24000) - 12, s: 4.2}, // at 30 the two lines look the same
  {t: 290.6, d: 2.6, cx: X(52), cy: 1300, s: 0.48},
  {t: 295.7, d: 1.8, cx: X(48), cy: 1420, s: 0.72}, // his fund, and the bumpy line
  {t: 308.2, d: 2.0, cx: X(27.5), cy: 2160, s: 2.5}, // once a month, not every day
  {t: 319.2, d: 2.0, ...WIDE}, // the whole thing
  {t: 334.2, d: 1.8, cx: X(63.5), cy: 1150, s: 0.6}, // in today's money
  {t: 351.2, d: 2.0, cx: X(24.6), cy: 2030, s: 1.5}, // mine: started at 22
  {t: 366.2, d: 1.8, cx: X(26), cy: 2560, s: 0.85}, // 27 now, £500 a month
  {t: 382.4, d: 2.2, cx: 2400, cy: 1500, s: 0.285}, // where that goes
  {t: 392.3, d: 1.8, cx: X(61), cy: 480, s: 0.8}, // crossing a million at 63
  {t: 396.6, d: 2.2, cx: X(24.6), cy: 2030, s: 1.5}, // what I did at 22
  {t: 402.3, d: 2.0, ...WIDE},
  {t: 419.6, d: 2.4, cx: -1700, cy: 1000, s: 0.62}, // the end screen, on the clear side of the sheet
];
const poseOf = (k: Key, p: number): Pose => {
  if ('ride' in k) {
    const age = k.ride[0] + (k.ride[1] - k.ride[0]) * p;
    return {cx: X(age), cy: Y(pot(age)) + k.dy, s: k.s};
  }
  return {cx: k.cx, cy: k.cy, s: k.s};
};
const camera = (t: number): Pose => {
  let c = poseOf(KEYS[0], 1);
  for (const k of KEYS.slice(1)) {
    if (t <= k.t) break;
    const p = span(t, k.t, k.t + k.d);
    if ('ride' in k) {
      // join the line in the first 0.7 s, then stay on it
      const on = span(t, k.t, k.t + 0.7);
      const r = poseOf(k, p);
      c = {cx: c.cx + (r.cx - c.cx) * on, cy: c.cy + (r.cy - c.cy) * on, s: Math.exp(Math.log(c.s) + (Math.log(r.s) - Math.log(c.s)) * on)};
    } else {
      const far = Math.hypot(k.cx - c.cx, k.cy - c.cy) * Math.min(c.s, k.s) > 1500 ? 1 - 0.3 * Math.sin(p * Math.PI) : 1;
      c = {cx: c.cx + (k.cx - c.cx) * p, cy: c.cy + (k.cy - c.cy) * p, s: Math.exp(Math.log(c.s) + (Math.log(k.s) - Math.log(c.s)) * p) * far};
    }
  }
  return c;
};

type LabelT = {x: number; y: number; t: number; text: string; fn?: (t: number) => string; size?: number; color?: string; font?: string; weight?: number; italic?: boolean; dx?: number; dy?: number; align?: 'left' | 'right' | 'center'; until?: number; bg?: boolean};

// a label keeps its size on screen whatever the camera does, and stays pinned to its mark on the sheet
const Label: React.FC<{l: LabelT; t: number; cam: Pose; w: number; h: number}> = ({l, t, cam, w, h}) => {
  if (t < l.t || (l.until !== undefined && t > l.until + 0.3)) return null;
  const sx = (l.x - cam.cx) * cam.s + w / 2 + (l.dx ?? 0);
  const sy = (l.y - cam.cy) * cam.s + h / 2 + (l.dy ?? 0);
  if (sx < -900 || sx > w + 900 || sy < -200 || sy > h + 200) return null;
  const a = out((t - l.t) / 0.3) * (l.until !== undefined ? 1 - span(t, l.until, l.until + 0.3) : 1);
  const tx = l.align === 'right' ? '-100%' : l.align === 'center' ? '-50%' : '0';
  return (
    <div style={{position: 'absolute', left: sx, top: sy, transform: `translate(${tx}, -50%) scale(${0.9 + 0.1 * pop(t, l.t)})`, transformOrigin: l.align === 'right' ? 'right center' : l.align === 'center' ? 'center' : 'left center', opacity: a, whiteSpace: 'nowrap', fontFamily: l.font ?? TXT, fontWeight: l.weight ?? 700, fontStyle: l.italic ? 'italic' : 'normal', fontSize: l.size ?? 52, color: l.color ?? INK, lineHeight: 1, letterSpacing: (l.font ?? TXT) === NUM ? -1 : 0, background: l.bg ? PAPER : 'transparent', padding: l.bg ? '6px 14px' : 0, borderRadius: 8}}>
      {l.fn ? l.fn(t) : l.text}
    </div>
  );
};
const N = (x: number, y: number, t: number, text: string, o: Partial<LabelT> = {}): LabelT => ({x, y, t, text, font: NUM, weight: 900, size: 84, ...o});
const T = (x: number, y: number, t: number, text: string, o: Partial<LabelT> = {}): LabelT => ({x, y, t, text, ...o});

const Pin: React.FC<{x: number; y: number; t: number; at: number; until?: number; n: number | string; s: number}> = ({x, y, t, at, until = 1e9, n, s}) => {
  if (t < at || t > until + 0.4) return null;
  const p = pop(t, at, 0.45) * (1 - out((t - until) / 0.3));
  const drop = (1 - out((t - at) / 0.3)) * -160;
  const k = 1 / s; // pins keep their size on screen too
  return (
    <g transform={`translate(${x}, ${y + drop * k}) scale(${k * p})`}>
      <ellipse cx={0} cy={2} rx={16} ry={5} fill="#00000022" />
      <path d="M0,0 C-10,-26 -30,-40 -30,-64 A30,30 0 1 1 30,-64 C30,-40 10,-26 0,0 Z" fill={MARK} stroke={INK} strokeWidth={5} strokeLinejoin="round" />
      <text x={0} y={-52} textAnchor="middle" fontFamily={NUM} fontWeight={900} fontSize={34} fill={INK}>{n}</text>
    </g>
  );
};

// a solid line that draws itself
const Draw: React.FC<{d: string; p: number; color?: string; w: number; o?: number}> = ({d, p, color = INK, w, o = 1}) =>
  p <= 0 || o <= 0 ? null : <path d={d} pathLength={1} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={1} strokeDashoffset={1 - Math.min(1, p)} opacity={o} />;

const Flag: React.FC<{x: number; y: number; t: number; px: (n: number) => number; color?: string; k?: number}> = ({x, y, t, px, color = MARK, k = 1}) =>
  k <= 0 ? null : (
    <g transform={`translate(${x}, ${y}) scale(${k})`}>
      <line x1={0} y1={0} x2={0} y2={-260} stroke={INK} strokeWidth={px(6) / k} strokeLinecap="round" />
      <path d="M0,-260 L-210,-205 L0,-150 Z" fill={color} stroke={INK} strokeWidth={px(5) / k} strokeLinejoin="round" transform={`skewY(${Math.sin(t * 3.2) * 4})`} />
      <circle r={px(9) / k} fill={INK} />
    </g>
  );

// a real page or clip taped onto the sheet: it sits in the world like any other mark
const Tape: React.FC<{x: number; y: number; w: number; h: number; t: number; at: number; until?: number; cam: Pose; W: number; H: number; rot?: number; children: React.ReactNode}> = ({x, y, w, h, t, at, until = 1e9, cam, W, H, rot = -1.2, children}) => {
  if (t < at - 0.1 || t > until + 0.5) return null;
  const a = vis(t, at, until);
  const sx = (x - cam.cx) * cam.s + W / 2;
  const sy = (y - cam.cy) * cam.s + H / 2;
  return (
    <div style={{position: 'absolute', left: sx, top: sy, width: w * cam.s, height: h * cam.s, opacity: a, transform: `rotate(${rot}deg) scale(${0.96 + 0.04 * out((t - at) / 0.5)})`, boxShadow: `0 ${10 * cam.s}px ${30 * cam.s}px rgba(20,33,61,0.22)`, border: `${Math.max(2, 5 * cam.s)}px solid ${INK}`, background: '#fff'}}>
      <div style={{position: 'absolute', inset: 0, overflow: 'hidden'}}>{children}</div>
      <div style={{position: 'absolute', left: '42%', top: -22 * cam.s, width: '16%', height: 44 * cam.s, background: MARK, opacity: 0.85, transform: 'rotate(-2deg)'}} />
    </div>
  );
};

const ISA = {x: 650, y: 366, w: 1400, h: 788};
const SP = {x: 4900, y: 180, w: 1400, h: 788};
const PHONE = {x: 2250, y: 740, w: 640, h: 877};
const END = {x: -1700, y: 1000};

export const Sheet: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, width: w, height: h} = useVideoConfig();
  const t = frame / fps;
  const cam = camera(t);
  const tr = `translate(${w / 2 - cam.cx * cam.s}, ${h / 2 - cam.cy * cam.s}) scale(${cam.s})`;
  const px = (n: number) => n / cam.s; // a stroke that keeps its weight on screen

  // ---- the monthly bar at 25 and who pays it (pounds a month, bottom to top) ----
  const segs = [
    {k: 'you96', v: 96, mine: true},
    {k: 'emp72', v: 72, mine: false},
    {k: 'tax24', v: 24, mine: false},
    {k: 'you110', v: 110, mine: true},
    {k: 'tax27', v: 27, mine: false},
  ];
  const payer = [0, 1, 2, 3, 4]; // the order he says them in
  const grouped = [0, 3, 1, 2, 4]; // yours at the bottom, the rest on top
  const g = 1 - span(t, 128.2, 129.6) + span(t, 147.0, 148.6); // 1 = grouped, 0 = payer order
  const yOf = (order: number[], i: number) => order.slice(0, order.indexOf(i)).reduce((a, j) => a + segs[j].v, 0) * BAR;
  const segY = (i: number) => BASE - (yOf(payer, i) * (1 - g) + yOf(grouped, i) * g) - segs[i].v * BAR;
  const green = t < 100 ? span(t, 9.85, 10.5) : 1;
  const lift = t < 100 ? span(t, 11.5, 12.3) * 4 * (1 - span(t, 38, 39)) : 0;
  const gapOn = (i: number) => (i < 3 ? 1 : i === 3 ? (t < 129 ? 1 : span(t, 142.6, 143.4)) : t < 129 ? 1 : span(t, 145.2, 146.0)); // the top-up arrives later
  const match = span(t, 161.6, 163.4) * (1 - span(t, 167.6, 168.4)); // "if your employer matches more when you put in more"
  const barH = 329 * BAR;

  const draw = span(t, -0.2, 1.7);
  const debits = (i: number) => out((t - (20.9 + i * 0.042)) / 0.25) * (1 - span(t, 38.6, 39.6));
  const area = span(t, 23.4, 24.6);
  const wedge = span(t, 24.5, 25.3);
  const teaseFee = span(t, 33.4, 35.4) * (1 - span(t, 39.5, 40.5));
  const feeP = t < 200 ? 0 : span(t, 268.6, 276.0);
  const balls = [7, 14, 23, 31, 42];
  const stairOn = vis(t, 175.8, 218.6) + vis(t, 318.6, 350);
  const lateOn = vis(t, 56.4, 73.2) + vis(t, 219.2, 264.0); // the 35 and 45 lines
  const bumpyP = span(t, 49.5, 51.6) * (1 - span(t, 51.8, 52.6)) + (t > 290 ? span(t, 299.6, 304.6) : 0);
  const realP = t > 300 ? span(t, 337.0, 343.4) : 0;
  const mineP = span(t, 383.6, 390.6);
  const areaO = t < 264 ? 1 : 1 - span(t, 264.2, 265.4) * (1 - span(t, 318.8, 320)) - span(t, 351, 352);

  const ages = [25, 30, 35, 40, 45, 50, 55, 60, 65, 67];
  const L: LabelT[] = [
    // ---- 0:00 the opening: frame one carries both numbers; the line between them draws as he talks ----
    N(X(67), Y(1e6), -1, '£1 million', {size: 150, dx: -70, dy: -110, align: 'right', until: 13.0}),
    N(X(25) + BW / 2, BASE - barH / 2, -1, '£329 a month', {fn: (tt) => `£${count(tt, 4.3, 0.8, 329)} a month`, size: 120, dx: 44, until: 12.9}),
    N(X(25), 2200, 2.85, 'start at 25', {italic: true, weight: 400, size: 50, dx: 22, dy: -44, until: 3.2}),
    T(X(25), BASE - barH - 46, 6.0, 'going in, every month', {size: 54, dx: 44, until: 9.4, weight: 600}),
    N(X(25) + BW / 2, BASE - barH + 28, 9.9, '£123 of it', {fn: (tt) => `£${count(tt, 9.85, 0.6, 123)} of it`, size: 110, color: GREEN, dx: 44, dy: -150, until: 13.0}),
    T(X(25) + BW / 2, BASE - barH + 28, 11.9, 'not from your pocket', {size: 60, color: GREEN, dx: 48, dy: -60, until: 13.0}),
    N(X(67), Y(1e6), 15.2, '£1 million', {size: 150, dx: -70, dy: -110, align: 'right', until: 382.6}),
    N(X(67), Y(1e6), 16.0, 'a lottery number?', {italic: true, weight: 400, size: 64, dx: -700, dy: 440, until: 19.3}),
    T(X(46), BASE + 70, 21.0, 'a direct debit, every month', {size: 42, align: 'center', dy: -150, until: 22.2, weight: 600}),
    N(X(46), 2200, 22.6, '42 years', {size: 54, align: 'center', dy: 104, until: 26.0}),
    N(X(60), Y(360000), 24.2, 'growth', {color: GREEN, align: 'center', dy: 40, until: 26.2}),
    T(X(60), Y(62000), 24.9, 'what goes in', {size: 38, align: 'center', until: 26.2}),
    T(X(25) + BW / 2, BASE - barH / 2, 27.5, 'who pays the rest', {size: 56, dx: 60, dy: -50, bg: true, until: 40.2}),
    T(X(35), 2200, 30.7, 'starting at 35', {align: 'center', dy: -128, until: 40.2}),
    T(X(45), 2200, 31.5, 'or 45', {align: 'center', dy: -128, dx: -40, until: 40.2}),
    N(X(62.5), Y(300000), 34.5, '−£250,000', {color: RED, align: 'center', bg: true, until: 40.2}),
    T(X(27), Y(pot(27)), 37.75, 'where I am', {dx: -60, dy: -210, until: 40.2}),
    // ---- 0:41 the number: 7% a year ----
    N(X(51), Y(pot(51)), 45.4, '7% a year', {size: 110, align: 'right', dx: -70, dy: -80, until: 51.4}),
    T(X(51), Y(pot(51)), 47.0, 'roughly what a global tracker has done', {size: 44, align: 'right', dx: -70, dy: 10, until: 51.4, weight: 600}),
    T(X(57), Y(bumpy(58)), 49.9, 'not a promise', {size: 52, color: RED, dx: 40, dy: 110, until: 51.6}),
    // ---- 0:52 start at 25, 35, 45 ----
    N(X(25), BASE - barH, 53.0, '£329', {align: 'center', dy: -56, until: 73.2, size: 70}),
    N(X(35), BASE - 700 * BAR, 58.2, '£700', {fn: (tt) => money(count(tt, 58.1, 0.7, 700)), align: 'center', dy: -56, until: 73.2, size: 70}),
    N(X(45), BASE - 1601 * BAR, 61.6, '£1,601', {fn: (tt) => money(count(tt, 61.4, 0.9, 1601)), align: 'center', dy: -56, until: 73.2, size: 70}),
    T(X(45), BASE - 1601 * BAR, 62.6, 'a month', {size: 40, dx: 150, dy: -52, until: 73.2, weight: 600}),
    N(X(30), BASE - 520 * BAR, 65.6, '×2', {size: 64, align: 'center', dy: -70, until: 73.0, color: RED}),
    N(X(40), BASE - 1150 * BAR, 66.4, '×2', {size: 64, align: 'center', dy: -70, until: 73.0, color: RED}),
    T(X(25), 2200, 71.4, 'early beats clever', {size: 60, dx: -30, dy: -150, until: 73.2}),
    // ---- 1:13 what goes in, what grows ----
    N(X(58), Y(52000), 78.8, '£166,000 goes in', {fn: (tt) => `${money(count(tt, 78.8, 0.8, 166000))} goes in`, size: 58, align: 'center', dy: 4, until: 86.6, bg: true}),
    N(X(59), Y(380000), 81.3, '£834,000', {fn: (tt) => money(count(tt, 81.3, 1.0, 834000)), size: 130, color: GREEN, align: 'center', until: 86.6, bg: true}),
    T(X(59), Y(380000), 82.9, 'is growth', {size: 56, color: GREEN, align: 'center', dy: 100, until: 86.6, bg: true}),
    // ---- 1:27 the first and the last hundred grand ----
    N(X(25), Y(100000), 89.6, '£100,000', {size: 56, dx: 12, dy: -44, until: 107.0}),
    N(X(32.3), 2200, 90.9, 'nearly 15 years', {size: 96, align: 'center', dy: 150, until: 94.4}),
    T(X(32.3), 2200, 92.6, 'feels like nothing is happening', {size: 44, align: 'center', dy: 232, until: 94.4, weight: 600}),
    N(X(63), Y(900000), 96.7, '£900,000', {size: 56, align: 'right', dx: -30, dy: -36, until: 101.2}),
    N(X(66.3), Y(950000), 98.8, '17 months', {size: 120, align: 'right', dx: -330, dy: 190, until: 101.2, bg: true}),
    T(X(66.3), Y(950000), 100.0, 'same money going in', {size: 46, align: 'right', dx: -330, dy: 280, until: 101.2, weight: 600, bg: true}),
    N(X(32.3), 2200, 102.6, '15 years', {size: 70, align: 'center', dy: 110, until: 107.0}),
    N(X(66.3), Y(950000), 102.9, '17 months', {size: 70, align: 'right', dx: -40, dy: 60, until: 107.0, bg: true}),
    T(X(40), Y(pot(40)), 104.2, 'slow at the start is normal', {size: 58, align: 'center', dy: -150, until: 107.0}),
    // ---- 1:47 what a million pays ----
    N(X(70), Y(1e6), 111.4, '4% a year', {size: 84, dx: 0, dy: -210, until: 120.6}),
    N(X(70), Y(1e6), 113.3, '£40,000 a year', {fn: (tt) => `${money(count(tt, 113.2, 0.8, 40000))} a year`, size: 110, dx: 0, dy: 250, until: 120.6, color: GREEN}),
    T(X(82), Y(1e6), 115.2, 'and the pot roughly lasts', {size: 48, align: 'center', dy: -60, until: 120.6, weight: 600}),
    T(X(88), Y(1e6), 118.9, 'the catch', {size: 48, align: 'center', dy: -130, until: 120.6}),
    // ---- 2:01 still a lot at 25 ----
    N(X(25) + BW / 2, BASE - barH / 2, 121.7, '£329 a month', {size: 110, dx: 50, until: 127.7}),
    T(X(25) + BW / 2, BASE - barH / 2, 123.6, 'a lot, at 25', {size: 54, dx: 54, dy: 96, until: 127.7, weight: 600}),
    // ---- 2:08 who pays it ----
    T(X(25) - BW / 2, BASE - barH - 18, 129.0, 'on a £35,000 salary', {size: 46, dx: 0, dy: -40, until: 156.0, weight: 600}),
    N(X(25) - BW / 2, BASE - 96 * BAR, 132.5, '£192', {size: 84, align: 'right', dx: -70, until: 146.6}),
    T(X(25) - BW / 2, BASE - 96 * BAR, 132.9, 'workplace pension', {size: 38, align: 'right', dx: -70, dy: 64, until: 146.6, weight: 600}),
    N(X(25) + BW / 2, segY(0) + 48 * BAR, 135.3, 'you: £96', {size: 76, dx: 50, until: 146.6}),
    N(X(25) + BW / 2, segY(1) + 36 * BAR, 138.6, 'your employer: £72', {size: 76, dx: 50, color: GREEN, until: 146.6}),
    N(X(25) + BW / 2, segY(2) + 12 * BAR, 141.0, 'the taxman: £24', {size: 76, dx: 50, color: GREEN, until: 146.6}),
    T(X(25) + BW / 2, segY(3) + 55 * BAR, 142.9, 'your top-up', {size: 50, dx: 50, until: 146.6}),
    T(X(25) + BW / 2, segY(4) + 13 * BAR, 145.4, '+ the taxman again', {size: 50, dx: 50, color: GREEN, until: 146.6}),
    N(X(25) - BW / 2, BASE - barH / 2, 147.7, '£329', {size: 96, align: 'right', dx: -70, until: 156.0}),
    T(X(25) - BW / 2, BASE - barH / 2, 148.0, 'going in', {size: 44, align: 'right', dx: -70, dy: 74, until: 156.0, weight: 600}),
    N(X(25) + BW / 2, BASE - 103 * BAR, 150.1, '£206 from your pay', {fn: (tt) => `${money(count(tt, 150.0, 0.7, 206))} from your pay`, size: 84, dx: 50, until: 156.0}),
    N(X(25) + BW / 2, BASE - 267 * BAR, 153.0, '£123 free', {fn: (tt) => `${money(count(tt, 152.9, 0.6, 123))} free`, size: 100, dx: 50, color: GREEN, until: 156.0}),
    // ---- 2:36 the match ----
    T(X(25) + BW / 2, BASE - 290 * BAR, 158.4, 'start with the pension at work', {size: 60, dx: 60, until: 161.4}),
    N(X(25) + BW / 2, BASE - 150 * BAR, 161.9, 'you put in more', {size: 66, dx: 60, dy: 70, until: 168.0}),
    N(X(25) + BW / 2, BASE - 150 * BAR, 162.6, 'they match it', {size: 66, dx: 60, dy: -40, color: GREEN, until: 168.0}),
    T(X(25) + BW / 2, BASE - 150 * BAR, 164.2, 'take every pound first', {size: 48, dx: 60, dy: -130, until: 168.0, weight: 600}),
    // ---- 2:48 start lower, raise it ----
    N(X(25), BASE - barH, 169.1, '£329', {size: 64, align: 'center', dy: -50, until: 176.0}),
    T(X(25), BASE - barH, 170.6, 'too much right now?', {size: 48, dx: 70, dy: -44, until: 176.0, weight: 600}),
    N(X(46), BASE - 223 * Math.pow(1.03, 21) * BAR, 177.2, '+3% a year', {size: 96, align: 'center', dy: -215, until: 185.0}),
    T(X(46), BASE - 223 * Math.pow(1.03, 21) * BAR, 178.6, 'every pay rise', {size: 46, align: 'center', dy: -140, until: 185.0, weight: 600}),
    N(X(25), BASE - 223 * BAR, 181.4, 'start at £223', {fn: (tt) => `start at ${money(count(tt, 181.3, 0.7, 223))}`, size: 76, dx: -20, dy: -110, until: 193.8}),
    T(X(67), Y(1e6), 184.0, 'same place', {size: 52, align: 'right', dx: -330, dy: -10, until: 185.3}),
    T(X(35), BASE - 223 * Math.pow(1.03, 10) * BAR, 187.3, 'you never see it, so you never miss it', {size: 50, align: 'center', dy: -90, until: 190.4}),
    N(X(35), BASE - 223 * Math.pow(1.03, 10) * BAR, 191.6, '2 minutes to change', {size: 70, align: 'center', dy: -100, until: 193.8}),
    // ---- 3:14 the ISA ----
    T(ISA.x, ISA.y + ISA.h, 196.0, 'Stocks and shares ISA', {size: 56, dy: 70, dx: 10, until: 208.7}),
    T(ISA.x + ISA.w, ISA.y + 200, 198.1, 'nothing on the way in', {size: 46, dx: 40, until: 208.7, weight: 600}),
    N(ISA.x + ISA.w, ISA.y + 330, 199.6, 'no tax on the way out', {size: 52, dx: 40, color: GREEN, until: 208.7}),
    T(ISA.x + ISA.w, ISA.y + 450, 201.8, 'take it when you need it', {size: 46, dx: 40, until: 208.7, weight: 600}),
    // ---- 3:29 one cheap tracker ----
    N(X(46), Y(pot(46)), 213.2, 'one cheap tracker', {size: 84, align: 'right', dx: -40, dy: -150, until: 219.0}),
    T(X(46), Y(pot(46)), 214.0, 'the whole market', {size: 48, align: 'right', dx: -40, dy: -76, until: 219.0, weight: 600}),
    T(X(47), Y(60000), 216.2, 'picking winners: I tried that', {size: 48, dx: 20, dy: 20, until: 219.0, color: RED}),
    // ---- 3:39 not 25 ----
    T(X(35), 2200, 222.6, '35', {size: 60, align: 'center', dy: -130, until: 228.0}),
    T(X(45), 2200, 223.7, 'or 45', {size: 60, align: 'center', dy: -130, until: 228.0}),
    T(X(56), Y(600000), 225.4, '"that\'s me done"', {size: 60, align: 'center', italic: true, font: NUM, weight: 400, until: 228.2}),
    N(X(45), BASE - 800 * BAR, 231.6, '£1,601 a month', {size: 70, dx: -60, dy: 0, align: 'right', until: 240.7}),
    T(X(45), BASE - 800 * BAR, 233.2, 'a lot', {size: 46, dx: -60, dy: 62, align: 'right', until: 240.7, weight: 600}),
    N(X(67), Y(500000), 234.9, '£500,000', {size: 96, dx: 40, dy: -80, until: 264.0}),
    N(X(45) + 110, BASE - 800 * BAR, 236.1, '£800 a month', {fn: (tt) => `${money(count(tt, 236.0, 0.7, 800))} a month`, size: 76, dx: 60, dy: 40, color: INK, until: 240.7}),
    T(X(45) + 110, BASE - 800 * BAR, 239.0, 'part of it not yours', {size: 46, dx: 60, dy: 116, color: GREEN, until: 240.7}),
    // ---- 4:01 the State Pension ----
    T(SP.x, SP.y, 242.0, 'GOV.UK: the new State Pension', {size: 40, dy: -50, dx: 10, until: 253.8, weight: 600}),
    N(SP.x + SP.w / 2, SP.y + SP.h, 248.4, 'about £12,500 a year', {size: 90, align: 'center', dy: 96, color: GREEN, until: 253.8}),
    // ---- 4:14 half a million plus the State Pension ----
    T(X(74), Y(500000), 256.0, '+ the State Pension', {size: 60, color: GREEN, dx: 0, dy: 86, until: 264.0}),
    T(X(74), Y(500000), 258.0, 'still a comfortable retirement', {size: 46, dx: 0, dy: 160, until: 264.0, weight: 600}),
    N(X(56), Y(pot(56, 800, 45)), 260.8, 'a different number, not a fail', {size: 56, align: 'right', dx: -60, dy: -60, until: 264.0}),
    // ---- 4:24 fees ----
    T(X(46), Y(pot(46)), 266.6, 'not a crash', {size: 64, align: 'right', dx: -50, dy: -110, until: 268.4}),
    N(X(46), Y(pot(46)), 268.6, 'fees', {size: 150, align: 'right', dx: -60, dy: -150, color: RED, until: 284.6}),
    T(X(46), Y(pot(46)), 273.3, '1% a year more', {size: 64, align: 'right', dx: -60, dy: -30, color: RED, until: 284.6}),
    N(X(67), Y(746000), 277.9, '£746,000', {fn: (tt) => money(1e6 - (1e6 - 746000) * out((tt - 277.6) / 1.0)), size: 96, dx: 40, dy: 30, until: 284.6}),
    N(X(67), Y(873000), 280.8, '−£254,000', {size: 96, dx: 40, dy: -40, color: RED, until: 284.6}),
    // ---- 4:45 find the fee ----
    T(X(30.2), Y(24000), 288.0, 'at 30 you can barely see it', {size: 60, align: 'center', dy: -220, until: 290.8}),
    N(X(64), Y(873000), 292.0, 'find the fee', {size: 110, align: 'right', dx: -200, dy: -60, until: 295.5}),
    T(X(64), Y(873000), 293.6, 'old workplace pensions, never checked', {size: 44, align: 'right', dx: -200, dy: 30, until: 295.5, weight: 600}),
    // ---- 4:56 the market drops ----
    T(PHONE.x, PHONE.y + 110, 297.0, "an S&P 500 fund's price,", {size: 36, align: 'right', dx: -30, until: 307.8, weight: 600}),
    T(PHONE.x, PHONE.y + 110, 297.0, 'not my balance', {size: 36, align: 'right', dx: -30, dy: 44, until: 307.8, weight: 600}),
    N(X(44), Y(bumpy(44)), 301.0, 'it will drop', {size: 96, color: RED, align: 'center', dy: 70, dx: -160, until: 307.8}),
    T(X(58), Y(bumpy(58)), 302.9, 'more than once', {size: 52, color: RED, align: 'center', dy: 110, until: 307.8}),
    N(X(59.5), Y(pot(59.5)), 305.6, 'stay in', {size: 96, color: GREEN, align: 'right', dx: -60, dy: -90, until: 307.8}),
    // ---- 5:08 don't look ----
    N(X(27.5), 2200, 311.4, 'once a month', {size: 110, color: GREEN, align: 'center', dy: -200, until: 313.4}),
    N(X(27.5), 2200, 313.9, 'every day', {size: 110, color: RED, align: 'center', dy: -200, until: 318.8}),
    T(X(27.5), 2200, 315.7, 'every red day felt like an emergency', {size: 50, color: RED, align: 'center', dy: 150, until: 318.8}),
    // ---- 5:19 the whole thing ----
    T(X(25) + 60, BASE - barH, 321.5, 'employer money first', {size: 52, dx: 40, dy: -70, bg: true, until: 333.7}),
    T(ISA.x + ISA.w / 2, ISA.y + ISA.h, 323.5, 'then an ISA, one cheap tracker', {size: 52, align: 'center', dy: 60, until: 333.7}),
    T(X(63), Y(880000), 325.6, 'check the fee', {size: 52, dx: -60, align: 'right', color: RED, until: 333.7, bg: true}),
    T(X(55), BASE, 327.2, 'put it up when your pay goes up', {size: 52, align: 'center', dy: 56, until: 333.7}),
    T(X(44), Y(bumpy(44)), 328.7, "don't sell when it drops", {size: 52, align: 'center', dy: -130, until: 333.7, bg: true}),
    N(X(46), 2200, 331.6, '40 years of it', {size: 80, align: 'center', dy: 110, until: 333.7, bg: true}),
    // ---- 5:34 today's money ----
    T(X(48), Y(pot(48)), 341.0, 'prices up about 2% a year', {size: 52, align: 'right', dx: -40, dy: -90, until: 350.6, weight: 600}),
    N(X(67), Y(435000), 343.5, '£435,000', {fn: (tt) => money(count(tt, 343.4, 0.9, 435000)), size: 110, dx: 40, dy: 10, until: 350.6}),
    T(X(67), Y(435000), 344.6, "in today's money", {size: 48, dx: 44, dy: 96, until: 350.6, weight: 600}),
    T(X(56), Y(250000), 347.2, 'still a really good retirement', {size: 52, align: 'center', color: GREEN, until: 350.6}),
    // ---- 5:51 mine ----
    N(X(22), 2200, 357.4, '22', {size: 90, align: 'center', dy: 96, until: 366.0}),
    T(X(22), 2200, 357.8, 'I started', {size: 46, align: 'center', dy: 170, until: 366.0, weight: 600}),
    N(X(25.4), Y(0), 359.6, 'bust', {size: 130, color: RED, dx: 40, dy: -150, until: 366.0}),
    T(X(25.4), Y(0), 360.7, 'I lost all of it', {size: 52, color: RED, dx: 44, dy: -50, until: 366.0}),
    T(X(25.4), Y(0), 363.6, 'started again from zero', {size: 48, dx: 44, dy: 120, until: 366.0, weight: 600}),
    N(X(27), 2200, 366.8, '27 now', {size: 84, align: 'center', dy: -170, until: 382.2}),
    N(X(27) + BW / 2, BASE - 250 * BAR, 368.4, '£500 a month', {fn: (tt) => `${money(count(tt, 368.3, 0.7, 500))} a month`, size: 84, dx: 44, until: 382.2}),
    T(X(27) + BW / 2, BASE - 250 * BAR, 370.2, 'into an S&P 500 fund', {size: 44, dx: 46, dy: 80, until: 382.2, weight: 600}),
    N(X(27), Y(4000), 372.2, 'about £4,000 so far', {size: 60, dx: 40, dy: -70, until: 382.2}),
    N(X(20.2), BASE - 500 * BAR, 377.6, '£1,000 a month', {size: 64, align: 'center', dy: -110, until: 382.2, color: GREY}),
    T(X(20.2), BASE - 500 * BAR, 378.8, 'for a house, not this line', {size: 42, align: 'center', dy: -50, until: 382.2, color: GREY, weight: 600}),
    T(X(40), Y(pot(40, 500, 27, 0.07, 4000)), 385.0, 'just the £500, if I keep it up', {size: 52, align: 'right', dx: -40, dy: -110, until: 392.0}),
    N(X(67), Y(1380000), 389.3, '£1.38 million', {size: 130, align: 'right', dx: -260, dy: -60, until: 402.2}),
    T(X(67), Y(1380000), 390.4, 'by 67', {size: 56, align: 'right', dx: -260, dy: 50, until: 402.2}),
    N(X(62.8), Y(1e6), 394.0, 'a million at 63', {size: 90, align: 'right', dx: -70, dy: 30, until: 396.8, bg: true}),
    T(X(24.6), Y(60000), 398.2, "only if I don't do this again", {size: 60, color: RED, dx: 60, dy: -150, until: 402.2}),
    // ---- 6:42 the small print, the comments, the end ----
    T(2500, 2640, 402.9, "I'm not a financial adviser and this isn't advice.", {size: 40, align: 'center', weight: 600, until: 410.6, color: GREY}),
    T(2500, 2640, 404.6, 'Pensions have rules on when you can take the money and how it is taxed: check what applies to you.', {size: 34, align: 'center', weight: 600, until: 410.6, color: GREY, dy: 54}),
    N(X(46), 2200, 412.2, 'what age did you start?', {size: 100, align: 'center', dy: -330, until: 419.6, bg: true}),
    N(END.x, END.y - 430, 421.4, 'The Everyday Investor', {size: 96, align: 'center'}),
    T(END.x, END.y - 290, 422.4, 'Is £1 million enough? It is on screen now', {size: 46, align: 'center', weight: 600}),
  ];

  const stair = Array.from({length: 42}, (_, i) => 223 * Math.pow(1.03, i));
  const commentAges = [19, 31, 24, 44, 38, 52, 28, 61, 35, 47];
  const month = (i: number) => X(27) + (i / 12) * 100;

  return (
    <AbsoluteFill style={{background: PAPER}}>
      <svg width={w} height={h} style={{position: 'absolute', inset: 0}}>
        <defs>
          <pattern id="hatch" width={5} height={5} patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
            <rect width={5} height={5} fill="#d9f0e2" />
            <line x1={0} y1={0} x2={0} y2={5} stroke={GREEN} strokeWidth={2} />
          </pattern>
          <pattern id="hatchBig" width={34} height={34} patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
            <line x1={0} y1={0} x2={0} y2={34} stroke={GREEN} strokeWidth={7} opacity={0.5} />
          </pattern>
          <clipPath id="areaReveal"><rect x={X(25)} y={0} width={(X(67) - X(25)) * area} height={2200} /></clipPath>
          <clipPath id="wedgeReveal"><rect x={X(25)} y={0} width={(X(67) - X(25)) * wedge} height={2200} /></clipPath>
          <clipPath id="teaseFee"><rect x={X(25)} y={0} width={(X(67) - X(25)) * teaseFee + 4} height={2300} /></clipPath>
          <clipPath id="feeReveal"><rect x={X(25)} y={0} width={(X(67) - X(25)) * feeP + 4} height={2300} /></clipPath>
          <clipPath id="realReveal"><rect x={X(25)} y={0} width={(X(67) - X(25)) * realP + 4} height={2300} /></clipPath>
        </defs>
        <g transform={tr}>
          {/* what is under the line: the thin wedge that goes in, and everything else */}
          <g opacity={Math.max(0, areaO)}>
            <g clipPath="url(#areaReveal)">
              <path d={`${P(main)} L${X(67)},2200 L${X(25)},2200 Z`} fill="#d9f0e2" opacity={0.75} />
              <path d={`${P(main)} L${X(67)},2200 L${X(25)},2200 Z`} fill="url(#hatchBig)" />
            </g>
            <g clipPath="url(#wedgeReveal)">
              <path d={`M${X(25)},2200 L${X(67)},${Y(166000)} L${X(67)},2200 Z`} fill={PAPER} stroke={INK} strokeWidth={px(3)} />
            </g>
          </g>

          {/* the age rail; after 67 it runs on, dashed */}
          <line x1={X(25)} y1={2200} x2={X(67) + 60} y2={2200} stroke={INK} strokeWidth={px(5)} strokeLinecap="round" />
          {Array.from({length: 43}, (_, i) => (
            <line key={i} x1={X(25 + i)} y1={2200} x2={X(25 + i)} y2={2200 + ((25 + i) % 5 === 0 || i === 42 ? 34 : 18)} stroke={INK} strokeWidth={px(3)} />
          ))}
          {t > 107 ? <line x1={X(67) + 60} y1={2200} x2={X(67) + 60 + (X(92) - X(67)) * span(t, 107.6, 109.4)} y2={2200} stroke={INK} strokeWidth={px(4)} strokeDasharray={`${px(16)} ${px(12)}`} /> : null}
          {t > 350 ? <line x1={X(25)} y1={2200} x2={X(25) - (X(25) - X(21.4)) * span(t, 351.6, 353.0)} y2={2200} stroke={INK} strokeWidth={px(4)} strokeDasharray={`${px(16)} ${px(12)}`} /> : null}
          {t > 22 && t < 27 ? <path d={`M${X(25)},${2200 + 70} L${X(25)},${2200 + 100} L${X(25) + (X(67) - X(25)) * span(t, 22.4, 23.2)},${2200 + 100} l0,-30`} fill="none" stroke={INK} strokeWidth={px(3.5)} opacity={vis(t, 22.4, 26.0)} /> : null}

          {/* the first £100,000 and the last */}
          {t > 87 && t < 108 ? (
            <g opacity={vis(t, 88.4, 106.8)}>
              <line x1={X(25)} y1={Y(100000)} x2={X(25) + (X(39.6) - X(25)) * span(t, 88.4, 90.2)} y2={Y(100000)} stroke={INK} strokeWidth={px(3)} strokeDasharray={`${px(12)} ${px(10)}`} />
              <path d={`M${X(25)},${2200 + 56} l0,30 L${X(25) + (X(39.6) - X(25)) * span(t, 89.4, 91.2)},${2200 + 86} l0,-30`} fill="none" stroke={INK} strokeWidth={px(5)} />
              {t > 95.6 ? (
                <g>
                  <line x1={X(60)} y1={Y(900000)} x2={X(60) + (X(67) - X(60)) * span(t, 95.8, 97.0)} y2={Y(900000)} stroke={INK} strokeWidth={px(3)} strokeDasharray={`${px(12)} ${px(10)}`} />
                  <line x1={X(60)} y1={Y(1e6)} x2={X(60) + (X(67) - X(60)) * span(t, 96.6, 97.6)} y2={Y(1e6)} stroke={INK} strokeWidth={px(3)} strokeDasharray={`${px(12)} ${px(10)}`} />
                  {t > 98.2 ? <rect x={X(65.6)} y={Y(1e6)} width={(X(67) - X(65.6)) * span(t, 98.2, 99.0)} height={Y(900000) - Y(1e6)} fill={MARK} opacity={0.7} /> : null}
                </g>
              ) : null}
            </g>
          ) : null}

          {/* the line as a real market draws it */}
          {bumpyP > 0 ? <Draw d={P(jag)} p={bumpyP} color={t < 100 ? GREY : RED} w={px(t < 100 ? 4 : 6)} o={t < 100 ? vis(t, 49.5, 51.8) : vis(t, 299.6, 333.8)} /> : null}

          {/* starting at 35 and at 45: steeper lines to the same flag */}
          {lateOn > 0 ? (
            <g opacity={lateOn}>
              <Draw d={P(from35)} p={t < 100 ? span(t, 56.6, 58.4) : 1} w={px(5)} color={GREY} />
              <Draw d={P(from45)} p={t < 100 ? span(t, 59.8, 61.6) : 1} w={px(5)} color={GREY} />
            </g>
          ) : null}
          {t > 233 && t < 265 ? (
            <g opacity={vis(t, 234.4, 264.0)}>
              <Draw d={P(half45)} p={span(t, 234.4, 236.4)} w={px(7)} color={GREEN} />
              <Flag x={X(67)} y={Y(500000)} t={t} px={px} color={GREENLT} k={0.8} />
              {t > 254.6 ? <rect x={X(67)} y={Y(500000) - 4} width={(X(90) - X(67)) * span(t, 254.8, 257.0)} height={150} fill="url(#hatchBig)" /> : null}
              {t > 254.6 ? <line x1={X(67)} y1={Y(500000)} x2={X(67) + (X(90) - X(67)) * span(t, 254.8, 257.0)} y2={Y(500000)} stroke={GREEN} strokeWidth={px(6)} /> : null}
            </g>
          ) : null}

          {/* picking winners */}
          {t > 215.6 && t < 219.4 ? (
            <g opacity={vis(t, 215.6, 219.0)}>
              {[0, 1, 2].map((i) => (
                <Draw key={i} d={`M${X(40)},${Y(pot(40))} l${60 + i * 30},${-120 - i * 60} l70,${150 + i * 40} l60,${-90 + i * 20} l${80 + i * 30},${260 + i * 30} l70,${Y(0) - Y(pot(40)) - 200 - i * 50}`} p={span(t, 215.7 + i * 0.25, 217.2 + i * 0.25)} color={RED} w={px(4)} />
              ))}
            </g>
          ) : null}

          {/* fees: the same money at 1% a year less */}
          {teaseFee > 0 ? (
            <g clipPath="url(#teaseFee)">
              <path d={`${P(main)} L${[...fee].reverse().join(' L')} Z`} fill={RED} opacity={0.2} />
              <path d={P(fee)} fill="none" stroke={RED} strokeWidth={px(7)} strokeLinecap="round" strokeDasharray={`${px(18)} ${px(14)}`} />
            </g>
          ) : null}
          {feeP > 0 && t < 352 ? (
            <g clipPath="url(#feeReveal)" opacity={vis(t, 268.6, 333.8)}>
              <path d={`${P(main)} L${[...fee].reverse().join(' L')} Z`} fill={RED} opacity={0.22} />
              <path d={P(fee)} fill="none" stroke={RED} strokeWidth={px(7)} strokeLinecap="round" />
            </g>
          ) : null}
          {t > 286.4 && t < 291 ? <circle cx={X(30.2)} cy={Y(24000) - 2} r={46 * span(t, 286.6, 287.6)} fill="none" stroke={INK} strokeWidth={px(5)} opacity={vis(t, 286.6, 290.6)} /> : null}

          {/* in today's money */}
          {realP > 0 ? (
            <g opacity={vis(t, 337, 350.8)}>
              <g clipPath="url(#realReveal)"><path d={P(real)} fill="none" stroke={INK} strokeWidth={px(6)} strokeDasharray={`${px(16)} ${px(12)}`} /></g>
              {t > 343 ? <Flag x={X(67)} y={Y(435000)} t={t} px={px} color={SOFT} k={0.8 * pop(t, 343.2)} /> : null}
            </g>
          ) : null}

          {/* the pot */}
          <Draw d={P(main)} p={draw} w={px(8)} o={1 - 0.72 * vis(t, 351.4, 402.2)} />
          {t > 13.6 && t < 19.6 ? <circle cx={X(29 + 38 * span(t, 13.3, 16.0))} cy={Y(pot(29 + 38 * span(t, 13.3, 16.0)))} r={px(15)} fill={MARK} stroke={INK} strokeWidth={px(5)} /> : null}
          {t > 94.6 && t < 98.5 ? <circle cx={X(40 + 27 * span(t, 94.8, 97.2))} cy={Y(pot(40 + 27 * span(t, 94.8, 97.2)))} r={px(15)} fill={MARK} stroke={INK} strokeWidth={px(5)} /> : null}
          {t > 44.8 && t < 51.8 ? (
            <path d={`M${X(47)},${Y(pot(47))} L${X(51)},${Y(pot(47))} L${X(51)},${Y(pot(51))}`} fill="none" stroke={INK} strokeWidth={px(4)} strokeDasharray={`${px(12)} ${px(9)}`} opacity={vis(t, 44.9, 51.4)} />
          ) : null}

          {/* after 67: £40,000 a year comes out and the pot roughly lasts */}
          {t > 109 && t < 121.4 ? (
            <g opacity={vis(t, 109.4, 120.8)}>
              <line x1={X(67)} y1={Y(1e6)} x2={X(67) + (X(90) - X(67)) * span(t, 114.2, 116.4)} y2={Y(1e6)} stroke={INK} strokeWidth={px(7)} strokeLinecap="round" />
              {Array.from({length: 12}, (_, i) => {
                const p = pop(t, 112.6 + i * 0.16, 0.4);
                return p > 0 ? (
                  <g key={i} transform={`translate(${X(68.5 + i * 1.8)}, ${Y(1e6) + 30})`} opacity={p}>
                    <line x1={0} y1={0} x2={0} y2={120 * p} stroke={GREEN} strokeWidth={px(5)} strokeLinecap="round" />
                    <path d={`M-18,${120 * p - 22} L0,${120 * p} L18,${120 * p - 22}`} fill="none" stroke={GREEN} strokeWidth={px(5)} strokeLinecap="round" strokeLinejoin="round" />
                  </g>
                ) : null;
              })}
              <Pin x={X(88)} y={Y(1e6)} t={t} at={118.9} n="?" s={cam.s} />
            </g>
          ) : null}

          {/* the flag at a million; and the lottery balls it is not */}
          <Flag x={X(67)} y={Y(1e6)} t={t} px={px} />
          {t > 15 && t < 20.4 ? (
            <g transform={`translate(${X(67) - 760}, ${Y(1e6) + 330})`} opacity={1 - span(t, 19.6, 20.2)}>
              {balls.map((n, i) => {
                const p = pop(t, 15.5 + i * 0.12, 0.4);
                return p > 0 ? (
                  <g key={n} transform={`translate(${i * 135}, 0) scale(${p})`}>
                    <circle r={58} fill={MARK} stroke={INK} strokeWidth={px(5)} />
                    <text y={20} textAnchor="middle" fontFamily={NUM} fontWeight={900} fontSize={58} fill={INK}>{n}</text>
                  </g>
                ) : null;
              })}
              {t > 18.85 ? <line x1={-80} y1={30} x2={-80 + 700 * span(t, 18.85, 19.25)} y2={-30} stroke={INK} strokeWidth={px(9)} strokeLinecap="round" /> : null}
            </g>
          ) : null}

          {/* mine: started at 22, went bust, started again at 27 */}
          {t > 351 ? (
            <g>
              <Draw d={bust} p={span(t, 356.6, 358.8)} w={px(10)} />
              <Draw d={bustDrop} p={span(t, 359.2, 360.6)} w={px(10)} color={RED} />
              {t > 397.4 && t < 402.6 ? <ellipse cx={X(24.9)} cy={Y(30000)} rx={130} ry={110} fill="none" stroke={RED} strokeWidth={px(6)} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - span(t, 397.6, 398.6)} /> : null}
              {t > 372 ? <circle cx={X(27)} cy={Y(4000)} r={px(13) * pop(t, 372.1)} fill={MARK} stroke={INK} strokeWidth={px(5)} /> : null}
              <Draw d={P(mine)} p={mineP} w={px(11)} color={GREEN} />
              {mineP >= 1 ? <Flag x={X(67)} y={Y(1380000)} t={t} px={px} color={GREENLT} k={pop(t, 390.6)} /> : null}
              {t > 393.6 ? <circle cx={X(62.8)} cy={Y(1e6)} r={px(16) * pop(t, 393.8)} fill={MARK} stroke={INK} strokeWidth={px(5)} /> : null}
              {t > 393 && t < 403 ? <line x1={X(50)} y1={Y(1e6)} x2={X(67)} y2={Y(1e6)} stroke={INK} strokeWidth={px(3)} strokeDasharray={`${px(12)} ${px(10)}`} opacity={vis(t, 393.2, 402.4)} /> : null}
            </g>
          ) : null}

          {/* once a month, or every day */}
          {t > 309 && t < 319.6 ? (
            <g opacity={vis(t, 309.6, 319.0)}>
              {Array.from({length: 13}, (_, i) => {
                const p = pop(t, 310.9 + i * 0.09, 0.3);
                return p > 0 ? <circle key={i} cx={month(i)} cy={2200 - 34} r={7 * p} fill={GREEN} opacity={1 - span(t, 313.4, 313.9)} /> : null;
              })}
              {Array.from({length: 180}, (_, i) => {
                const p = out((t - (313.7 + i * 0.01)) / 0.2);
                return p > 0 ? <line key={i} x1={X(27) + i * (100 / 180)} y1={2200 - 14} x2={X(27) + i * (100 / 180)} y2={2200 - 14 - (18 + 30 * Math.abs(Math.sin(i * 1.7))) * p} stroke={RED} strokeWidth={px(2.5)} /> : null;
              })}
            </g>
          ) : null}

          {/* the bar floor, the direct debits, the staircase */}
          <line x1={X(25) - 160} y1={BASE} x2={X(67) + 60} y2={BASE} stroke={INK} strokeWidth={px(3)} opacity={0.5} />
          {t > 20 && t < 40 ? Array.from({length: 41}, (_, i) => {
            const p = debits(i);
            return p > 0 ? <rect key={i} x={X(26 + i) - 22} y={BASE - barH * p} width={44} height={barH * p} fill="none" stroke={INK} strokeWidth={px(2.5)} opacity={0.75} /> : null;
          }) : null}
          {stairOn > 0 ? (
            <g opacity={stairOn}>
              <line x1={X(25)} y1={BASE - barH} x2={X(67)} y2={BASE - barH} stroke={INK} strokeWidth={px(3)} strokeDasharray={`${px(12)} ${px(10)}`} />
              {stair.map((v, i) => {
                const p = t > 300 ? 1 : out((t - (176.2 + i * 0.1)) / 0.4);
                return p > 0 ? <rect key={i} x={X(25 + i) + (i === 0 ? 50 : -24)} y={BASE - v * BAR * p} width={48} height={v * BAR * p} fill={v > 329 ? GREENLT : SOFT} stroke={INK} strokeWidth={px(2.5)} /> : null;
              })}
            </g>
          ) : null}

          {/* the monthly bar at 25, in the payers' pieces */}
          <g opacity={1 - vis(t, 351.4, 402.2)}>
          {segs.map((sg, i) => {
            const on = gapOn(i);
            const m = match * 30 * BAR; // a bigger match: his piece and theirs both grow
            const extra = i === 0 || i === 1 ? m : 0;
            const up = (sg.mine ? 0 : lift) + (i === 1 ? m : i >= 2 && g < 0.5 ? 2 * m : 0);
            const fill = sg.mine ? SOFT : green > 0 ? (i === 1 ? GREENLT : 'url(#hatch)') : SOFT;
            return (
              <g key={sg.k} transform={`translate(0, ${-up})`}>
                <rect x={X(25) - BW / 2} y={segY(i) - extra} width={BW} height={sg.v * BAR + extra} fill={on > 0.5 ? fill : 'none'} fillOpacity={sg.mine ? 1 : Math.max(green, 0.001)} stroke={sg.mine || green < 0.5 ? INK : GREEN} strokeWidth={px(on > 0.5 ? 4 : 3)} strokeDasharray={on > 0.5 ? undefined : `${px(8)} ${px(7)}`} strokeLinejoin="round" />
              </g>
            );
          })}
          </g>
          {t > 5.8 && t < 9.7 ? (
            <g opacity={1 - span(t, 9.3, 9.7)}>
              <path d={`M${X(25)},${BASE - barH - 95} L${X(25)},${BASE - barH - 95 + 75 * span(t, 5.9, 6.5)}`} stroke={INK} strokeWidth={px(6)} strokeLinecap="round" fill="none" />
              {t > 6.4 ? <path d={`M${X(25) - 12},${BASE - barH - 32} L${X(25)},${BASE - barH - 16} L${X(25) + 12},${BASE - barH - 32}`} stroke={INK} strokeWidth={px(6)} strokeLinecap="round" strokeLinejoin="round" fill="none" /> : null}
            </g>
          ) : null}
          {t > 131.8 && t < 147 ? <path d={`M${X(25) - BW / 2 - 12},${BASE} l-10,0 l0,${-192 * BAR} l10,0`} fill="none" stroke={INK} strokeWidth={px(4)} opacity={vis(t, 132.0, 146.6)} /> : null}

          {/* 35 and 45: what the month costs */}
          {t > 57 && t < 265 ? (
            <g opacity={vis(t, 57.6, 73.2) + vis(t, 229.6, 264.0)}>
              <rect x={X(35) - BW / 2} y={BASE - 700 * BAR * (t < 100 ? span(t, 57.8, 58.8) : 1)} width={BW} height={700 * BAR * (t < 100 ? span(t, 57.8, 58.8) : 1)} fill={SOFT} stroke={INK} strokeWidth={px(4)} />
              <rect x={X(45) - BW / 2} y={BASE - 1601 * BAR * (t < 100 ? span(t, 60.8, 62.2) : 1)} width={BW} height={1601 * BAR * (t < 100 ? span(t, 60.8, 62.2) : 1)} fill={SOFT} stroke={INK} strokeWidth={px(4)} />
              {t > 64.4 && t < 74 ? (
                <g>
                  <Draw d={`M${X(25) + 40},${BASE - barH - 20} Q${X(30)},${BASE - 520 * BAR - 120} ${X(35) - 44},${BASE - 700 * BAR - 14}`} p={span(t, 64.8, 65.8)} w={px(5)} color={RED} />
                  <Draw d={`M${X(35) + 40},${BASE - 700 * BAR - 20} Q${X(40)},${BASE - 1150 * BAR - 150} ${X(45) - 44},${BASE - 1601 * BAR - 14}`} p={span(t, 65.7, 66.7)} w={px(5)} color={RED} />
                </g>
              ) : null}
              {t > 235 ? (
                <g>
                  <rect x={X(45) + 110 - BW / 2} y={BASE - 800 * BAR * span(t, 235.6, 236.6)} width={BW} height={800 * BAR * span(t, 235.6, 236.6)} fill={SOFT} stroke={INK} strokeWidth={px(4)} />
                  {t > 238.6 ? <rect x={X(45) + 110 - BW / 2} y={BASE - 800 * BAR} width={BW} height={300 * BAR * span(t, 238.7, 239.5)} fill="url(#hatch)" stroke={GREEN} strokeWidth={px(4)} /> : null}
                </g>
              ) : null}
            </g>
          ) : null}

          {/* his £500 a month, and the house money that is not on this line */}
          {t > 366 && t < 403 ? (
            <g opacity={vis(t, 368.0, 402.4)}>
              <rect x={X(27) - BW / 2} y={BASE - 500 * BAR * span(t, 368.1, 369.0)} width={BW} height={500 * BAR * span(t, 368.1, 369.0)} fill={GREENLT} stroke={INK} strokeWidth={px(4)} />
              {t > 377 ? <rect x={X(20.2) - BW / 2} y={BASE - 1000 * BAR * span(t, 377.3, 378.3)} width={BW} height={1000 * BAR * span(t, 377.3, 378.3)} fill="none" stroke={GREY} strokeWidth={px(4)} strokeDasharray={`${px(10)} ${px(8)}`} /> : null}
            </g>
          ) : null}

          {/* the end screen: two frames for the videos YouTube lays over them */}
          {t > 420 ? (
            <g opacity={vis(t, 421.2)}>
              <rect x={END.x - 1010} y={END.y - 200} width={960} height={540} fill="none" stroke={INK} strokeWidth={px(4)} rx={18} />
              <rect x={END.x + 50} y={END.y - 200} width={960} height={540} fill="none" stroke={INK} strokeWidth={px(4)} rx={18} />
              <Draw d={`M${END.x - 1010},${END.y + 520} C${END.x - 300},${END.y + 500} ${END.x + 500},${END.y + 420} ${END.x + 1010},${END.y + 380 - 60 * Math.sin(t)}`} p={span(t, 421.6, 424)} w={px(6)} color={GREEN} />
            </g>
          ) : null}

          <Pin x={X(25) + BW / 2} y={BASE - barH / 2} t={t} at={27.42} until={40.2} n={1} s={cam.s} />
          <Pin x={X(35)} y={2200} t={t} at={30.61} until={40.2} n={2} s={cam.s} />
          <Pin x={X(45)} y={2200} t={t} at={31.42} until={40.2} n={2} s={cam.s} />
          <Pin x={X(64.5)} y={Y(pot(64.5))} t={t} at={34.42} until={40.2} n={3} s={cam.s} />
          <Pin x={X(27)} y={Y(pot(27))} t={t} at={37.7} until={40.2} n={4} s={cam.s} />
          <Pin x={X(35)} y={2200} t={t} at={222.6} until={228.0} n="?" s={cam.s} />
          <Pin x={X(45)} y={2200} t={t} at={223.7} until={228.0} n="?" s={cam.s} />
          <Pin x={X(25) + 60} y={BASE - barH} t={t} at={321.3} until={333.7} n={1} s={cam.s} />
          <Pin x={ISA.x + ISA.w / 2} y={ISA.y + ISA.h - 30} t={t} at={323.3} until={333.7} n={2} s={cam.s} />
          <Pin x={X(63)} y={Y(880000)} t={t} at={325.5} until={333.7} n={3} s={cam.s} />
          <Pin x={X(55)} y={BASE - 223 * Math.pow(1.03, 30) * BAR} t={t} at={327.1} until={333.7} n={4} s={cam.s} />
          <Pin x={X(44)} y={Y(bumpy(44))} t={t} at={328.5} until={333.7} n={5} s={cam.s} />
          {commentAges.map((a, i) => (
            <Pin key={a} x={X(a)} y={2200} t={t} at={412.6 + i * 0.5} until={419.4} n={a} s={cam.s} />
          ))}
        </g>
      </svg>

      {/* real pages and his own clip, taped onto the sheet */}
      <Tape {...ISA} t={t} at={t < 300 ? 194.6 : 322.9} until={t < 300 ? 209.6 : 334.0} cam={cam} W={w} H={h}>
        <Img src={staticFile('sheet/real-gov-isa.jpg')} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
        {t > 204.9 ? <div style={{position: 'absolute', left: '26%', top: '75%', width: '50%', height: '19%', border: `${Math.max(3, 7 * cam.s)}px solid ${INK}`, borderRadius: 10, opacity: out((t - 204.9) / 0.4), boxShadow: `0 0 0 ${3 * cam.s}px ${MARK}`}} /> : null}
      </Tape>
      <Tape {...SP} t={t} at={241.4} until={264.2} cam={cam} W={w} H={h} rot={1}>
        <Img src={staticFile('sheet/real-gov-state-pension.jpg')} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
        {t > 244.9 ? <div style={{position: 'absolute', left: '47.5%', top: '54.2%', width: `${21 * out((t - 244.9) / 0.5)}%`, height: '5.4%', background: MARK, mixBlendMode: 'multiply', opacity: 0.85}} /> : null}
        {t > 252.5 ? <div style={{position: 'absolute', left: '58.8%', top: '31.5%', width: `${32.6 * out((t - 252.5) / 0.5)}%`, height: Math.max(3, 6 * cam.s), background: INK}} /> : null}
      </Tape>
      <Tape {...PHONE} t={t} at={296.2} until={308.4} cam={cam} W={w} H={h} rot={-2}>
        <Sequence from={Math.round(296.2 * fps)} layout="none">
          <OffthreadVideo src={staticFile('sheet/vuag.mp4')} startFrom={Math.round(2 * fps)} muted style={{width: '100%', height: '100%', objectFit: 'cover'}} />
        </Sequence>
      </Tape>

      {ages.map((a) => (
        <Label key={a} l={{x: X(a), y: 2200, t: -1, text: String(a), font: NUM, weight: 700, size: 26, align: 'center', dy: 58, color: INK}} t={t} cam={cam} w={w} h={h} />
      ))}
      {t > 108 && t < 121 ? [70, 75, 80, 85, 90].map((a) => <Label key={a} l={{x: X(a), y: 2200, t: 108.4, until: 120.8, text: String(a), font: NUM, weight: 700, size: 26, align: 'center', dy: 58}} t={t} cam={cam} w={w} h={h} />) : null}
      {L.map((l, i) => (
        <Label key={i} l={l} t={t} cam={cam} w={w} h={h} />
      ))}
    </AbsoluteFill>
  );
};
