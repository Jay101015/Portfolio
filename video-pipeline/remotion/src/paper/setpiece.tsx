// A set piece (`[set room=...]`, pipeline/setpiece.py): the character acting out a moment in a whole drawn room,
// between stretches of footage. The room is cropped for the frame (the full width and a 16:9 band in landscape, a
// 9:16 slice in a Short) from its measured staging, lightened so he stands out, and boils like redrawn paper; he
// stands where the room was measured for him (or walks in first), changes pose on the words with the house motion
// style (docs/pose-library.md "How he moves": on twos at 12 drawings a second, squash and stretch on landings,
// in-betweens before key poses, hops on happy poses, a jump on an arc); the numbers land on cards in a column on the
// side he is not, pinned outside the slow push-in so they stay still and readable; props pop in beside them.
import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene} from '../types';
import poseLib from '../../../library/poses/manifest.json';
import walkLib from '../../../library/poses/walk.json';
import roomLib from '../../../library/backgrounds/manifest.json';

type PoseEntry = {name: string; w: number; h: number; foot_x: number; floor_y: number};
type RoomEntry = {name: string; file: string; w: number; h: number};
const POSE: Record<string, PoseEntry> = Object.fromEntries((poseLib as PoseEntry[]).map((e) => [e.name, e]));
const ROOM: Record<string, RoomEntry> = Object.fromEntries((roomLib as RoomEntry[]).map((e) => [e.name, e]));
const WALK = walkLib as {cycle: number[]; step: number; frames: {file: string; w: number; h: number; foot_x: number; floor_y: number}[]};

type Stage = {x: number; floor: number; h: number; top?: number; cx?: number; zoom?: number; vtop?: number};
export type SetCue = {t: number; do: 'pose' | 'card' | 'prop'; pose?: string; ib?: boolean; hop?: boolean; arc?: number; flip?: boolean; text?: string; old?: string; color?: string; prop?: string};

const STOP = 12; // drawings a second: the stop-motion clock for the room, the character and the push-in
const STAND_H = 800; // a standing figure in the saved poses, head to toe
const PAPER = '#faf9f5';
const COLORS: Record<string, string> = {ink: '#1a1714', green: '#1f6f4a', red: '#c83237'};
const SQUASH: [number, number][] = [[1.08, 0.92], [0.95, 1.06], [1.02, 0.98]];
const squashAt = (age: number): [number, number] => SQUASH[Math.floor(age / 2)] ?? [1, 1]; // age in drawings
const rand = (k: number, salt: number) => {
  const x = Math.sin(k * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const isFigure = (s: string) => /^[£$]?\d[\d,.]*\s?(%|k|m|bn)?\.?$/i.test(s.trim());

/** The room: cropped for the frame, a little lighter than drawn, boiling on three displacement fields. */
const Room: React.FC<{file: string; room: RoomEntry; st: Stage; vertical: boolean; k: number; id: number}> = ({file, room, st, vertical, k, id}) => {
  const {width: W, height: H} = useVideoConfig();
  let w: number, h: number, left: number, top: number;
  if (vertical) {
    h = H * (st.zoom ?? 1);
    w = (h * room.w) / room.h;
    left = -Math.min(Math.max(0, (st.cx ?? 0.5) * w - W / 2), Math.max(0, w - W));
    top = -(h - H) * (st.vtop ?? 1);
  } else {
    w = W;
    h = (W * room.h) / room.w;
    left = 0;
    top = -(h - H) * (st.top ?? 0.5);
  }
  const u = W / 1920;
  const v = k % 3;
  return (
    <AbsoluteFill style={{background: PAPER, overflow: 'hidden'}}>
      <svg width={0} height={0} style={{position: 'absolute'}}>
        <defs>
          {[0, 1, 2].map((s) => (
            <filter key={s} id={`boil-${id}-${s}`} x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency={0.012} numOctaves={2} seed={11 + s} result="n" />
              <feDisplacementMap in="SourceGraphic" in2="n" scale={3.2 * Math.max(1, u)} xChannelSelector="R" yChannelSelector="G" />
            </filter>
          ))}
        </defs>
      </svg>
      <Img src={staticFile(file)} style={{position: 'absolute', left, top, width: w, height: h, filter: `url(#boil-${id}-${v})`}} />
      <AbsoluteFill style={{background: PAPER, opacity: 0.28}} />
    </AbsoluteFill>
  );
};

/** Where he is and which drawing shows, at scene time t (seconds, on the stop-motion clock). */
const figureAt = (scene: Scene, cues: SetCue[], st: Stage, W: number, H: number, tq: number, cardsLeft: boolean) => {
  const hpx = st.h * H;
  const X = st.x * W;
  const local = Math.max(0, tq - scene.start); // the stop-motion clock can round to just before the scene's first frame
  const walk = scene.props.walk as 'left' | 'right' | undefined;
  let walkEnd = scene.start;
  if (walk) {
    const dir = walk === 'left' ? 1 : -1; // enters from the left: moves right
    const startX = Math.min(0.95 * W, Math.max(0.05 * W, X - dir * Number(scene.props.walkDx ?? 0.28) * W));
    const nd = Math.max(1, Math.round(Math.abs(X - startX) / (WALK.step * hpx)));
    walkEnd = scene.start + nd / 8;
    const dk = Math.floor(local * 8); // the walk on threes: 8 drawings a second
    if (dk < nd) {
      const fr = WALK.frames[WALK.cycle[dk % WALK.cycle.length]];
      return {kind: 'walk' as const, src: fr.file, e: fr, x: startX + (X - startX) * Math.min(1, (dk + 1) / nd), lift: [0, 4, 2][dk % 3] * (hpx / 400), flip: dir < 0, sx: 1, sy: 1, age: 99, name: 'walk'};
    }
  }
  // the exit: with time left after the last word, he turns and walks off the nearer edge (walk in, act, leave)
  const lastWord = (scene.words ?? []).length ? (scene.words as {e: number}[])[(scene.words as {e: number}[]).length - 1].e : scene.end;
  const leaveAt = lastWord + 0.15;
  const exitDir = st.x > 0.5 ? 1 : -1;
  const needed = ((exitDir > 0 ? W - X : X) + 0.3 * hpx) / (WALK.step * hpx) / 8; // seconds to walk clear of the edge
  if (scene.props.leave !== 'no' && scene.end - leaveAt >= needed && tq >= leaveAt) {
    const dir = exitDir;
    const dk = Math.floor((tq - leaveAt) * 8);
    const fr = WALK.frames[WALK.cycle[dk % WALK.cycle.length]];
    return {kind: 'walk' as const, src: fr.file, e: fr, x: X + dir * (dk + 1) * WALK.step * hpx, lift: [0, 4, 2][dk % 3] * (hpx / 400), flip: dir < 0, sx: 1, sy: 1, age: 99, name: 'walk'};
  }
  const poses = cues.filter((c) => c.do === 'pose' && c.pose && POSE[c.pose]);
  const now = poses.filter((c) => c.t <= tq + 1e-6);
  const cue = now[now.length - 1];
  let name = walk ? 'stand-3q' : 'stand';
  let at = walk ? walkEnd : scene.start;
  let flip = walk ? walk === 'left' : false; // the three-quarter drawing faces left: mirrored after walking right
  let lift = 0;
  let [sx, sy] = [1, 1];
  if (cue) {
    name = cue.pose as string;
    at = Math.max(cue.t, walkEnd);
    // point-board points to the right as drawn: it points at the cards unless the script says which way
    flip = cue.flip ?? (name.startsWith('point-board') || name.startsWith('hand-over') ? cardsLeft : false); // both drawn reaching right: towards the cards
    const age = (tq - at) * STOP;
    if (!cue.ib) [sx, sy] = squashAt(age);
    if (cue.hop && age < 8) lift = (H > W ? 0.04 : 0.06) * hpx * Math.sin((Math.PI * age) / 8); // lower on a Short: clear of the captions
    if (cue.arc) {
      const p = Math.min(1, (tq - cue.t + 1 / STOP) / cue.arc);
      lift = 0.32 * hpx * Math.sin(Math.PI * p);
      // on a Short the top of the leap (fists above his head) stays under the captions
      if (H > W) lift = Math.min(lift, Math.max(0.04 * hpx, st.floor * H - hpx - 0.3 * H));
      [sx, sy] = [1, 1];
    }
  }
  // the dip before the next key pose (anticipation), unless an in-between is about to do that job
  const next = poses.find((c) => c.t > tq + 1e-6);
  if (next && !next.ib && (!cue || !cue.ib) && (next.t - tq) * STOP <= 1) [sx, sy] = [1.03, 0.96];
  const e = POSE[name] ?? POSE.stand;
  return {kind: 'pose' as const, src: `poses/solid/${e.name}.png`, e, x: X, lift, flip, sx, sy, age: (tq - at) * STOP, name: e.name};
};

const Card: React.FC<{c: SetCue; x: number; y: number; age: number; tilt: number; vertical: boolean; W: number; maxw: number}> = ({c, x, y, age, tilt, vertical, W, maxw}) => {
  const u = vertical ? W / 1080 : W / 1920;
  const text = String(c.text ?? '');
  const big = !c.old && isFigure(text);
  let size = (big ? (vertical ? 104 : 104) : vertical ? 72 : 70) * u;
  const stack = !!c.old && vertical; // a Short's column is narrow: the old figure struck through above the new one
  const chars = stack ? Math.max(text.length, (c.old ?? '').length) : text.length + (c.old ? c.old.length + 3 : 0);
  const room = maxw - 70 * u;
  if (chars * 0.47 * size > room) size = room / (chars * 0.47);
  const [sx, sy] = age < 0 ? [1, 1] : squashAt(age);
  const color = COLORS[c.color ?? 'ink'] ?? COLORS.ink;
  return (
    <div style={{position: 'absolute', left: x, top: y, transform: `translate(-50%, -50%) rotate(${tilt}deg) scale(${sx}, ${sy})`, transformOrigin: '50% 100%',
      background: '#fff', border: `${4 * u}px solid ${COLORS.ink}`, borderRadius: 18 * u, padding: `${8 * u}px ${26 * u}px ${12 * u}px`,
      boxShadow: `${6 * u}px ${8 * u}px 0 rgba(0,0,0,0.18)`, fontFamily: 'Caveat Brush', fontSize: size, lineHeight: 1.1, whiteSpace: 'nowrap', color, display: 'flex', flexDirection: stack ? 'column' : 'row', alignItems: 'center', gap: (stack ? 2 : 14) * u}}>
      {stack ? <span style={{color: COLORS.red, textDecoration: 'line-through', textDecorationThickness: 5 * u, fontSize: size * 0.8}}>{c.old}</span> : null}
      {c.old && !stack ? (
        <>
          <span style={{color: COLORS.red, textDecoration: 'line-through', textDecorationThickness: 5 * u}}>{c.old}</span>
          <svg width={size * 1.1} height={size * 0.6} viewBox="0 0 44 24">
            <path d="M2 12 H34 M26 4 L40 12 L26 20" stroke={COLORS.ink} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </>
      ) : null}
      <span>{text}</span>
    </div>
  );
};

export const SetScene: React.FC<{scene: Scene; brand: Brand}> = ({scene}) => {
  const frame = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const vertical = H > W;
  const p = scene.props;
  const room = ROOM[p.room as string];
  const stage = (p.stage ?? {}) as {land?: Stage; vert?: Stage};
  const st = (vertical ? stage.vert : stage.land) as Stage | undefined;
  if (!room || !st) return <AbsoluteFill style={{background: PAPER}} />;
  const t = scene.start + frame / fps;
  const k = Math.floor(t * STOP);
  const tq = k / STOP;
  const cues = ((scene.cues ?? []) as unknown as SetCue[]).filter((c) => c.do);
  const cardsLeft = st.x > 0.5;
  const fig = figureAt(scene, cues, st, W, H, tq, cardsLeft);
  const hpx = st.h * H;
  const s = hpx / STAND_H;
  const u = W / 1920;
  const jx = (rand(k, 1) - 0.5) * 2.8 * u * (vertical ? 1.8 : 1);
  const jy = (rand(k, 2) - 0.5) * 1.8 * u * (vertical ? 1.8 : 1);
  const jr = (rand(k, 3) - 0.5) * 0.8;
  const Y = st.floor * H;
  const e = fig.e;
  // the slow push-in with a slight pan right, on the stop-motion clock; a shake on a shock
  const dur = Math.max(0.5, scene.end - scene.start);
  const pp = Math.min(1, Math.max(0, (tq - scene.start) / dur));
  // a long set piece pushes further, towards him, so the payoff reads on a phone; a short one drifts as the board does
  const amount = dur > 9 && !vertical ? Math.min(0.14, 0.03 + dur * 0.008) : Math.min(0.08, 0.03 + dur * 0.004);
  const origin = dur > 9 && !vertical ? `${st.x * 100}% ${(st.floor - st.h * 0.55) * 100}%` : '50% 48%';
  let z = 1 + amount * (pp * (2 - pp) * 0.6 + pp * 0.4);
  const pan = (z - 1) * (W / 2) * 0.3;
  let shx = 0, shy = 0;
  if ((fig.name === 'shocked' || fig.name === 'bill-shock') && fig.age >= 0 && fig.age < 0.42 * STOP) {
    const amp = 14 * u * (1 - fig.age / (0.42 * STOP));
    shx = (rand(k, 7) - 0.5) * 2 * amp;
    shy = (rand(k, 8) - 0.5) * 2 * amp;
    z = Math.max(z, 1.02);
  }
  const shadowW = hpx * 0.28 * Math.max(0.45, 1 - fig.lift / (0.5 * hpx));
  // cards and props, in the order they land, in a column on the side he is not (the last few)
  const poseAt = (t: number) => cues.filter((c) => c.do === 'pose' && c.t <= t + 0.3).pop()?.pose ?? '';
  const inHand = (c: SetCue) => c.do === 'prop' && poseAt(c.t).startsWith('hand-over');
  const landed = cues.filter((c) => (c.do === 'card' || (c.do === 'prop' && !inHand(c))) && c.t <= tq + 1e-6);
  const shown = landed.slice(-(vertical ? 4 : 5));
  const held = cues.filter((c) => inHand(c) && c.t <= tq + 1e-6 && fig.name.startsWith('hand-over'));
  const he = POSE['hand-over'];
  const reach = he ? (he.w - he.foot_x) * s * 0.92 : 0.3 * hpx;
  const handDir = cardsLeft ? -1 : 1;
  const colX = (cardsLeft ? (vertical ? 0.29 : 0.26) : vertical ? 0.71 : 0.74) * W;
  const y0 = (vertical ? 0.3 : 0.2) * H;
  const step = (vertical ? 0.09 : 0.118) * H;
  const maxw = (vertical ? 0.52 : 0.44) * W;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{transform: `translate(${-pan + shx}px, ${shy}px) scale(${z})`, transformOrigin: origin}}>
        <Room file={(p.roomFile as string) ?? room.file} room={room} st={st} vertical={vertical} k={k} id={scene.id} />
        <div style={{position: 'absolute', left: fig.x - shadowW / 2, top: Y - shadowW * 0.07, width: shadowW, height: shadowW * 0.14, borderRadius: '50%', background: 'rgba(26,23,20,0.22)', filter: `blur(${5 * u}px)`}} />
        <Img
          src={staticFile(fig.src)}
          style={{
            position: 'absolute', left: fig.x - e.foot_x * s + jx, top: Y - e.floor_y * s - fig.lift + jy, width: e.w * s, height: e.h * s,
            transformOrigin: `${e.foot_x * s}px ${e.floor_y * s}px`, transform: `scale(${fig.flip ? -fig.sx : fig.sx}, ${fig.sy}) rotate(${jr}deg)`,
          }}
        />
      </AbsoluteFill>
      {held.map((c, i) => {
        const ph = (vertical ? 0.09 : 0.12) * H;
        const [sx, sy] = squashAt((tq - c.t) * STOP);
        const hx = fig.x + handDir * (reach + ph * 0.35);
        const hy = Y - hpx * 0.6;
        return <Img key={`h${i}`} src={staticFile(`props/solid/${c.prop}.png`)} style={{position: 'absolute', left: hx - ph / 2, top: hy - ph * 0.55, height: ph, filter: 'contrast(1.9)', transform: `scale(${sx}, ${sy})`, transformOrigin: '50% 100%'}} />;
      })}
      <Column items={shown} colX={colX} y0={y0} step={step} maxw={maxw} tq={tq} k={k} left={cardsLeft} vertical={vertical} W={W} H={H} />
    </AbsoluteFill>
  );
};

/** The cards and props that have landed, stacked down a column, each squashing as it lands. */
const Column: React.FC<{items: SetCue[]; colX: number; y0: number; step: number; maxw: number; tq: number; k: number; left: boolean; vertical: boolean; W: number; H: number}> = ({items, colX, y0, step, maxw, tq, k, left, vertical, W, H}) => (
  <>
    {items.map((c, i) => {
      const age = (tq - c.t) * STOP;
      const y = y0 + i * step;
      const tilt = (left ? -2 : 1.5) + (rand(k, 9 + i) - 0.5) * 0.8;
      if (c.do === 'prop') {
        const ph = (vertical ? 0.075 : 0.11) * H;
        const [sx, sy] = squashAt(age);
        return <Img key={`p${i}`} src={staticFile(`props/solid/${c.prop}.png`)} style={{position: 'absolute', left: colX - ph / 2, top: y - ph / 2, height: ph, filter: 'contrast(1.9)', transform: `rotate(${tilt * 3}deg) scale(${sx}, ${sy})`, transformOrigin: '50% 100%'}} />;
      }
      return <Card key={`c${i}`} c={c} x={colX} y={y} age={age} tilt={tilt} vertical={vertical} W={W} maxw={maxw} />;
    })}
  </>
);

/** Cards over footage: the amounts said land on the picture as they are said, in a column on the right (landscape)
 * or under the captions (a Short), on the same stop-motion clock as the set pieces. */
export const FootageCards: React.FC<{scene: Scene}> = ({scene}) => {
  const frame = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const vertical = H > W;
  const t = scene.start + frame / fps;
  const k = Math.floor(t * STOP);
  const tq = k / STOP;
  const cues = ((scene.cues ?? []) as unknown as SetCue[]).filter((c) => c.do === 'card' && c.t <= tq + 1e-6);
  if (!cues.length) return null;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <Column items={cues.slice(-(vertical ? 3 : 4))} colX={(vertical ? 0.5 : 0.74) * W} y0={(vertical ? 0.3 : 0.2) * H} step={(vertical ? 0.09 : 0.118) * H}
        maxw={(vertical ? 0.8 : 0.44) * W} tq={tq} k={k} left={false} vertical={vertical} W={W} H={H} />
    </AbsoluteFill>
  );
};

export const setCaptionsHigh = (scenes: Scene[]) => scenes.some((s) => s.type === 'set');
