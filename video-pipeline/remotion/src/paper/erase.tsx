import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand} from '../types';

/**
 * Rubbing something off the board. Over `win` ([from, to] scene frames) a felt pad sweeps the box in three passes,
 * left to right, right to left, left to right, from the top down, and whatever is inside `Erasable` is wiped as
 * the pad goes over it. The sweep is also a pen path with `data-pen-win`, so the hand travels with the pad.
 *
 *   <Erase win={[a, b]} brand={brand} width={w} height={h}>…the content…</Erase>
 *
 * Before `win[0]` the content shows untouched; after `win[1]` nothing is left.
 */
export const eraseProgress = (frame: number, win: [number, number]) => Math.max(0, Math.min(1, (frame - win[0]) / Math.max(1e-6, win[1] - win[0])));

const PASSES = 3;

/** where the pad is at progress `q` (0..1) inside a box `w` by `h` */
export const padAt = (q: number, w: number, h: number) => {
  const row = Math.min(PASSES - 1, Math.floor(q * PASSES));
  const u = q * PASSES - row;
  const x = (row % 2 === 0 ? u : 1 - u) * w;
  const y = ((row + 0.5) / PASSES) * h;
  return {x, y, row, u};
};

export const Erase: React.FC<{win: [number, number]; brand: Brand; width: number; height: number; x0?: number; children: React.ReactNode; style?: React.CSSProperties}> = ({win, brand, width: fullW, height, x0 = 0, children, style}) => {
  const width = fullW - x0; // the sweep covers only the part right of x0
  const frame = useCurrentFrame();
  const {width: vw} = useVideoConfig();
  const u = vw / 1920;
  const q = eraseProgress(frame, win);
  const done = frame >= win[1];
  const going = frame >= win[0] && !done;
  const padW = 170 * u;
  const padH = 80 * u;
  const p = padAt(q, width, height);
  // the sweep as a path the hand follows: a zigzag through the rows
  const rowH = height / PASSES;
  const d = Array.from({length: PASSES}, (_, r) => {
    const y = (r + 0.5) * rowH;
    return r % 2 === 0 ? `${r === 0 ? 'M' : 'L'}0,${y} L${width},${y}` : `L${width},${y} L0,${y}`;
  }).join(' ');
  // what is wiped: the rows the pad has finished, and the part of the current row behind it
  const clip = done
    ? 'inset(100% 0 0 0)'
    : going
      ? `polygon(${(() => {
          const topDone = p.row * rowH;
          const curTop = topDone;
          const curBot = topDone + rowH;
          const xEdge = p.row % 2 === 0 ? p.x : p.x; // the edge of the pad on the row it is crossing
          // visible region: below the current row entirely, plus the part of the current row the pad has not reached
          const pts = p.row % 2 === 0
            ? [`${xEdge}px ${curTop}px`, `${width}px ${curTop}px`, `${width}px ${height}px`, `0px ${height}px`, `0px ${curBot}px`, `${xEdge}px ${curBot}px`]
            : [`0px ${curTop}px`, `${xEdge}px ${curTop}px`, `${xEdge}px ${curBot}px`, `${width}px ${curBot}px`, `${width}px ${height}px`, `0px ${height}px`];
          return pts.join(', ');
        })()})`
      : undefined;
  return (
    <div style={{position: 'relative', width: fullW, height, ...style}}>
      {x0 > 0 ? <div style={{position: 'absolute', inset: 0, clipPath: `inset(0 ${fullW - x0}px 0 0)`}}>{children}</div> : null}
      <div style={{position: 'absolute', inset: 0, clipPath: x0 > 0 && !clip ? `inset(0 0 0 ${x0}px)` : clip ? clip.replace(/(\d+(?:\.\d+)?)px (\d+(?:\.\d+)?)px/g, (_m, x, y) => `${Number(x) + x0}px ${y}px`) : undefined, visibility: done ? 'hidden' : undefined}}>{children}</div>
      {going ? (
        <>
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{position: 'absolute', left: x0, top: 0, overflow: 'visible', pointerEvents: 'none'}}>
            <path d={d} fill="none" stroke="none" data-pen-win={`${win[0]},${win[1]},l`} data-pen-sub="0,1" />
          </svg>
          {/* the felt pad, a little ahead of the hand's nib so the hand reads as pushing it */}
          <div style={{position: 'absolute', left: x0 + p.x - padW * 0.55, top: p.y - padH * 0.5, width: padW, height: padH, borderRadius: 10 * u, background: '#3a3a3c', boxShadow: `0 ${4 * u}px ${10 * u}px rgba(0,0,0,0.25)`, transform: `rotate(${p.row % 2 === 0 ? -4 : 4}deg)`}}>
            <div style={{position: 'absolute', left: 8 * u, right: 8 * u, bottom: 6 * u, height: 14 * u, borderRadius: 6 * u, background: brand.paper ? '#d9d4c7' : '#cfd3d8', opacity: 0.9}} />
          </div>
        </>
      ) : null}
    </div>
  );
};
