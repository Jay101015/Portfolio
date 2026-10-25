import React from 'react';
import {useCurrentFrame} from 'remotion';
import type {Brand} from '../types';

/**
 * Clearing something off the board. Over `win` ([from, to] scene frames) whatever is inside fades away, and after
 * `win[1]` nothing is left. No eraser, no hand: the board just clears.
 *
 *   <Erase win={[a, b]} brand={brand} width={w} height={h}>…the content…</Erase>
 */
export const eraseProgress = (frame: number, win: [number, number]) => Math.max(0, Math.min(1, (frame - win[0]) / Math.max(1e-6, win[1] - win[0])));

export const Erase: React.FC<{win: [number, number]; brand: Brand; width: number; height: number; x0?: number; children: React.ReactNode; style?: React.CSSProperties}> = ({win, width, height, x0 = 0, children, style}) => {
  const frame = useCurrentFrame();
  const q = eraseProgress(frame, win);
  const done = frame >= win[1];
  const ease = 1 - Math.pow(1 - q, 2);
  return (
    <div style={{position: 'relative', width, height, ...style}}>
      {x0 > 0 ? <div style={{position: 'absolute', inset: 0, clipPath: `inset(0 ${width - x0}px 0 0)`}}>{children}</div> : null}
      {/* only the part right of x0 clears (the whole thing when x0 is 0) */}
      <div style={{position: 'absolute', inset: 0, clipPath: x0 > 0 ? `inset(0 0 0 ${x0}px)` : undefined, opacity: done ? 0 : 1 - ease, visibility: done ? 'hidden' : 'visible'}}>{children}</div>
    </div>
  );
};
