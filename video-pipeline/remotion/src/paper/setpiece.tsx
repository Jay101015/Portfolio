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
import {displayWidth, type StageFor} from '../components/layout';
import zones from '../components/upright.json';
import {isTraced, pickArt} from './art';
import {CharacterOn} from './character';
import {LOOPS} from './loops';
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
    // a seated pose is drawn with its desk and chair: the furniture does not squash or hop with him
    if (!cue.ib && !(POSE[name] as {seated?: boolean} | undefined)?.seated) [sx, sy] = squashAt(age);
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
  if (next && !next.ib && (!cue || !cue.ib) && (next.t - tq) * STOP <= 1 && !(POSE[name] as {seated?: boolean} | undefined)?.seated) [sx, sy] = [1.03, 0.96];
  // a pose with a loop partner (typing: desk-type and desk-type-b) swaps between the two while it is held, on threes
  const partner = (POSE[name] as {loop?: string} | undefined)?.loop;
  if (partner && POSE[partner] && cue && Math.floor(((tq - at) * STOP) / 3) % 2 === 1) name = partner;
  const e = POSE[name] ?? POSE.stand;
  return {kind: 'pose' as const, src: `poses/solid/${e.name}.png`, e, x: X, lift, flip, sx, sy, age: (tq - at) * STOP, name: e.name};
};

/** How a card's words are set in a column `maxw` wide: the type size, whether an old figure is stacked over the new
 * one, and whether the words wrap. `hung` is a card that hangs from an edge (a Short's board, below): it is as wide as
 * its words, so at the floor size it wraps only when they really are wider than the column (the 0.47 em a character
 * allowed above is a safe guess, a fifth wide of this face). */
const cardType = (c: SetCue, vertical: boolean, W: number, maxw: number, hung = false) => {
  const u = vertical ? W / 1080 : W / 1920;
  const text = String(c.text ?? '');
  const big = !c.old && isFigure(text);
  let size = (big ? (vertical ? 104 : 104) : vertical ? 72 : 70) * u;
  const stack = !!c.old && vertical; // a Short's column is narrow: the old figure struck through above the new one
  const chars = stack ? Math.max(text.length, (c.old ?? '').length) : text.length + (c.old ? c.old.length + 3 : 0);
  const room = maxw - 70 * u;
  if (chars * 0.47 * size > room) size = room / (chars * 0.47);
  // a Short's card is never smaller than 50 px type (smaller cannot be read on a phone): it wraps onto two lines instead
  const floor = vertical ? 50 * u : 0;
  let wrap = size < floor;
  if (wrap) size = floor;
  if (wrap && hung && Math.max(displayWidth(text, size), stack ? displayWidth(String(c.old), size * 0.8) : 0) * 1.03 <= room) wrap = false;
  return {u, text, size, stack, wrap};
};

/** how far inside the line it hangs from a card hung by its right edge keeps, in px of a 1080-wide frame: its shadow
 * (6 px), the corner its tilt swings out (up to 7 px on a card of three lines) and 2 px to spare */
const HANG_IN = 15;
/** a column of cards hung from a line: `at` is where the cards' left or right edges sit */
type Hang = {at: number; side: 'left' | 'right'};

/** A card. `x, y` is its centre. `hang`: `x` is its left or right edge instead (it hangs from a line, and its landing
 * squash widens it away from that line, never across it); `top`: `y` is its top edge instead. */
const Card: React.FC<{c: SetCue; x: number; y: number; age: number; tilt: number; vertical: boolean; W: number; maxw: number; hang?: 'left' | 'right'; top?: boolean}> = ({c, x, y, age, tilt, vertical, W, maxw, hang, top}) => {
  const {u, text, size, stack, wrap} = cardType(c, vertical, W, maxw, !!hang);
  const [sx, sy] = age < 0 ? [1, 1] : squashAt(age);
  const color = COLORS[c.color ?? 'ink'] ?? COLORS.ink;
  return (
    <div style={{position: 'absolute', left: x, top: y, transform: `translate(${hang === 'right' ? '-100%' : hang === 'left' ? '0' : '-50%'}, ${top ? '0' : '-50%'}) rotate(${tilt}deg) scale(${sx}, ${sy})`, transformOrigin: hang === 'right' ? '100% 100%' : hang === 'left' ? '0% 100%' : '50% 100%',
      background: '#fff', border: `${4 * u}px solid ${COLORS.ink}`, borderRadius: 18 * u, padding: `${8 * u}px ${26 * u}px ${12 * u}px`,
      boxShadow: `${6 * u}px ${8 * u}px 0 rgba(0,0,0,0.18)`, fontFamily: 'Caveat Brush', fontSize: size, lineHeight: 1.1, whiteSpace: wrap ? 'normal' : 'nowrap', ...(wrap ? {width: maxw - 60 * u, textAlign: 'center' as const, justifyContent: 'center'} : {}), color, display: 'flex', flexDirection: stack ? 'column' : 'row', alignItems: 'center', gap: (stack ? 2 : 14) * u}}>
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
  // On a Short the cards hang from the far edge of their side: the left margin, or on the right the line YouTube's
  // buttons begin at (upright.json cards.right). They are no wider than the room between that edge and him, at the
  // widest he reaches towards them in any pose of this scene, and a third of the width at least. Centred at 29% or 71%
  // of the width and up to 52% wide, a long card lay on his arm on the left, and ran to 97%, under the buttons, on the
  // right.
  let hang: Hang | undefined;
  let colW = maxw;
  if (vertical) {
    const poses = cues.filter((c) => c.do === 'pose' && !!c.pose && !!POSE[c.pose]);
    // a pose drawn reaching right is turned to face the cards (figureAt); what he holds out reaches that far
    const turned = (c: SetCue) => c.flip ?? ((c.pose as string).startsWith('point-board') || (c.pose as string).startsWith('hand-over') ? cardsLeft : false);
    const towards = (e: PoseEntry, flip: boolean) => (cardsLeft !== flip ? e.foot_x : e.w - e.foot_x) * s;
    const widest = Math.max(towards(POSE.stand, false), ...poses.map((c) => towards(POSE[c.pose as string], turned(c))));
    const beside = st.x * W + (cardsLeft ? -1 : 1) * (widest + 0.02 * W);
    hang = cardsLeft ? {at: zones.stage.left * W, side: 'left'} : {at: zones.cards.right * W - HANG_IN * (W / 1080), side: 'right'};
    colW = Math.min(maxw, Math.max(0.33 * W, Math.abs(beside - hang.at)));
  }
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
      <Column items={shown} colX={colX} y0={y0} step={step} maxw={colW} tq={tq} k={k} left={cardsLeft} vertical={vertical} W={W} H={H} hang={hang} />
    </AbsoluteFill>
  );
};

type Rect = {x: number; y: number; w: number; h: number};
const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
/** where the scene's drawing or loop sits on a landscape page, as ArtLayer / LoopLayer / the big traced picture place
 * it, so the cards can keep off it; null when the scene has none */
const artRect = (scene: Scene, brand: Brand | undefined, W: number, H: number): Rect | null => {
  const p = scene.props;
  const art = p.art && p.art !== 'off' ? String(p.art) : '';
  const anim = p.anim ? String(p.anim) : '';
  if (!art && !anim) return null;
  if (p.art_x !== undefined && p.art_y !== undefined) {
    const size = H * Math.max(0.12, Math.min(0.8, Number(p.art_size ?? 0.3)));
    return {x: Number(p.art_x) * W - size / 2, y: Number(p.art_y) * H - size / 2, w: size, h: size};
  }
  const u = W / 1920;
  const pad = 70 * u;
  if (art && brand?.illustrated && (scene.type === 'text' || scene.type === 'hook') && isTraced(art)) {
    const size = 760 * u; // the big picture on the right half (scenes.tsx CornerDoodle)
    return {x: W - pad * 0.5 - size, y: H / 2 - size / 2, w: size, h: size};
  }
  const size = anim && !art ? H * Math.max(0.14, Math.min(0.64, Number(p.art_size ?? 0.34))) : H * Math.max(0.12, Math.min(0.8, Number(p.art_size ?? 0.3)));
  const at = String(p.art_at ?? 'tr');
  const right = W * 0.95 - size;
  const left = W * 0.05;
  switch (at) {
    case 'tl': return {x: left, y: H * 0.08, w: size, h: size};
    case 'br': return {x: right, y: H * 0.85 - size, w: size, h: size};
    case 'bl': return {x: left, y: H * 0.85 - size, w: size, h: size};
    case 'r': return {x: right, y: H * 0.55 - size / 2, w: size, h: size};
    case 'l': return {x: left, y: H * 0.5 - size / 2, w: size, h: size};
    case 'c': return {x: W / 2 - size / 2, y: H / 2 - size / 2, w: size, h: size};
    default: return {x: right, y: H * 0.08, w: size, h: size};
  }
};
/** the card column's slot: the first of the candidates whose column clears the drawing (under about a tenth of its
 * area on it); the first candidate is the layout's usual place. A wide or centred drawing used to get cards on its
 * hands and props (retirement Shorts and long video, both review rounds). */
const pickSlot = (cands: {colX: number; y0: number}[], n: number, step: number, maxw: number, art: Rect | null): {colX: number; y0: number} => {
  if (!art) return cands[0];
  for (const c of cands) {
    const col = {x: c.colX - maxw / 2, y: c.y0 - step / 2, w: maxw, h: step * n};
    if (overlap(col, art) < 0.1 * col.w * col.h) return c;
  }
  return cands[0];
};

/** The cards and props that have landed, stacked down a column, each squashing as it lands. With `hang` the cards hang
 * from that line by their left or right edges (the props stay centred on `colX`); with `top`, `y0` is the first card's
 * top edge and each card hangs from its own top, `step` below the last. */
const Column: React.FC<{items: SetCue[]; colX: number; y0: number; step: number; maxw: number; tq: number; k: number; left: boolean; vertical: boolean; W: number; H: number; hang?: Hang; top?: boolean}> = ({items, colX, y0, step, maxw, tq, k, left, vertical, W, H, hang, top}) => (
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
      return <Card key={`c${i}`} c={c} x={hang ? hang.at : colX} y={y} age={age} tilt={tilt} vertical={vertical} W={W} maxw={maxw} hang={hang?.side} top={top} />;
    })}
  </>
);

/** `cards_at=strip|tr|br|bl` on a scene: where its cards go on the landscape page, in place of the layout's usual
 * slot. `strip` is two cards side by side along the foot of the frame, so a real page keeps its headline: on a page
 * the real words are marked (paper/pagework.tsx) and a card is the exception. `brand.pagecards: strip` gives the strip
 * to every real page or photo (a still whose file is named real-...) that does not say otherwise. '' is the usual slot. */
export type CardsAt = '' | 'strip' | 'tr' | 'br' | 'bl';
const REAL_STILL = /(^|\/)real-[^/]*\.(jpe?g|png|webp)$/i;
export const cardsAt = (scene: Scene, brand?: Brand): CardsAt => {
  const asked = String(scene.props.cards_at ?? '').trim().toLowerCase();
  if (asked === 'strip' || asked === 'tr' || asked === 'br' || asked === 'bl') return asked;
  if (asked) return ''; // anything else written on the scene keeps the usual slot
  return brand?.pagecards === 'strip' && REAL_STILL.test(String(scene.props.src ?? '')) ? 'strip' : '';
};
/** true while a landscape scene's cards have the foot of its frame on the left (the strip, or the bottom-left corner):
 * its caption label moves to a tab on the frame's top-left edge (PaperBroll) */
export const cardsTakeFoot = (scene: Scene, brand?: Brand) => {
  const at = cardsAt(scene, brand);
  return (at === 'strip' || at === 'bl') && ((scene.cues ?? []) as unknown as SetCue[]).some((c) => c.do === 'card');
};
// the strip: card centres 84.5% down, so a card (a tenth of the height, a figure card 13%) and its landing stretch stay
// under the top 70% of a taped page (which ends 65% down the frame at its lower end) and above the key-words band
// (from 93%); each card at most 41% wide, so the pair spans the taped frame (8% to 92%)
const STRIP = {y: 0.845, xs: [0.29, 0.71], maxw: 0.41};
const CORNER: Record<'tr' | 'br' | 'bl', {colX: number; y0: number}> = {tr: {colX: 0.74, y0: 0.2}, br: {colX: 0.74, y0: 0.727}, bl: {colX: 0.26, y0: 0.727}};

/** true when a placed drawing or loop stands bottom left on a Short's scene: paper/art.tsx ArtLayer and paper/loops.tsx
 * LoopLayer put it there whatever art_at says, unless it was dragged somewhere (art_x and art_y). The stage ends above
 * it and the cards keep to its right. */
export const drawingBelow = (scene: Scene, brand?: Brand): boolean => {
  const p = scene.props;
  if (!brand?.board || (p.art_x !== undefined && p.art_y !== undefined)) return false;
  const loop = !!p.anim && (LOOPS as readonly string[]).includes(String(p.anim));
  const name = pickArt(p.art, undefined);
  // footage and a clipping carry no drawing, and a traced drawing on an illustrated board is the board's own big picture
  const art = !!name && scene.type !== 'broll' && scene.type !== 'news' && !(brand.illustrated && (scene.type === 'text' || scene.type === 'hook') && isTraced(name) && p.art_x === undefined);
  return loop || art;
};
const NO_CHARACTER = new Set(['broll', 'clip', 'still', 'image', 'set']); // the scenes the posing character steps out for (paper/poses.tsx PoseLayer)
/** What stands under a Short's stage on this scene (components/layout.ts uprightStage): cards, a drawing or loop bottom
 * left, the posing character (`characterOn`: the video has one, paper/character.ts). */
export const stageUnder = (scene: Scene, brand: Brand | undefined, characterOn: boolean): StageFor => ({
  cards: ((scene.cues ?? []) as unknown as SetCue[]).some((c) => c.do === 'card'),
  drawing: drawingBelow(scene, brand),
  character: characterOn && !NO_CHARACTER.has(scene.type),
});
// ------------------------------------------------------------------ how wide the hand face writes a line
// The advance width of each character of Caveat (the board look's hand face: labels, sub-lines, source lines) in ems,
// read from the font file, as components/layout.ts holds them for the display face. A sum of these is the line the
// browser sets, less its kerning. The stat and the pie fit their written lines to a Short's stage with it.
const CAVEAT: Record<string, number> = {
  ' ': 0.242, '!': 0.21, '"': 0.237, '#': 0.559, '$': 0.45, '%': 0.6, '&': 0.564, "'": 0.117, '(': 0.33,
  ')': 0.33, '*': 0.363, '+': 0.446, ',': 0.198, '-': 0.326, '.': 0.198, '/': 0.33, '0': 0.45, '1': 0.45,
  '2': 0.45, '3': 0.45, '4': 0.45, '5': 0.45, '6': 0.45, '7': 0.45, '8': 0.45, '9': 0.45, ':': 0.198,
  ';': 0.198, '<': 0.446, '=': 0.446, '>': 0.446, '?': 0.374, '@': 0.643, 'A': 0.502, 'B': 0.52, 'C': 0.472,
  'D': 0.578, 'E': 0.529, 'F': 0.454, 'G': 0.487, 'H': 0.563, 'I': 0.4, 'J': 0.306, 'K': 0.498, 'L': 0.426,
  'M': 0.72, 'N': 0.599, 'O': 0.496, 'P': 0.464, 'Q': 0.502, 'R': 0.537, 'S': 0.486, 'T': 0.458, 'U': 0.482,
  'V': 0.49, 'W': 0.72, 'X': 0.524, 'Y': 0.504, 'Z': 0.522, '[': 0.33, '\\': 0.33, ']': 0.33, '^': 0.446,
  '_': 0.446, '`': 0.353, 'a': 0.437, 'b': 0.435, 'c': 0.355, 'd': 0.393, 'e': 0.325, 'f': 0.291, 'g': 0.355,
  'h': 0.464, 'i': 0.187, 'j': 0.204, 'k': 0.365, 'l': 0.169, 'm': 0.56, 'n': 0.45, 'o': 0.353, 'p': 0.378,
  'q': 0.377, 'r': 0.36, 's': 0.341, 't': 0.331, 'u': 0.37, 'v': 0.331, 'w': 0.517, 'x': 0.343, 'y': 0.341,
  'z': 0.315, '{': 0.33, '|': 0.33, '}': 0.33, '~': 0.446, '£': 0.45, '€': 0.45, '−': 0.446, '–': 0.446,
  '—': 0.566, '’': 0.117, '‘': 0.117, '“': 0.267, '”': 0.267, '…': 0.594, '×': 0.446,
};
const handEm = (word: string) => {
  let em = 0;
  for (const c of word) em += CAVEAT[c] ?? 0.45;
  return em;
};
/** how wide a written line is, in ems of the hand face: each word and the gap the marker leaves after it
 * (paper/write.tsx Write) */
export const writtenEm = (text: string) => text.split(/\s+/).filter(Boolean).reduce((w, word) => w + handEm(word) + 0.28, 0);
/** how many lines a written line takes at `size` px in a column `room` wide, its words broken as the browser breaks
 * them, with 3% in hand so a close call counts as the extra line */
export const writtenLines = (text: string, size: number, room: number) => {
  let lines = 1;
  let x = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = (handEm(word) + 0.28) * size * 1.03;
    if (x > 0 && x + w > room) {
      lines += 1;
      x = 0;
    }
    x += w;
  }
  return lines;
};

/** A page, photo or phone screen shown whole on a Short (paper/scenes.tsx PaperBroll: `vfit=contain`, or `phone=on`):
 * its box. A page is 94% of the width, from 29% of the height down, and as tall as its own shape makes it (`w` and `h`
 * on the scene); a phone screen is 72% of the width (29% to 84% of the height on a 1080 x 1480 recording). */
export const uprightWhole = (scene: Scene, W: number, H: number): Rect => {
  const w = W * (String(scene.props.vfit ?? '') === 'contain' ? 0.94 : 0.72);
  const h = w * (Number(scene.props.h) > 0 && Number(scene.props.w) > 0 ? Number(scene.props.h) / Number(scene.props.w) : 1480 / 1080);
  return {x: (W - w) / 2, y: H * 0.29, w, h};
};

/** Cards over footage (and over any board, stat or chart given cards=): the amounts said land on the picture as they are
 * said, in a column on the right (landscape) or under the captions (a Short), on the same stop-motion clock as the set
 * pieces. */
export const FootageCards: React.FC<{scene: Scene; brand?: Brand}> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps, width: W, height: H} = useVideoConfig();
  const characterOn = React.useContext(CharacterOn);
  const vertical = H > W;
  const t = scene.start + frame / fps;
  const k = Math.floor(t * STOP);
  const tq = k / STOP;
  const cues = ((scene.cues ?? []) as unknown as SetCue[]).filter((c) => c.do === 'card' && c.t <= tq + 1e-6);
  if (!cues.length) return null;
  const at = vertical ? '' : cardsAt(scene, brand); // a Short keeps its own bands
  if (at === 'strip') {
    // the last two cards, side by side. A card keeps the side it landed on (the first on the left, the next on the
    // right, the third over the first) until the one after next replaces it, so nothing slides along the strip
    const last = cues.length - 1;
    return (
      <AbsoluteFill style={{pointerEvents: 'none'}}>
        {[last - 1, last].filter((i) => i >= 0).map((i) => {
          const side = i % 2;
          const tilt = (side ? 1.2 : -1.5) + (rand(k, 9 + side) - 0.5) * 0.8;
          return <Card key={`s${i}`} c={cues[i]} x={STRIP.xs[side] * W} y={STRIP.y * H} age={(tq - cues[i].t) * STOP} tilt={tilt} vertical={false} W={W} maxw={STRIP.maxw * W} />;
        })}
      </AbsoluteFill>
    );
  }
  if (at) {
    // a corner asked for by name: two cards, one above the other
    const c = CORNER[at];
    return (
      <AbsoluteFill style={{pointerEvents: 'none'}}>
        <Column items={cues.slice(-2)} colX={c.colX * W} y0={c.y0 * H} step={0.118 * H} maxw={0.44 * W} tq={tq} k={k} left={c.colX < 0.5} vertical={false} W={W} H={H} />
      </AbsoluteFill>
    );
  }
  // a Short's board, stat or chart has its content in the stage; the band under it, above the Shorts title strip, is
  // where its cards go
  const lowBand = vertical && scene.type !== 'broll';
  // a Short's board in the illustrated style with a traced drawing: the drawing is the big centred picture from 45% down,
  // so the cards go in the gap above it, under the caption, not on its hands or props (retirement Shorts round 2)
  const aboveArt = lowBand && !!brand?.illustrated && (scene.type === 'text' || scene.type === 'hook') && !!scene.props.art && isTraced(String(scene.props.art)) && scene.props.art_x === undefined;
  if (lowBand && !aboveArt) {
    // The cards hang from the right edge of their zone (components/upright.json: 84% of the width, where YouTube's
    // buttons begin; centred at 73% and half the width wide, a card ran to 98%, under the buttons), two at a time at
    // the heights they have always had. With nothing else in the band they may run back to the left margin, so a
    // line of thirty characters stays one line. Beside a drawing or loop bottom left they start right of it, one card
    // at a time when its words have to wrap there (two wrapped cards stood on each other). Beside the character they
    // hang from the line left of him instead. With both, the one card goes in the gap over the drawing, left of him.
    const z = zones;
    const under = stageUnder(scene, brand, characterOn);
    let right = z.cards.right;
    let from = z.stage.left;
    let y0 = 0.755 * H;
    if (under.character && under.drawing) {
      right = z.character.left;
      y0 = ((z.stage.foot.character + z.drawing.top) / 2) * H;
    } else if (under.character) right = z.cards.beside_character;
    else if (under.drawing) from = z.cards.beside_drawing;
    const edge = right * W - HANG_IN * (W / 1080);
    const room = edge - from * W;
    const pair = cues.slice(-2);
    const one = under.drawing && (!!under.character || pair.some((c) => cardType(c, true, W, room, true).wrap));
    return (
      <AbsoluteFill style={{pointerEvents: 'none'}}>
        <Column items={one ? pair.slice(-1) : pair} colX={edge - room / 2} y0={y0} step={0.065 * H} maxw={room} tq={tq} k={k} left={false} vertical W={W} H={H} hang={{at: edge, side: 'right'}} />
      </AbsoluteFill>
    );
  }
  if (vertical && String(scene.props.vfit ?? '') === 'contain' && !!(scene.props.vsrc || scene.props.src) && String(scene.props.next ?? '') !== 'on') {
    // A page fitted whole on a Short (PaperBroll): its cards hang under the page's foot, the first a little clear of
    // it, the second a step below. They used to start at 60% of the height whatever the page's shape, on the foot of a
    // page that ends at 58%. The page keeps its size: real material is not shrunk to make room for cards. Two cards
    // while both end above the Shorts title strip, else one; under a page so tall that not even one fits, the one
    // card sits on the page's foot, as low as the strip allows.
    const box = uprightWhole(scene, W, H);
    const pitch = 0.08 * H;
    const tall = 0.072 * H; // a card of two lines
    const floor = zones.cards.bottom * H;
    const top0 = box.y + box.h + 0.0125 * H; // clear of the foot by the corner a card's tilt lifts and its landing stretch
    const fit = Math.floor((floor - top0 - tall) / pitch) + 1;
    return (
      <AbsoluteFill style={{pointerEvents: 'none'}}>
        <Column items={cues.slice(-Math.max(1, Math.min(2, fit)))} colX={0.34 * W} y0={Math.min(top0, floor - tall)} step={pitch} maxw={0.56 * W} tq={tq} k={k} left vertical W={W} H={H} top />
      </AbsoluteFill>
    );
  }
  // on footage the column is on the right; on a board with a drawing on its right half they go under the written
  // lines on the left, so the page fills up instead of sitting white
  // a board with a drawing: the cards go under its written lines, low on the left; a stat keeps them in the right column
  const board = scene.type === 'text' || scene.type === 'hook';
  const underLines = !vertical && board && ((!!scene.props.art && scene.props.art !== 'off') || !!scene.props.anim);
  const iconBoard = !vertical && board && !underLines; // a corner doodle top right: the column starts below it
  // a chart's lines and bars start low on the left: its cards go top-left, under the title, where the page is empty
  const chart = !vertical && scene.type === 'chart';
  // a drawing or a loop on the right half (any board, list, stat or recap): the cards sit top right, above it, two at a time
  const rightArt = !vertical && !chart && scene.type !== 'broll' && ((!!scene.props.art && scene.props.art !== 'off') || !!scene.props.anim || scene.type === 'pie');
  const topRow = !vertical && (scene.type === 'bite' || scene.type === 'news'); // the label or the clipping runs under the column: start at the top, a card's half-height clear of the edge (at 0.03 the top card was cut in half)
  // a compare fills the page with its two boxes: the cards go in the strip under them, two at a time, so they never
  // sit on a box's heading (retirement round 2: "most people under 40: a pot" hid "It depends" for 12 s)
  const compare = !vertical && scene.type === 'compare';
  const left = (underLines && !rightArt) || chart || compare;
  const n = compare ? 2 : aboveArt ? 1 : vertical ? 2 : rightArt || topRow || chart ? 2 : underLines ? 2 : left ? 3 : iconBoard ? 3 : 4;
  const step = (compare ? 0.088 : aboveArt ? 0.065 : vertical ? 0.08 : underLines ? 0.1 : 0.118) * H;
  const maxw = (compare ? 0.84 : aboveArt ? 0.84 : vertical ? 0.56 : left ? 0.42 : 0.44) * W;
  const usual = {colX: (compare ? 0.5 : aboveArt ? 0.5 : vertical ? 0.34 : chart ? 0.66 : rightArt ? 0.74 : underLines ? 0.25 : 0.74) * W, y0: (compare ? 0.81 : aboveArt ? 0.4 : vertical ? 0.6 : chart ? 0.21 : topRow ? 0.075 : rightArt ? 0.075 : underLines ? 0.72 : iconBoard ? 0.5 : 0.2) * H};
  // on a landscape board the column keeps off the drawing: its usual place first, then top right, bottom left under
  // the lines, mid left, and the strip along the bottom
  const slot = vertical || compare || chart ? usual : pickSlot([usual, {colX: 0.74 * W, y0: 0.075 * H}, {colX: 0.25 * W, y0: 0.72 * H}, {colX: 0.25 * W, y0: 0.42 * H}, {colX: 0.5 * W, y0: 0.86 * H}], n, step, maxw, artRect(scene, brand, W, H));
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <Column items={cues.slice(-n)} colX={slot.colX} y0={slot.y0} step={step} maxw={maxw} tq={tq} k={k} left={left || slot.colX < W / 2} vertical={vertical} W={W} H={H} />
    </AbsoluteFill>
  );
};

export const setCaptionsHigh = (scenes: Scene[]) => scenes.some((s) => s.type === 'set');
