import React from 'react';
import {FACES, POSES, defaultFaceFor, poseTween, type Face, type Pose} from './Avatar';
import hostInfo from '../../public/host/host.json';

/**
 * The painted host: a generated portrait cut into layers (body, head, brows,
 * mouth patch) by pipeline/host_rig.py, animated as a cut-out puppet with the
 * same rig as the drawn character: tweened poses, viseme mouth shapes drawn in
 * the portrait's own colours, lids and blinks painted over the eyes, brows that
 * move and tilt, a head that bobs, nods and turns on the neck, breathing, and
 * the reaction marks.
 */
export type HostInfo = typeof hostInfo;
export {FACES, POSES};

const W = 1856;
const VIEW_H = 1680; // the visible bust: 1856x1680 keeps the drawn character's 840:760 proportions
const INK = '#1a1012';
const MOUTH = '#2a1416';
const TEETH = '#f1e9e2';
const TONGUE = '#9c3b40';
const RED = '#e5484d';
const BLUE = '#3b7dd8';
const GOLD = '#ffb020';
const K = 2.7; // drawn-rig units -> portrait pixels around the face

type Pt = [number, number];
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixPt = (a: Pt, b: Pt, t: number): Pt => [mix(a[0], b[0], t), mix(a[1], b[1], t)];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOutBack = (p: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};
const hash = (n: number) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const hexToRgb = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgb = (r: number, g: number, b: number) => `rgb(${Math.max(0, Math.min(255, r)) | 0},${Math.max(0, Math.min(255, g)) | 0},${Math.max(0, Math.min(255, b)) | 0})`;
const darken = (hex: string, amt = 0.25) => {
  const [r, g, b] = hexToRgb(hex);
  return rgb(r * (1 - amt), g * (1 - amt), b * (1 - amt));
};
const lighten = (hex: string, amt = 0.15) => {
  const [r, g, b] = hexToRgb(hex);
  return rgb(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
};

// ------------------------------------------------------------------ poses (portrait pixels)
type HandKind = 'fist' | 'open' | 'point' | 'thumb' | 'none';
type ArmP = {elbow: Pt; hand: Pt; kind: HandKind; angle: number; front: boolean};
type PoseP = {L: ArmP; R: ArmP; tilt: number; lean: number; headY: number; shoulderY: number; bodyRot: number};
type Motion = {f2: number; talk: number};

const REST_L: ArmP = {elbow: [120, 2200], hand: [120, 2500], kind: 'none', angle: 0, front: false};
const REST_R: ArmP = {elbow: [1740, 2200], hand: [1740, 2500], kind: 'none', angle: 0, front: false};

const poseParams = (pose: Pose | 'gesture', m: Motion): PoseP => {
  const base: PoseP = {L: REST_L, R: REST_R, tilt: 0, lean: 0, headY: 0, shoulderY: 0, bodyRot: 0};
  switch (pose) {
    case 'gesture': {
      const beat = Math.round(m.talk * 70);
      const sway = Math.round(Math.sin(m.f2 / 9) * 28);
      return {...base, R: {elbow: [1840, 1950], hand: [1600 + sway, 1180 - beat], kind: 'open', angle: 26 + sway, front: true}, lean: 6};
    }
    case 'point':
      return {...base, L: {elbow: [-60, 1800], hand: [-300, 1060], kind: 'point', angle: -95, front: true}, lean: -22, tilt: -3, bodyRot: -1.5};
    case 'crossed':
      return {...base, L: {elbow: [140, 2150], hand: [1300, 2000], kind: 'none', angle: 0, front: false}, R: {elbow: [1760, 2160], hand: [540, 2020], kind: 'fist', angle: 0, front: true}, tilt: 4, headY: 10};
    case 'think':
      return {...base, R: {elbow: [1800, 2150], hand: [1000, 1450], kind: 'fist', angle: -58, front: true}, tilt: -6, lean: 16, headY: 6};
    case 'shocked':
      return {...base, L: {elbow: [-60, 1600], hand: [330, 900], kind: 'open', angle: -24, front: true}, R: {elbow: [1900, 1600], hand: [1500, 900], kind: 'open', angle: 24, front: true}, headY: -36, shoulderY: -24};
    case 'thumbsup':
      return {...base, R: {elbow: [1900, 1950], hand: [1640, 1180], kind: 'thumb', angle: -10, front: true}, tilt: 3, lean: -8};
    case 'facepalm':
      return {...base, R: {elbow: [1860, 2000], hand: [1200, 1200], kind: 'none', angle: 0, front: true}, tilt: 6, headY: 36, lean: 10};
    case 'laugh': {
      const ha = Math.abs(Math.sin(m.f2 / 4)) * 28;
      return {...base, L: {elbow: [160, 2300], hand: [700, 2250 - ha], kind: 'fist', angle: 0, front: true}, headY: -22 + ha, tilt: 5, shoulderY: -ha * 0.6};
    }
    case 'wave': {
      const wob = Math.round(Math.sin(m.f2 / 5) * 110);
      return {...base, R: {elbow: [1900, 1750], hand: [1960 + wob, 1050], kind: 'open', angle: wob / 2.5, front: true}, tilt: 2};
    }
    case 'shrug':
      return {...base, L: {elbow: [-80, 2100], hand: [-150, 1750], kind: 'open', angle: -80, front: true}, R: {elbow: [1940, 2100], hand: [2010, 1750], kind: 'open', angle: 80, front: true}, tilt: 6, shoulderY: -40, headY: 16};
    default:
      return base;
  }
};
const blendArm = (a: ArmP, b: ArmP, t: number): ArmP => {
  const swapAt = a.kind === 'none' && b.kind !== 'none' ? 0.3 : a.kind !== 'none' && b.kind === 'none' ? 0.7 : 0.5;
  const late = t >= swapAt;
  return {elbow: mixPt(a.elbow, b.elbow, t), hand: mixPt(a.hand, b.hand, t), kind: late ? b.kind : a.kind, angle: mix(a.angle, b.angle, t), front: late ? b.front : a.front};
};
const blendPose = (a: PoseP, b: PoseP, t: number): PoseP => ({
  L: blendArm(a.L, b.L, t),
  R: blendArm(a.R, b.R, t),
  tilt: mix(a.tilt, b.tilt, t),
  lean: mix(a.lean, b.lean, t),
  headY: mix(a.headY, b.headY, t),
  shoulderY: mix(a.shoulderY, b.shoulderY, t),
  bodyRot: mix(a.bodyRot, b.bodyRot, t),
});

// ------------------------------------------------------------------ expressions
type FaceP = {browY: number; browLA: number; browRA: number; browRY: number; lidOuter: number; lidInner: number; lidOuterR: number; lidInnerR: number; eyeOpen: number; cornerL: number; cornerR: number; lipMid: number; closed: number; laughEyes: number};
const faceParams = (expr: Face): FaceP => {
  const base: FaceP = {browY: 0, browLA: 0, browRA: 0, browRY: 0, lidOuter: 0, lidInner: 0, lidOuterR: 0, lidInnerR: 0, eyeOpen: 1, cornerL: 0, cornerR: 0, lipMid: 0, closed: 0, laughEyes: 0};
  switch (expr) {
    case 'angry':
      return {...base, browY: 14, browLA: 14, browRA: 14, browRY: 14, lidOuter: 0.35, lidInner: 0.75, lidOuterR: 0.35, lidInnerR: 0.75, cornerL: 6, cornerR: 6, lipMid: -6};
    case 'sad':
      return {...base, browY: 4, browLA: -12, browRA: -12, browRY: 4, lidOuter: 0.7, lidInner: 0.3, lidOuterR: 0.7, lidInnerR: 0.3, cornerL: 8, cornerR: 8, lipMid: -8};
    case 'surprised':
      return {...base, browY: -34, browRY: -34, browLA: -3, browRA: -3, eyeOpen: 1.3, cornerL: 2, cornerR: 2};
    case 'confused':
      return {...base, browY: -22, browLA: -8, browRY: 10, browRA: 10, lidOuterR: 0.45, lidInnerR: 0.45, cornerL: 3, cornerR: -4};
    case 'smug':
      return {...base, browY: 4, browLA: 2, browRY: -22, browRA: -8, lidOuter: 0.5, lidInner: 0.55, lidOuterR: 0.5, lidInnerR: 0.55, cornerL: 1, cornerR: -12, lipMid: 10};
    case 'happy':
      return {...base, browY: -10, browRY: -10, browLA: -2, browRA: -2, lidOuter: 0.15, lidInner: 0.2, lidOuterR: 0.15, lidInnerR: 0.2, cornerL: -9, cornerR: -9, lipMid: 14};
    case 'laugh':
      return {...base, browY: -16, browRY: -16, browLA: -4, browRA: -4, cornerL: -11, cornerR: -11, lipMid: 14, laughEyes: 1};
    case 'closed':
      return {...base, browY: 10, browRY: 10, browLA: 8, browRA: 8, closed: 1};
    default:
      return base;
  }
};
const blendFace = (a: FaceP, b: FaceP, t: number): FaceP => {
  const out = {} as FaceP;
  (Object.keys(a) as (keyof FaceP)[]).forEach((k) => {
    out[k] = mix(a[k], b[k], t);
  });
  return out;
};

type MouthShape = {w: number; top: number; bot: number; teeth: number; tongue: number; round: number};
const visemeShape = (v: number, open: number): MouthShape => {
  switch (v) {
    case 1:
      return {w: 34, top: -3, bot: 10 + open * 30, teeth: 0.7, tongue: open > 0.5 ? 1 : 0, round: 0};
    case 2:
      return {w: 42, top: -2, bot: 7 + open * 12, teeth: 1, tongue: 0, round: 0};
    case 3:
      return {w: 20 + open * 3, top: -8 - open * 5, bot: 12 + open * 18, teeth: 0, tongue: 0, round: 1};
    case 4:
      return {w: 32, top: 0, bot: 2, teeth: 0, tongue: 0, round: 0};
    case 5:
      return {w: 36, top: -3, bot: 7, teeth: 1, tongue: 0, round: 0};
    case 6:
      return {w: 34, top: -3, bot: 9 + open * 16, teeth: 0.3, tongue: 1, round: 0};
    default:
      return {w: 34, top: 0, bot: 0, teeth: 0, tongue: 0, round: 0};
  }
};

export type RasterHostProps = {
  pose: Pose;
  face?: Face;
  prevPose?: Pose;
  prevFace?: Face;
  sinceChange?: number;
  mouth: number;
  viseme?: number;
  talk?: number;
  lookX?: number;
  attention?: number;
  frame: number;
  width?: number;
  flip?: boolean;
  style?: React.CSSProperties;
  /** Resolves a layer file name to a URL (Remotion: staticFile; the studio: a relative path). */
  src: (name: string) => string;
  info?: HostInfo;
};

export const RasterHost: React.FC<RasterHostProps> = ({pose, face, prevPose, prevFace, sinceChange = 999, mouth, viseme = 0, talk = 0, lookX = 0, attention = 0.3, frame, width = 600, flip = false, style, src, info = hostInfo}) => {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const f2 = Math.floor(frame / 2) * 2;
  const since2 = Math.floor(Math.max(0, sinceChange) / 2) * 2;
  const tw = poseTween(since2, 10);
  const twFace = clamp01(since2 / 6);
  const expr: Face = face ?? defaultFaceFor(pose);
  const prevExpr: Face = prevFace ?? (prevPose ? defaultFaceFor(prevPose) : expr);
  const loud = clamp01(mouth);
  const talking = talk > 0.2;
  const C = info.colors;
  const skin = C.skin;
  const skinS = C.skin_shadow;
  const lipU = C.lip_upper;
  const lipL = C.lip_lower;
  const sleeve = C.sleeve;
  const sleeveS = C.sleeve_shadow === C.sleeve ? darken(C.sleeve, 0.3) : C.sleeve_shadow;
  const flat = (info as {style?: string}).style === 'flat';
  const hasGlasses = Boolean((info as {glasses?: boolean}).glasses) && 'glasses.png' in info.boxes;

  // ------------------------------------------------------------ body tween
  const motion: Motion = {f2, talk: loud};
  const effective = (p: Pose, isCurrent: boolean): Pose | 'gesture' => (p === 'idle' && talking && (isCurrent ? sinceChange > 12 : true) ? 'gesture' : p);
  const cur = poseParams(effective(pose, true), motion);
  const prev = poseParams(effective(prevPose ?? pose, false), motion);
  let B = blendPose(prev, cur, tw);
  if (pose === 'idle' && sinceChange > 12) B = blendPose(poseParams('idle', motion), cur, easeOutBack(clamp01((talk - 0.2) / 0.3)));

  // ------------------------------------------------------------ idle acting
  const breath = Math.sin(f2 / 22);
  const bob = Math.round(Math.sin(f2 / 16) * 5 + breath * 4);
  const nod = Math.round(loud * 14);
  const slowTilt = Math.sin(f2 / 44) * 1.2;
  const cycle = 120;
  const ci = Math.floor(frame / cycle);
  const phase = (frame + Math.floor(hash(ci) * 40)) % cycle;
  const glanceLen = 20 + attention * 40;
  const glancing = lookX !== 0 && hash(ci + 7) < attention + 0.2 && phase < glanceLen && sinceChange > 24;
  const headTurn = glancing ? lookX * 2.5 : 0;
  const microX = Math.round((hash(Math.floor(frame / 9)) - 0.5) * 6);
  const microY = Math.round((hash(Math.floor(frame / 11) + 3) - 0.5) * 4);
  const gazeX = glancing ? lookX * 22 : microX;
  const gazeY = glancing ? 6 : microY;
  const gazeInfo = (info as {gaze?: {l: {cx: number; cy: number; r: number}; r: {cx: number; cy: number; r: number}} | null}).gaze ?? null;
  const blinkSlot = Math.floor((frame + 23) / 41);
  const blinkFrame = (frame + 23) % 41;
  const randomBlink = hash(blinkSlot * 3) < 0.75 && blinkFrame < 4;
  const blinking = randomBlink || sinceChange < 3 || (glancing && phase < 3);

  const F = blendFace(faceParams(prevExpr), faceParams(expr), easeOutBack(twFace));
  const browLift = Math.round(loud * 8) + (glancing ? 3 : 0);

  // ------------------------------------------------------------ layers
  const box = (name: keyof typeof info.boxes) => info.boxes[name];
  const Layer: React.FC<{name: keyof typeof info.boxes; transform?: string; opacity?: number}> = ({name, transform, opacity}) => {
    const [x0, y0, x1, y1] = box(name);
    return <image href={src(name)} x={x0} y={y0} width={x1 - x0} height={y1 - y0} transform={transform} opacity={opacity} />;
  };

  // ------------------------------------------------------------ eyes: lids, blinks and laugh arcs painted over the portrait
  const eyesShut = blinking || F.closed > 0.5;
  const Eye: React.FC<{side: 'l' | 'r'}> = ({side}) => {
    const e = side === 'l' ? info.eye_shape_l : info.eye_shape_r;
    const sign = side === 'l' ? 1 : -1; // outer corner is toward the ear
    const outer = e.cx - sign * e.rx;
    const inner = e.cx + sign * e.rx;
    const top = e.cy - e.ry * F.eyeOpen - 6;
    const lidLine = (yo: number, yi: number) => `M${outer},${yo} Q${e.cx},${Math.min(yo, yi) - 6} ${inner},${yi}`;
    if (F.laughEyes > 0.5) {
      return (
        <g>
          <ellipse cx={e.cx} cy={e.cy} rx={e.rx + 10} ry={e.ry + 10} fill={skin} />
          <path d={`M${outer},${e.cy + 6} Q${e.cx},${e.cy - 34} ${inner},${e.cy + 4}`} stroke={INK} strokeWidth={9} fill="none" strokeLinecap="round" />
        </g>
      );
    }
    if (eyesShut) {
      const droop = expr === 'sad' ? 14 : 8;
      return (
        <g>
          <ellipse cx={e.cx} cy={e.cy} rx={e.rx + 12} ry={e.ry + 10} fill={skin} />
          <path d={`M${outer},${e.cy - 2} Q${e.cx},${e.cy + droop} ${inner},${e.cy - 4}`} stroke={INK} strokeWidth={7} fill="none" strokeLinecap="round" />
          <path d={`M${outer},${e.cy - 2} L${outer - sign * 12},${e.cy - 12}`} stroke={INK} strokeWidth={5} strokeLinecap="round" />
        </g>
      );
    }
    const lo = side === 'l' ? F.lidOuter : F.lidOuterR;
    const li = side === 'l' ? F.lidInner : F.lidInnerR;
    const pupil = gazeInfo ? (
      <g>
        <clipPath id={`eye-${uid}-${side}`}>
          <ellipse cx={e.cx} cy={e.cy} rx={e.rx - 6} ry={e.ry - 3} />
        </clipPath>
        <g clipPath={`url(#eye-${uid}-${side})`}>
          <Layer name={`iris-${side}.png` as keyof typeof info.boxes} transform={`translate(${gazeX} ${gazeY})`} />
        </g>
      </g>
    ) : null;
    if (lo < 0.05 && li < 0.05) return pupil;
    // a skin-coloured lid comes down over the eye: 0 = open, 1 = shut
    const yo = e.cy - e.ry + lo * (2 * e.ry);
    const yi = e.cy - e.ry + li * (2 * e.ry);
    return (
      <g>
        {pupil}
        <clipPath id={`lid-${uid}-${side}`}>
          <ellipse cx={e.cx} cy={e.cy} rx={e.rx + 4} ry={e.ry + 4} />
        </clipPath>
        <g clipPath={`url(#lid-${uid}-${side})`}>
          <path d={`M${outer - sign * 10},${top} L${inner + sign * 10},${top} L${inner + sign * 10},${yi} Q${e.cx},${Math.min(yo, yi) - 4} ${outer - sign * 10},${yo} Z`} fill={skin} />
          <path d={lidLine(yo, yi)} stroke={INK} strokeWidth={6} fill="none" strokeLinecap="round" />
        </g>
      </g>
    );
  };

  // ------------------------------------------------------------ mouth: drawn in the portrait's colours over the healed patch
  const Mouth: React.FC = () => {
    const [cx, cy] = info.mouth;
    const k = info.mouth_half_width / 34;
    const open = 0.3 + 0.7 * loud;
    const isLaugh = expr === 'laugh' && twFace >= 1;
    const isSurprised = expr === 'surprised' && twFace >= 1;
    let v = viseme;
    if (expr === 'closed' || expr === 'flat') v = 0;
    if (v === 0 && loud > 0.3 && expr !== 'closed' && expr !== 'flat') v = 1;
    const restingNeutral = v === 0 && (expr === 'neutral' || expr === 'closed' || expr === 'flat') && twFace >= 1;
    if (restingNeutral) return null; // the painted lips
    let S: MouthShape;
    if (isLaugh) S = {w: 40, top: -6, bot: 44, teeth: 1, tongue: 1, round: 0};
    else if (isSurprised && v === 0) S = {w: 16, top: -12, bot: 26, teeth: 0, tongue: 0, round: 1};
    else if ((expr === 'happy' || expr === 'smug') && v === 0 && twFace >= 1) S = {w: expr === 'smug' ? 36 : 42, top: 0, bot: expr === 'smug' ? 0 : 14, teeth: 1, tongue: 0, round: 0};
    else S = visemeShape(v, open);
    const w = S.w * k;
    const topY = S.top * k;
    const botY = S.bot * k;
    const cl = F.cornerL * k;
    const cr = F.cornerR * k;
    const opening = botY - topY;
    const line = 7;
    const heal = <Layer name="mouth-heal.png" />;
    if (opening > 5 * k) {
      const kx = S.round ? w * 0.55 : w * 0.9;
      const topPath = `M${cx - w},${cy + cl} C${cx - kx},${cy + topY - 4} ${cx + kx},${cy + topY - 4} ${cx + w},${cy + cr}`;
      const botPath = `C${cx + kx},${cy + botY} ${cx - kx},${cy + botY} ${cx - w},${cy + cl} Z`;
      const teethH = Math.min(9 * k, opening * 0.38);
      const lipLo = darken(lipL, 0.25);
      return (
        <g>
          {heal}
          <path d={`M${cx - w - 8},${cy + cl - 2} C${cx - kx},${cy + botY + 44} ${cx + kx},${cy + botY + 44} ${cx + w + 8},${cy + cr - 2} ${botPath}`} fill={lipLo} />
          <path d={`M${cx - w},${cy + cl + 6} C${cx - kx * 0.9},${cy + botY + 30} ${cx + kx * 0.9},${cy + botY + 30} ${cx + w},${cy + cr + 6} C${cx + kx},${cy + botY + 4} ${cx - kx},${cy + botY + 4} ${cx - w},${cy + cl + 6} Z`} fill={lipL} opacity={0.7} />
          <path d={`M${cx - w - 8},${cy + cl - 2} C${cx - kx},${cy + topY - 46} ${cx + kx},${cy + topY - 46} ${cx + w + 8},${cy + cr - 2} ${topPath.replace('M', 'L')} Z`} fill={lipU} />
          <path d={`${topPath} ${botPath}`} fill={MOUTH} />
          <clipPath id={`mouth-${uid}`}>
            <path d={`${topPath} ${botPath}`} />
          </clipPath>
          <g clipPath={`url(#mouth-${uid})`}>
            {S.teeth > 0 ? <path d={`M${cx - w},${cy + topY - 16} L${cx + w},${cy + topY - 16} L${cx + w},${cy + topY + teethH * 0.6} Q${cx},${cy + topY + teethH + 10} ${cx - w},${cy + topY + teethH * 0.6} Z`} fill={TEETH} opacity={S.teeth * 0.92} /> : null}
            {S.teeth > 0 ? <path d={`M${cx - w * 0.8},${cy + topY - 2} Q${cx},${cy + topY + 8} ${cx + w * 0.8},${cy + topY - 2}`} stroke={darken(TEETH, 0.3)} strokeWidth={3} fill="none" opacity={S.teeth * 0.5} /> : null}
            {v === 5 ? <rect x={cx - w * 0.8} y={cy + botY - 16} width={w * 1.6} height={16} fill={TEETH} /> : null}
            {S.tongue > 0 ? <ellipse cx={cx} cy={cy + botY} rx={w * 0.5} ry={Math.max(16, opening * 0.22)} fill={TONGUE} opacity={S.tongue} /> : null}
          </g>
          <path d={topPath} stroke={INK} strokeWidth={line} fill="none" strokeLinecap="round" />
          <path d={`M${cx - w},${cy + cl} C${cx - kx},${cy + botY} ${cx + kx},${cy + botY} ${cx + w},${cy + cr}`} stroke={INK} strokeWidth={line * 0.7} fill="none" strokeLinecap="round" opacity={0.85} />
          <path d={`M${cx - w * 0.7},${cy + botY + 30} Q${cx},${cy + botY + 46} ${cx + w * 0.7},${cy + botY + 30}`} stroke={skinS} strokeWidth={6} fill="none" strokeLinecap="round" opacity={0.8} />
        </g>
      );
    }
    const mid = (F.lipMid + (v === 4 ? -2 : 0)) * k;
    return (
      <g>
        {heal}
        <path d={`M${cx - w},${cy + cl} Q${cx - w * 0.5},${cy - 10 + mid * 0.3} ${cx - 16},${cy - 8} Q${cx},${cy + 2} ${cx + 16},${cy - 8} Q${cx + w * 0.5},${cy - 10 + mid * 0.3} ${cx + w},${cy + cr} Q${cx},${cy + mid + 6} ${cx - w},${cy + cl} Z`} fill={lipU} />
        <path d={`M${cx - w + 10},${cy + cl + 2} Q${cx},${cy + mid + 4} ${cx + w - 10},${cy + cr + 2} Q${cx + w * 0.6},${cy + mid + 40} ${cx},${cy + mid + 46} Q${cx - w * 0.6},${cy + mid + 40} ${cx - w + 10},${cy + cl + 2} Z`} fill={darken(lipL, 0.3)} />
        <path d={`M${cx - w * 0.55},${cy + cl + 8} Q${cx},${cy + mid + 10} ${cx + w * 0.55},${cy + cr + 8} Q${cx + w * 0.35},${cy + mid + 30} ${cx},${cy + mid + 32} Q${cx - w * 0.35},${cy + mid + 30} ${cx - w * 0.55},${cy + cl + 8} Z`} fill={lipL} opacity={0.6} />
        <path d={`M${cx - w},${cy + cl} Q${cx},${cy + mid + 6} ${cx + w},${cy + cr}`} stroke={INK} strokeWidth={line} fill="none" strokeLinecap="round" />
        <path d={`M${cx - w * 0.65},${cy + mid + 56} Q${cx},${cy + mid + 72} ${cx + w * 0.65},${cy + mid + 56}`} stroke={skinS} strokeWidth={7} fill="none" strokeLinecap="round" opacity={0.9} />
      </g>
    );
  };

  // ------------------------------------------------------------ arms and hands, painted to match the hoodie and skin
  /** A hand in the portrait's flat style: palm, four tapered fingers, a thumb. Origin at the wrist, fingers point up. */
  const Hand: React.FC<{kind: HandKind; angle: number}> = ({kind, angle}) => {
    if (kind === 'none') return null;
    const fill = `url(#skin-${uid})`;
    const line = 7;
    const finger = (x: number, rot: number, len: number, w = 40) => (
      <g key={`${x}${rot}`} transform={`translate(${x} -70) rotate(${rot})`}>
        <path d={`M${-w / 2},0 L${-w / 2 + 4},${-len + 18} Q${-w / 2 + 4},${-len} ${0},${-len} Q${w / 2 - 4},${-len} ${w / 2 - 4},${-len + 18} L${w / 2},0 Z`} fill={fill} stroke={INK} strokeWidth={line} strokeLinejoin="round" />
        <path d={`M${-w / 2 + 8},${-len * 0.55} Q0,${-len * 0.5} ${w / 2 - 8},${-len * 0.55}`} stroke={INK} strokeWidth={3} fill="none" opacity={0.5} strokeLinecap="round" />
      </g>
    );
    const palm = <path d="M-78,80 L-82,-40 Q-82,-78 -44,-80 L54,-80 Q86,-78 86,-40 L82,80 Q0,110 -78,80 Z" fill={fill} stroke={INK} strokeWidth={line} strokeLinejoin="round" />;
    const knuckles = (
      <g fill={fill} stroke={INK} strokeWidth={line}>
        {[-58, -20, 18, 56].map((x, i) => (
          <circle key={i} cx={x} cy={-78 + Math.abs(i - 1.5) * 6} r={22} />
        ))}
      </g>
    );
    const thumbSide = (
      <g transform="translate(-86 -16) rotate(-52)">
        <path d="M-20,0 L-16,-110 Q0,-128 16,-110 L20,0 Z" fill={fill} stroke={INK} strokeWidth={line} strokeLinejoin="round" />
      </g>
    );
    const thumbAcross = <path d="M-74,-30 Q-20,-10 40,-12 Q72,-10 70,16 Q66,40 36,38 Q-20,40 -74,20 Z" fill={fill} stroke={INK} strokeWidth={line} strokeLinejoin="round" />;
    return (
      <g transform={`rotate(${angle}) scale(1.15)`}>
        {kind === 'open' ? [finger(-62, -16, 150, 42), finger(-20, -5, 178, 42), finger(22, 5, 172, 42), finger(60, 15, 140, 40)] : null}
        {kind === 'point' ? finger(-20, -4, 190, 42) : null}
        {kind === 'thumb' ? <g transform="translate(-56 6) rotate(-20)">{finger(0, 0, 150, 50)}</g> : null}
        {kind === 'open' || kind === 'point' ? thumbSide : null}
        {palm}
        {kind === 'fist' || kind === 'point' || kind === 'thumb' ? knuckles : null}
        {kind === 'fist' || kind === 'point' || kind === 'thumb' ? thumbAcross : null}
        <path d="M-66,60 Q0,96 70,60" fill={skinS} opacity={0.35} />
      </g>
    );
  };
  const Arm: React.FC<{from: Pt; arm: ArmP}> = ({from, arm}) => {
    const pts = `${from[0]},${from[1]} ${arm.elbow[0]},${arm.elbow[1]} ${arm.hand[0]},${arm.hand[1]}`;
    return (
      <g>
        <polyline points={pts} fill="none" stroke={INK} strokeWidth={210} strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={pts} fill="none" stroke={`url(#sleeve-${uid})`} strokeWidth={194} strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={pts} fill="none" stroke={sleeveS} strokeWidth={56} strokeLinecap="round" strokeLinejoin="round" opacity={0.45} transform="translate(34 28)" />
        <g transform={`translate(${arm.hand[0]} ${arm.hand[1]})`}>
          <Hand kind={arm.kind} angle={arm.angle} />
        </g>
      </g>
    );
  };

  // ------------------------------------------------------------ emanata
  const Emanata: React.FC = () => {
    const life = 40;
    if (sinceChange >= life || sinceChange < 2) return null;
    const pop = easeOutBack(clamp01((sinceChange - 2) / 6));
    const fade = sinceChange > life - 8 ? (life - sinceChange) / 8 : 1;
    // the marks sit on the side of the head that faces the frame: when the drawing is flipped the whole group is mirrored
    // back, which also cancels the flip for the text
    const text = (x: number, y: number, s: string, size: number, color: string, rot = 0) => (
      <text x={0} y={0} fontSize={size} fontFamily="'Gochi Hand', 'Patrick Hand', cursive" fontWeight={700} fill={color} stroke={INK} strokeWidth={12} paintOrder="stroke" textAnchor="middle" transform={`translate(${x} ${y}) rotate(${rot})`}>
        {s}
      </text>
    );
    const kind = expr === 'surprised' ? 'bang' : expr === 'confused' ? 'question' : expr === 'angry' ? 'anger' : expr === 'laugh' ? 'ha' : expr === 'sad' || pose === 'facepalm' ? 'sweat' : pose === 'thumbsup' ? 'sparkle' : expr === 'smug' ? 'smug' : null;
    if (!kind) return null;
    const wob = Math.sin(sinceChange / 3) * 10;
    return (
      <g opacity={fade} transform={flip ? `translate(${W} 0) scale(-1 1)` : undefined}>
        {kind === 'bang' ? (
          <g transform={`translate(1380 330) scale(${pop})`}>
            {[...Array(8)].map((_, i) => {
              const a = (i / 8) * Math.PI * 2;
              return <line key={i} x1={Math.cos(a) * 150} y1={Math.sin(a) * 150} x2={Math.cos(a) * (210 + (i % 2) * 30)} y2={Math.sin(a) * (210 + (i % 2) * 30)} stroke={INK} strokeWidth={14} strokeLinecap="round" />;
            })}
            {text(0, 85, '!', 320, RED, -12)}
          </g>
        ) : null}
        {kind === 'question' ? <g transform={`translate(${1370 + wob} ${360 - sinceChange * 2}) scale(${pop})`}>{text(0, 90, '?', 290, GOLD, 14)}</g> : null}
        {kind === 'anger' ? (
          <g transform={`translate(1130 560) scale(${pop * 2})`} stroke={RED} strokeWidth={8} fill="none" strokeLinecap="round">
            <path d="M-24,-10 Q-10,-22 4,-10 M4,-10 Q18,2 4,14 M4,14 Q-10,26 -24,14 M-24,14 Q-38,2 -24,-10" transform={`rotate(${sinceChange * 2})`} />
          </g>
        ) : null}
        {kind === 'ha' ? (
          <g>
            <g transform={`translate(${1480 + wob} ${800 - sinceChange * 4}) scale(${pop})`}>{text(0, 0, 'HA', 260, GOLD, 16)}</g>
            <g transform={`translate(${1580 - wob} ${500 - sinceChange * 5}) scale(${pop * 0.75})`}>{text(0, 0, 'HA', 220, GOLD, -10)}</g>
          </g>
        ) : null}
        {kind === 'sweat' ? (
          <g transform={`translate(1120 ${640 + Math.min(150, sinceChange * 5)}) scale(2.4)`}>
            <path d="M0,-24 C10,-8 16,0 16,10 A16,16 0 1,1 -16,10 C-16,0 -10,-8 0,-24 Z" fill={BLUE} stroke={INK} strokeWidth={3} transform={`scale(${pop})`} />
            <circle cx={-5} cy={9} r={4} fill="#fff" opacity={0.7} />
          </g>
        ) : null}
        {kind === 'sparkle' ? (
          <g fill={GOLD} stroke={INK} strokeWidth={6}>
            {[
              [1340, 380, 1],
              [1420, 620, 0.7],
              [300, 440, 0.8],
            ].map(([x, y, s], i) => {
              const tw2 = 0.6 + 0.4 * Math.abs(Math.sin(sinceChange / 4 + i));
              return <path key={i} d="M0,-22 L6,-6 L22,0 L6,6 L0,22 L-6,6 L-22,0 L-6,-6 Z" transform={`translate(${x} ${y}) scale(${pop * s * tw2 * 2.6})`} />;
            })}
          </g>
        ) : null}
        {kind === 'smug' ? <g transform={`translate(1380 760) scale(${pop})`}>{text(0, 0, '~', 200, GOLD, 10)}</g> : null}
      </g>
    );
  };

  // ------------------------------------------------------------ assemble
  const [nx, ny] = info.neck_base;
  const shL: Pt = [info.shoulder_l[0], info.shoulder_l[1] + B.shoulderY];
  const shR: Pt = [info.shoulder_r[0], info.shoulder_r[1] + B.shoulderY];
  const arms = [
    {key: 'L', from: shL, arm: B.L},
    {key: 'R', from: shR, arm: B.R},
  ];
  const facepalmAmt = pose === 'facepalm' ? clamp01((sinceChange - 4) / 4) : prevPose === 'facepalm' ? 1 - clamp01(sinceChange / 4) : 0;
  const headTilt = B.tilt + slowTilt + headTurn;
  const headDx = B.lean + headTurn * 6;
  const headDy = B.headY - nod;
  const bl = box('brow-l.png');
  const br = box('brow-r.png');
  const browPivotL: Pt = [bl[2] - 10, (bl[1] + bl[3]) / 2];
  const browPivotR: Pt = [br[0] + 10, (br[1] + br[3]) / 2];

  return (
    <svg viewBox={`0 0 ${W} ${VIEW_H}`} width={width} style={{overflow: 'visible', transform: flip ? 'scaleX(-1)' : undefined, ...style}}>
      <defs>
        <linearGradient id={`sleeve-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={flat ? sleeve : lighten(sleeve, 0.08)} />
          <stop offset="1" stopColor={flat ? sleeve : sleeveS} />
        </linearGradient>
        <radialGradient id={`skin-${uid}`} cx="0.35" cy="0.3" r="0.9">
          <stop offset="0" stopColor={flat ? skin : lighten(skin, 0.1)} />
          <stop offset="1" stopColor={flat ? skin : skinS} />
        </radialGradient>
      </defs>
      <g transform={`translate(0 ${bob}) rotate(${B.bodyRot} ${nx} ${VIEW_H}) translate(${nx} ${VIEW_H}) scale(1 ${1 + breath * 0.004}) translate(${-nx} ${-VIEW_H})`}>
        {arms.filter((a) => !a.arm.front).map((a) => (
          <Arm key={`b${a.key}`} from={a.from} arm={a.arm} />
        ))}
        <g transform={`translate(0 ${B.shoulderY * 0.5})`}>
          <Layer name="body.png" />
        </g>
        <g transform={`translate(${headDx} ${headDy}) rotate(${headTilt} ${nx} ${ny})`}>
          <Layer name="head.png" />
          <g transform={`translate(${headTurn * 4} 0)`}>
            <Layer name="brow-l.png" transform={`translate(0 ${F.browY - browLift}) rotate(${F.browLA} ${browPivotL[0]} ${browPivotL[1]})`} />
            <Layer name="brow-r.png" transform={`translate(0 ${F.browRY - browLift}) rotate(${-F.browRA} ${browPivotR[0]} ${browPivotR[1]})`} />
            <Eye side="l" />
            <Eye side="r" />
            <Mouth />
            {hasGlasses ? <Layer name={'glasses.png' as keyof typeof info.boxes} /> : null}
          </g>
          {facepalmAmt > 0 ? (
            <g transform={`translate(${(1 - facepalmAmt) * 300} ${(1 - facepalmAmt) * 400})`} opacity={facepalmAmt}>
              <polyline points="1600,1760 1380,1300 1060,1040" fill="none" stroke={INK} strokeWidth={210} strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="1600,1760 1380,1300 1060,1040" fill="none" stroke={`url(#sleeve-${uid})`} strokeWidth={194} strokeLinecap="round" strokeLinejoin="round" />
              <g transform="translate(1000 1010) rotate(-62) scale(1.35)">
                <Hand kind="open" angle={0} />
              </g>
            </g>
          ) : null}
        </g>
        {arms.filter((a) => a.arm.front && !(pose === 'facepalm' && a.key === 'R' && facepalmAmt > 0.5)).map((a) => (
          <Arm key={`f${a.key}`} from={a.from} arm={a.arm} />
        ))}
        <Emanata />
      </g>
    </svg>
  );
};
