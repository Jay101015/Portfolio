import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene} from '../types';
import {useLayout} from '../components/layout';
import {SketchEllipse, SketchPath, SketchRect} from './sketch';
import {PLACE} from './art';

/**
 * Stop-motion loops: small drawn scenes, six to nine seconds each, that any board, stat or chart can place where a
 * drawing would go (`anim=payday-split`, with the same art_at / art_size / art_start). Each has a beginning, a middle
 * and an end: coins land and the jar wobbles, a price tag flips four times and the cup shrinks, a tax arrow bounces
 * off a shield. They move in steps, eight a second, the pace of a flip book, with the lines boiling between steps,
 * and the craft of animation on top: a squash on every landing, a wobble after it, a wind-up before a move, a quick
 * fade instead of a snap at the end. Drawn by code from the sketch primitives, so each costs nothing and always
 * matches the hand. Money things doing money things; no character.
 */
export const LOOPS = [
  'coins-jar', 'piggy-bank', 'card-tap', 'money-flies', 'bills-pile', 'receipt-print', 'phone-ping',
  'stack-grow', 'bar-race', 'snowball', 'plant-grow', 'arrow-up', 'house-build',
  'calendar-flip', 'clock', 'hourglass', 'scales',
  'payday-split', 'price-creep', 'rent-day', 'interest-grows', 'isa-shield', 'deposit-jar',
] as const;

/** how long each runs before it goes again (seconds): the reel and the director read this */
export const LOOP_SECONDS: Record<string, number> = {
  'coins-jar': 6.4, 'piggy-bank': 6.6, 'card-tap': 5.6, 'money-flies': 5.8, 'bills-pile': 6.4, 'receipt-print': 6.6, 'phone-ping': 6.0,
  'stack-grow': 8.0, 'bar-race': 6.4, 'snowball': 7.0, 'plant-grow': 7.4, 'arrow-up': 5.6, 'house-build': 8.4,
  'calendar-flip': 6.0, 'clock': 6.0, 'hourglass': 7.6, 'scales': 6.4,
  'payday-split': 9.4, 'price-creep': 9.0, 'rent-day': 9.6, 'interest-grows': 8.4, 'isa-shield': 8.4, 'deposit-jar': 9.4,
};

const STEPS = 8; // steps a second: stop motion on threes at 24 fps, near enough
const step = (t: number) => Math.floor(t * STEPS) / STEPS;
const clamp01 = (q: number) => Math.max(0, Math.min(1, q));
const easeOut = (q: number) => 1 - Math.pow(1 - clamp01(q), 3);
const easeIn = (q: number) => Math.pow(clamp01(q), 2);
const easeInOut = (q: number) => (q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2);
/** a value through keyframes [[t, v], ...], eased within each segment */
const kf = (t: number, pts: [number, number][], ease: (q: number) => number = easeInOut) => {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [t0, v0] = pts[i - 1];
    const [t1, v1] = pts[i];
    if (t <= t1) return v0 + (v1 - v0) * ease((t - t0) / Math.max(1e-6, t1 - t0));
  }
  return pts[pts.length - 1][1];
};
/** the squash on a landing at `at`, then a little stretch, then settled: [scaleX, scaleY] */
const land = (dt: number, at: number): [number, number] => (dt >= at && dt < at + 0.13 ? [1.18, 0.8] : dt >= at + 0.13 && dt < at + 0.26 ? [0.96, 1.06] : [1, 1]);
/** a wobble after a knock: degrees, dying out over half a second */
const wobble = (dt: number, at: number, deg = 4) => (dt >= at && dt < at + 0.5 ? deg * Math.sin((dt - at) * 20) * (1 - (dt - at) / 0.5) : 0);

type Opt = Record<string, unknown>;

export const DrawnLoop: React.FC<{name: string; size: number; brand: Brand; start: number; seed: number; style?: React.CSSProperties}> = ({name, size, brand, start, seed, style}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = (frame - start) / fps;
  if (t < 0) return null;
  const P = LOOP_SECONDS[name] ?? 6;
  const tt = Math.min(step(t), P - 0.4); // once through, then the end state holds until the cut
  const ink = brand.ink;
  const green = brand.fill ?? brand.accent;
  const greenInk = brand.accent;
  const red = brand.accent2;
  const blue = brand.blue ?? brand.accent;
  const paper = brand.panel ?? '#ffffff';
  const slate = brand.note ?? brand.muted;
  const marker = brand.marker ?? '#ffe66d';
  const hand = brand.display;
  // two pen weights: the outline and the detail
  const o = (stroke: string, k: number, extra: Opt = {}): Opt => ({stroke, strokeWidth: 2.6, roughness: 1.05, bowing: 0.8, seed: seed * 11 + k, ...extra});
  const fine = (stroke: string, k: number, extra: Opt = {}): Opt => o(stroke, k, {strokeWidth: 1.4, ...extra});
  const solid = (fill: string): Opt => ({fill, fillStyle: 'solid'});
  const hatch = (fill: string, gap = 3): Opt => ({fill, fillStyle: 'hachure', hachureGap: gap, fillWeight: 0.9, hachureAngle: -40});
  const T: React.FC<{x: number; y: number; s?: number; c?: string; children: React.ReactNode; anchor?: 'middle' | 'start' | 'end'; rot?: number}> = ({x, y, s = 9, c = ink, children, anchor = 'middle', rot = 0}) => (
    <text x={x} y={y} textAnchor={anchor} fontFamily={hand} fontSize={s} fill={c} transform={rot ? `rotate(${rot} ${x} ${y})` : undefined}>{children}</text>
  );
  const Shadow: React.FC<{cx: number; cy: number; w: number; k: number}> = ({cx, cy, w, k}) => <SketchEllipse cx={cx} cy={cy} w={w} h={w * 0.16} draw={1} options={fine(slate, k, {...hatch(slate, 2.2), strokeWidth: 0.5})} />;
  const Coin: React.FC<{cx: number; cy: number; r?: number; k: number; sx?: number; sy?: number}> = ({cx, cy, r = 7, k, sx = 1, sy = 1}) => (
    <g transform={`translate(${cx} ${cy}) scale(${sx} ${sy}) translate(${-cx} ${-cy})`}>
      <SketchEllipse cx={cx} cy={cy} w={r * 2.4} h={r * 1.1} draw={1} options={o(ink, k, solid(green))} />
      <T x={cx} y={cy + r * 0.38} s={r * 1.05} c={ink}>£</T>
    </g>
  );
  const Note: React.FC<{x: number; y: number; k: number; w?: number; h?: number; rot?: number; op?: number}> = ({x, y, k, w = 24, h = 13, rot = 0, op = 1}) => (
    <g transform={`rotate(${rot} ${x} ${y})`} opacity={op}>
      <SketchRect x={x - w / 2} y={y - h / 2} w={w} h={h} draw={1} options={o(ink, k, hatch(green, 2.6))} />
      <SketchRect x={x - w / 2 + 2.5} y={y - h / 2 + 2.5} w={w - 5} h={h - 5} draw={1} options={fine(ink, k + 1)} />
      <SketchEllipse cx={x} cy={y} w={h * 0.55} h={h * 0.7} draw={1} options={fine(ink, k + 2, solid(paper))} />
    </g>
  );
  const Envelope: React.FC<{x: number; y: number; k: number; label?: string; w?: number; h?: number; rot?: number; stamp?: boolean}> = ({x, y, k, label, w = 34, h = 21, rot = 0, stamp}) => (
    <g transform={`rotate(${rot} ${x + w / 2} ${y + h / 2})`}>
      <SketchRect x={x} y={y} w={w} h={h} draw={1} options={o(ink, k, solid(paper))} />
      <SketchPath d={`M${x},${y} L${x + w / 2},${y + h * 0.55} L${x + w},${y}`} draw={1} options={fine(ink, k + 1)} />
      {label ? <T x={x + w / 2} y={y + h - 3.5} s={6.5} c={slate}>{label}</T> : null}
      {stamp ? <SketchRect x={x + w - 11} y={y + 2.5} w={8} h={6} draw={1} options={fine(red, k + 2, hatch(red, 1.6))} /> : null}
    </g>
  );
  const fadeOut = (last = 0.35) => (tt > P - last ? (P - tt) / last : 1);
  let body: React.ReactNode = null;
  let op = 1;

  if (name === 'coins-jar') {
    // a labelled jar; eight coins drop in, each landing with a squash and a knock that rocks the jar; a tick on the label
    const n = 8;
    const coins: React.ReactNode[] = [];
    let rock = 0;
    for (let i = 0; i < n; i++) {
      const dt = tt - 0.3 - i * 0.55;
      if (dt < 0) continue;
      const q = easeIn(dt / 0.4);
      const level = 86 - Math.floor(i / 2) * 5.5;
      const y = -6 + (level + 6) * q;
      const x = 50 + (i % 2 ? 9 : -9) + (i % 4 >= 2 ? 3 : -3);
      const [sx, sy] = land(dt, 0.4);
      rock += wobble(dt, 0.4, 2.2);
      coins.push(<Coin key={i} cx={x} cy={y} k={20 + i * 3} sx={sx} sy={sy} />);
    }
    const done = tt > 0.3 + (n - 1) * 0.55 + 0.6;
    op = fadeOut();
    body = (
      <g transform={`rotate(${rock} 50 92)`}>
        <Shadow cx={50} cy={95} w={52} k={2} />
        <SketchPath d="M30,30 L30,86 Q30,93 37,93 L63,93 Q70,93 70,86 L70,30" draw={1} options={o(ink, 1)} />
        <SketchPath d="M26,30 L74,30 M27,24 L73,24 M27,24 L27,30 M73,24 L73,30" draw={1} options={o(ink, 3)} />
        <SketchRect x={37} y={48} w={26} h={12} draw={1} options={fine(ink, 5, solid(paper))} />
        <T x={50} y={57} s={7.5} c={slate}>SAVINGS</T>
        {coins}
        {done ? <SketchPath d="M40,43 L46,49 L60,36" draw={clamp01((tt - (0.3 + (n - 1) * 0.55 + 0.6)) / 0.4)} options={o(greenInk, 7, {strokeWidth: 3})} /> : null}
      </g>
    );
  } else if (name === 'piggy-bank') {
    // a proper pig: ears, snout, a curly tail; coins into the slot, a squash each time, a happy double bounce at the end
    const n = 6;
    const coins: React.ReactNode[] = [];
    let sq: [number, number] = [1, 1];
    let tail = 0;
    for (let i = 0; i < n; i++) {
      const dt = tt - 0.4 - i * 0.62;
      if (dt < 0) continue;
      const q = easeIn(dt / 0.34);
      if (q < 1) coins.push(<Coin key={i} cx={50} cy={-4 + 36 * q} r={6.5} k={30 + i * 3} />);
      const l = land(dt, 0.34);
      if (l[0] !== 1) sq = l;
      tail += wobble(dt, 0.34, 18);
    }
    const end = 0.4 + (n - 1) * 0.62 + 0.6;
    const hop = tt > end && tt < end + 0.8 ? Math.abs(Math.sin(((tt - end) / 0.4) * Math.PI)) * 7 : 0;
    op = fadeOut();
    body = (
      <>
        <Shadow cx={52} cy={91} w={66} k={2} />
        {coins}
        <g transform={`translate(0 ${-hop}) translate(50 88) scale(${sq[0]} ${sq[1]}) translate(-50 -88)`}>
          <SketchRect x={32} y={76} w={8} h={12} draw={1} options={o(ink, 40, solid(paper))} />
          <SketchRect x={58} y={76} w={8} h={12} draw={1} options={o(ink, 41, solid(paper))} />
          <SketchEllipse cx={48} cy={60} w={62} h={44} draw={1} options={o(ink, 42, solid(paper))} />
          <SketchEllipse cx={76} cy={56} w={24} h={20} draw={1} options={o(ink, 43, solid(paper))} />
          <SketchEllipse cx={88} cy={58} w={11} h={8.5} draw={1} options={o(ink, 44, solid(paper))} />
          <SketchEllipse cx={86} cy={58} w={1.8} h={1.8} draw={1} options={fine(ink, 45, solid(ink))} />
          <SketchEllipse cx={90} cy={58} w={1.8} h={1.8} draw={1} options={fine(ink, 46, solid(ink))} />
          <SketchPath d="M70,48 L73,39 L79,47" draw={1} options={o(ink, 47, solid(paper))} />
          <SketchEllipse cx={79} cy={53} w={2.4} h={2.4} draw={1} options={fine(ink, 48, solid(ink))} />
          <SketchPath d="M40,42 L54,42" draw={1} options={o(ink, 49, {strokeWidth: 3.2})} />
          <g transform={`rotate(${tail} 18 56)`}>
            <SketchPath d="M18,56 Q10,52 13,46 Q16,42 12,40" draw={1} options={o(ink, 50)} />
          </g>
        </g>
      </>
    );
  } else if (name === 'card-tap') {
    // the card swings in on an arc, taps, the reader beeps, shows the price and a tick, prints a stub; the card goes
    const q1 = easeInOut(clamp01((tt - 0.2) / 0.8));
    const q2 = easeInOut(clamp01((tt - 3.4) / 0.6));
    const cx = kf(tt, [[0.2, 12], [1.0, 40], [3.4, 40], [4.0, 8]]);
    const cy = kf(tt, [[0.2, 22], [1.0, 48], [3.4, 48], [4.0, 20]]);
    const rot = -28 + 28 * q1 - 14 * q2;
    const tapped = tt >= 1.0 && tt < 3.4;
    const beep = tt >= 1.1 && tt < 1.7 ? Math.floor((tt - 1.1) * STEPS) % 2 : -1;
    const stub = clamp01((tt - 2.2) / 0.8) * 16;
    op = fadeOut(0.3);
    body = (
      <>
        <Shadow cx={70} cy={92} w={38} k={2} />
        <SketchRect x={56} y={36} w={32} h={54} draw={1} options={o(ink, 20, solid(paper))} />
        <SketchRect x={61} y={42} w={22} h={14} draw={1} options={fine(ink, 21, solid(tapped ? '#EAFAF2' : '#EEF2F8'))} />
        {tapped ? <T x={72} y={52} s={7} c={greenInk}>£3.50</T> : null}
        {[0, 1, 2].map((r) => [0, 1, 2].map((c) => <SketchRect key={`${r}${c}`} x={62 + c * 7} y={62 + r * 6} w={4.5} h={4} draw={1} options={fine(ink, 22 + r * 3 + c)} />))}
        <SketchPath d="M60,84 L84,84" draw={1} options={fine(ink, 31)} />
        {stub > 0 ? <SketchRect x={62} y={84} w={20} h={stub} draw={1} options={fine(ink, 32, solid(paper))} /> : null}
        {stub > 8 ? <SketchPath d="M65,90 L78,90 M65,94 L75,94" draw={1} options={fine(slate, 33)} /> : null}
        {beep >= 0 ? <SketchPath d={beep ? 'M46,30 Q50,36 46,42 M50,26 Q56,36 50,46' : 'M48,32 Q51,36 48,40'} draw={1} options={fine(greenInk, 34)} /> : null}
        {tt > 1.7 ? <SketchPath d="M62,22 L68,29 L82,12" draw={clamp01((tt - 1.7) / 0.4)} options={o(greenInk, 35, {strokeWidth: 3.2})} /> : null}
        <g transform={`rotate(${rot} ${cx} ${cy})`}>
          <SketchRect x={cx - 16} y={cy - 10} w={32} h={20} draw={1} options={o(ink, 36, solid(paper))} />
          <SketchPath d={`M${cx - 16},${cy - 4} L${cx + 16},${cy - 4}`} draw={1} options={o(ink, 37, {strokeWidth: 3.4})} />
          <SketchRect x={cx - 12} y={cy + 1} w={8} h={5} draw={1} options={fine(ink, 38, solid(marker))} />
          <SketchPath d={`M${cx + 2},${cy + 5} L${cx + 12},${cy + 5}`} draw={1} options={fine(slate, 39)} />
        </g>
      </>
    );
  } else if (name === 'money-flies') {
    // a wallet with a card in it; notes tumble out and away, each turning over as it goes; the wallet thins to nothing
    const notes: React.ReactNode[] = [];
    for (let i = 0; i < 6; i++) {
      const dt = tt - 0.4 - i * 0.5;
      if (dt < 0 || dt > 1.8) continue;
      const q = dt / 1.8;
      const x = 34 + 60 * q;
      const y = 60 - 66 * q + 30 * q * q + (i % 2 ? 7 : -5) * q;
      notes.push(<Note key={i} x={x} y={y} k={40 + i * 3} rot={-20 + 200 * q} op={1 - q * 0.75} w={22} h={12} />);
    }
    const thin = kf(tt, [[0.4, 1], [3.4, 0.45]]);
    op = fadeOut();
    body = (
      <>
        <Shadow cx={33} cy={90} w={44} k={2} />
        <g transform={`translate(0 ${(1 - thin) * 26}) scale(1 ${thin})`}>
          <SketchRect x={12} y={60} w={42} h={28} draw={1} options={o(ink, 50, solid(paper))} />
          <SketchPath d="M12,68 L54,68" draw={1} options={o(ink, 51)} />
          <SketchRect x={40} y={71} w={9} h={8} draw={1} options={fine(ink, 52, solid(paper))} />
          <SketchRect x={18} y={54} w={22} h={8} draw={1} options={fine(ink, 53, solid(marker))} />
          <SketchPath d="M14,62 Q33,58 52,62" draw={1} options={fine(ink, 54)} />
        </g>
        {notes}
        {thin < 0.5 ? <T x={33} y={48} s={8} c={red}>empty</T> : null}
      </>
    );
  } else if (name === 'bills-pile') {
    // envelopes land one on the other, each askew, each with its name; an OVERDUE stamp slams onto the top one
    const names = ['RENT', 'GAS', 'PHONE', 'WIFI', 'CARD'];
    const bills: React.ReactNode[] = [];
    for (let i = 0; i < 5; i++) {
      const dt = tt - 0.3 - i * 0.6;
      if (dt < 0) continue;
      const q = easeIn(dt / 0.36);
      const landY = 66 - i * 4.8;
      const y = -22 + (landY + 22) * q;
      const x = 32 + ((i % 3) - 1) * 5;
      const [sx, sy] = land(dt, 0.36);
      bills.push(
        <g key={i} transform={`translate(${x + 17} ${y + 10}) scale(${sx} ${sy}) translate(${-(x + 17)} ${-(y + 10)})`}>
          <Envelope x={x} y={y} k={60 + i * 4} label={names[i]} rot={(i % 2 ? 7 : -6) * q} stamp={i >= 3} />
        </g>
      );
    }
    const slam = tt > 3.9 ? kf(tt, [[3.9, 2.4], [4.2, 1]], easeIn) : 0;
    op = fadeOut();
    body = (
      <>
        <Shadow cx={50} cy={90} w={54} k={2} />
        <SketchPath d="M14,88 L86,88" draw={1} options={o(ink, 58)} />
        {bills}
        {slam > 0 ? (
          <g transform={`rotate(-14 50 46) translate(50 46) scale(${slam}) translate(-50 -46)`} opacity={Math.min(1, (slam - 1) < 0.1 ? 1 : 0.85)}>
            <SketchRect x={32} y={40} w={36} h={12} draw={1} options={o(red, 70, {strokeWidth: 2})} />
            <T x={50} y={49} s={8} c={red}>OVERDUE</T>
          </g>
        ) : null}
      </>
    );
  } else if (name === 'receipt-print') {
    // the till: buttons, a drawer; the receipt comes out line by line, TOTAL in red, then tears off and drops
    const len = kf(tt, [[0.3, 0], [3.0, 58]], (q) => q);
    const tornAt = 3.9;
    const torn = tt >= tornAt;
    const drop = torn ? easeIn(clamp01((tt - tornAt) / 0.7)) : 0;
    const lines: React.ReactNode[] = [];
    for (let y = 36; y < 28 + len - 10; y += 6.5) lines.push(<SketchPath key={y} d={`M40,${y} L${[52, 56, 50, 58][Math.floor(y / 6.5) % 4]},${y} M60,${y} L64,${y}`} draw={1} options={fine(slate, 100 + Math.floor(y))} />);
    op = fadeOut();
    body = (
      <>
        <Shadow cx={50} cy={92} w={56} k={2} />
        <g transform={torn ? `translate(0 ${drop * 30}) rotate(${drop * 12} 50 60)` : undefined}>
          {len > 2 ? <SketchRect x={34} y={28} w={32} h={len} draw={1} options={o(ink, 95, solid(paper))} /> : null}
          {len > 4 ? <T x={50} y={34.5} s={5.5} c={slate}>EVERYDAY STORES</T> : null}
          {lines}
          {len > 54 ? <T x={50} y={28 + len - 5} s={7} c={red}>TOTAL £84.20</T> : null}
          {len > 54 ? <SketchPath d={`M34,${28 + len} L38,${28 + len + 2} L42,${28 + len} L46,${28 + len + 2} L50,${28 + len} L54,${28 + len + 2} L58,${28 + len} L62,${28 + len + 2} L66,${28 + len}`} draw={1} options={fine(ink, 96)} /> : null}
        </g>
        <SketchRect x={24} y={6} w={52} h={22} draw={1} options={o(ink, 90, solid('#EEF2F8'))} />
        <SketchRect x={28} y={10} w={20} h={8} draw={1} options={fine(ink, 91, solid(paper))} />
        {[0, 1, 2, 3].map((k) => <SketchRect key={k} x={52 + (k % 2) * 9} y={10 + Math.floor(k / 2) * 7} w={6} h={5} draw={1} options={fine(ink, 92 + k)} />)}
        <SketchPath d="M30,28 L70,28" draw={1} options={o(ink, 97, {strokeWidth: 3.4})} />
      </>
    );
  } else if (name === 'phone-ping') {
    // notifications drop onto the screen, the phone buzzes with each; a red badge counts them up
    const pings: React.ReactNode[] = [];
    let buzz = 0;
    let count = 0;
    for (let i = 0; i < 4; i++) {
      const dt = tt - 0.5 - i * 0.75;
      if (dt < 0) continue;
      count++;
      const q = easeOut(dt / 0.3);
      const y = 24 + i * 11.5 - (1 - q) * 12;
      buzz += dt < 0.35 ? (Math.floor(dt * STEPS) % 2 ? 1.6 : -1.6) : 0;
      pings.push(
        <g key={i} opacity={q}>
          <SketchRect x={38} y={y} w={25} h={9.5} draw={1} options={fine(ink, 110 + i * 2, solid('#EEF2F8'))} />
          <SketchEllipse cx={42} cy={y + 4.7} w={4.5} h={4.5} draw={1} options={fine(ink, 111 + i * 2, solid(['#2E6FE8', '#01C77B', '#D7263D', '#6B7A99'][i]))} />
          <SketchPath d={`M46,${y + 3.5} L59,${y + 3.5} M46,${y + 6.5} L55,${y + 6.5}`} draw={1} options={fine(slate, 120 + i, {strokeWidth: 0.9})} />
        </g>
      );
    }
    op = fadeOut();
    body = (
      <g transform={`translate(${buzz} 0)`}>
        <Shadow cx={50} cy={90} w={40} k={2} />
        <SketchRect x={32} y={10} w={36} h={76} draw={1} options={o(ink, 125, {strokeWidth: 3, ...solid(paper)})} />
        <SketchRect x={36} y={16} w={28} h={62} draw={1} options={fine(ink, 126, {strokeWidth: 0.9})} />
        <SketchRect x={44} y={11.5} w={12} h={3} draw={1} options={fine(ink, 127, solid(ink))} />
        <SketchPath d="M45,82 L55,82" draw={1} options={fine(ink, 128)} />
        {pings}
        {count > 0 ? (
          <>
            <SketchEllipse cx={66} cy={16} w={11} h={11} draw={1} options={fine(red, 129, solid(red))} />
            <T x={66} y={19} s={7} c={paper}>{count}</T>
          </>
        ) : null}
      </g>
    );
  } else if (name === 'stack-grow') {
    // eight years of saving: each year a navy layer the same height, then a green layer of interest that gets thicker
    const years = 8;
    const layers: React.ReactNode[] = [];
    let y = 86;
    let yr = 0;
    for (let i = 0; i < years; i++) {
      const dt = tt - 0.3 - i * 0.9;
      if (dt < 0) break;
      yr = i + 1;
      const q = easeOut(dt / 0.3);
      const x = 50 + (1 - q) * 60;
      const h1 = 5;
      const h2 = 1.2 + i * 0.75;
      layers.push(<SketchRect key={`s${i}`} x={x - 26} y={y - h1} w={52} h={h1} draw={1} options={o(ink, 130 + i * 2, solid(paper))} />);
      y -= h1;
      if (dt > 0.45) layers.push(<SketchRect key={`g${i}`} x={50 - 26} y={y - h2} w={52} h={h2} draw={1} options={fine(greenInk, 131 + i * 2, hatch(green, 1.8))} />);
      y -= h2;
    }
    op = fadeOut();
    body = (
      <>
        <Shadow cx={50} cy={89} w={62} k={2} />
        <SketchPath d="M12,86 L88,86" draw={1} options={o(ink, 129)} />
        {layers}
        {yr > 0 ? <T x={82} y={20} s={9} c={slate} anchor="end">year {yr}</T> : null}
        {yr >= years ? <T x={50} y={y - 4} s={8} c={greenInk}>+ interest</T> : null}
      </>
    );
  } else if (name === 'bar-race') {
    // cash, bonds and shares growing from the same start; shares starts slowest and ends tallest, and gets the tick
    const q = clamp01((tt - 0.3) / 3.2);
    const bars: [number, string, number, string][] = [[26 * easeOut(q), ink, 18, 'cash'], [42 * q, blue, 42, 'bonds'], [66 * q * q * q + 8 * q, green, 66, 'shares']];
    op = fadeOut();
    body = (
      <>
        <SketchPath d="M8,86 L94,86 M8,86 L8,10" draw={1} options={o(ink, 140)} />
        {bars.map(([h, col, x, label], k) => (
          <g key={k}>
            {h > 1 ? <SketchRect x={x} y={86 - h} w={18} h={h} draw={1} options={o(col, 141 + k, hatch(col, 3.2))} /> : null}
            <T x={x + 9} y={94} s={7} c={slate}>{label}</T>
          </g>
        ))}
        {q >= 1 && tt > 3.8 ? <SketchPath d="M68,10 L74,16 L86,2" draw={clamp01((tt - 3.8) / 0.4)} options={o(greenInk, 146, {strokeWidth: 3.2})} /> : null}
      </>
    );
  } else if (name === 'snowball') {
    // a snowy hill; the ball rolls down, grows, leaves a track; stops with a wobble and shows what it is: money
    const q = easeIn(clamp01((tt - 0.4) / 3.4)) * 0.6 + clamp01((tt - 0.4) / 3.4) * 0.4;
    const slope = (x: number) => 26 + ((x - 6) / 88) * 58;
    const cx = 12 + 70 * q;
    const r = 4 + 14 * q;
    const cy = slope(cx) - r * 0.92;
    const ang = q * Math.PI * 5;
    const wob = tt > 3.8 ? wobble(tt, 3.8, 6) : 0;
    op = fadeOut();
    body = (
      <>
        <SketchPath d="M6,26 L94,84" draw={1} options={o(ink, 150)} />
        <SketchPath d="M6,26 Q14,22 22,27 Q30,20 38,31" draw={1} options={fine(ink, 151)} />
        <SketchPath d={`M${Math.max(6, cx - 60 * q)},${slope(Math.max(6, cx - 60 * q)) - 1.5} L${cx},${slope(cx) - 1.5}`} draw={1} options={fine(slate, 152, {strokeWidth: 1.8})} />
        <g transform={`rotate(${wob} ${cx} ${slope(cx)})`}>
          <SketchEllipse cx={cx} cy={cy} w={r * 2} h={r * 2} draw={1} options={o(ink, 153, solid(paper))} />
          <SketchPath d={`M${cx},${cy} L${cx + Math.cos(ang) * r * 0.75},${cy + Math.sin(ang) * r * 0.75}`} draw={1} options={fine(ink, 154)} />
          <SketchPath d={`M${cx - r * 0.5},${cy + r * 0.2} Q${cx},${cy + r * 0.6} ${cx + r * 0.5},${cy + r * 0.2}`} draw={1} options={fine(ink, 155)} />
          {q > 0.9 ? <T x={cx} y={cy - r * 0.15} s={r * 0.9} c={greenInk}>£</T> : null}
        </g>
      </>
    );
  } else if (name === 'plant-grow') {
    // a seed goes in, the stem grows, leaves open, a bud becomes a coin on top; a watering can tips at the start
    const seed = clamp01((tt - 0.3) / 0.5);
    const g = easeOut(clamp01((tt - 1.2) / 3.0));
    const tip = kf(tt, [[0.1, 0], [0.5, -30], [1.1, -30], [1.5, 0]]);
    op = fadeOut();
    body = (
      <>
        <Shadow cx={50} cy={97} w={40} k={2} />
        <SketchPath d="M34,80 L66,80 L62,96 L38,96 Z" draw={1} options={o(ink, 160, solid(paper))} />
        <SketchPath d="M36,80 Q50,75 64,80" draw={1} options={fine(ink, 161, hatch(slate, 2))} />
        {seed < 1 ? <SketchEllipse cx={50} cy={40 + 38 * easeIn(seed)} w={4} h={3} draw={1} options={fine(ink, 162, solid(ink))} /> : null}
        <g transform={`rotate(${tip} 20 36)`}>
          <SketchRect x={10} y={30} w={20} h={14} draw={1} options={fine(ink, 163, solid(paper))} />
          <SketchPath d="M30,34 L42,28 M14,30 Q20,22 26,30" draw={1} options={fine(ink, 164)} />
          {tip < -20 ? <SketchPath d="M42,30 L45,40 M44,30 L48,38" draw={1} options={fine(blue, 165)} /> : null}
        </g>
        <SketchPath d="M50,78 Q48,64 50,52 Q52,40 50,28" draw={g} options={o(greenInk, 166, {strokeWidth: 2.4})} />
        {g > 0.4 ? <SketchPath d="M50,60 Q38,56 34,46 Q46,46 50,60" draw={clamp01((g - 0.4) / 0.25)} options={fine(greenInk, 167, hatch(green, 2.2))} /> : null}
        {g > 0.6 ? <SketchPath d="M50,48 Q62,44 66,34 Q54,34 50,48" draw={clamp01((g - 0.6) / 0.25)} options={fine(greenInk, 168, hatch(green, 2.2))} /> : null}
        {g > 0.92 ? <Coin cx={50} cy={25} r={6.5} k={169} /> : null}
      </>
    );
  } else if (name === 'arrow-up') {
    // a chart with a faint grid; the brand's arrow draws itself in four bounces, the head lands with a pulse, +7% pops
    const q = clamp01((tt - 0.2) / 2.0);
    const pulse = tt > 2.2 && tt < 2.6 ? 1 + 0.16 * Math.sin(((tt - 2.2) / 0.4) * Math.PI) : 1;
    op = fadeOut(0.3);
    body = (
      <>
        {[30, 50, 70].map((y) => <SketchPath key={y} d={`M12,${y} L90,${y}`} draw={1} options={fine(slate, 170 + y, {strokeWidth: 0.6, strokeLineDash: [2, 3]})} />)}
        <SketchPath d="M12,88 L92,88 M12,88 L12,12" draw={1} options={o(ink, 171)} />
        <SketchPath d="M14,82 L30,66 L38,74 L54,52 L62,58 L84,24" draw={q} options={o(green, 172, {strokeWidth: 5.2})} />
        <g transform={`translate(84 24) scale(${pulse}) translate(-84 -24)`}>
          <SketchPath d="M66,22 L86,22 L86,42" draw={clamp01((tt - 1.9) / 0.3)} options={o(green, 173, {strokeWidth: 5.2})} />
        </g>
        {tt > 2.6 ? <T x={76} y={56} s={11} c={greenInk}>+7%</T> : null}
      </>
    );
  } else if (name === 'house-build') {
    // ground, then brick courses, the roof, the door, windows, the chimney and its smoke, and the keys at the end
    const at = (a: number, d = 0.3) => clamp01((tt - a) / d);
    const bricks: React.ReactNode[] = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const a = 0.7 + r * 0.45 + c * 0.1;
      if (tt < a) continue;
      bricks.push(<SketchRect key={`${r}${c}`} x={28 + c * 11 + (r % 2 ? 5.5 : 0) - (r % 2 && c === 3 ? 5.5 : 0)} y={86 - (r + 1) * 7.5} w={r % 2 && c === 3 ? 5.5 : 11} h={7.5} draw={at(a, 0.2)} options={fine(ink, 180 + r * 4 + c)} />);
    }
    const puffs = [0, 1, 2].map((i) => {
      const dt = (tt - 5.6 - i * 0.5) % 1.5;
      if (tt < 5.6 + i * 0.5) return null;
      return <SketchEllipse key={i} cx={66 + dt * 6} cy={36 - dt * 14} w={6 + dt * 8} h={5 + dt * 6} draw={1} options={fine(slate, 196 + i, {strokeWidth: 0.9})} />;
    });
    op = fadeOut();
    body = (
      <>
        <Shadow cx={50} cy={90} w={70} k={2} />
        <SketchPath d="M12,86 L88,86" draw={at(0.2)} options={o(ink, 178, {strokeWidth: 3})} />
        {bricks}
        {tt > 2.6 ? <SketchRect x={28} y={56} w={44} h={30} draw={at(2.6)} options={o(ink, 179)} /> : null}
        {tt > 3.0 ? <SketchPath d="M22,57 L50,30 L78,57" draw={at(3.0, 0.4)} options={o(ink, 199, {strokeWidth: 3})} /> : null}
        {tt > 3.2 ? <SketchPath d="M24,57 L50,33 L76,57 Z" draw={at(3.2, 0.4)} options={fine(ink, 200, hatch(slate, 3))} /> : null}
        {tt > 3.6 ? <SketchRect x={44} y={68} w={12} h={18} draw={at(3.6)} options={o(ink, 201, solid(paper))} /> : null}
        {tt > 3.9 ? <SketchEllipse cx={53} cy={78} w={2} h={2} draw={1} options={fine(ink, 202, solid(ink))} /> : null}
        {tt > 4.1 ? <SketchRect x={31} y={62} w={10} h={9} draw={at(4.1)} options={o(blue, 203, solid('#EEF2F8'))} /> : null}
        {tt > 4.3 ? <SketchRect x={59} y={62} w={10} h={9} draw={at(4.3)} options={o(blue, 204, solid('#EEF2F8'))} /> : null}
        {tt > 4.8 ? <SketchRect x={62} y={36} w={7} h={14} draw={at(4.8)} options={o(ink, 205, solid(paper))} /> : null}
        {puffs}
        {tt > 6.4 ? (
          <g transform={`translate(0 ${-Math.abs(Math.sin((tt - 6.4) * 6)) * 3 * Math.max(0, 1 - (tt - 6.4))})`}>
            <SketchEllipse cx={84} cy={70} w={7} h={7} draw={1} options={o(greenInk, 206)} />
            <SketchPath d="M84,73.5 L84,84 M84,80 L88,80 M84,84 L87,84" draw={1} options={o(greenInk, 207)} />
          </g>
        ) : null}
      </>
    );
  } else if (name === 'calendar-flip') {
    // a desk calendar: one month on the band, the day big; a page lifts and flies off five times a second and the
    // days count 1 to 30, then the 30 holds (it used to flip the months, which read as years passing)
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const i = seed % 12;
    const n = Math.min(30, 1 + Math.floor(tt / 0.18)); // 30 by 5.3 s, inside the six-second loop's hold
    const flipping = n < 30;
    const k = flipping ? Math.floor(tt * STEPS) % 2 : 0;
    const sy = k === 1 ? 0.5 : 1;
    const fly = k === 1 ? 0.6 : 0;
    body = (
      <>
        <Shadow cx={50} cy={90} w={56} k={2} />
        <SketchRect x={24} y={24} w={52} h={62} draw={1} options={o(ink, 210, solid(paper))} />
        <SketchRect x={24} y={24} w={52} h={15} draw={1} options={o(ink, 211, solid(ink))} />
        <T x={50} y={35} s={9} c={paper}>{months[i]}</T>
        {[32, 50, 64].map((x) => (
          <g key={x}>
            <SketchEllipse cx={x} cy={24} w={5} h={5} draw={1} options={fine(ink, 212 + x, solid(paper))} />
            <SketchRect x={x - 1.8} y={13} w={3.6} h={13} draw={1} options={fine(ink, 213 + x, solid(slate))} />
          </g>
        ))}
        <g transform={`translate(0 ${39 * (1 - sy)}) scale(1 ${sy})`}>
          <T x={50} y={75} s={30}>{n}</T>
        </g>
        {fly > 0 ? <SketchRect x={28 + fly * 40} y={40 - fly * 36} w={44 * (1 - fly * 0.6)} h={14} draw={1} options={fine(ink, 220, solid(paper))} /> : null}
      </>
    );
  } else if (name === 'clock') {
    // a wall clock with numerals; the minute hand ticks round once in three seconds, the hour hand follows
    const a = (tt / 3) * Math.PI * 2 - Math.PI / 2;
    const hr = (tt / 6) * (Math.PI / 3) - Math.PI / 2 + (seed % 7) * 0.9;
    const tick = Math.floor(tt * STEPS) % 2 ? 1.2 : 0;
    body = (
      <>
        <Shadow cx={50} cy={94} w={30} k={2} />
        <SketchEllipse cx={50} cy={50} w={80} h={80} draw={1} options={o(ink, 230, {strokeWidth: 3.2, ...solid(paper)})} />
        <SketchEllipse cx={50} cy={50} w={72} h={72} draw={1} options={fine(ink, 231, {strokeWidth: 0.8})} />
        {[['12', 50, 23], ['3', 76, 54], ['6', 50, 83], ['9', 24, 54]].map(([n, x, y]) => <T key={String(n)} x={Number(x)} y={Number(y)} s={9}>{n}</T>)}
        {Array.from({length: 12}, (_, k) => {
          const ang = (k * Math.PI) / 6;
          return <SketchPath key={k} d={`M${50 + Math.cos(ang) * 33},${50 + Math.sin(ang) * 33} L${50 + Math.cos(ang) * 36},${50 + Math.sin(ang) * 36}`} draw={1} options={fine(ink, 232 + k)} />;
        })}
        <g transform={`rotate(${tick} 50 50)`}>
          <SketchPath d={`M50,50 L${50 + Math.cos(hr) * 18},${50 + Math.sin(hr) * 18}`} draw={1} options={o(ink, 245, {strokeWidth: 3.4})} />
          <SketchPath d={`M50,50 L${50 + Math.cos(a) * 27},${50 + Math.sin(a) * 27}`} draw={1} options={o(greenInk, 246, {strokeWidth: 2.4})} />
        </g>
        <SketchEllipse cx={50} cy={50} w={5} h={5} draw={1} options={fine(ink, 247, solid(ink))} />
      </>
    );
  } else if (name === 'hourglass') {
    // a wooden frame; grains fall in a stream, the top empties, the bottom fills; then the whole thing turns over
    const run = 5.6;
    const p = clamp01(tt / run);
    const flip = tt > run ? easeInOut(clamp01((tt - run - 0.3) / 1.2)) * 180 : 0;
    const grains = Array.from({length: 5}, (_, k) => {
      const y = 50 + ((tt * 7 + k * 7) % 34);
      return y < 86 - 36 * p ? <SketchEllipse key={k} cx={50 + ((k % 3) - 1) * 0.8} cy={y} w={1.6} h={1.6} draw={1} options={fine(ink, 250 + k, solid(slate))} /> : null;
    });
    body = (
      <g transform={`rotate(${flip} 50 50)`}>
        <SketchRect x={24} y={8} w={52} h={7} draw={1} options={o(ink, 260, hatch(slate, 2))} />
        <SketchRect x={24} y={85} w={52} h={7} draw={1} options={o(ink, 261, hatch(slate, 2))} />
        <SketchPath d="M27,15 L27,85 M73,15 L73,85" draw={1} options={o(ink, 262, {strokeWidth: 2.2})} />
        <SketchPath d="M32,15 L68,15 L52,50 L68,85 L32,85 L48,50 Z" draw={1} options={fine(ink, 263, {strokeWidth: 1.6})} />
        {p < 0.98 ? <SketchPath d={`M${32 + 16 * p},${15 + 33 * p} L${68 - 16 * p},${15 + 33 * p} L52,50 L48,50 Z`} draw={1} options={fine(ink, 264, {...hatch(marker, 1.8), strokeWidth: 0.5})} /> : null}
        {p > 0.03 ? <SketchPath d={`M32,85 L68,85 L${50 + 17 * p},${85 - 34 * p} L${50 - 17 * p},${85 - 34 * p} Z`} draw={1} options={fine(ink, 265, {...hatch(marker, 1.8), strokeWidth: 0.5})} /> : null}
        {p < 0.98 && flip === 0 ? grains : null}
      </g>
    );
  } else if (name === 'scales') {
    // a proper balance; three coins land on the left pan one by one and the beam tips further each time; the bill side rises
    const landed = [0.8, 1.9, 3.0].filter((a) => tt >= a).length;
    const target = -4 + landed * -5;
    const a = kf(tt, [[0, -2], [0.8, -2], [1.2, -8], [1.9, -8], [2.3, -13], [3.0, -13], [3.4, -18]]) + (landed ? wobble(tt, [0.8, 1.9, 3.0][landed - 1], 3) : Math.sin(tt * 3) * 1.5);
    void target;
    const rad = (a * Math.PI) / 180;
    const lx = 50 - 30 * Math.cos(rad);
    const ly = 36 - 30 * Math.sin(rad);
    const rx = 50 + 30 * Math.cos(rad);
    const ry = 36 + 30 * Math.sin(rad);
    const pan = (x: number, y: number, k: number) => (
      <>
        <SketchPath d={`M${x},${y} L${x - 10},${y + 18} M${x},${y} L${x + 10},${y + 18}`} draw={1} options={fine(ink, k)} />
        <SketchPath d={`M${x - 12},${y + 18} Q${x},${y + 24} ${x + 12},${y + 18}`} draw={1} options={o(ink, k + 1, solid(paper))} />
      </>
    );
    const falling = [0.8, 1.9, 3.0].map((at, i) => {
      const dt = tt - at + 0.4;
      if (dt < 0 || dt > 0.4) return null;
      return <Coin key={i} cx={lx} cy={-8 + (ly + 14 + 8) * easeIn(dt / 0.4)} r={6} k={280 + i * 3} />;
    });
    op = fadeOut();
    body = (
      <>
        <Shadow cx={50} cy={93} w={44} k={2} />
        <SketchPath d="M36,90 L64,90 L50,74 Z" draw={1} options={o(ink, 270, hatch(slate, 2.5))} />
        <SketchPath d="M50,74 L50,36" draw={1} options={o(ink, 271, {strokeWidth: 3})} />
        <g transform={`rotate(${a} 50 36)`}>
          <SketchPath d="M20,36 L80,36" draw={1} options={o(ink, 272, {strokeWidth: 3})} />
        </g>
        <SketchEllipse cx={50} cy={36} w={6} h={6} draw={1} options={fine(ink, 273, solid(ink))} />
        {pan(lx, ly, 274)}
        {pan(rx, ry, 276)}
        {Array.from({length: landed}, (_, k) => <Coin key={k} cx={lx + (k % 2 ? 3 : -3)} cy={ly + 15 - k * 3.2} r={6} k={290 + k * 3} />)}
        {falling}
        <Envelope x={rx - 14} y={ry + 2} w={28} h={16} k={300} label="BILLS" />
        {landed >= 3 && tt > 3.6 ? <SketchPath d="M14,70 L19,75 L28,62" draw={clamp01((tt - 3.6) / 0.4)} options={o(greenInk, 305, {strokeWidth: 3})} /> : null}
      </>
    );
  } else if (name === 'payday-split') {
    // a payslip arrives; three arrows draw to a jar, an envelope and a card; coins hop to each in turn; a tick on the jar
    const slip = easeOut(clamp01((tt - 0.2) / 0.7));
    const arrows = [[1.2, 'M50,38 Q34,46 22,60'], [1.6, 'M50,38 Q50,50 50,62'], [2.0, 'M50,38 Q66,46 78,60']] as [number, string][];
    const hops: [number, number, number][] = [[2.6, 0, 3], [3.0, 1, 2], [3.4, 2, 2], [3.8, 0, 3], [4.2, 1, 2], [4.6, 2, 2], [5.0, 0, 3], [5.4, 1, 2]];
    const targets = [[22, 72], [50, 74], [78, 72]];
    const counts = [0, 0, 0];
    const coins: React.ReactNode[] = [];
    hops.forEach(([at, to], i) => {
      const dt = tt - at;
      if (dt < 0) return;
      if (dt >= 0.45) {
        counts[to]++;
        return;
      }
      const q = dt / 0.45;
      const [tx, ty] = targets[to];
      const x = 50 + (tx - 50) * q;
      const y = 38 + (ty - 38) * q - 22 * Math.sin(q * Math.PI);
      coins.push(<Coin key={i} cx={x} cy={y} r={5.5} k={320 + i * 3} />);
    });
    op = fadeOut();
    body = (
      <>
        <g transform={`translate(${(1 - slip) * -70} 0)`}>
          <SketchRect x={34} y={6} w={32} h={30} draw={1} options={o(ink, 310, solid(paper))} />
          <T x={50} y={15} s={6} c={slate}>PAYSLIP</T>
          <SketchPath d="M38,20 L62,20 M38,25 L58,25" draw={1} options={fine(slate, 311)} />
          <T x={50} y={34} s={8} c={greenInk}>£2,100</T>
        </g>
        {arrows.map(([at, d], i) => (tt >= at ? <SketchPath key={i} d={d} draw={clamp01((tt - at) / 0.35)} options={fine(greenInk, 312 + i, {strokeWidth: 1.8})} /> : null))}
        <SketchPath d="M12,62 L12,88 Q12,92 16,92 L28,92 Q32,92 32,88 L32,62 M10,62 L34,62" draw={1} options={o(ink, 316)} />
        <T x={22} y={59} s={6.5} c={slate}>SAVE</T>
        {Array.from({length: counts[0]}, (_, k) => <Coin key={k} cx={22} cy={88 - k * 4.5} r={5} k={330 + k * 3} />)}
        <Envelope x={36} y={66} w={28} h={18} k={340} label="BILLS" />
        {Array.from({length: counts[1]}, (_, k) => <Coin key={k} cx={50 + (k ? 5 : -5)} cy={64} r={4.5} k={345 + k * 3} />)}
        <SketchRect x={66} y={66} w={26} h={17} draw={1} options={o(ink, 350, solid(paper))} />
        <SketchPath d="M66,71 L92,71" draw={1} options={o(ink, 351, {strokeWidth: 3})} />
        <T x={79} y={62} s={6.5} c={slate}>SPEND</T>
        {Array.from({length: counts[2]}, (_, k) => <Coin key={k} cx={79 + (k ? 5 : -5)} cy={64} r={4.5} k={355 + k * 3} />)}
        {coins}
        {tt > 6.0 ? <SketchPath d="M14,46 L20,52 L32,38" draw={clamp01((tt - 6.0) / 0.4)} options={o(greenInk, 360, {strokeWidth: 3.2})} /> : null}
      </>
    );
  } else if (name === 'price-creep') {
    // a coffee with a price tag; the tag flips up four times over the years and the cup shrinks a little each time
    const prices = ['£2.50', '£2.80', '£3.10', '£3.50'];
    const years = ['2021', '2023', '2025', '2026'];
    const stageAt = [0, 1.8, 3.6, 5.4];
    const stage = stageAt.filter((a) => tt >= a).length - 1;
    const since = tt - stageAt[stage];
    const flip = stage > 0 && since < 0.5 ? (Math.floor(since * STEPS) % 4 < 2 ? 0.2 : 1) : 1;
    const shrink = 1 - stage * 0.06;
    const steam = [0, 1, 2].map((k) => <SketchPath key={k} d={`M${42 + k * 7},${30 - ((tt * 6 + k * 3) % 6)} q2,-4 0,-8 q-2,-4 0,-8`} draw={1} options={fine(slate, 370 + k, {strokeWidth: 0.9})} />);
    op = fadeOut();
    body = (
      <>
        <Shadow cx={50} cy={92} w={44} k={2} />
        <g transform={`translate(50 90) scale(${shrink}) translate(-50 -90)`}>
          <SketchPath d="M28,40 L34,90 L66,90 L72,40 Z" draw={1} options={o(ink, 372, solid(paper))} />
          <SketchPath d="M26,40 L74,40" draw={1} options={o(ink, 373, {strokeWidth: 3})} />
          <SketchPath d="M72,52 Q90,52 88,66 Q86,78 68,78" draw={1} options={o(ink, 374)} />
          <SketchPath d="M34,60 Q50,66 66,60" draw={1} options={fine(ink, 375, hatch(slate, 3))} />
          {steam}
        </g>
        <g transform={`translate(0 ${12 * (1 - flip)}) scale(1 ${flip})`}>
          <SketchPath d="M10,12 L40,12 L46,22 L40,32 L10,32 Z" draw={1} options={o(ink, 376, solid(stage === 3 ? '#FDEDEE' : paper))} />
          <SketchEllipse cx={16} cy={22} w={3.5} h={3.5} draw={1} options={fine(ink, 377)} />
          <T x={30} y={26} s={9} c={stage === 3 ? red : ink}>{prices[stage]}</T>
        </g>
        <SketchPath d="M46,22 L54,34" draw={1} options={fine(ink, 378)} />
        <T x={84} y={14} s={8} c={slate}>{years[stage]}</T>
      </>
    );
  } else if (name === 'rent-day') {
    // the calendar turns to the 1st, the envelope slides out of the wallet and away, the wallet thins; three months of it
    const months = ['JAN', 'FEB', 'MAR'];
    const cycle = 3.0;
    const m = Math.min(2, Math.floor(tt / cycle));
    const c = tt - m * cycle;
    const day = c < 0.6 ? Math.min(31, 26 + Math.floor(c * STEPS)) : 1;
    const out = kf(c, [[0.8, 0], [1.6, 1]], easeInOut);
    const away = kf(c, [[1.6, 0], [2.4, 1]], easeIn);
    const thin = 1 - m * 0.22 - (c > 1.6 ? 0.22 * clamp01((c - 1.6) / 0.4) : 0);
    body = (
      <>
        <SketchRect x={8} y={8} w={30} h={34} draw={1} options={o(ink, 380, solid(paper))} />
        <SketchRect x={8} y={8} w={30} h={9} draw={1} options={o(ink, 381, solid(ink))} />
        <T x={23} y={15} s={6.5} c={paper}>{months[m]}</T>
        <T x={23} y={36} s={day === 1 ? 17 : 13} c={day === 1 ? red : ink}>{day === 1 ? '1st' : day}</T>
        <Shadow cx={66} cy={92} w={48} k={2} />
        <g transform={`translate(0 ${(1 - thin) * 30}) scale(1 ${thin})`}>
          <SketchRect x={44} y={58} w={44} h={30} draw={1} options={o(ink, 382, solid(paper))} />
          <SketchPath d="M44,66 L88,66" draw={1} options={o(ink, 383)} />
          <SketchRect x={74} y={70} w={9} h={8} draw={1} options={fine(ink, 384, solid(paper))} />
        </g>
        {c > 0.8 ? (
          <g transform={`translate(${away * -60} ${-out * 30 - away * 40}) rotate(${-away * 25} 66 52)`} opacity={1 - away * 0.9}>
            <Envelope x={50} y={46} w={32} h={20} k={386} label="RENT £1,406" stamp />
          </g>
        ) : null}
        {m === 2 && c > 2.4 ? <T x={66} y={50} s={9} c={red}>– £4,218</T> : null}
      </>
    );
  } else if (name === 'interest-grows') {
    // a credit card beside a debt bar; each month a red layer of interest goes on top and the figure climbs
    const months = 7;
    const layers: React.ReactNode[] = [];
    let y = 86;
    let m = 0;
    let total = 1000;
    for (let i = 0; i < months; i++) {
      const dt = tt - 0.4 - i * 0.95;
      if (dt < 0) break;
      m = i + 1;
      const h = i === 0 ? 22 : 4 + i * 1.4;
      const q = easeOut(dt / 0.3);
      layers.push(<SketchRect key={i} x={62} y={y - h * q} w={24} h={h * q} draw={1} options={i === 0 ? o(ink, 390, hatch(slate, 3)) : fine(red, 391 + i, hatch(red, 2))} />);
      y -= h;
      if (i > 0) total = Math.round(total * 1.03 + 60);
    }
    const flash = m > 1 && (tt - 0.4 - (m - 1) * 0.95) < 0.3;
    op = fadeOut();
    body = (
      <>
        <Shadow cx={30} cy={92} w={44} k={2} />
        <g transform="rotate(-8 30 60)">
          <SketchRect x={10} y={48} w={40} h={26} draw={1} options={o(ink, 400, solid(paper))} />
          <SketchPath d="M10,55 L50,55" draw={1} options={o(ink, 401, {strokeWidth: 3.6})} />
          <SketchRect x={14} y={60} w={9} h={7} draw={1} options={fine(ink, 402, solid(marker))} />
          <SketchPath d="M14,70 L40,70" draw={1} options={fine(slate, 403)} />
        </g>
        <SketchPath d="M58,86 L92,86" draw={1} options={o(ink, 404)} />
        {layers}
        {m > 0 ? <T x={74} y={y - 3} s={8} c={flash ? red : ink}>£{total.toLocaleString()}</T> : null}
        {m > 0 ? <T x={30} y={14} s={7.5} c={slate}>month {m}</T> : null}
        {m > 1 ? <T x={30} y={24} s={7} c={red}>+ interest</T> : null}
      </>
    );
  } else if (name === 'isa-shield') {
    // coins pile up; a shield draws round them, labelled ISA; a red TAX arrow flies in and bounces off, twice
    const pile = Math.min(6, Math.floor(clamp01((tt - 0.2) / 2.0) * 7));
    const shield = clamp01((tt - 2.4) / 0.9);
    const hit = (at: number) => {
      const dt = tt - at;
      if (dt < 0 || dt > 1.3) return null;
      const x = dt < 0.5 ? 6 + (30 - 6) * easeIn(dt / 0.5) : 30 - (dt - 0.5) * 50;
      const y = dt < 0.5 ? 22 + (46 - 22) * (dt / 0.5) : 46 - (dt - 0.5) * 30;
      const rot = dt < 0.5 ? 40 : 40 - (dt - 0.5) * 220;
      return (
        <g transform={`rotate(${rot} ${x} ${y})`} opacity={dt > 0.9 ? 1 - (dt - 0.9) / 0.4 : 1}>
          <SketchPath d={`M${x - 16},${y} L${x + 4},${y} M${x - 2},${y - 5} L${x + 5},${y} L${x - 2},${y + 5}`} draw={1} options={o(red, 420, {strokeWidth: 3})} />
          <T x={x - 8} y={y - 4} s={6.5} c={red}>TAX</T>
        </g>
      );
    };
    const shake = [3.6, 6.0].reduce((s, at) => s + wobble(tt, at + 0.5, 3), 0);
    op = fadeOut();
    body = (
      <>
        <Shadow cx={56} cy={90} w={46} k={2} />
        {Array.from({length: pile}, (_, k) => <Coin key={k} cx={56 + ((k % 3) - 1) * 9} cy={84 - Math.floor(k / 3) * 5.5} r={6} k={410 + k * 3} />)}
        <g transform={`rotate(${shake} 56 56)`}>
          <SketchPath d="M30,30 Q56,22 82,30 L82,60 Q82,80 56,92 Q30,80 30,60 Z" draw={shield} options={o(blue, 416, {strokeWidth: 3.4})} />
          {shield >= 1 ? <T x={56} y={44} s={10} c={blue}>ISA</T> : null}
        </g>
        {hit(3.6)}
        {hit(6.0)}
        {tt > 7.4 ? <SketchPath d="M64,10 L70,16 L84,2" draw={clamp01((tt - 7.4) / 0.4)} options={o(greenInk, 425, {strokeWidth: 3.2})} /> : null}
      </>
    );
  } else if (name === 'deposit-jar') {
    // a tall jar with marks; it fills steadily as the years count; when the level reaches the top mark a house pops up
    const fill = clamp01((tt - 0.3) / 6.4);
    const level = 90 - 56 * fill;
    const yr = Math.min(8, 1 + Math.floor(fill * 8));
    const pop = tt > 6.9 ? kf(tt, [[6.9, 0], [7.3, 1.2], [7.5, 1]], easeOut) : 0;
    const marks: [number, string][] = [[76, '£5K'], [62, '£10K'], [48, '£15K'], [34, '£20K']];
    op = fadeOut();
    body = (
      <>
        <Shadow cx={38} cy={95} w={44} k={2} />
        {void 0}
        {fill > 0.02 ? <SketchRect x={22} y={level} w={32} h={90 - level} draw={1} options={fine(greenInk, 430, {...hatch(green, 2), strokeWidth: 0.6})} /> : null}
        <SketchPath d="M22,30 L22,86 Q22,92 28,92 L48,92 Q54,92 54,86 L54,30 M18,30 L58,30" draw={1} options={o(ink, 431)} />
        {marks.map(([y, label], k) => (
          <g key={k}>
            <SketchPath d={`M16,${y} L22,${y}`} draw={1} options={fine(ink, 432 + k)} />
            <T x={14} y={y + 2.5} s={6} c={level <= y ? greenInk : slate} anchor="end">{label}</T>
          </g>
        ))}
        <T x={38} y={20} s={7.5} c={slate}>year {yr}</T>
        {pop > 0 ? (
          <g transform={`translate(78 60) scale(${pop}) translate(-78 -60)`}>
            <SketchPath d="M64,62 L78,50 L92,62 L92,78 L64,78 Z" draw={1} options={o(ink, 440, solid(paper))} />
            <SketchRect x={74} y={68} w={8} h={10} draw={1} options={fine(ink, 441)} />
            <SketchPath d="M60,62 L78,46 L96,62" draw={1} options={o(ink, 442, {strokeWidth: 3})} />
            <SketchPath d="M68,90 L73,95 L84,82" draw={1} options={o(greenInk, 443, {strokeWidth: 3})} />
          </g>
        ) : null}
      </>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{overflow: 'visible', display: 'block', opacity: op, ...style}}>
      {body}
    </svg>
  );
};

/** A stop-motion loop placed on a scene the way a drawing is (`anim=`, art_at, art_size, art_start). */
export const LoopLayer: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  const {fps} = useVideoConfig();
  const {height, width, isVertical} = useLayout();
  const name = scene.props.anim ? String(scene.props.anim) : '';
  if (!name || !brand.board || !(LOOPS as readonly string[]).includes(name)) return null;
  const at = isVertical ? 'bl' : String(scene.props.art_at ?? 'tr');
  const size = height * (isVertical ? Math.min(0.22, Number(scene.props.art_size ?? 0.22)) : Math.max(0.14, Math.min(0.64, Number(scene.props.art_size ?? 0.34))));
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
