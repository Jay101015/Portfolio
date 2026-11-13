import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene} from '../types';
import {SketchPath, SketchRect} from './sketch';

/**
 * Page work: a real article or official page worked on as it is read out. The real words are swiped with a
 * highlighter, boxed or underlined on the word that says them, in place of a still page under paraphrased cards
 * (`marks="highlight 12,18,46,7@China; box 10,52,60,14@analysts; underline 12,40,30@fell"`).
 *
 * A cue is {t, do: 'mark', kind, x, y, w, h, color}. x, y is the rectangle's top-left corner and w, h its size, all in
 * per cent of the picture (read them off the grid picture scripts/mark-grid.py draws); for an underline x, y is the
 * line's left end and w its length. color is 'marker' (a highlight's default), 'ink' (a box's and an underline's
 * default), 'green' or 'red': red only ever means a loss, so it is never a default.
 *
 * The page holds still while it is worked on (PaperBroll turns the push-in off), so a mark stays on its words.
 */
export type PageKind = 'highlight' | 'box' | 'underline';
export type PageMarkCue = {t: number; do: 'mark'; kind: PageKind; x: number; y: number; w: number; h?: number; color?: string};

const KINDS: string[] = ['highlight', 'box', 'underline'];
export const isPageMark = (c: unknown): c is PageMarkCue => !!c && (c as {do?: string}).do === 'mark' && KINDS.includes(String((c as {kind?: string}).kind));
export const pageMarks = (scene: Scene): PageMarkCue[] => ((scene.cues ?? []) as unknown[]).filter(isPageMark);
export const hasPageMarks = (scene: Scene) => pageMarks(scene).length > 0;

const SWIPE = 0.35; // seconds for the highlighter to cross its words
const PEN = 0.5; // seconds for the pen to draw a box; an underline takes a little less
const rand = (k: number, salt: number) => {
  const x = Math.sin(k * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));

/** the pen's colour: the highlighter's yellow for a highlight (ink would black the words out), ink for a box or an
 * underline, green or red only when the script wrote it */
const penColor = (m: PageMarkCue, brand: Brand) => {
  if (m.color === 'red') return brand.accent2;
  if (m.color === 'green') return brand.fill ?? brand.accent;
  if (m.kind === 'highlight' || m.color === 'marker') return brand.marker ?? '#ffe66d';
  return brand.ink;
};

/** The highlighter's swipe, `p` of the way across (0..1): a bar with a chisel tip's slanted ends and slightly uneven
 * long edges, all of it inside the rectangle typed, so it never spills onto the line above or below. */
const swipe = (w: number, h: number, p: number, seed: number) => {
  const slant = Math.min(h * 0.1, w * 0.04);
  const xr = slant + (w - slant) * p; // the tip's top corner; its bottom corner trails by the slant
  const n = Math.max(3, Math.min(12, Math.round(w / Math.max(40, h * 1.5))));
  const top: string[] = [];
  const bottom: string[] = [];
  for (let i = 0; i <= n; i++) {
    const xt = slant + ((w - slant) * i) / n;
    const xb = ((w - slant) * i) / n;
    if (xt <= xr) top.push(`${xt.toFixed(1)},${(h * (0.01 + 0.05 * rand(seed, i))).toFixed(1)}`);
    if (xb <= xr - slant) bottom.push(`${xb.toFixed(1)},${(h * (0.99 - 0.05 * rand(seed, 40 + i))).toFixed(1)}`);
  }
  top.push(`${xr.toFixed(1)},${(h * 0.03).toFixed(1)}`);
  bottom.push(`${(xr - slant).toFixed(1)},${(h * 0.97).toFixed(1)}`);
  return [...top, ...bottom.reverse()].join(' ');
};

/** The three kinds drawn over a picture `w` by `h` pixels, each from the frame its word is said. */
export const PageMarks: React.FC<{scene: Scene; brand: Brand; w: number; h: number}> = ({scene, brand, w, h}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const marks = pageMarks(scene);
  if (!marks.length) return null;
  // the pen is as thick as it would be on a page this size: the same page shown smaller (a Short) gets a finer line
  const pen = clamp(w * 0.0032, 3, 6);
  return (
    <div style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
      {marks.map((m, i) => {
        const at = Math.round((m.t - scene.start) * fps);
        if (frame < at) return null;
        const px = clamp(Number(m.x), 0, 100);
        const py = clamp(Number(m.y), 0, 100);
        const x = (px / 100) * w;
        const y = (py / 100) * h;
        const rw = (clamp(Number(m.w), 0, 100 - px) / 100) * w;
        const rh = (clamp(Number(m.h ?? 0), 0, 100 - py) / 100) * h;
        const col = penColor(m, brand);
        const seed = scene.id * 7 + i;
        if (m.kind === 'highlight') {
          if (rw <= 0 || rh <= 0) return null;
          const q = clamp((frame - at) / Math.max(1, Math.round(fps * SWIPE)), 0, 1);
          const p = q * (2 - q) * 0.4 + q * 0.6; // a steady hand, easing off a little at the end of the line
          // multiply: the yellow tints the page and the real words show through it, as ink does through a highlighter
          return (
            <svg key={i} width={rw} height={rh} viewBox={`0 0 ${rw} ${rh}`} style={{position: 'absolute', left: x, top: y, mixBlendMode: 'multiply', opacity: m.color === 'red' || m.color === 'green' ? 0.5 : 0.92}}>
              <polygon points={swipe(rw, rh, p, seed)} fill={col} />
            </svg>
          );
        }
        if (m.kind === 'box') {
          if (rw <= 0 || rh <= 0) return null;
          return (
            <svg key={i} width={rw} height={rh} viewBox={`0 0 ${rw} ${rh}`} style={{position: 'absolute', left: x, top: y, overflow: 'visible'}}>
              <SketchRect x={0} y={0} w={rw} h={rh} win={[at, at + Math.round(fps * PEN)]} easeOut options={{stroke: col, strokeWidth: pen, roughness: 0.9, bowing: 1.2, seed}} />
            </svg>
          );
        }
        // an underline: one line of the pen under the words, from its left end, bowing a touch as a hand does
        if (rw <= 0) return null;
        return (
          <svg key={i} width={rw} height={pen * 4} viewBox={`0 0 ${rw} ${pen * 4}`} style={{position: 'absolute', left: x, top: y - pen * 2, overflow: 'visible'}}>
            <SketchPath d={`M0,${pen * 2} Q${rw * 0.35},${pen * 1.4} ${rw * 0.6},${pen * 2} T${rw},${pen * 2}`} win={[at, at + Math.round(fps * PEN * 0.8)]} easeOut options={{stroke: col, strokeWidth: pen, roughness: 1.1, seed}} />
          </svg>
        );
      })}
    </div>
  );
};
