import React, {useLayoutEffect, useRef, useState} from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand} from '../types';
import {DOODLES} from './doodles';
import {rnd} from '../components/motion';

/**
 * The whiteboard look's writing. Text is revealed one character at a time, left to right inside each glyph, at a
 * marker's pace, so a line reads as being written rather than fading in. Anything mid-stroke carries a `data-pen`
 * attribute with its progress; the PenHand layer finds it after layout and parks the marker tip on it.
 */

/** characters per second a marker manages on a board; headlines are slower, notes quicker */
export const CPS = 26;

/** how many frames a run of text takes to write at `cps` */
export const writeFrames = (text: string, fps: number, cps = CPS) => Math.ceil((String(text).replace(/\s+/g, '').length / cps) * fps);

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
export const Write: React.FC<WriteProps> = ({text, frame, fps, start = 0, cps = CPS, color, style, wordGap = '0.28em'}) => {
  const per = fps / cps; // frames per character
  let k = 0;
  const words = String(text).split(/\s+/).filter(Boolean);
  return (
    <span style={style}>
      {words.map((w, wi) => {
        const chars = Array.from(w);
        const el = (
          <span key={wi} style={{display: 'inline-block', marginRight: wordGap, whiteSpace: 'nowrap'}}>
            {chars.map((ch, ci) => {
              const at = start + k * per;
              k += 1;
              const p = Math.max(0, Math.min(1, (frame - at) / per));
              const writing = p > 0 && p < 1;
              return (
                <span
                  key={ci}
                  data-pen={writing ? p : undefined}
                  data-pen-color={writing ? color : undefined}
                  style={{display: 'inline-block', clipPath: p >= 1 ? undefined : `inset(-0.2em ${(1 - p) * 100}% -0.25em 0)`, visibility: p <= 0 ? 'hidden' : undefined}}
                >
                  {ch}
                </span>
              );
            })}
          </span>
        );
        return el;
      })}
    </span>
  );
};

/** Write that starts each word when it is spoken (for narration on the board); `words` carry absolute times. */
export const WriteSpoken: React.FC<{words: {w: string; s: number; e: number}[]; t: number; fps: number; color?: string; style?: React.CSSProperties; wordGap?: string}> = ({words, t, color, style, wordGap = '0.28em'}) => (
  <span style={style}>
    {words.map((w, wi) => {
      const chars = Array.from(w.w);
      const dur = Math.max(0.12, Math.min(0.6, w.e - w.s + 0.08));
      return (
        <span key={wi} style={{display: 'inline-block', marginRight: wordGap, whiteSpace: 'nowrap'}}>
          {chars.map((ch, ci) => {
            const a = w.s - 0.04 + (ci / chars.length) * dur;
            const p = Math.max(0, Math.min(1, (t - a) / (dur / chars.length)));
            const writing = p > 0 && p < 1;
            return (
              <span key={ci} data-pen={writing ? p : undefined} data-pen-color={writing ? color : undefined} style={{display: 'inline-block', clipPath: p >= 1 ? undefined : `inset(-0.2em ${(1 - p) * 100}% -0.25em 0)`, visibility: p <= 0 ? 'hidden' : undefined}}>
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

type DoodleProps = {name: string; size: number; draw: number; stroke: string; width?: number; style?: React.CSSProperties; seed?: number; fill?: string};

/** A Lucide outline drawn on stroke by stroke, with a little wobble so it reads as a marker, not a vector. */
export const Doodle: React.FC<DoodleProps> = ({name, size, draw, stroke, width = 1.6, style, seed = 1, fill}) => {
  const nodes = DOODLES[name];
  if (!nodes) return null;
  const n = nodes.length;
  const tilt = (rnd(seed) - 0.5) * 6;
  return (
    <svg width={size} height={size} viewBox="-1 -1 26 26" fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" style={{overflow: 'visible', transform: `rotate(${tilt}deg)`, ...style}}>
      {fill ? <g opacity={Math.max(0, draw - 0.85) * 4} fill={fill} stroke="none">{nodes.map(([tag, attrs], i) => (tag === 'path' || tag === 'circle' || tag === 'rect' || tag === 'ellipse' || tag === 'polygon' ? React.createElement(tag, {key: i, ...attrs}) : null))}</g> : null}
      {nodes.map(([tag, attrs], i) => {
        // each sub-stroke gets an equal slice of the draw; the pen moves on to the next when one is done
        const p = Math.max(0, Math.min(1, draw * n - i));
        const writing = p > 0 && p < 1;
        const dash = p < 1 ? {pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - p} : {};
        if (p <= 0) return null;
        return React.createElement(tag, {key: i, ...attrs, ...dash, 'data-pen': writing ? p : undefined, 'data-pen-color': writing ? stroke : undefined, 'data-pen-path': writing ? 1 : undefined});
      })}
    </svg>
  );
};

// ------------------------------------------------------------------ the hand
type Tip = {x: number; y: number; color?: string} | null;

/**
 * Jeffrey's own line drawing of a hand holding a pencil (public/hand.png, white background cut out, the hand filled
 * opaque so it covers what it writes over). The pencil tip is at HAND_TIP in the image; the image is placed so that
 * point sits at (0,0) of its box, and the arm runs off the bottom of the frame.
 */
const HAND_TIP = {x: 2 / 404, y: 0 / 752}; // the tip, as a fraction of the image's width and height
const HAND_RATIO = 752 / 404;
export const MarkerHand: React.FC<{size: number; color?: string; brand: Brand}> = ({size}) => {
  const w = size * 0.62;
  const h = w * HAND_RATIO;
  return <Img src={staticFile('hand.png')} style={{display: 'block', width: w, height: h, transform: `translate(${-HAND_TIP.x * 100}%, ${-HAND_TIP.y * 100}%)`}} />;
};

/**
 * Finds whatever is being written or drawn on this frame and parks the marker on it. Text marks the character
 * in progress (`data-pen` = 0..1 across the glyph); sketched strokes mark the path (`data-pen-path`), and the tip
 * is read off the path at that length. Positions are measured after layout, in composition pixels.
 */
export const PenHand: React.FC<{brand: Brand}> = ({brand}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const [tip, setTip] = useState<Tip>(null);
  const last = useRef<Tip>(null);
  const own = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // the layer's own element is attached before this effect runs; its parent is the composition root
    const root = own.current?.parentElement;
    if (!root) return;
    const rr = root.getBoundingClientRect();
    const scale = rr.width / width || 1;
    const els = Array.from(root.querySelectorAll<HTMLElement | SVGGeometryElement>('[data-pen]'));
    let found: Tip = null;
    for (const el of els) {
      const p = Number(el.getAttribute('data-pen'));
      const color = el.getAttribute('data-pen-color') || undefined;
      if (el.hasAttribute('data-pen-path') && 'getTotalLength' in el) {
        const g = el as SVGGeometryElement;
        try {
          const pt = g.getPointAtLength(g.getTotalLength() * p);
          const m = g.getScreenCTM();
          if (!m) continue;
          const x = m.a * pt.x + m.c * pt.y + m.e;
          const y = m.b * pt.x + m.d * pt.y + m.f;
          found = {x: (x - rr.left) / scale, y: (y - rr.top) / scale, color};
        } catch {
          continue;
        }
      } else {
        const r = el.getBoundingClientRect();
        found = {x: (r.left - rr.left + r.width * p) / scale, y: (r.top - rr.top + r.height * 0.78) / scale, color};
      }
      break;
    }
    if (JSON.stringify(found) !== JSON.stringify(last.current)) {
      last.current = found;
      setTip(found);
    }
  }, [frame, width]);
  const size = Math.min(width, height) * 0.42;
  return (
    <AbsoluteFill ref={own} style={{pointerEvents: 'none'}}>
      {tip ? (
        <div style={{position: 'absolute', left: tip.x, top: tip.y, filter: 'drop-shadow(4px 8px 8px rgba(0,0,0,0.14))'}}>
          <MarkerHand size={size} color={tip.color} brand={brand} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
