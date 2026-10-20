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
/** An arm is placed by its wrist; the elbow is solved from the shoulder. bend: degrees the hand turns off the forearm. */
type ArmP = {hand: Pt; kind: HandKind; bend: number; front: boolean; elbowUp?: boolean; abs?: boolean};
type PoseP = {L: ArmP; R: ArmP; tilt: number; lean: number; headY: number; shoulderY: number; bodyRot: number};
type Motion = {f2: number; talk: number};

const REST_L: ArmP = {hand: [250, 2650], kind: 'none', bend: 0, front: false};
const REST_R: ArmP = {hand: [1610, 2650], kind: 'none', bend: 0, front: false};

/** Each pose is a still: the hand sits where it sits and nothing sways, beats or wobbles. */
const poseParams = (pose: Pose | 'gesture', _m: Motion): PoseP => {
  const base: PoseP = {L: REST_L, R: REST_R, tilt: 0, lean: 0, headY: 0, shoulderY: 0, bodyRot: 0};
  switch (pose) {
    case 'point':
      return {...base, L: {hand: [430, 1300], kind: 'point', bend: -72, abs: true, front: true}, lean: -10, tilt: -2};
    case 'crossed':
      return {...base, L: {hand: [1250, 2050], kind: 'none', bend: 0, front: false}, R: {hand: [560, 1600], kind: 'fist', bend: 84, front: true}, tilt: 2, headY: 6};
    case 'think':
      return {...base, R: {hand: [1010, 1440], kind: 'fist', bend: -8, front: true}, tilt: -4, lean: 10, headY: 4};
    case 'shocked':
      return {...base, L: {hand: [230, 870], kind: 'open', bend: -16, abs: true, front: true}, R: {hand: [1630, 870], kind: 'open', bend: 16, abs: true, front: true}, headY: -20, shoulderY: -16};
    case 'thumbsup':
      return {...base, R: {hand: [1560, 1120], kind: 'thumb', bend: 14, abs: true, front: true}, tilt: 2, lean: -6};
    case 'facepalm':
      return {...base, R: {hand: [1090, 1030], kind: 'open', bend: -62, abs: true, elbowUp: true, front: true}, tilt: 4, headY: 24, lean: 8};
    case 'laugh':
      return {...base, L: {hand: [560, 1640], kind: 'fist', bend: 70, front: true}, headY: -10, tilt: 3};
    case 'wave':
      return {...base, R: {hand: [1700, 1000], kind: 'open', bend: 14, abs: true, front: true}, tilt: 2};
    case 'shrug':
      return {...base, L: {hand: [-40, 1480], kind: 'open', bend: -100, abs: true, front: true}, R: {hand: [1900, 1480], kind: 'open', bend: 100, abs: true, front: true}, tilt: 4, shoulderY: -30, headY: 10};
    default:
      return base;
  }
};
const blendArm = (a: ArmP, b: ArmP, t: number): ArmP => {
  const swapAt = a.kind === 'none' && b.kind !== 'none' ? 0.3 : a.kind !== 'none' && b.kind === 'none' ? 0.7 : 0.5;
  const late = t >= swapAt;
  return {hand: mixPt(a.hand, b.hand, t), kind: late ? b.kind : a.kind, bend: mix(a.bend, b.bend, t), front: late ? b.front : a.front, elbowUp: late ? b.elbowUp : a.elbowUp, abs: late ? b.abs : a.abs};
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
  const tw = 1; // a pose change is a cut, like a new drawing, not a slide
  const twFace = clamp01(since2 / 6);
  const expr: Face = face ?? defaultFaceFor(pose);
  const prevExpr: Face = prevFace ?? (prevPose ? defaultFaceFor(prevPose) : expr);
  const loud = clamp01(mouth);
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
  const effective = (p: Pose, _isCurrent: boolean): Pose | 'gesture' => p; // no talking-hand gesture: idle is still
  const cur = poseParams(effective(pose, true), motion);
  const prev = poseParams(effective(prevPose ?? pose, false), motion);
  const B = blendPose(prev, cur, tw);

  // ------------------------------------------------------------ idle acting
  const breath = Math.sin(f2 / 22);
  const bob = 0; // the head holds still; only the breathing scale and the eyes move
  const nod = 0;
  const slowTilt = 0;
  const cycle = 120;
  const ci = Math.floor(frame / cycle);
  const phase = (frame + Math.floor(hash(ci) * 40)) % cycle;
  const glanceLen = 20 + attention * 40;
  const glancing = lookX !== 0 && hash(ci + 7) < attention + 0.2 && phase < glanceLen && sinceChange > 24;
  const headTurn = 0; // a glance moves only the pupils
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
  const browLift = glancing ? 2 : 0;

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

  // ------------------------------------------------------------ mouth: the portrait's own lip drawing, redrawn so it can move
  // The art draws the mouth as an outlined upper lip, a thick mouth line and a chin crease, with no lower-lip line.
  // Every shape here keeps that vocabulary: the upper lip lifts and narrows, the mouth line becomes the roof of the
  // opening, the lower lip is the same kind of line, and the crease drops with the jaw.
  type LipShape = {gap: number; sx: number};
  // Only the lips move. The chin and jaw stay painted; the mouth line is the fixed roof of a small
  // opening and the lower lip line drops a little below it. Nothing lifts, nothing stretches.
  const lipShape = (v: number, open: number): LipShape => {
    switch (v) {
      case 1:
        return {gap: 10 + open * 16, sx: 1};
      case 2:
        return {gap: 6 + open * 8, sx: 1.04};
      case 3:
        return {gap: 12 + open * 12, sx: 0.8};
      case 4:
        return {gap: 0, sx: 1};
      case 5:
        return {gap: 7, sx: 1};
      case 6:
        return {gap: 9 + open * 10, sx: 1};
      default:
        return {gap: 0, sx: 1};
    }
  };
  const Mouth: React.FC = () => {
    // The painted lips are never touched. When the host talks, a small dark opening is painted just
    // under the painted mouth line, closed by a lower lip line, in the style of a mouth swap: the
    // chin, jaw and upper lip stay exactly as drawn. Closed mouths show the painting as is.
    const Lp = info.lips;
    const cx = (Lp.corner_l[0] + Lp.corner_r[0]) / 2;
    const lineY = Lp.line_y;
    const sw = Lp.stroke;
    const open = 0.3 + 0.7 * loud;
    const isLaugh = expr === 'laugh' && twFace >= 1;
    const isSurprised = expr === 'surprised' && twFace >= 1;
    let v = viseme;
    if (expr === 'closed' || expr === 'flat') v = 0;
    if (v === 0 && loud > 0.3 && expr !== 'closed' && expr !== 'flat') v = 1;
    let S: LipShape;
    if (isLaugh) S = {gap: 34, sx: 1};
    else if (isSurprised && v === 0) S = {gap: 22, sx: 0.8};
    else S = lipShape(v, open);
    if (S.gap < 4) return null;
    const half = Lp.line_half * 0.92 * S.sx;
    const topY = lineY + Lp.line_dip * 0.5 + 2; // just under the painted line
    const floorY = topY + S.gap;
    const roof = `M${cx - half},${lineY + 1} Q${cx},${topY} ${cx + half},${lineY + 1}`;
    const floor = `Q${cx},${floorY + S.gap * 0.4} ${cx - half},${lineY + 1} Z`;
    return (
      <g>
        <path d={`${roof} ${floor}`} fill={MOUTH} />
        <path d={`M${cx - half},${lineY + 1} Q${cx},${floorY + S.gap * 0.4} ${cx + half},${lineY + 1}`} stroke={INK} strokeWidth={sw} fill="none" strokeLinecap="round" />
      </g>
    );
  };

  // ------------------------------------------------------------ arms and hands, painted to match the hoodie and skin
  /** A hand in the portrait's flat style: palm, four tapered fingers, a thumb. Origin at the wrist, fingers point up. */
  const Hand: React.FC<{kind: HandKind; angle: number; mirror?: boolean}> = ({kind, angle, mirror}) => {
    if (kind === 'none') return null;
    const fill = `url(#skin-${uid})`;
    const line = 7;
    const finger = (x: number, rot: number, len: number, w = 40) => (
      <g key={`${x}${rot}`} transform={`translate(${x} -70) rotate(${rot})`}>
        <path d={`M${-w / 2},0 L${-w / 2 + 4},${-len + 18} Q${-w / 2 + 4},${-len} ${0},${-len} Q${w / 2 - 4},${-len} ${w / 2 - 4},${-len + 18} L${w / 2},0 Z`} fill={fill} stroke={INK} strokeWidth={line} strokeLinejoin="round" />
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
      <g transform={`rotate(${angle}) scale(${mirror ? -1.15 : 1.15} 1.15)`}>
        {kind === 'open' ? [finger(-62, -16, 150, 42), finger(-20, -5, 178, 42), finger(22, 5, 172, 42), finger(60, 15, 140, 40)] : null}
        {kind === 'point' ? finger(-20, -4, 190, 42) : null}
        {kind === 'thumb' ? <g transform="translate(-56 6) rotate(-20)">{finger(0, 0, 150, 50)}</g> : null}
        {kind === 'open' || kind === 'point' ? thumbSide : null}
        {palm}
        {kind === 'fist' || kind === 'point' || kind === 'thumb' ? knuckles : null}
        {kind === 'fist' || kind === 'point' || kind === 'thumb' ? thumbAcross : null}
      </g>
    );
  };
  /** A sleeve in the hoodie's raglan red: upper arm and forearm as tapered pieces, a cuff, and the hand continuing the forearm. */
  const Arm: React.FC<{from: Pt; arm: ArmP; side: 'L' | 'R'}> = ({from, arm, side}) => {
    const UPPER = 620;
    const FORE = 570;
    const S = from;
    const H = arm.hand;
    let dx = H[0] - S[0];
    let dy = H[1] - S[1];
    let d = Math.hypot(dx, dy);
    const reach = UPPER + FORE - 30;
    if (d > reach) {
      dx *= reach / d;
      dy *= reach / d;
      d = reach;
    }
    const W: Pt = [S[0] + dx, S[1] + dy];
    const ux = dx / d;
    const uy = dy / d;
    const a = (d * d + UPPER * UPPER - FORE * FORE) / (2 * d);
    const h = Math.sqrt(Math.max(0, UPPER * UPPER - a * a));
    const c1: Pt = [S[0] + ux * a - uy * h, S[1] + uy * a + ux * h];
    const c2: Pt = [S[0] + ux * a + uy * h, S[1] + uy * a - ux * h];
    const out = side === 'L' ? -1 : 1; // which way is away from the body
    const score = (p: Pt) => (arm.elbowUp ? -p[1] : p[1]) + out * p[0] * 0.3;
    const E = score(c1) > score(c2) ? c1 : c2;
    const piece = (p: Pt, q: Pt, wp: number, wq: number, grow = 0) => {
      const vx = q[0] - p[0];
      const vy = q[1] - p[1];
      const l = Math.hypot(vx, vy) || 1;
      const px = -vy / l;
      const py = vx / l;
      const a1 = wp / 2 + grow;
      const a2 = wq / 2 + grow;
      return `M${p[0] + px * a1},${p[1] + py * a1} L${q[0] + px * a2},${q[1] + py * a2} L${q[0] - px * a2},${q[1] - py * a2} L${p[0] - px * a1},${p[1] - py * a1} Z`;
    };
    const wS = 220;
    const wE = 190;
    const wW = 150;
    const fvx = W[0] - E[0];
    const fvy = W[1] - E[1];
    const fl = Math.hypot(fvx, fvy) || 1;
    const fux = fvx / fl;
    const fuy = fvy / fl;
    const forearmAngle = (Math.atan2(fux, -fuy) * 180) / Math.PI;
    // a relative bend turns the hand off the forearm; an absolute one sets where the fingers point
    const handAngle = arm.abs ? arm.bend : forearmAngle + arm.bend;
    const cuffA: Pt = [W[0] - fux * 46, W[1] - fuy * 46];
    const ink = 10;
    return (
      <g>
        <g fill={INK}>
          <circle cx={S[0]} cy={S[1]} r={wS / 2 + ink} />
          <path d={piece(S, E, wS, wE, ink)} />
          <circle cx={E[0]} cy={E[1]} r={wE / 2 + ink} />
          <path d={piece(E, W, wE, wW, ink)} />
          <circle cx={W[0]} cy={W[1]} r={wW / 2 + ink} />
        </g>
        <g fill={sleeve}>
          <circle cx={S[0]} cy={S[1]} r={wS / 2} />
          <path d={piece(S, E, wS, wE)} />
          <circle cx={E[0]} cy={E[1]} r={wE / 2} />
          <path d={piece(E, W, wE, wW)} />
          <circle cx={W[0]} cy={W[1]} r={wW / 2} />
        </g>
        <path d={`M${cuffA[0] + (wW / 2) * -fuy},${cuffA[1] + (wW / 2) * fux} L${cuffA[0] - (wW / 2) * -fuy},${cuffA[1] - (wW / 2) * fux}`} stroke={INK} strokeWidth={6} strokeLinecap="round" />
        <g transform={`translate(${W[0]} ${W[1]})`}>
          {/* the thumbs face the body: the viewer's-left hand is the drawing mirrored */}
          <Hand kind={arm.kind} angle={handAngle} mirror={side === 'L'} />
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
    const wob = 0;
    const top = Math.max(0, ((info as {head_top?: number}).head_top ?? 260) - 260); // marks sit relative to the top of the hair, inside the drawing
    return (
      <g opacity={fade} transform={`${flip ? `translate(${W} 0) scale(-1 1)` : ''} translate(0 ${top})`}>
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
  const arms: {key: 'L' | 'R'; from: Pt; arm: ArmP}[] = [
    {key: 'L', from: shL, arm: B.L},
    {key: 'R', from: shR, arm: B.R},
  ];
  const headTilt = 0; // the head is a still: the whole drawing holds, only eyes, brows and mouth change
  const headDx = 0;
  const headDy = 0;
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
      <g>
        <g>
          <Layer name="body.png" />
        </g>
        <g transform={`translate(${headDx} ${headDy}) rotate(${headTilt} ${nx} ${ny})`}>
          <Layer name="head.png" />
          <g>
            <Layer name="brow-l.png" transform={`translate(0 ${F.browY - browLift}) rotate(${F.browLA} ${browPivotL[0]} ${browPivotL[1]})`} />
            <Layer name="brow-r.png" transform={`translate(0 ${F.browRY - browLift}) rotate(${-F.browRA} ${browPivotR[0]} ${browPivotR[1]})`} />
            <Eye side="l" />
            <Eye side="r" />
            <Mouth />
            {hasGlasses ? <Layer name={'glasses.png' as keyof typeof info.boxes} /> : null}
          </g>
        </g>
        <Emanata />
      </g>
    </svg>
  );
};
