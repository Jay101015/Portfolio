import React, {useLayoutEffect, useRef, useState} from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand} from '../types';
import {DOODLES} from './doodles';
import {rnd} from '../components/motion';

/**
 * The whiteboard look's writing. Text is revealed one character at a time, left to right inside each glyph, at a
 * marker's pace, so a line reads as being written rather than fading in.
 *
 * Everything the hand writes or draws carries its timing in the DOM: a character has `data-pen-at` / `data-pen-end`
 * (scene-local frames), a stroke has `data-pen-win` (from, to, easing) and `data-pen-sub` (the slice of the stroke
 * this subpath covers). The PenHand layer reads that timeline after layout and moves the hand along it smoothly:
 * along each letter with a little up-and-down as it forms it, gliding between words, lines and shapes, and lifting
 * off the board when nothing is written for a while.
 */

/** characters per second a marker manages on a board; headlines are slower, notes quicker */
export const CPS = 26;

/** how many frames a run of text takes to write at `cps` */
export const writeFrames = (text: string, fps: number, cps = CPS) => Math.ceil((String(text).replace(/\s+/g, '').length / cps) * fps);

const clip = (p: number): React.CSSProperties => ({display: 'inline-block', clipPath: p >= 1 ? undefined : `inset(-0.2em ${(1 - p) * 100}% -0.25em 0)`, visibility: p <= 0 ? 'hidden' : undefined});

type WriteProps = {
  text: string;
  frame: number;
  fps: number;
  start?: number; // frame the writing starts
  cps?: number;
  color?: string;
  style?: React.CSSProperties;
  wordGap?: string;
};

/** Text that writes itself. Words are inline-block so lines wrap; each character clips open left to right. */
export const Write: React.FC<WriteProps> = ({text, frame, fps, start = 0, cps = CPS, style, wordGap = '0.28em'}) => {
  const per = fps / cps; // frames per character
  let k = 0;
  const words = String(text).split(/\s+/).filter(Boolean);
  return (
    <span style={style}>
      {words.map((w, wi) => (
        <span key={wi} style={{display: 'inline-block', marginRight: wordGap, whiteSpace: 'nowrap'}}>
          {Array.from(w).map((ch, ci) => {
            const at = start + k * per;
            k += 1;
            const p = Math.max(0, Math.min(1, (frame - at) / per));
            return (
              <span key={ci} data-pen-at={at} data-pen-end={at + per} style={clip(p)}>
                {ch}
              </span>
            );
          })}
        </span>
      ))}
    </span>
  );
};

/** Write that starts each word when it is spoken (for narration on the board); `words` carry absolute times. */
export const WriteSpoken: React.FC<{words: {w: string; s: number; e: number}[]; t: number; fps: number; sceneStart: number; color?: string; style?: React.CSSProperties; wordGap?: string}> = ({words, t, fps, sceneStart, style, wordGap = '0.28em'}) => (
  <span style={style}>
    {words.map((w, wi) => {
      const chars = Array.from(w.w);
      const dur = Math.max(0.12, Math.min(0.6, w.e - w.s + 0.08));
      const per = dur / chars.length;
      return (
        <span key={wi} style={{display: 'inline-block', marginRight: wordGap, whiteSpace: 'nowrap'}}>
          {chars.map((ch, ci) => {
            const a = w.s - 0.04 + ci * per;
            const p = Math.max(0, Math.min(1, (t - a) / per));
            return (
              <span key={ci} data-pen-at={(a - sceneStart) * fps} data-pen-end={(a + per - sceneStart) * fps} style={clip(p)}>
                {ch}
              </span>
            );
          })}
        </span>
      );
    })}
  </span>
);

// ------------------------------------------------------------------ doodles
const KEYWORDS: [RegExp, string][] = [
  [/emergency|safety|insur/i, 'umbrella'],
  [/credit card|debt|loan|overdraft|borrow/i, 'credit-card'],
  [/crypto|bitcoin|coin/i, 'bitcoin'],
  [/index|etf|fund|invest|compound|return/i, 'trending-up'],
  [/loss|lost|crash|drop|down/i, 'trending-down'],
  [/\bcar\b|drive|vehicle/i, 'car'],
  [/house|home|rent|mortgage|flat/i, 'house'],
  [/salary|pay|wage|earn|income|job|work/i, 'briefcase'],
  [/save|saving|saved|pot|cash/i, 'piggy-bank'],
  [/time|month|year|wait|patien/i, 'hourglass'],
  [/goal|target|aim|plan/i, 'target'],
  [/million|rich|wealth|win|trophy/i, 'trophy'],
  [/idea|learn|lesson|mistake/i, 'lightbulb'],
  [/fee|cost|charge|percent|%/i, 'percent'],
  [/bank|account/i, 'landmark'],
  [/subscribe|channel|video|watch/i, 'youtube'],
  [/risk|warning|careful|danger/i, 'triangle-alert'],
  [/tax|bill|receipt|statement/i, 'receipt'],
  [/phone|app/i, 'smartphone'],
  [/budget|spend|shop|buy/i, 'shopping-cart'],
  [/grow|start|seed|begin|first/i, 'sprout'],
  [/money|£|\$|€|pound|dollar/i, 'banknote'],
];

/** Pick a doodle for a scene from an explicit icon= or the words on it. */
export const pickDoodle = (explicit: string | undefined, ...texts: (string | undefined)[]): string | undefined => {
  if (explicit) return DOODLES[explicit] ? explicit : undefined;
  const hay = texts.filter(Boolean).join(' ');
  for (const [re, name] of KEYWORDS) if (re.test(hay)) return name;
  return undefined;
};

type DoodleProps = {name: string; size: number; draw?: number; win?: [number, number]; stroke: string; width?: number; style?: React.CSSProperties; seed?: number; fill?: string};

/** A Lucide outline drawn on stroke by stroke, with a little wobble so it reads as a marker, not a vector. */
export const Doodle: React.FC<DoodleProps> = ({name, size, draw, win, stroke, width = 1.6, style, seed = 1, fill}) => {
  const frame = useCurrentFrame();
  const nodes = DOODLES[name];
  if (!nodes) return null;
  const n = nodes.length;
  const tilt = (rnd(seed) - 0.5) * 6;
  const d = win ? Math.max(0, Math.min(1, (frame - win[0]) / Math.max(1e-6, win[1] - win[0]))) : draw ?? 1;
  return (
    <svg width={size} height={size} viewBox="-1 -1 26 26" fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" style={{overflow: 'visible', transform: `rotate(${tilt}deg)`, ...style}}>
      {fill ? <g opacity={Math.max(0, d - 0.85) * 4} fill={fill} stroke="none">{nodes.map(([tag, attrs], i) => (tag === 'path' || tag === 'circle' || tag === 'rect' || tag === 'ellipse' || tag === 'polygon' ? React.createElement(tag, {key: i, ...attrs}) : null))}</g> : null}
      {nodes.map(([tag, attrs], i) => {
        // each sub-stroke gets an equal slice of the draw; the pen moves on to the next when one is done
        const p = Math.max(0, Math.min(1, d * n - i));
        const dash = p < 1 ? {pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - p} : {};
        const timing = win ? {'data-pen-win': `${win[0]},${win[1]},l`, 'data-pen-sub': `${i / n},${(i + 1) / n}`} : {};
        if (p <= 0 && !win) return null;
        return React.createElement(tag, {key: i, ...attrs, ...dash, ...timing, visibility: p <= 0 ? 'hidden' : undefined});
      })}
    </svg>
  );
};

// ------------------------------------------------------------------ the hand

/**
 * Jeffrey's line drawing of a hand, coloured in (public/hand.png): brown skin, and the pencil repainted as a black
 * Sharpie-style marker with a bullet nib, a grey grip and a label strip; the outside cut away. The nib is at HAND_TIP
 * in the image; the image is placed so that point sits at (0,0) of its box, and the arm runs off the bottom.
 */
const HAND_TIP = {x: 3.8 / 407, y: 0.4 / 754};
const HAND_RATIO = 754 / 407;
export const MarkerHand: React.FC<{size: number}> = ({size}) => {
  const w = size * 0.62;
  return <Img src={staticFile('hand.png')} style={{display: 'block', width: w, height: w * HAND_RATIO, transform: `translate(${-HAND_TIP.x * 100}%, ${-HAND_TIP.y * 100}%)`}} />;
};

type Pt = {x: number; y: number};
type Seg = {a: number; b: number; at: (t: number) => Pt; h: number; char: boolean};

const easeOutInv = (p: number) => 1 - Math.cbrt(1 - p); // inverse of 1-(1-u)^3
const easeInOut = (u: number) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
const lerp = (p: Pt, q: Pt, u: number): Pt => ({x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u});

/**
 * Reads the writing timeline of the scene on screen and moves the hand along it. Deterministic: the position at a
 * frame depends only on that frame's layout, so chunked and parallel renders agree.
 */
export const PenHand: React.FC<{brand: Brand}> = () => {
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const [pose, setPose] = useState<{x: number; y: number; rot: number} | null>(null);
  const last = useRef<string>('');
  const own = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = own.current?.parentElement;
    if (!root) return;
    const rr = root.getBoundingClientRect();
    const scale = rr.width / width || 1;
    // the scene on screen: the latest one that has started
    let sceneEl: HTMLElement | null = null;
    let from = 0;
    root.querySelectorAll<HTMLElement>('[data-pen-scene]').forEach((el) => {
      const f = Number(el.dataset.penFrom);
      if (f <= frame && (!sceneEl || f >= from)) {
        sceneEl = el;
        from = f;
      }
    });
    const scene = sceneEl as HTMLElement | null;
    // off the board to the right, so the hand leaves and returns sideways instead of crossing the captions
    const REST: Pt = {x: width * 1.3, y: height * 0.72};
    if (!scene) {
      setPose(null);
      return;
    }
    const local = frame - from;
    const toLocal = (x: number, y: number): Pt => ({x: (x - rr.left) / scale, y: (y - rr.top) / scale});
    const segs: Seg[] = [];
    scene.querySelectorAll<HTMLElement>('[data-pen-at]').forEach((el) => {
      const a = Number(el.dataset.penAt);
      const b = Number(el.dataset.penEnd);
      let r: DOMRect | null = null;
      const rect = () => (r ??= el.getBoundingClientRect());
      segs.push({
        a,
        b,
        char: true,
        get h() {
          return rect().height / scale;
        },
        at: (t) => {
          const R = rect();
          const u = Math.max(0, Math.min(1, (t - a) / Math.max(1e-6, b - a)));
          return toLocal(R.left + R.width * u, R.top + R.height * 0.8);
        },
      });
    });
    scene.querySelectorAll<SVGGeometryElement>('[data-pen-win]').forEach((el) => {
      const [wa, wb, kind] = (el.getAttribute('data-pen-win') || '0,1,l').split(',');
      const [f0, f1] = (el.getAttribute('data-pen-sub') || '0,1').split(',').map(Number);
      const A = Number(wa);
      const B = Number(wb);
      const ease = kind === 'e';
      const tOf = (p: number) => A + (ease ? easeOutInv(p) : p) * (B - A);
      let len: number | null = null;
      segs.push({
        a: tOf(f0),
        b: tOf(f1),
        char: false,
        h: 0,
        at: (t) => {
          const u = Math.max(0, Math.min(1, (t - A) / Math.max(1e-6, B - A)));
          const P = ease ? 1 - Math.pow(1 - u, 3) : u;
          const q = Math.max(0, Math.min(1, (P - f0) / Math.max(1e-6, f1 - f0)));
          try {
            len ??= el.getTotalLength();
            const pt = el.getPointAtLength(len * q);
            const m = el.getScreenCTM();
            if (!m) return REST;
            return toLocal(m.a * pt.x + m.c * pt.y + m.e, m.b * pt.x + m.d * pt.y + m.f);
          } catch {
            return REST;
          }
        },
      });
    });
    if (!segs.length) {
      setPose(null);
      return;
    }
    segs.sort((p, q) => p.a - q.a || p.b - q.b);
    const GLIDE = fps * 0.4; // time to travel to or from the edge of the board
    const LINGER = fps * 0.5; // how long the hand stays after a stroke before lifting away
    const BRIDGE = fps * 1.6; // gaps up to this long are crossed without leaving the board
    const raw = (t: number): Pt => {
      let active: Seg | null = null;
      let prev: Seg | null = null;
      let next: Seg | null = null;
      for (const s of segs) {
        if (s.a <= t && t < s.b) active = s; // the latest-starting stroke in progress wins
        if (s.b <= t && (!prev || s.b >= prev.b)) prev = s;
        if (s.a > t && (!next || s.a < next.a)) next = s;
      }
      if (active) return active.at(t);
      if (prev && next && next.a - prev.b <= BRIDGE) return lerp(prev.at(prev.b), next.at(next.a), easeInOut((t - prev.b) / Math.max(1e-6, next.a - prev.b)));
      if (next && next.a - t < GLIDE) return lerp(REST, next.at(next.a), easeInOut(1 - (next.a - t) / GLIDE));
      if (prev && t - prev.b < LINGER) return prev.at(prev.b);
      if (prev && t - prev.b < LINGER + GLIDE) return lerp(prev.at(prev.b), REST, easeInOut((t - prev.b - LINGER) / GLIDE));
      return REST;
    };
    // a soft average over a few frames either side takes the corners out of line breaks and stroke changes
    let sx = 0;
    let sy = 0;
    let sw = 0;
    for (let k = -6; k <= 6; k++) {
      const wgt = Math.exp(-(k * k) / (2 * 2.6 * 2.6));
      const p = raw(local + k);
      sx += p.x * wgt;
      sy += p.y * wgt;
      sw += wgt;
    }
    let x = sx / sw;
    let y = sy / sw;
    // forming a letter: the pen goes up and back down once per character
    const writing = segs.find((s) => s.char && s.a <= local && local < s.b);
    if (writing) {
      const u = (local - writing.a) / Math.max(1e-6, writing.b - writing.a);
      y -= Math.sin(u * Math.PI) * writing.h * 0.12;
    }
    // the wrist turns a little as the hand travels across the board
    const rot = -5 + 9 * Math.max(0, Math.min(1, x / width));
    const key = `${x.toFixed(1)},${y.toFixed(1)},${rot.toFixed(2)}`;
    if (key !== last.current) {
      last.current = key;
      setPose({x, y, rot});
    }
  }, [frame, width, height, fps]);
  const size = Math.min(width, height) * 0.42;
  return (
    <AbsoluteFill ref={own} style={{pointerEvents: 'none'}}>
      {pose && pose.x < width * 1.15 ? (
        <div style={{position: 'absolute', left: pose.x, top: pose.y, transform: `rotate(${pose.rot}deg)`, transformOrigin: '0 0', filter: 'drop-shadow(4px 8px 8px rgba(0,0,0,0.14))'}}>
          <MarkerHand size={size} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
