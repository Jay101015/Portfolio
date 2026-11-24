import React from 'react';
import {AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import '../fonts';

// "One sheet, 25 to 67": the whole video as a single chart on squared paper. The camera travels over it and never
// cuts to a fresh page; every figure is a mark on the chart with its label attached. No boards, no cards, no doodles.
// This file is the opening of retire-a-millionaire-uk (0 to 41 s), built as a sample for Jeffrey.

const INK = '#14213d';
const GREEN = '#1a8f55';
const RED = '#c8372d';
const PAPER = '#f7f4ea';
const GRID = '#b9cbe0';
const MARK = '#ffd84d';
const NUM = 'Fraunces';
const TXT = 'Inter';

// world: 100 px a year, 1600 px a million
const X = (age: number) => 400 + (age - 25) * 100;
const Y = (v: number) => 2200 - (v / 1e6) * 1600;
const BASE = 3010; // the "a month" bars stand here
const BAR = 1; // px per pound a month
const pot = (age: number, monthly = 329, from = 25) => {
  const r = 0.07 / 12;
  const n = Math.max(0, (age - from) * 12);
  return (monthly * (Math.pow(1 + r, n) - 1)) / r;
};
const curve = (from: number, to: number, monthly = 329, start = 25) => {
  const pts: string[] = [];
  for (let a = from; a <= to + 1e-6; a += 0.5) pts.push(`${X(a).toFixed(1)},${Y(pot(a, monthly, start)).toFixed(1)}`);
  return 'M' + pts.join(' L');
};

const ease = (p: number) => (p <= 0 ? 0 : p >= 1 ? 1 : p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const span = (t: number, a: number, b: number) => ease((t - a) / (b - a));
const out = (p: number) => (p <= 0 ? 0 : p >= 1 ? 1 : 1 - Math.pow(1 - p, 3));
const pop = (t: number, at: number, d = 0.35) => {
  const p = (t - at) / d;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  return 1 + 0.18 * Math.sin(p * Math.PI) * (1 - p) - Math.pow(1 - p, 3);
};

// the camera: where it looks (world) and how close; it holds on a key until the next one starts moving
type Key = {t: number; d: number; cx: number; cy: number; s: number};
const WIDE = {cx: 2500, cy: 1760, s: 0.315};
const KEYS: Key[] = [
  {t: 0, d: 0, ...WIDE},
  {t: 3.0, d: 1.5, cx: 980, cy: 2800, s: 1.15}, // "you need about £329": down to the bar at 25
  {t: 7.4, d: 2.4, cx: 900, cy: 2790, s: 1.4}, // "the bit nobody tells you": closer
  {t: 13.3, d: 2.1, cx: 4150, cy: 760, s: 0.95}, // "a million sounds like a lottery number": up the curve to the flag
  {t: 18.7, d: 1.9, ...WIDE}, // "when you break it down": the whole sheet
  {t: 38.7, d: 2.6, cx: 1750, cy: 1950, s: 0.62}, // into the first chapter, on the left of the sheet
];
const camera = (t: number) => {
  let c = {cx: KEYS[0].cx, cy: KEYS[0].cy, s: KEYS[0].s};
  for (const k of KEYS.slice(1)) {
    if (t <= k.t) break;
    const p = span(t, k.t, k.t + k.d);
    // pull back a little in the middle of a long move, so the travel reads as travel
    const far = Math.hypot(k.cx - c.cx, k.cy - c.cy) > 2000 ? 1 - 0.45 * Math.sin(p * Math.PI) : 1;
    c = {cx: c.cx + (k.cx - c.cx) * p, cy: c.cy + (k.cy - c.cy) * p, s: Math.exp(Math.log(c.s) + (Math.log(k.s) - Math.log(c.s)) * p) * far};
  }
  return c;
};

type LabelT = {x: number; y: number; t: number; text: string; size?: number; color?: string; font?: string; weight?: number; italic?: boolean; dx?: number; dy?: number; align?: 'left' | 'right' | 'center'; until?: number; bg?: boolean};

// a label keeps its size on screen whatever the camera does, and stays pinned to its mark on the sheet
const Label: React.FC<{l: LabelT; t: number; cam: {cx: number; cy: number; s: number}; w: number; h: number}> = ({l, t, cam, w, h}) => {
  if (t < l.t || (l.until !== undefined && t > l.until + 0.3)) return null;
  const sx = (l.x - cam.cx) * cam.s + w / 2 + (l.dx ?? 0);
  const sy = (l.y - cam.cy) * cam.s + h / 2 + (l.dy ?? 0);
  const a = out((t - l.t) / 0.3) * (l.until !== undefined ? 1 - span(t, l.until, l.until + 0.3) : 1);
  const tx = l.align === 'right' ? '-100%' : l.align === 'center' ? '-50%' : '0';
  return (
    <div style={{position: 'absolute', left: sx, top: sy, transform: `translate(${tx}, -50%) scale(${0.9 + 0.1 * pop(t, l.t)})`, transformOrigin: l.align === 'right' ? 'right center' : 'left center', opacity: a, whiteSpace: 'nowrap', fontFamily: l.font ?? TXT, fontWeight: l.weight ?? 600, fontStyle: l.italic ? 'italic' : 'normal', fontSize: l.size ?? 40, color: l.color ?? INK, lineHeight: 1, letterSpacing: l.font === NUM ? -1 : 0, background: l.bg ? PAPER : 'transparent', padding: l.bg ? '6px 12px' : 0, borderRadius: 6}}>
      {l.text}
    </div>
  );
};

const Pin: React.FC<{x: number; y: number; t: number; at: number; n: number; s: number}> = ({x, y, t, at, n, s}) => {
  if (t < at) return null;
  const p = pop(t, at, 0.45);
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

export const Sheet: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, width: w, height: h} = useVideoConfig();
  const t = frame / fps;
  const cam = camera(t);
  const tr = `translate(${w / 2 - cam.cx * cam.s}, ${h / 2 - cam.cy * cam.s}) scale(${cam.s})`;
  const px = (n: number) => n / cam.s; // a stroke that keeps its weight on screen

  const draw = span(t, 0.25, 1.75); // the curve reaches the flag as he says "million"
  const LEN = 5400;
  const barH = 329 * BAR;
  const split = 123 * BAR;
  const green = span(t, 9.85, 10.5);
  const lift = span(t, 11.5, 12.3) * 16;
  const arrow = span(t, 5.9, 6.5);
  const cutline = span(t, 8.6, 9.3);
  const debits = (i: number) => out((t - (20.9 + i * 0.042)) / 0.25);
  const years = span(t, 22.4, 23.2);
  const area = span(t, 23.4, 24.6);
  const mine = span(t, 24.5, 25.3);
  const notch = span(t, 34.3, 35.2);

  const ages = [25, 30, 35, 40, 45, 50, 55, 60, 65, 67];
  const labels: LabelT[] = [
    // frame one carries both numbers; the line between them draws as he talks
    {x: X(67), y: Y(1e6), t: -1, text: '£1 million', font: NUM, weight: 900, size: 92, dx: -40, dy: -78, align: 'right'},
    {x: X(25) + 80, y: BASE - barH / 2, t: -1, text: '£329 a month', font: NUM, weight: 900, size: 76, dx: 34},
    {x: X(25), y: 2200, t: 2.85, text: 'start at 25', italic: true, font: NUM, weight: 400, size: 44, dx: 22, dy: -40, until: 12.9, bg: true},
    {x: X(25), y: BASE - barH - 150, t: 6.0, text: 'going in, every month', weight: 600, size: 40, dx: 40, until: 9.4},
    {x: X(25) + 80, y: BASE - barH + split / 2 - 8, t: 9.9, text: '£123 of it', font: NUM, weight: 900, size: 70, color: GREEN, dx: 34, dy: -30, until: 13.0},
    {x: X(25) + 80, y: BASE - barH + split / 2 - 8, t: 11.9, text: 'not from your pocket', weight: 600, size: 44, color: GREEN, dx: 400, dy: -26, until: 13.0},
    {x: X(67), y: Y(1e6), t: 16.0, text: 'a lottery number?', italic: true, font: NUM, weight: 400, size: 54, dx: -560, dy: 40, until: 18.6},
    {x: X(46), y: BASE + 70, t: 21.0, text: 'a direct debit, every month', weight: 600, size: 42, align: 'center', dy: -150, bg: true, until: 26.0},
    {x: X(46), y: 2200, t: 22.6, text: '42 years', font: NUM, weight: 900, size: 54, align: 'center', dy: 104, until: 26.0, bg: true},
    {x: X(60), y: Y(360000), t: 24.2, text: 'not your money', font: NUM, weight: 900, size: 60, color: GREEN, align: 'center', until: 26.2, bg: true},
    {x: X(61), y: Y(60000), t: 24.9, text: 'what you put in', weight: 600, size: 36, align: 'center', dy: 4, until: 26.2},
    // the four things coming, pinned where they happen on the sheet
    {x: X(25), y: BASE - barH, t: 27.5, text: 'who pays the rest', weight: 700, size: 44, dx: 46, dy: -44, bg: true},
    {x: X(35), y: 2200, t: 30.7, text: 'starting at 35', weight: 700, size: 44, align: 'center', dy: -124, bg: true},
    {x: X(45), y: 2200, t: 31.5, text: 'or 45', weight: 700, size: 44, align: 'center', dy: -124, bg: true},
    {x: X(64.5), y: Y(pot(64.5)), t: 34.5, text: '−£250,000', font: NUM, weight: 900, size: 56, color: RED, align: 'right', dx: -70, dy: -40, bg: true},
    {x: X(27), y: Y(pot(27)), t: 37.75, text: 'where I am', weight: 700, size: 44, dx: -40, dy: -124, bg: true},
  ];
  // the two opening numbers step aside once the sheet starts filling with other marks
  labels[0].until = undefined;
  labels[1].until = 18.4;

  return (
    <AbsoluteFill style={{background: PAPER}}>
      <svg width={w} height={h} style={{position: 'absolute', inset: 0}}>
        <defs>
          <pattern id="sq" width={100} height={100} patternUnits="userSpaceOnUse">
            <path d="M100,0 L0,0 0,100" fill="none" stroke={GRID} strokeWidth={px(1)} opacity={0.75} />
          </pattern>
          <pattern id="sq5" width={500} height={500} patternUnits="userSpaceOnUse">
            <path d="M500,0 L0,0 0,500" fill="none" stroke={GRID} strokeWidth={px(2.2)} />
          </pattern>
          <pattern id="hatch" width={14} height={14} patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
            <rect width={14} height={14} fill="#d9f0e2" />
            <line x1={0} y1={0} x2={0} y2={14} stroke={GREEN} strokeWidth={5} />
          </pattern>
          <pattern id="hatchBig" width={34} height={34} patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
            <line x1={0} y1={0} x2={0} y2={34} stroke={GREEN} strokeWidth={7} opacity={0.5} />
          </pattern>
          <clipPath id="areaReveal"><rect x={X(25)} y={0} width={(X(67) - X(25)) * area} height={2200} /></clipPath>
          <clipPath id="mineReveal"><rect x={X(25)} y={0} width={(X(67) - X(25)) * mine} height={2200} /></clipPath>
        </defs>
        <g transform={tr}>
          <rect x={-3000} y={-3000} width={12000} height={10000} fill="url(#sq)" />
          <rect x={-3000} y={-3000} width={12000} height={10000} fill="url(#sq5)" />

          {/* what is under the curve: the thin wedge you paid in, and everything else */}
          <g clipPath="url(#areaReveal)">
            <path d={`${curve(25, 67)} L${X(67)},2200 L${X(25)},2200 Z`} fill="#d9f0e2" opacity={0.75} />
            <path d={`${curve(25, 67)} L${X(67)},2200 L${X(25)},2200 Z`} fill="url(#hatchBig)" />
          </g>
          <g clipPath="url(#mineReveal)">
            <path d={`M${X(25)},2200 L${X(67)},${Y(166000)} L${X(67)},2200 Z`} fill={PAPER} stroke={INK} strokeWidth={px(3)} />
          </g>

          {/* the age rail */}
          <line x1={X(25)} y1={2200} x2={X(67) + 60} y2={2200} stroke={INK} strokeWidth={px(5)} strokeLinecap="round" />
          {Array.from({length: 43}, (_, i) => (
            <line key={i} x1={X(25 + i)} y1={2200} x2={X(25 + i)} y2={2200 + ((25 + i) % 5 === 0 || i === 42 ? 34 : 18)} stroke={INK} strokeWidth={px(3)} />
          ))}
          {years > 0 ? <path d={`M${X(25)},${2200 + 70} L${X(25)},${2200 + 100} L${X(25) + (X(67) - X(25)) * years},${2200 + 100} l0,-30`} fill="none" stroke={INK} strokeWidth={px(3.5)} /> : null}

          {/* the pot */}
          <path d={curve(25, 67)} fill="none" stroke={INK} strokeWidth={px(8)} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={LEN} strokeDashoffset={LEN * (1 - draw)} />
          {notch > 0 ? (
            <g>
              <path d={`M${X(62)},${Y(pot(62))} L${X(67)},${Y(746000 + (1e6 - 746000) * (1 - notch))}`} fill="none" stroke={RED} strokeWidth={px(7)} strokeLinecap="round" strokeDasharray={`${px(18)} ${px(14)}`} />
              <path d={`${curve(62, 67)} L${X(67)},${Y(746000 + (1e6 - 746000) * (1 - notch))} Z`} fill={RED} opacity={0.18} />
            </g>
          ) : null}

          {/* the flag at a million */}
          <g transform={`translate(${X(67)}, ${Y(1e6)})`}>
            <line x1={0} y1={0} x2={0} y2={-150} stroke={INK} strokeWidth={px(6)} strokeLinecap="round" />
            <path d="M0,-150 L-120,-118 L0,-86 Z" fill={MARK} stroke={INK} strokeWidth={px(5)} strokeLinejoin="round" transform={`skewY(${Math.sin(t * 3.2) * 4})`} />
            <circle r={px(9)} fill={INK} />
          </g>

          {/* the monthly bar at 25, and its green top: the part that is not yours */}
          <line x1={X(25) - 160} y1={BASE} x2={X(67) + 60} y2={BASE} stroke={INK} strokeWidth={px(3)} opacity={0.5} />
          {Array.from({length: 41}, (_, i) => {
            const p = debits(i);
            return p > 0 ? <rect key={i} x={X(26 + i) - 26} y={BASE - barH * p} width={52} height={barH * p} fill="none" stroke={INK} strokeWidth={px(2.5)} opacity={0.75} /> : null;
          })}
          <rect x={X(25) - 80} y={BASE - barH + split} width={160} height={barH - split} fill="#e9edf5" stroke={INK} strokeWidth={px(5)} strokeLinejoin="round" />
          <g transform={`translate(0, ${-lift})`}>
            <rect x={X(25) - 80} y={BASE - barH} width={160} height={split} fill={green > 0 ? 'url(#hatch)' : '#e9edf5'} fillOpacity={green > 0 ? green : 1} stroke={green > 0.5 ? GREEN : INK} strokeWidth={px(5)} strokeLinejoin="round" />
          </g>

          {arrow > 0 && t < 9.7 ? (
            <g opacity={1 - span(t, 9.3, 9.7)}>
              <path d={`M${X(25)},${BASE - barH - 210} L${X(25)},${BASE - barH - 210 + 170 * arrow}`} stroke={INK} strokeWidth={px(6)} strokeLinecap="round" fill="none" />
              {arrow > 0.9 ? <path d={`M${X(25) - 26},${BASE - barH - 70} L${X(25)},${BASE - barH - 36} L${X(25) + 26},${BASE - barH - 70}`} stroke={INK} strokeWidth={px(6)} strokeLinecap="round" strokeLinejoin="round" fill="none" /> : null}
            </g>
          ) : null}
          {cutline > 0 && green <= 0 ? <line x1={X(25) - 110} y1={BASE - barH + split} x2={X(25) - 110 + 220 * cutline} y2={BASE - barH + split} stroke={GREEN} strokeWidth={px(5)} strokeDasharray={`${px(14)} ${px(10)}`} /> : null}
          <Pin x={X(25)} y={BASE - barH - lift} t={t} at={27.42} n={1} s={cam.s} />
          <Pin x={X(35)} y={2200} t={t} at={30.61} n={2} s={cam.s} />
          <Pin x={X(45)} y={2200} t={t} at={31.42} n={2} s={cam.s} />
          <Pin x={X(64.5)} y={Y(pot(64.5))} t={t} at={34.42} n={3} s={cam.s} />
          <Pin x={X(27)} y={Y(pot(27))} t={t} at={37.7} n={4} s={cam.s} />
        </g>
      </svg>

      {ages.map((a) => (
        <Label key={a} l={{x: X(a), y: 2200, t: -1, text: String(a), font: NUM, weight: 700, size: 26, align: 'center', dy: 58, color: INK}} t={t} cam={cam} w={w} h={h} />
      ))}
      {labels.map((l, i) => (
        <Label key={i} l={l} t={t} cam={cam} w={w} h={h} />
      ))}
      <AbsoluteFill style={{backgroundImage: `url(${staticFile('paper/grain.png')})`, backgroundRepeat: 'repeat', opacity: 0.05, mixBlendMode: 'multiply', pointerEvents: 'none'}} />
    </AbsoluteFill>
  );
};
