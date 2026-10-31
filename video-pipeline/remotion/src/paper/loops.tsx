import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene} from '../types';
import {useLayout} from '../components/layout';
import {SketchEllipse, SketchPath, SketchRect} from './sketch';
import {PLACE} from './art';

/**
 * Drawn loops: stop-motion animations in the line style that any scene can place where a drawing would go
 * (`anim=coins-jar`, with the same art_at / art_size / art_start). Each moves in steps, eight a second, the pace of
 * a flip book, with the lines boiling between steps; runs a few seconds, breathes, and goes again. Built from the
 * sketch primitives, so they cost nothing to make and always match the hand. The "little animations" Jeffrey asked
 * for, without a character: money things doing money things.
 */
export const LOOPS = [
  'coins-jar', 'stack-grow', 'arrow-up', 'clock', 'plant-grow',
  'card-tap', 'piggy-bank', 'money-flies', 'house-build', 'calendar-flip', 'scales', 'bar-race',
  'receipt-print', 'phone-ping', 'snowball', 'hourglass', 'bills-pile',
] as const;

const STEPS = 8; // steps a second: stop motion on threes at 24 fps, near enough
const step = (t: number) => Math.floor(t * STEPS) / STEPS;
const clamp01 = (q: number) => Math.max(0, Math.min(1, q));
const easeOut = (q: number) => 1 - Math.pow(1 - clamp01(q), 3);

export const DrawnLoop: React.FC<{name: string; size: number; brand: Brand; start: number; seed: number; style?: React.CSSProperties}> = ({name, size, brand, start, seed, style}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = (frame - start) / fps;
  if (t < 0) return null;
  const sw = 2.2;
  const o = (stroke: string, k: number, extra: Record<string, unknown> = {}) => ({stroke, strokeWidth: sw, roughness: 1.1, seed: seed * 11 + k, ...extra});
  const ink = brand.ink;
  const green = brand.fill ?? brand.accent;
  const red = brand.accent2;
  const blue = brand.blue ?? brand.accent;
  const paper = brand.panel ?? '#ffffff';
  const solid = (fill: string) => ({fill, fillStyle: 'solid'});
  let body: React.ReactNode = null;

  if (name === 'coins-jar') {
    // a jar; six coins drop in one by one, each squashing as it lands, then a breath, then again
    const tt = step(t) % 4.4;
    const coins: React.ReactNode[] = [];
    for (let i = 0; i < 6; i++) {
      const dt = tt - i * 0.5;
      if (dt < 0) continue;
      const fall = Math.pow(clamp01(dt / 0.38), 2);
      const level = 88 - i * 5.4;
      const y = -10 + (level + 10) * fall;
      const sq = dt > 0.38 && dt < 0.5 ? 1.22 : 1;
      const x = 50 + (i % 2 ? 7 : -7) * (i > 0 ? 1 : 0);
      coins.push(<SketchEllipse key={i} cx={x} cy={y} w={19 * sq} h={7.5 / sq} draw={1} options={o(ink, 20 + i, {...solid(green), strokeWidth: sw * 0.9})} />);
    }
    body = (
      <>
        <SketchPath d="M30,34 L30,88 Q30,94 36,94 L64,94 Q70,94 70,88 L70,34" draw={1} options={o(ink, 1, {strokeWidth: sw * 1.25})} />
        <SketchPath d="M26,34 L74,34" draw={1} options={o(ink, 2, {strokeWidth: sw * 1.25})} />
        <SketchPath d="M34,27 L66,27" draw={1} options={o(ink, 3)} />
        {coins}
      </>
    );
  } else if (name === 'stack-grow') {
    // notes slide in from the right and stack, the top one green
    const tt = step(t) % 4.6;
    const notes: React.ReactNode[] = [];
    for (let i = 0; i < 7; i++) {
      const dt = tt - i * 0.42;
      if (dt < 0) continue;
      const q = easeOut(dt / 0.35);
      const y = 84 - i * 7.2;
      const x = 50 + (1 - q) * 64;
      const top = i === 6;
      notes.push(<SketchRect key={i} x={x - 26} y={y - 4} w={52} h={9} draw={1} options={o(top ? green : ink, 30 + i, solid(top ? green : paper))} />);
    }
    body = (
      <>
        {notes}
        <SketchPath d="M10,92 L90,92" draw={1} options={o(ink, 4)} />
      </>
    );
  } else if (name === 'arrow-up') {
    // the brand's arrow drawing itself up and to the right, the head landing with a pulse
    const tt = step(t) % 3.6;
    const pulse = tt > 1.3 && tt < 1.7 ? 1 + 0.14 * Math.sin(((tt - 1.3) / 0.4) * Math.PI) : 1;
    body = (
      <>
        <SketchPath d="M12,80 L34,60 L46,70 L84,28" draw={clamp01(tt / 1.3)} options={o(green, 5, {strokeWidth: sw * 2.4})} />
        <g transform={`translate(84 28) scale(${pulse}) translate(-84 -28)`}>
          <SketchPath d="M66,26 L86,26 L86,46" draw={clamp01((tt - 1.0) / 0.3)} options={o(green, 6, {strokeWidth: sw * 2.4})} />
        </g>
      </>
    );
  } else if (name === 'clock') {
    // the minute hand ticks round once in three seconds, the hour hand creeps
    const tt = step(t) % 6;
    const a = (tt / 3) * Math.PI * 2 - Math.PI / 2;
    const hr = (tt / 6) * (Math.PI / 3) - Math.PI / 2 + (seed % 7) * 0.9;
    body = (
      <>
        <SketchEllipse cx={50} cy={50} w={76} h={76} draw={1} options={o(ink, 7, {strokeWidth: sw * 1.3})} />
        {[0, 1, 2, 3].map((k) => {
          const ang = (k * Math.PI) / 2;
          return <SketchPath key={k} d={`M${50 + Math.cos(ang) * 31},${50 + Math.sin(ang) * 31} L${50 + Math.cos(ang) * 36},${50 + Math.sin(ang) * 36}`} draw={1} options={o(ink, 8 + k)} />;
        })}
        <SketchPath d={`M50,50 L${50 + Math.cos(hr) * 18},${50 + Math.sin(hr) * 18}`} draw={1} options={o(ink, 12, {strokeWidth: sw * 1.7})} />
        <SketchPath d={`M50,50 L${50 + Math.cos(a) * 28},${50 + Math.sin(a) * 28}`} draw={1} options={o(green, 13, {strokeWidth: sw * 1.3})} />
      </>
    );
  } else if (name === 'plant-grow') {
    // a pot; the stem grows, two leaves open, a flower the colour of the marker on top; then again
    const tt = step(t) % 5;
    const g = easeOut(tt / 2.4);
    body = (
      <>
        <SketchPath d="M34,86 L66,86 L62,97 L38,97 Z" draw={1} options={o(ink, 14)} />
        <SketchPath d="M50,86 Q48,70 50,56 Q52,42 50,30" draw={g} options={o(green, 15, {strokeWidth: sw * 1.5})} />
        {g > 0.45 ? <SketchPath d="M50,62 Q38,58 34,48 Q46,48 50,62" draw={clamp01((g - 0.45) / 0.25)} options={o(green, 16, {fill: green, fillStyle: 'hachure', hachureGap: 3})} /> : null}
        {g > 0.65 ? <SketchPath d="M50,50 Q62,46 66,36 Q54,36 50,50" draw={clamp01((g - 0.65) / 0.25)} options={o(green, 17, {fill: green, fillStyle: 'hachure', hachureGap: 3})} /> : null}
        {g > 0.9 ? <SketchEllipse cx={50} cy={27} w={13} h={13} draw={clamp01((g - 0.9) / 0.1)} options={o(red, 18, solid(brand.marker ?? '#ffe66d'))} /> : null}
      </>
    );
  } else if (name === 'card-tap') {
    // a card comes in, taps the reader, a green tick, the card goes
    const tt = step(t) % 3.0;
    const approach = easeOut(tt / 0.7);
    const leave = tt > 1.9 ? easeOut((tt - 1.9) / 0.5) : 0;
    const cx = 14 + 28 * approach - 30 * leave;
    const cy = 32 + 20 * approach - 14 * leave;
    const rot = -22 + 22 * approach - 10 * leave;
    body = (
      <>
        <SketchRect x={56} y={42} w={30} h={46} draw={1} options={o(ink, 20, {strokeWidth: sw * 1.2})} />
        <SketchRect x={62} y={48} w={18} h={12} draw={1} options={o(ink, 21, solid('#EEF2F8'))} />
        {[0, 1, 2].map((k) => <SketchRect key={k} x={63 + k * 6} y={68} w={4} h={4} draw={1} options={o(ink, 22 + k)} />)}
        <g transform={`rotate(${rot} ${cx} ${cy})`}>
          <SketchRect x={cx - 15} y={cy - 9} w={30} h={19} draw={1} options={o(ink, 25, solid(paper))} />
          <SketchPath d={`M${cx - 15},${cy - 3} L${cx + 15},${cy - 3}`} draw={1} options={o(ink, 26, {strokeWidth: sw * 1.6})} />
        </g>
        {tt > 1.0 ? <SketchPath d="M60,26 L67,33 L82,16" draw={clamp01((tt - 1.0) / 0.4)} options={o(green, 27, {strokeWidth: sw * 2})} /> : null}
      </>
    );
  } else if (name === 'piggy-bank') {
    // coins into the slot, the pig squashing as each one lands
    const tt = step(t) % 4.0;
    const coins: React.ReactNode[] = [];
    let squash = 1;
    for (let i = 0; i < 5; i++) {
      const dt = tt - 0.2 - i * 0.6;
      if (dt < 0 || dt > 0.45) continue;
      const q = clamp01(dt / 0.35);
      if (q < 1) coins.push(<SketchEllipse key={i} cx={50} cy={2 + 30 * q * q} w={16} h={7} draw={1} options={o(ink, 30 + i, solid(green))} />);
      else squash = 0.93;
    }
    body = (
      <>
        {coins}
        <g transform={`translate(0 ${(1 - squash) * 86}) scale(1 ${squash})`}>
          <SketchEllipse cx={48} cy={62} w={62} h={42} draw={1} options={o(ink, 36, {strokeWidth: sw * 1.2, ...solid(paper)})} />
          <SketchEllipse cx={78} cy={60} w={22} h={18} draw={1} options={o(ink, 37, solid(paper))} />
          <SketchEllipse cx={88} cy={62} w={9} h={7} draw={1} options={o(ink, 38)} />
          <SketchPath d="M72,50 L76,42 L81,50" draw={1} options={o(ink, 39)} />
          <SketchEllipse cx={80} cy={56} w={2.5} h={2.5} draw={1} options={o(ink, 40, solid(ink))} />
          <SketchRect x={30} y={80} w={8} h={10} draw={1} options={o(ink, 41)} />
          <SketchRect x={56} y={80} w={8} h={10} draw={1} options={o(ink, 42)} />
          <SketchPath d="M42,42 L56,42" draw={1} options={o(ink, 43, {strokeWidth: sw * 2.2})} />
          <SketchPath d="M18,60 Q10,56 14,50" draw={1} options={o(ink, 44)} />
        </g>
      </>
    );
  } else if (name === 'money-flies') {
    // notes leaving a wallet, up and away to the right, fading as they go
    const tt = step(t) % 3.2;
    const notes: React.ReactNode[] = [];
    for (let i = 0; i < 5; i++) {
      const dt = tt - i * 0.35;
      if (dt < 0 || dt > 1.5) continue;
      const q = dt / 1.5;
      const x = 32 + 56 * q;
      const y = 62 - 58 * q + 22 * q * q + (i % 2 ? 6 : -4) * q;
      notes.push(
        <g key={i} transform={`rotate(${-18 + 70 * q} ${x} ${y})`} opacity={1 - q * 0.65}>
          <SketchRect x={x - 10} y={y - 6} w={20} h={12} draw={1} options={o(ink, 45 + i, solid(green))} />
          <SketchEllipse cx={x} cy={y} w={6} h={6} draw={1} options={o(ink, 50 + i)} />
        </g>
      );
    }
    body = (
      <>
        <SketchRect x={12} y={60} w={38} h={26} draw={1} options={o(ink, 55, {strokeWidth: sw * 1.2, ...solid(paper)})} />
        <SketchPath d="M12,68 L50,68" draw={1} options={o(ink, 56)} />
        <SketchRect x={40} y={70} w={8} h={7} draw={1} options={o(ink, 57)} />
        {notes}
      </>
    );
  } else if (name === 'house-build') {
    // a house going up a piece at a time: the ground, the walls, the roof, the door, the windows, the chimney
    const tt = step(t) % 3.8;
    const part = (at: number) => clamp01((tt - at) / 0.3);
    body = (
      <>
        <SketchPath d="M14,88 L86,88" draw={part(0.2)} options={o(ink, 60, {strokeWidth: sw * 1.3})} />
        {tt > 0.6 ? <SketchRect x={28} y={56} w={44} h={32} draw={part(0.6)} options={o(ink, 61, {strokeWidth: sw * 1.2})} /> : null}
        {tt > 1.0 ? <SketchPath d="M22,57 L50,30 L78,57" draw={part(1.0)} options={o(ink, 62, {strokeWidth: sw * 1.3})} /> : null}
        {tt > 1.4 ? <SketchRect x={44} y={70} w={12} h={18} draw={part(1.4)} options={o(ink, 63)} /> : null}
        {tt > 1.8 ? <SketchRect x={32} y={62} w={10} h={9} draw={part(1.8)} options={o(blue, 64)} /> : null}
        {tt > 1.8 ? <SketchRect x={58} y={62} w={10} h={9} draw={part(1.95)} options={o(blue, 65)} /> : null}
        {tt > 2.2 ? <SketchRect x={62} y={36} w={7} h={13} draw={part(2.2)} options={o(ink, 66)} /> : null}
        {tt > 2.6 ? <SketchPath d="M64,30 Q66,24 70,26 Q74,20 78,24" draw={part(2.6)} options={o(ink, 67, {strokeWidth: sw * 0.8})} /> : null}
        {tt > 2.9 ? <SketchPath d="M46,80 L54,80" draw={1} options={o(green, 68, {strokeWidth: sw * 1.5})} /> : null}
      </>
    );
  } else if (name === 'calendar-flip') {
    // a page a half-second, the number climbing: time passing
    const tt = step(t) % 6;
    const k = Math.floor(tt * STEPS) % 4;
    const n = 1 + (Math.floor(tt / 0.5) % 12);
    const sy = k === 2 ? 0.5 : k === 3 ? 0.12 : 1;
    body = (
      <>
        <SketchRect x={24} y={22} w={52} h={62} draw={1} options={o(ink, 70, {strokeWidth: sw * 1.2, ...solid(paper)})} />
        <SketchRect x={24} y={22} w={52} h={14} draw={1} options={o(ink, 71, solid(ink))} />
        <SketchRect x={34} y={15} w={4} h={12} draw={1} options={o(ink, 72, solid(paper))} />
        <SketchRect x={62} y={15} w={4} h={12} draw={1} options={o(ink, 73, solid(paper))} />
        <g transform={`translate(0 ${36 * (1 - sy)}) scale(1 ${sy})`}>
          <text x={50} y={74} textAnchor="middle" fontFamily={brand.display} fontSize={34} fill={ink}>{n}</text>
        </g>
      </>
    );
  } else if (name === 'scales') {
    // a balance rocking: coins on one pan, a bill on the other
    const tt = step(t) % 3.0;
    const a = 11 * Math.sin((tt / 3.0) * Math.PI * 2);
    const rad = (a * Math.PI) / 180;
    const lx = 50 - 30 * Math.cos(rad);
    const ly = 40 - 30 * Math.sin(rad);
    const rx = 50 + 30 * Math.cos(rad);
    const ry = 40 + 30 * Math.sin(rad);
    const pan = (x: number, y: number, k: number) => (
      <>
        <SketchPath d={`M${x},${y} L${x - 9},${y + 16} M${x},${y} L${x + 9},${y + 16}`} draw={1} options={o(ink, k)} />
        <SketchEllipse cx={x} cy={y + 17} w={24} h={6} draw={1} options={o(ink, k + 1, solid(paper))} />
      </>
    );
    body = (
      <>
        <SketchPath d="M50,90 L50,40 M30,90 L70,90" draw={1} options={o(ink, 75, {strokeWidth: sw * 1.4})} />
        <g transform={`rotate(${a} 50 40)`}>
          <SketchPath d="M20,40 L80,40" draw={1} options={o(ink, 76, {strokeWidth: sw * 1.4})} />
        </g>
        <SketchEllipse cx={50} cy={40} w={6} h={6} draw={1} options={o(ink, 77, solid(ink))} />
        {pan(lx, ly, 78)}
        {pan(rx, ry, 80)}
        {[0, 1, 2].map((k) => <SketchEllipse key={k} cx={lx} cy={ly + 14 - k * 3} w={14} h={5} draw={1} options={o(ink, 82 + k, solid(green))} />)}
        <SketchRect x={rx - 8} y={ry + 6} w={16} h={10} draw={1} options={o(red, 85, {fill: red, fillStyle: 'hachure', hachureGap: 3})} />
      </>
    );
  } else if (name === 'bar-race') {
    // three bars growing: the green one starts slow and ends highest, the way compounding does
    const tt = step(t) % 3.4;
    const q = clamp01(tt / 2.2);
    const bars: [number, string, number][] = [[30 * q, ink, 20], [46 * Math.sqrt(q), blue, 44], [66 * q * q, green, 68]];
    body = (
      <>
        <SketchPath d="M10,88 L92,88" draw={1} options={o(ink, 90, {strokeWidth: sw * 1.3})} />
        {bars.map(([h, col, x], k) => (h > 1 ? <SketchRect key={k} x={x} y={88 - h} w={18} h={h} draw={1} options={o(col, 91 + k, {fill: col, fillStyle: 'hachure', hachureGap: 3.5})} /> : null))}
      </>
    );
  } else if (name === 'receipt-print') {
    // a receipt coming out of the till, line by line, and curling at the end
    const tt = step(t) % 3.4;
    const len = 56 * clamp01(tt / 2.0);
    const lines: React.ReactNode[] = [];
    for (let y = 40; y < 30 + len - 4; y += 7) lines.push(<SketchPath key={y} d={`M41,${y} L${y % 14 === 5 ? 56 : 60},${y}`} draw={1} options={o(ink, 100 + y, {strokeWidth: sw * 0.8})} />);
    body = (
      <>
        <SketchRect x={28} y={12} w={44} h={18} draw={1} options={o(ink, 95, {strokeWidth: sw * 1.3, ...solid('#EEF2F8')})} />
        <SketchPath d="M34,30 L66,30" draw={1} options={o(ink, 96, {strokeWidth: sw * 1.6})} />
        {len > 2 ? <SketchRect x={36} y={30} w={28} h={len} draw={1} options={o(ink, 97, solid(paper))} /> : null}
        {lines}
        {len > 50 ? <SketchPath d={`M36,${30 + len} Q50,${30 + len + 6} 64,${30 + len}`} draw={1} options={o(ink, 98)} /> : null}
        {len > 50 ? <SketchPath d="M42,80 L58,80" draw={1} options={o(red, 99, {strokeWidth: sw * 1.6})} /> : null}
      </>
    );
  } else if (name === 'phone-ping') {
    // notifications dropping onto a phone's screen one after another
    const tt = step(t) % 3.6;
    const notes: React.ReactNode[] = [];
    for (let i = 0; i < 4; i++) {
      const dt = tt - 0.3 - i * 0.45;
      if (dt < 0) continue;
      const q = easeOut(dt / 0.25);
      const y = 22 + i * 12 - (1 - q) * 10;
      notes.push(
        <g key={i} opacity={q}>
          <SketchRect x={38} y={y} w={24} h={9} draw={1} options={o(ink, 110 + i, solid('#EEF2F8'))} />
          <SketchEllipse cx={60} cy={y + 1.5} w={4} h={4} draw={1} options={o(red, 115 + i, solid(red))} />
        </g>
      );
    }
    body = (
      <>
        <SketchRect x={33} y={12} w={34} h={70} draw={1} options={o(ink, 120, {strokeWidth: sw * 1.4, ...solid(paper)})} />
        <SketchRect x={36} y={18} w={28} h={56} draw={1} options={o(ink, 121, {strokeWidth: sw * 0.8})} />
        <SketchPath d="M46,78 L54,78" draw={1} options={o(ink, 122)} />
        {notes}
      </>
    );
  } else if (name === 'snowball') {
    // a snowball rolling down the slope and growing as it goes: compounding
    const tt = step(t) % 3.8;
    const q = clamp01(tt / 2.6);
    const cx = 14 + 68 * q;
    const r = 4 + 13 * q;
    const slopeY = (x: number) => 30 + ((x - 8) / 84) * 56;
    const cy = slopeY(cx) - r * 0.95;
    const ang = q * Math.PI * 4;
    body = (
      <>
        <SketchPath d="M8,30 L92,86" draw={1} options={o(ink, 130, {strokeWidth: sw * 1.3})} />
        <SketchEllipse cx={cx} cy={cy} w={r * 2} h={r * 2} draw={1} options={o(ink, 131, {strokeWidth: sw * 1.1, ...solid(paper)})} />
        <SketchPath d={`M${cx},${cy} L${cx + Math.cos(ang) * r * 0.7},${cy + Math.sin(ang) * r * 0.7}`} draw={1} options={o(ink, 132, {strokeWidth: sw * 0.8})} />
        {q > 0.5 ? <SketchPath d={`M${cx - r * 0.5},${cy - r * 0.3} Q${cx - r * 0.2},${cy - r * 0.6} ${cx + r * 0.2},${cy - r * 0.4}`} draw={1} options={o(ink, 133, {strokeWidth: sw * 0.7})} /> : null}
      </>
    );
  } else if (name === 'hourglass') {
    // sand running through: the top emptying, the bottom filling, a thin stream between
    const tt = step(t) % 4.6;
    const p = clamp01(tt / 3.6);
    body = (
      <>
        <SketchPath d="M30,14 L70,14 L50,50 Z" draw={1} options={o(ink, 140, {strokeWidth: sw * 1.2})} />
        <SketchPath d="M30,86 L70,86 L50,50 Z" draw={1} options={o(ink, 141, {strokeWidth: sw * 1.2})} />
        <SketchPath d="M26,14 L74,14 M26,86 L74,86" draw={1} options={o(ink, 142, {strokeWidth: sw * 1.8})} />
        {p < 0.98 ? <SketchPath d={`M${30 + 20 * p},${14 + 36 * p} L${70 - 20 * p},${14 + 36 * p} L50,50 Z`} draw={1} options={o(ink, 143, {fill: brand.marker ?? '#ffe66d', fillStyle: 'hachure', hachureGap: 2.5, strokeWidth: sw * 0.6})} /> : null}
        {p > 0.03 ? <SketchPath d={`M30,86 L70,86 L${50 + 20 * p},${86 - 36 * p} L${50 - 20 * p},${86 - 36 * p} Z`} draw={1} options={o(ink, 144, {fill: brand.marker ?? '#ffe66d', fillStyle: 'hachure', hachureGap: 2.5, strokeWidth: sw * 0.6})} /> : null}
        {p > 0.02 && p < 0.98 ? <SketchPath d={`M50,50 L50,${86 - 36 * p}`} draw={1} options={o(ink, 145, {strokeWidth: sw * 0.7})} /> : null}
      </>
    );
  } else if (name === 'bills-pile') {
    // envelopes landing one on another, each a little askew
    const tt = step(t) % 3.8;
    const bills: React.ReactNode[] = [];
    for (let i = 0; i < 5; i++) {
      const dt = tt - 0.2 - i * 0.4;
      if (dt < 0) continue;
      const q = Math.pow(clamp01(dt / 0.35), 2);
      const land = 66 - i * 4.5;
      const y = -14 + (land + 14) * q;
      const x = 34 + ((i % 3) - 1) * 6;
      const rot = (i % 2 ? 7 : -6) * q;
      bills.push(
        <g key={i} transform={`rotate(${rot} ${x + 16} ${y + 10})`}>
          <SketchRect x={x} y={y} w={32} h={20} draw={1} options={o(ink, 150 + i, solid(paper))} />
          <SketchPath d={`M${x},${y} L${x + 16},${y + 11} L${x + 32},${y}`} draw={1} options={o(ink, 155 + i, {strokeWidth: sw * 0.8})} />
          {i === 4 ? <SketchRect x={x + 20} y={y + 3} w={8} h={6} draw={1} options={o(red, 160, solid(red))} /> : null}
        </g>
      );
    }
    body = (
      <>
        <SketchPath d="M14,88 L86,88" draw={1} options={o(ink, 161)} />
        {bills}
      </>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{overflow: 'visible', display: 'block', ...style}}>
      {body}
    </svg>
  );
};

/** A drawn loop placed on a scene the way a drawing is (`anim=`, art_at, art_size, art_start). */
export const LoopLayer: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  const {fps} = useVideoConfig();
  const {height, width, isVertical} = useLayout();
  const name = scene.props.anim ? String(scene.props.anim) : '';
  if (!name || !brand.board || !(LOOPS as readonly string[]).includes(name)) return null;
  const at = isVertical ? 'bl' : String(scene.props.art_at ?? 'tr');
  const size = height * (isVertical ? Math.min(0.2, Number(scene.props.art_size ?? 0.2)) : Math.max(0.12, Math.min(0.6, Number(scene.props.art_size ?? 0.28))));
  const start = Math.round(Number(scene.props.art_start ?? 0.6) * fps);
  const free = scene.props.art_x !== undefined && scene.props.art_y !== undefined;
  const place: React.CSSProperties = free ? {left: Number(scene.props.art_x) * width - size / 2, top: Number(scene.props.art_y) * height - size / 2} : PLACE[at] ?? PLACE.tr;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div style={{position: 'absolute', ...place, width: size, height: size}}>
        <DrawnLoop name={name} size={size} brand={brand} start={start} seed={scene.id * 3 + 2} />
      </div>
    </AbsoluteFill>
  );
};
