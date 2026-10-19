import React from 'react';

/**
 * The host character, drawn in a cel-shaded, semi-realistic style (webtoon /
 * stylised-animation proportions): a defined jaw, almond eyes with small irises,
 * thick straight brows, a real nose and lips, dense curl texture with a line-up
 * and fade, thin dark line work and hard two-tone shading.
 *
 * Everything that moves is a number: each pose and each expression is a set of
 * parameters, and the character tweens between the previous and current set with
 * a little anticipation and overshoot, held on twos. The mouth is driven by
 * visemes (sound shapes) plus loudness, and the idle has gaze, nods on stressed
 * words, breathing, blinks and secondary motion.
 */
export type AvatarConfig = {
  skin: string;
  hair: 'short' | 'curly' | 'buzz' | 'long' | 'bald' | 'fade' | 'locs' | 'afro' | 'bun' | 'hightop';
  hairColor: string;
  facialHair: 'none' | 'stubble' | 'beard' | 'goatee' | 'mustache' | 'chinstrap';
  glasses: 'none' | 'round' | 'square';
  eyeColor: string;
  shirt: 'tee' | 'hoodie' | 'jacket' | 'collared';
  shirtColor: string;
  shirtAccent: string;
  accessory: 'none' | 'cap' | 'headphones' | 'beanie' | 'earring';
  accessoryColor: string;
};

export type Pose = 'idle' | 'point' | 'crossed' | 'think' | 'shocked' | 'thumbsup' | 'facepalm' | 'laugh' | 'wave' | 'shrug';
export type Face = 'neutral' | 'happy' | 'angry' | 'sad' | 'smug' | 'surprised' | 'confused' | 'laugh' | 'closed' | 'flat';
export const POSES: Pose[] = ['idle', 'point', 'crossed', 'think', 'shocked', 'thumbsup', 'facepalm', 'laugh', 'wave', 'shrug'];
export const FACES: Face[] = ['neutral', 'happy', 'angry', 'sad', 'smug', 'surprised', 'confused', 'laugh', 'closed', 'flat'];

export const defaultFaceFor = (pose: Pose): Face => {
  switch (pose) {
    case 'point':
    case 'wave':
    case 'thumbsup':
      return 'happy';
    case 'crossed':
      return 'angry';
    case 'think':
    case 'shrug':
      return 'confused';
    case 'shocked':
      return 'surprised';
    case 'facepalm':
      return 'closed';
    case 'laugh':
      return 'laugh';
    default:
      return 'neutral';
  }
};

export const defaultAvatar: AvatarConfig = {
  skin: '#6b3f26',
  hair: 'hightop',
  hairColor: '#17120f',
  facialHair: 'none',
  glasses: 'round',
  eyeColor: '#3a2416',
  shirt: 'hoodie',
  shirtColor: '#2a2a31',
  shirtAccent: '#c9303a',
  accessory: 'earring',
  accessoryColor: '#e9e9ec',
};

const INK = '#1d1410';
const OUT = 5; // silhouette line
const IN = 3; // interior line
const MOUTH = '#3a1515';
const TEETH = '#f6f1ea';
const TONGUE = '#b8484c';
const RED = '#e5484d';
const BLUE = '#3b7dd8';
const GOLD = '#ffb020';

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
/** Shadow tone for skin: darker and a touch cooler, the way cel shading is painted. */
const shade = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return rgb(r * 0.66, g * 0.64, b * 0.7);
};
const lipTone = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return rgb(r * 0.9 + 30, g * 0.7, b * 0.75);
};

// ------------------------------------------------------------------ maths
type Pt = [number, number];
const SH_L: Pt = [140, 620];
const SH_R: Pt = [460, 620];
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixPt = (a: Pt, b: Pt, t: number): Pt => [mix(a[0], b[0], t), mix(a[1], b[1], t)];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOutBack = (p: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};
/** 0..1 progress of a re-pose: a short anticipation (moves the wrong way), then a snap with overshoot. */
export const poseTween = (since: number, len = 10): number => {
  if (since >= len) return 1;
  const p = Math.max(0, since) / len;
  if (p < 0.2) return -0.12 * Math.sin((p / 0.2) * (Math.PI / 2));
  const q = (p - 0.2) / 0.8;
  return -0.12 + 1.12 * easeOutBack(q);
};
const hash = (n: number) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// ------------------------------------------------------------------ pose params
type HandKind = 'fist' | 'open' | 'point' | 'thumb' | 'none';
type ArmP = {elbow: Pt; hand: Pt; kind: HandKind; angle: number; front: boolean};
type PoseP = {L: ArmP; R: ArmP; tilt: number; lean: number; headY: number; shoulderY: number; bodyRot: number};
type Motion = {f2: number; talk: number};

const REST_L: ArmP = {elbow: [70, 790], hand: [60, 890], kind: 'none', angle: 0, front: false};
const REST_R: ArmP = {elbow: [530, 790], hand: [540, 890], kind: 'none', angle: 0, front: false};

/** The numbers behind each pose. 'gesture' is an internal pose: idle while talking, one hand up and moving with the voice. */
const poseParams = (pose: Pose | 'gesture', m: Motion): PoseP => {
  const base: PoseP = {L: REST_L, R: REST_R, tilt: 0, lean: 0, headY: 0, shoulderY: 0, bodyRot: 0};
  switch (pose) {
    case 'gesture': {
      const beat = Math.round(m.talk * 24);
      const sway = Math.round(Math.sin(m.f2 / 9) * 10);
      return {...base, R: {elbow: [580, 760], hand: [548 + sway, 572 - beat], kind: 'open', angle: 26 + sway, front: true}, lean: 2};
    }
    case 'point':
      return {
        ...base,
        R: {elbow: [540, 780], hand: [560, 880], kind: 'none', angle: 0, front: false},
        L: {elbow: [10, 700], hand: [-90, 600], kind: 'point', angle: -92, front: true},
        lean: -8,
        tilt: -3,
        bodyRot: -2,
      };
    case 'crossed':
      return {
        ...base,
        L: {elbow: [90, 736], hand: [410, 712], kind: 'none', angle: 0, front: false},
        R: {elbow: [510, 740], hand: [186, 724], kind: 'fist', angle: 0, front: true},
        tilt: 4,
        headY: 4,
      };
    case 'think':
      return {...base, R: {elbow: [560, 780], hand: [338, 500], kind: 'fist', angle: 0, front: true}, tilt: -7, lean: 6, headY: 2};
    case 'shocked':
      return {
        ...base,
        L: {elbow: [20, 560], hand: [148, 350], kind: 'open', angle: -24, front: true},
        R: {elbow: [580, 560], hand: [452, 350], kind: 'open', angle: 24, front: true},
        headY: -14,
        shoulderY: -10,
      };
    case 'thumbsup':
      return {...base, R: {elbow: [590, 720], hand: [580, 530], kind: 'thumb', angle: 0, front: true}, tilt: 3, lean: -3};
    case 'facepalm':
      return {...base, R: {elbow: [580, 720], hand: [420, 470], kind: 'none', angle: 0, front: true}, tilt: 6, headY: 14, lean: 4};
    case 'laugh': {
      const ha = Math.abs(Math.sin(m.f2 / 4)) * 10;
      return {...base, L: {elbow: [80, 800], hand: [240, 790 - ha], kind: 'fist', angle: 0, front: true}, R: {elbow: [540, 800], hand: [560, 890], kind: 'none', angle: 0, front: false}, headY: -8 + ha, tilt: 5, shoulderY: -ha * 0.6};
    }
    case 'wave': {
      const wob = Math.round(Math.sin(m.f2 / 5) * 40);
      return {...base, R: {elbow: [590, 620], hand: [630 + wob, 430], kind: 'open', angle: wob / 2, front: true}, tilt: 2};
    }
    case 'shrug':
      return {
        ...base,
        L: {elbow: [20, 760], hand: [-30, 660], kind: 'open', angle: -80, front: true},
        R: {elbow: [580, 760], hand: [630, 660], kind: 'open', angle: 80, front: true},
        tilt: 6,
        shoulderY: -16,
        headY: 6,
      };
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

// ------------------------------------------------------------------ face params
type FaceP = {
  browLY: number; // brow centre height (smaller = higher)
  browLA: number; // brow angle, positive = inner end down (angry)
  browRY: number;
  browRA: number;
  lidOuterL: number; // upper-lid edge height relative to the eye centre (-24 = fully open)
  lidInnerL: number;
  lidOuterR: number;
  lidInnerR: number;
  eyeOpen: number; // vertical scale of the eye (1.25 = wide)
  cornerL: number; // mouth corner offsets (negative = up)
  cornerR: number;
  lipMid: number; // closed-mouth centre line offset (positive = smile curve)
  tense: number; // 0..1 pressed lips (anger)
  closed: number; // 0..1 eyes shut
  laughEyes: number; // 0..1 upturned arc eyes
};
const faceParams = (expr: Face): FaceP => {
  const o = -17;
  const base: FaceP = {browLY: 300, browLA: 4, browRY: 300, browRA: 4, lidOuterL: o, lidInnerL: o, lidOuterR: o, lidInnerR: o, eyeOpen: 1, cornerL: 0, cornerR: 0, lipMid: 3, tense: 0, closed: 0, laughEyes: 0};
  switch (expr) {
    case 'angry':
      return {...base, browLY: 306, browLA: 18, browRY: 306, browRA: 18, lidOuterL: -12, lidInnerL: -2, lidOuterR: -12, lidInnerR: -2, cornerL: 6, cornerR: 6, lipMid: -6, tense: 1};
    case 'sad':
      return {...base, browLY: 298, browLA: -14, browRY: 298, browRA: -14, lidOuterL: -4, lidInnerL: -14, lidOuterR: -4, lidInnerR: -14, cornerL: 8, cornerR: 8, lipMid: -8};
    case 'surprised':
      return {...base, browLY: 284, browLA: -2, browRY: 284, browRA: -2, eyeOpen: 1.3, lidOuterL: -26, lidInnerL: -26, lidOuterR: -26, lidInnerR: -26, cornerL: 2, cornerR: 2, lipMid: 2};
    case 'confused':
      return {...base, browLY: 288, browLA: -8, browRY: 304, browRA: 10, lidOuterR: -10, lidInnerR: -10, cornerL: 3, cornerR: -4, lipMid: 2};
    case 'smug':
      return {...base, browLY: 302, browLA: 2, browRY: 290, browRA: -8, lidOuterL: -9, lidInnerL: -11, lidOuterR: -9, lidInnerR: -11, cornerL: 1, cornerR: -12, lipMid: 10};
    case 'happy':
      return {...base, browLY: 294, browLA: -2, browRY: 294, browRA: -2, lidOuterL: -18, lidInnerL: -20, lidOuterR: -18, lidInnerR: -20, cornerL: -9, cornerR: -9, lipMid: 14};
    case 'laugh':
      return {...base, browLY: 290, browLA: -4, browRY: 290, browRA: -4, cornerL: -11, cornerR: -11, lipMid: 14, laughEyes: 1};
    case 'closed':
      return {...base, browLY: 304, browLA: 8, browRY: 304, browRA: 8, lipMid: 0, closed: 1};
    case 'flat':
      return {...base, lipMid: 0};
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

// ------------------------------------------------------------------ visemes
/** 0 rest, 1 open (ah), 2 wide (ee), 3 round (oh/oo), 4 closed (m/b/p), 5 teeth on lip (f/v), 6 tongue (l/th). */
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

// ------------------------------------------------------------------ parts
const Hand: React.FC<{kind: HandKind; skin: string; angle: number}> = ({kind, skin, angle}) => {
  if (kind === 'none') return null;
  const dark = shade(skin);
  const finger = (x: number, rot: number, h = 44) => (
    <rect key={`${x}${rot}`} x={x - 7} y={-h - 22} width={14} height={h + 10} rx={7} fill={skin} stroke={INK} strokeWidth={IN} transform={`rotate(${rot})`} />
  );
  return (
    <g transform={`rotate(${angle})`}>
      {kind === 'open' ? [finger(-20, -24, 40), finger(-6, -8, 50), finger(8, 6, 50), finger(20, 20, 42)] : null}
      {kind === 'point' ? finger(0, 0, 52) : null}
      {kind === 'thumb' ? finger(-6, -18, 44) : null}
      <circle r={30} fill={skin} stroke={INK} strokeWidth={IN + 0.5} />
      <path d="M-26,8 Q0,30 26,8" fill={dark} opacity={0.5} />
      {kind === 'fist' ? <path d="M-18,-6 Q0,-16 18,-6 M-18,8 Q0,-2 18,8" stroke={INK} strokeWidth={IN} fill="none" strokeLinecap="round" /> : null}
    </g>
  );
};

const Arm: React.FC<{from: Pt; arm: ArmP; skin: string; sleeve: string}> = ({from, arm, skin, sleeve}) => {
  const pts = `${from[0]},${from[1]} ${arm.elbow[0]},${arm.elbow[1]} ${arm.hand[0]},${arm.hand[1]}`;
  return (
    <g>
      <polyline points={pts} fill="none" stroke={INK} strokeWidth={62} strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={pts} fill="none" stroke={sleeve} strokeWidth={54} strokeLinecap="round" strokeLinejoin="round" />
      <g transform={`translate(${arm.hand[0]} ${arm.hand[1]})`}>
        <Hand kind={arm.kind} skin={skin} angle={arm.angle} />
      </g>
    </g>
  );
};

export type AvatarProps = {
  config: AvatarConfig;
  pose: Pose;
  face?: Face;
  prevPose?: Pose;
  prevFace?: Face;
  sinceChange?: number;
  mouth: number; // loudness 0..1
  viseme?: number; // 0..6
  talk?: number; // smoothed "is talking" 0..1
  lookX?: number; // -1 left, 0 camera, 1 right (character space)
  attention?: number;
  frame: number;
  width?: number;
  flip?: boolean;
  style?: React.CSSProperties;
};

export const Avatar: React.FC<AvatarProps> = ({config: c, pose, face, prevPose, prevFace, sinceChange = 999, mouth, viseme = 0, talk = 0, lookX = 0, attention = 0.3, frame, width = 600, flip = false, style}) => {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const f2 = Math.floor(frame / 2) * 2; // hold on twos
  const since2 = Math.floor(Math.max(0, sinceChange) / 2) * 2;
  const tw = poseTween(since2, 10);
  const twFace = clamp01(since2 / 6);
  const expr: Face = face ?? defaultFaceFor(pose);
  const prevExpr: Face = prevFace ?? (prevPose ? defaultFaceFor(prevPose) : expr);
  const skin = c.skin;
  const skinS = shade(c.skin);
  const skinH = lighten(c.skin, 0.14);
  const sleeve = c.shirt === 'tee' ? c.skin : c.shirtColor;
  const loud = clamp01(mouth);
  const talking = talk > 0.2;
  const hairH = lighten(c.hairColor, 0.16);

  // ------------------------------------------------------------ body: tween previous pose -> current pose
  const motion: Motion = {f2, talk: loud};
  const effective = (p: Pose, isCurrent: boolean): Pose | 'gesture' => (p === 'idle' && talking && (isCurrent ? sinceChange > 12 : true) ? 'gesture' : p);
  const cur = poseParams(effective(pose, true), motion);
  const prev = poseParams(effective(prevPose ?? pose, false), motion);
  let B = blendPose(prev, cur, tw);
  if (pose === 'idle' && sinceChange > 12) B = blendPose(poseParams('idle', motion), cur, easeOutBack(clamp01((talk - 0.2) / 0.3)));

  // ------------------------------------------------------------ idle acting
  const breath = Math.sin(f2 / 22);
  const bob = Math.round(Math.sin(f2 / 16) * 2 + breath * 2);
  const nod = Math.round(loud * 5);
  const slowTilt = Math.sin(f2 / 44) * 1.5;
  const cycle = 120;
  const ci = Math.floor(frame / cycle);
  const phase = (frame + Math.floor(hash(ci) * 40)) % cycle;
  const glanceLen = 20 + attention * 40;
  const glancing = lookX !== 0 && hash(ci + 7) < attention + 0.2 && phase < glanceLen && sinceChange > 24;
  const microX = Math.round((hash(Math.floor(frame / 9)) - 0.5) * 2);
  const microY = Math.round((hash(Math.floor(frame / 11) + 3) - 0.5) * 2);
  const gazeX = glancing ? lookX * 7 : microX;
  const gazeY = glancing ? 2 : microY;
  const headTurn = glancing ? lookX * 3 : 0;
  const blinkSlot = Math.floor((frame + 23) / 41);
  const blinkFrame = (frame + 23) % 41;
  const randomBlink = hash(blinkSlot * 3) < 0.75 && blinkFrame < 4;
  const blinking = randomBlink || sinceChange < 3 || (glancing && phase < 3);

  // ------------------------------------------------------------ face tween
  const F = blendFace(faceParams(prevExpr), faceParams(expr), easeOutBack(twFace));
  const browLift = Math.round(loud * 3) + (glancing ? 1 : 0);

  // ------------------------------------------------------------ brows: thick, angular, tapering outward
  const Brow: React.FC<{side: 1 | -1; y: number; a: number}> = ({side, y, a}) => {
    // drawn for the left brow (side 1), mirrored for the right
    const cx = 240;
    const d = `M${cx - 36},${y - 1} C${cx - 22},${y - 10} ${cx + 2},${y - 12} ${cx + 36},${y - 7} L${cx + 36},${y + 3} C${cx + 4},${y} ${cx - 20},${y + 3} ${cx - 36},${y + 8} Z`;
    const t = side === 1 ? `rotate(${a} ${cx} ${y})` : `translate(600 0) scale(-1 1) rotate(${a} ${cx} ${y})`;
    return <path d={d} fill={darken(c.hairColor, 0.05)} transform={t} />;
  };

  // ------------------------------------------------------------ eyes: almond, heavy upper lid, small iris
  const eyesShut = blinking || F.closed > 0.5;
  const Eye: React.FC<{side: 1 | -1}> = ({side}) => {
    // drawn for the left eye at cx=254 and mirrored for the right
    const cx = 254;
    const cy = 334;
    const id = `eye-${uid}-${side}`;
    const t = side === 1 ? '' : 'translate(600 0) scale(-1 1)';
    const gx = side === 1 ? gazeX : -gazeX;
    if (F.laughEyes > 0.5) {
      return <path d={`M${cx - 24},${cy + 4} C${cx - 10},${cy - 14} ${cx + 10},${cy - 14} ${cx + 24},${cy + 2}`} stroke={INK} strokeWidth={OUT} fill="none" strokeLinecap="round" transform={t} />;
    }
    if (eyesShut) {
      const droop = expr === 'sad' ? 8 : 4;
      return (
        <g transform={t}>
          <path d={`M${cx - 26},${cy - 2} C${cx - 12},${cy + droop} ${cx + 12},${cy + droop} ${cx + 26},${cy - 4}`} stroke={INK} strokeWidth={4.5} fill="none" strokeLinecap="round" />
          <path d={`M${cx - 26},${cy - 2} L${cx - 32},${cy - 7}`} stroke={INK} strokeWidth={3} strokeLinecap="round" />
        </g>
      );
    }
    const sy = F.eyeOpen;
    const outerY = side === 1 ? F.lidOuterL : F.lidOuterR;
    const innerY = side === 1 ? F.lidInnerL : F.lidInnerR;
    const inner = cx + 28; // toward the nose
    const outer = cx - 28;
    const lidVisible = outerY > -23 || innerY > -23;
    const lid = `M${outer - 4},${cy - 30} L${inner + 4},${cy - 30} L${inner + 4},${cy + innerY} L${outer - 4},${cy + outerY} Z`;
    const shape = `M${cx - 28},${cy + 2} C${cx - 18},${cy - 16} ${cx + 12},${cy - 20} ${cx + 28},${cy - 2} C${cx + 16},${cy + 13} ${cx - 14},${cy + 15} ${cx - 28},${cy + 2} Z`;
    const px = cx + 3 + gx;
    const py = cy - 1 + gazeY;
    return (
      <g transform={`${t} translate(${cx} ${cy}) scale(1 ${sy}) translate(${-cx} ${-cy})`}>
        <defs>
          <clipPath id={id}>
            <path d={shape} />
          </clipPath>
        </defs>
        <path d={shape} fill="#f4efe8" />
        <g clipPath={`url(#${id})`}>
          <ellipse cx={cx} cy={cy - 12} rx={30} ry={8} fill={skinS} opacity={0.35} />
          <circle cx={px} cy={py} r={14.5} fill={c.eyeColor} />
          <circle cx={px} cy={py} r={14.5} fill="none" stroke={darken(c.eyeColor, 0.5)} strokeWidth={2} />
          <circle cx={px} cy={py} r={7} fill={INK} />
          <circle cx={px - 4} cy={py - 5} r={3} fill="#fff" />
          <circle cx={px + 5} cy={py + 6} r={1.6} fill="#fff" opacity={0.8} />
          {lidVisible ? <path d={lid} fill={skin} /> : null}
        </g>
        {/* heavy upper lid line with a lash flick at the outer corner */}
        <path d={`M${cx - 28},${cy + 2} C${cx - 18},${cy - 16} ${cx + 12},${cy - 20} ${cx + 28},${cy - 2}`} stroke={INK} strokeWidth={5} fill="none" strokeLinecap="round" />
        <path d={`M${cx - 28},${cy + 2} L${cx - 35},${cy - 5}`} stroke={INK} strokeWidth={3.5} strokeLinecap="round" />
        <path d={`M${cx - 20},${cy + 10} C${cx - 6},${cy + 15} ${cx + 14},${cy + 13} ${cx + 28},${cy - 2}`} stroke={INK} strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.75} />
        {lidVisible ? <path d={`M${inner},${cy + innerY} L${outer},${cy + outerY}`} stroke={INK} strokeWidth={3.5} strokeLinecap="round" /> : null}
        {/* lid crease */}
        <path d={`M${cx - 18},${cy - 24} C${cx - 6},${cy - 32} ${cx + 12},${cy - 32} ${cx + 24},${cy - 22}`} stroke={INK} strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.45} />
      </g>
    );
  };

  // ------------------------------------------------------------ mouth: real lips, teeth when open
  const Mouth: React.FC = () => {
    const cx = 300;
    const cy = 438;
    const open = 0.3 + 0.7 * loud;
    const isLaugh = expr === 'laugh' && twFace >= 1;
    const isSurprised = expr === 'surprised' && twFace >= 1;
    let v = viseme;
    if (expr === 'closed' || expr === 'flat') v = 0;
    if (v === 0 && loud > 0.3 && expr !== 'closed' && expr !== 'flat') v = 1;
    let S: MouthShape;
    if (isLaugh) S = {w: 40, top: -6, bot: 44, teeth: 1, tongue: 1, round: 0};
    else if (isSurprised && v === 0) S = {w: 16, top: -12, bot: 26, teeth: 0, tongue: 0, round: 1};
    else if ((expr === 'happy' || expr === 'smug') && v === 0 && twFace >= 1) S = {w: expr === 'smug' ? 36 : 42, top: 0, bot: expr === 'smug' ? 0 : 14, teeth: 1, tongue: 0, round: 0};
    else S = visemeShape(v, open);
    const cl = F.cornerL;
    const cr = F.cornerR;
    const opening = S.bot - S.top;
    const lip = lipTone(skin);
    const lipLight = lighten(lipTone(skin), 0.06);
    if (opening > 5) {
      const w = S.w;
      const kx = S.round ? w * 0.55 : w * 0.9;
      const topPath = `M${cx - w},${cy + cl} C${cx - kx},${cy + S.top - 2} ${cx + kx},${cy + S.top - 2} ${cx + w},${cy + cr}`;
      const botPath = `C${cx + kx},${cy + S.bot} ${cx - kx},${cy + S.bot} ${cx - w},${cy + cl} Z`;
      const teethH = Math.min(13, opening * 0.5);
      return (
        <g>
          {/* lower lip under the opening */}
          <path d={`M${cx - w},${cy + cl} C${cx - kx},${cy + S.bot + 8} ${cx + kx},${cy + S.bot + 8} ${cx + w},${cy + cr} ${botPath}`} fill={lip} />
          <path d={`${topPath} ${botPath}`} fill={MOUTH} />
          <clipPath id={`mouth-${uid}`}>
            <path d={`${topPath} ${botPath}`} />
          </clipPath>
          <g clipPath={`url(#mouth-${uid})`}>
            {S.teeth > 0 ? <rect x={cx - w} y={cy + S.top - 6} width={w * 2} height={teethH + 6 + Math.max(0, cl, cr)} fill={TEETH} opacity={S.teeth} /> : null}
            {S.teeth > 0 ? <path d={`M${cx - w},${cy + S.top + teethH - 1} L${cx + w},${cy + S.top + teethH - 1}`} stroke={darken(TEETH, 0.25)} strokeWidth={1.5} opacity={S.teeth * 0.6} /> : null}
            {v === 5 ? <rect x={cx - w * 0.8} y={cy + S.bot - 6} width={w * 1.6} height={6} fill={TEETH} /> : null}
            {S.tongue > 0 ? <ellipse cx={cx} cy={cy + S.bot} rx={w * 0.5} ry={Math.max(6, opening * 0.22)} fill={TONGUE} opacity={S.tongue} /> : null}
          </g>
          <path d={topPath} stroke={INK} strokeWidth={IN} fill="none" strokeLinecap="round" />
          <path d={`M${cx - w},${cy + cl} C${cx - kx},${cy + S.bot} ${cx + kx},${cy + S.bot} ${cx + w},${cy + cr}`} stroke={INK} strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.8} />
          <path d={`M${cx - w * 0.7},${cy + S.bot + 9} Q${cx},${cy + S.bot + 15} ${cx + w * 0.7},${cy + S.bot + 9}`} stroke={skinS} strokeWidth={2.5} fill="none" strokeLinecap="round" opacity={0.8} />
        </g>
      );
    }
    // closed lips: cupid's bow on top, a fuller lower lip, a shadow line beneath
    const w = S.w;
    const mid = F.lipMid + (v === 4 ? -2 : 0);
    const tense = F.tense;
    return (
      <g>
        <path d={`M${cx - w},${cy + cl} Q${cx - w * 0.5},${cy - 3 + mid * 0.3} ${cx - 6},${cy - 2} Q${cx},${cy + 1} ${cx + 6},${cy - 2} Q${cx + w * 0.5},${cy - 3 + mid * 0.3} ${cx + w},${cy + cr} Q${cx},${cy + mid + 2} ${cx - w},${cy + cl} Z`} fill={skinS} opacity={0.8} />
        <path d={`M${cx - w + 4},${cy + cl + 1} Q${cx},${cy + mid + 1} ${cx + w - 4},${cy + cr + 1} Q${cx + w * 0.6},${cy + mid + 13 - tense * 6} ${cx},${cy + mid + 15 - tense * 7} Q${cx - w * 0.6},${cy + mid + 13 - tense * 6} ${cx - w + 4},${cy + cl + 1} Z`} fill={lipLight} opacity={0.75} />
        <path d={`M${cx - w},${cy + cl} Q${cx},${cy + mid + 2} ${cx + w},${cy + cr}`} stroke={INK} strokeWidth={IN + 0.5} fill="none" strokeLinecap="round" />
        <path d={`M${cx - w * 0.65},${cy + mid + 18 - tense * 6} Q${cx},${cy + mid + 24 - tense * 8} ${cx + w * 0.65},${cy + mid + 18 - tense * 6}`} stroke={skinS} strokeWidth={3} fill="none" strokeLinecap="round" opacity={0.9} />
      </g>
    );
  };

  // ------------------------------------------------------------ hair
  const curlJig = sinceChange < 8 ? Math.round(Math.sin(sinceChange * 1.3) * (8 - sinceChange) * 0.6) : 0;
  /** Dense coil texture: short arcs scattered through a region, lighter than the base. */
  const coils = (x0: number, y0: number, x1: number, y1: number, inside: (x: number, y: number) => boolean, seed: number, step = 13) => {
    const out: React.ReactNode[] = [];
    let i = 0;
    for (let y = y0; y < y1; y += step) {
      for (let x = x0 + ((Math.round(y / step) % 2) * step) / 2; x < x1; x += step) {
        const jx = (hash(seed + i * 3) - 0.5) * 8;
        const jy = (hash(seed + i * 3 + 1) - 0.5) * 8;
        const r = 2.5 + hash(seed + i * 3 + 2) * 2.5;
        i++;
        const px = x + jx;
        const py = y + jy;
        if (!inside(px, py)) continue;
        out.push(<path key={i} d={`M${px - r},${py} a${r},${r} 0 1 1 ${r * 1.2},${r * 0.9}`} fill="none" stroke={hairH} strokeWidth={1.6} strokeLinecap="round" opacity={0.3 + hash(seed + i * 5) * 0.25} />);
      }
    }
    return out;
  };
  const hairBack = (() => {
    switch (c.hair) {
      case 'afro':
        return <circle cx={300} cy={290} r={190} fill={c.hairColor} stroke={INK} strokeWidth={OUT} />;
      case 'long':
        return <path d="M190,300 Q170,470 200,640 L400,640 Q430,470 410,300 Z" fill={c.hairColor} stroke={INK} strokeWidth={OUT} />;
      case 'locs':
        return (
          <g fill={c.hairColor} stroke={INK} strokeWidth={IN}>
            {[-118, -96, -74, 74, 96, 118].map((dx, i) => (
              <rect key={i} x={300 + dx - 10} y={240} width={20} height={300 + (i % 2) * 40} rx={10} />
            ))}
          </g>
        );
      case 'bun':
        return <circle cx={300} cy={128} r={46} fill={c.hairColor} stroke={INK} strokeWidth={OUT} />;
      default:
        return null;
    }
  })();
  const hairFront = (() => {
    const cap = 'M204,238 C196,200 196,170 214,150 C240,120 360,120 386,150 C404,170 404,200 396,238 C380,222 220,222 204,238 Z';
    const fade = (
      <g>
        <defs>
          <linearGradient id={`fade-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c.hairColor} stopOpacity={0.95} />
            <stop offset="1" stopColor={c.hairColor} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <path d="M206,238 L198,238 C197,268 197,300 200,330 L212,330 C207,300 206,268 206,238 Z" fill={`url(#fade-${uid})`} />
        <path d="M394,238 L402,238 C403,268 403,300 400,330 L388,330 C393,300 394,268 394,238 Z" fill={`url(#fade-${uid})`} />
      </g>
    );
    switch (c.hair) {
      case 'bald':
        return null;
      case 'buzz':
      case 'fade':
        return (
          <g>
            <path d={cap} fill={c.hairColor} opacity={0.85} />
            {fade}
          </g>
        );
      case 'hightop': {
        const mass = 'M204,238 C194,210 174,180 178,140 C182,92 232,64 300,62 C368,64 418,92 422,140 C426,180 406,210 396,238 Z';
        const inside = (x: number, y: number) => {
          const dx = (x - 300) / 122;
          const dy = (y - 150) / 90;
          return dx * dx + dy * dy < 1 && y > 72 && y < 232;
        };
        return (
          <g transform={`translate(0 ${curlJig})`}>
            {fade}
            <path d={mass} fill={c.hairColor} />
            {/* scalloped silhouette: coils along the top edge */}
            <g fill={c.hairColor}>
              {[...Array(13)].map((_, i) => {
                const a = Math.PI * (0.08 + (i / 12) * 0.84);
                const x = 300 - Math.cos(a) * 126;
                const y = 150 - Math.sin(a) * 92;
                const r = 13 + hash(i * 7) * 6;
                return <circle key={i} cx={x} cy={y} r={r} />;
              })}
            </g>
            {/* highlight band top-left, coil texture, and the dark underside toward the line-up */}
            <defs>
              <radialGradient id={`hairlight-${uid}`} cx="0.36" cy="0.3" r="0.6">
                <stop offset="0" stopColor={hairH} stopOpacity={0.7} />
                <stop offset="1" stopColor={hairH} stopOpacity={0} />
              </radialGradient>
            </defs>
            <path d={mass} fill={`url(#hairlight-${uid})`} />
            {coils(180, 70, 420, 236, inside, 11)}
            <path d="M204,238 C230,228 370,228 396,238 C380,214 220,214 204,238 Z" fill={INK} opacity={0.35} />
            {/* outline: silhouette and the crisp line-up */}
            <path d={mass} fill="none" stroke={INK} strokeWidth={OUT} strokeLinejoin="round" />
            <path d="M204,238 C230,236 370,236 396,238" fill="none" stroke={INK} strokeWidth={IN + 0.5} />
            <g fill="none" stroke={INK} strokeWidth={OUT}>
              {[...Array(13)].map((_, i) => {
                const a = Math.PI * (0.08 + (i / 12) * 0.84);
                const x = 300 - Math.cos(a) * 126;
                const y = 150 - Math.sin(a) * 92;
                const r = 13 + hash(i * 7) * 6;
                return <path key={i} d={`M${x - r},${y} A${r},${r} 0 0 1 ${x + r},${y}`} />;
              })}
            </g>
          </g>
        );
      }
      case 'curly':
      case 'afro': {
        const inside = (x: number, y: number) => {
          const dx = (x - 300) / 110;
          const dy = (y - 190) / 80;
          return dx * dx + dy * dy < 1;
        };
        return (
          <g transform={`translate(0 ${curlJig})`}>
            <path d="M196,250 C186,200 200,120 300,114 C400,120 414,200 404,250 Z" fill={c.hairColor} stroke={INK} strokeWidth={OUT} />
            <g fill={c.hairColor} stroke={INK} strokeWidth={IN}>
              {[200, 236, 272, 300, 328, 364, 400].map((x, i) => (
                <circle key={i} cx={x} cy={i % 2 ? 126 : 142} r={22} />
              ))}
            </g>
            {coils(190, 118, 410, 246, inside, 5)}
          </g>
        );
      }
      default:
        return (
          <g>
            <path d={cap} fill={c.hairColor} stroke={INK} strokeWidth={OUT} strokeLinejoin="round" />
            <path d="M214,150 C240,128 280,124 320,130" stroke={hairH} strokeWidth={4} fill="none" opacity={0.5} strokeLinecap="round" />
            {fade}
          </g>
        );
    }
  })();

  const facialHair = (() => {
    const mustache = <path d="M268,410 Q300,398 332,410 Q318,420 300,416 Q282,420 268,410 Z" fill={c.hairColor} opacity={0.9} />;
    switch (c.facialHair) {
      case 'stubble':
        return <path d="M222,400 C232,440 262,468 300,470 C338,468 368,440 378,400 C364,440 334,456 300,458 C266,456 236,440 222,400 Z" fill={INK} opacity={0.22} />;
      case 'beard':
        return <path d="M204,360 C210,430 250,486 300,490 C350,486 390,430 396,360 C380,420 340,440 300,440 C260,440 220,420 204,360 Z" fill={c.hairColor} stroke={INK} strokeWidth={IN} />;
      case 'goatee':
        return <path d="M276,450 Q300,444 324,450 Q322,478 300,482 Q278,478 276,450 Z" fill={c.hairColor} stroke={INK} strokeWidth={2} />;
      case 'mustache':
        return mustache;
      case 'chinstrap':
        return (
          <g>
            <path d="M210,380 C220,440 258,476 300,480 C342,476 380,440 390,380 C374,436 340,462 300,464 C260,462 226,436 210,380 Z" fill={c.hairColor} opacity={0.9} />
            {mustache}
          </g>
        );
      default:
        return null;
    }
  })();

  const glasses = (() => {
    if (c.glasses === 'none') return null;
    const lens = 'rgba(255,255,255,0.08)';
    return c.glasses === 'round' ? (
      <g fill={lens} stroke={INK} strokeWidth={4}>
        <circle cx={254} cy={336} r={33} />
        <circle cx={346} cy={336} r={33} />
        <path d="M287,334 Q300,326 313,334 M221,332 L198,324 M379,332 L402,324" fill="none" />
        <path d="M232,318 Q244,308 258,308" stroke="#fff" strokeWidth={2.5} opacity={0.5} fill="none" strokeLinecap="round" />
        <path d="M324,318 Q336,308 350,308" stroke="#fff" strokeWidth={2.5} opacity={0.5} fill="none" strokeLinecap="round" />
      </g>
    ) : (
      <g fill={lens} stroke={INK} strokeWidth={4}>
        <rect x={220} y={308} width={70} height={54} rx={12} />
        <rect x={310} y={308} width={70} height={54} rx={12} />
        <path d="M290,334 L310,334 M220,332 L198,324 M380,332 L402,324" fill="none" />
      </g>
    );
  })();

  const accessory = (() => {
    switch (c.accessory) {
      case 'cap':
        return (
          <g stroke={INK} strokeWidth={OUT} strokeLinejoin="round">
            <path d="M186,250 Q186,100 300,100 Q414,100 414,250 Z" fill={c.accessoryColor} />
            <path d="M176,250 L424,250 Q470,250 470,276 Q380,290 176,276 Z" fill={darken(c.accessoryColor, 0.3)} />
          </g>
        );
      case 'beanie':
        return (
          <g stroke={INK} strokeWidth={OUT} strokeLinejoin="round">
            <path d="M186,268 Q186,86 300,86 Q414,86 414,268 Z" fill={c.accessoryColor} />
            <rect x={180} y={224} width={240} height={50} rx={16} fill={darken(c.accessoryColor, 0.25)} />
          </g>
        );
      case 'earring': {
        const swing = Math.round(Math.sin(f2 / 7) * 1.5) - Math.round(B.tilt * 0.3);
        return <circle cx={193 + swing} cy={374} r={5} fill={c.accessoryColor} stroke={INK} strokeWidth={2} />;
      }
      case 'headphones':
        return (
          <g stroke={INK} strokeWidth={OUT}>
            <path d="M184,330 Q184,110 300,110 Q416,110 416,330" fill="none" strokeWidth={14} />
            <rect x={168} y={310} width={40} height={70} rx={16} fill={c.accessoryColor} />
            <rect x={392} y={310} width={40} height={70} rx={16} fill={c.accessoryColor} />
          </g>
        );
      default:
        return null;
    }
  })();

  // ------------------------------------------------------------ emanata (reaction marks)
  const Emanata: React.FC = () => {
    const life = 40;
    if (sinceChange >= life || sinceChange < 2) return null;
    const pop = easeOutBack(clamp01((sinceChange - 2) / 6));
    const fade = sinceChange > life - 8 ? (life - sinceChange) / 8 : 1;
    const unflip = flip ? 'scale(-1 1)' : '';
    const text = (x: number, y: number, s: string, size: number, color: string, rot = 0) => (
      <text x={0} y={0} fontSize={size} fontFamily="'Gochi Hand', 'Patrick Hand', cursive" fontWeight={700} fill={color} stroke={INK} strokeWidth={5} paintOrder="stroke" textAnchor="middle" transform={`translate(${x} ${y}) rotate(${rot}) ${unflip}`}>
        {s}
      </text>
    );
    const kind = expr === 'surprised' ? 'bang' : expr === 'confused' ? 'question' : expr === 'angry' ? 'anger' : expr === 'laugh' ? 'ha' : expr === 'sad' || pose === 'facepalm' ? 'sweat' : pose === 'thumbsup' ? 'sparkle' : expr === 'smug' ? 'smug' : null;
    if (!kind) return null;
    const wob = Math.sin(sinceChange / 3) * 4;
    return (
      <g opacity={fade}>
        {kind === 'bang' ? (
          <g transform={`translate(470 150) scale(${pop})`}>
            {[...Array(8)].map((_, i) => {
              const a = (i / 8) * Math.PI * 2;
              return <line key={i} x1={Math.cos(a) * 60} y1={Math.sin(a) * 60} x2={Math.cos(a) * (84 + (i % 2) * 12)} y2={Math.sin(a) * (84 + (i % 2) * 12)} stroke={INK} strokeWidth={6} strokeLinecap="round" />;
            })}
            {text(0, 34, '!', 130, RED, flip ? 12 : -12)}
          </g>
        ) : null}
        {kind === 'question' ? <g transform={`translate(${466 + wob} ${160 - sinceChange * 0.8}) scale(${pop})`}>{text(0, 36, '?', 116, GOLD, flip ? -14 : 14)}</g> : null}
        {kind === 'anger' ? (
          <g transform={`translate(404 236) scale(${pop * 0.8})`} stroke={RED} strokeWidth={8} fill="none" strokeLinecap="round">
            <path d="M-24,-10 Q-10,-22 4,-10 M4,-10 Q18,2 4,14 M4,14 Q-10,26 -24,14 M-24,14 Q-38,2 -24,-10" transform={`rotate(${sinceChange * 2})`} />
          </g>
        ) : null}
        {kind === 'ha' ? (
          <g>
            <g transform={`translate(${520 + wob} ${330 - sinceChange * 1.5}) scale(${pop})`}>{text(0, 0, 'HA', 104, GOLD, 16)}</g>
            <g transform={`translate(${560 - wob} ${210 - sinceChange * 2}) scale(${pop * 0.75})`}>{text(0, 0, 'HA', 90, GOLD, -10)}</g>
          </g>
        ) : null}
        {kind === 'sweat' ? (
          <g transform={`translate(392 ${268 + Math.min(60, sinceChange * 2.2)})`}>
            <path d="M0,-24 C10,-8 16,0 16,10 A16,16 0 1,1 -16,10 C-16,0 -10,-8 0,-24 Z" fill={BLUE} stroke={INK} strokeWidth={3} transform={`scale(${pop})`} />
            <circle cx={-5} cy={9} r={4} fill="#fff" opacity={0.7} />
          </g>
        ) : null}
        {kind === 'sparkle' ? (
          <g fill={GOLD} stroke={INK} strokeWidth={3}>
            {[
              [460, 170, 1],
              [490, 260, 0.7],
              [136, 190, 0.8],
            ].map(([x, y, s], i) => {
              const tw2 = 0.6 + 0.4 * Math.abs(Math.sin(sinceChange / 4 + i));
              return <path key={i} d="M0,-22 L6,-6 L22,0 L6,6 L0,22 L-6,6 L-22,0 L-6,-6 Z" transform={`translate(${x} ${y}) scale(${pop * s * tw2})`} />;
            })}
          </g>
        ) : null}
        {kind === 'smug' ? <g transform={`translate(470 310) scale(${pop})`}>{text(0, 0, '~', 80, GOLD, 10)}</g> : null}
      </g>
    );
  };

  // ------------------------------------------------------------ assemble
  const shL: Pt = [SH_L[0], SH_L[1] + B.shoulderY];
  const shR: Pt = [SH_R[0], SH_R[1] + B.shoulderY];
  const arms = [
    {key: 'L', from: shL, arm: B.L},
    {key: 'R', from: shR, arm: B.R},
  ];
  const facepalmAmt = pose === 'facepalm' ? clamp01((sinceChange - 4) / 4) : prevPose === 'facepalm' ? 1 - clamp01(sinceChange / 4) : 0;
  const headTilt = B.tilt + slowTilt + headTurn;
  const headDx = B.lean + headTurn * 2;
  const headDy = B.headY - nod;
  const stringSwing = Math.round(-headDx * 0.5 + Math.sin(f2 / 10) * 3);
  const shirtDark = darken(c.shirtColor, 0.32);
  const accentDark = darken(c.shirtAccent, 0.32);
  const accentLight = lighten(c.shirtAccent, 0.12);

  const facePath = 'M300,472 C270,472 240,454 222,424 C206,398 198,364 198,330 C198,282 204,246 214,216 C236,172 268,150 300,150 C332,150 364,172 386,216 C396,246 402,282 402,330 C402,364 394,398 378,424 C360,454 330,472 300,472 Z';

  const torso = (() => {
    const body = 'M30,900 L30,712 C30,660 96,630 168,606 L258,574 L342,574 L432,606 C504,630 570,660 570,712 L570,900 Z';
    switch (c.shirt) {
      case 'hoodie':
        return (
          <g>
            <path d={body} fill={c.shirtColor} stroke={INK} strokeWidth={OUT} strokeLinejoin="round" />
            {/* shoulder shading */}
            <path d="M30,900 L30,712 C30,660 96,630 168,606 L200,620 C120,650 60,690 56,730 L56,900 Z" fill={shirtDark} opacity={0.6} />
            {/* hood: a deep bowl behind the neck, then two thick panels that wrap the neck and cross on the chest */}
            <path d="M164,660 C160,576 220,528 300,526 C380,528 440,576 436,660 Z" fill={accentDark} stroke={INK} strokeWidth={OUT} strokeLinejoin="round" />
            <path d="M176,650 C176,586 226,548 300,546 C374,548 424,586 424,650" fill="none" stroke={darken(c.shirtAccent, 0.5)} strokeWidth={7} opacity={0.6} />
            <path d="M150,704 C154,654 184,604 228,570 C246,558 258,554 262,560 C254,600 266,650 300,712 L268,768 C224,754 178,738 150,704 Z" fill={c.shirtAccent} stroke={INK} strokeWidth={OUT} strokeLinejoin="round" />
            <path d="M450,704 C446,654 416,604 372,570 C354,558 342,554 338,560 C346,600 334,650 300,712 L332,768 C376,754 422,738 450,704 Z" fill={c.shirtAccent} stroke={INK} strokeWidth={OUT} strokeLinejoin="round" />
            <path d="M338,560 C346,600 334,650 300,712 L332,768 C362,758 392,746 416,730 C386,736 354,728 332,708 C352,664 348,606 338,560 Z" fill={accentDark} opacity={0.5} />
            <path d="M262,560 C254,600 266,650 300,712 L268,768 C252,762 236,756 222,748 C250,738 270,718 276,698 C256,654 252,606 262,560 Z" fill={accentDark} opacity={0.35} />
            <g stroke={accentDark} strokeWidth={3} fill="none" strokeLinecap="round" opacity={0.7}>
              <path d="M178,694 C190,656 212,620 240,592" />
              <path d="M208,728 C216,692 234,656 260,622" />
              <path d="M422,694 C410,656 388,620 360,592" />
              <path d="M392,728 C384,692 366,656 340,622" />
            </g>
            <path d="M162,682 C174,640 202,602 236,576" stroke={accentLight} strokeWidth={5} fill="none" opacity={0.5} strokeLinecap="round" />
            <path d="M438,682 C426,640 398,602 364,576" stroke={accentLight} strokeWidth={5} fill="none" opacity={0.5} strokeLinecap="round" />
            <path d="M300,706 L300,760" stroke={INK} strokeWidth={IN} opacity={0.5} />
            {/* strings */}
            <path d={`M272,690 Q${262 + stringSwing},740 ${256 + stringSwing * 2},800 M328,690 Q${338 + stringSwing},740 ${344 + stringSwing * 2},800`} stroke="#ece7dc" strokeWidth={5} strokeLinecap="round" fill="none" />
            <path d={`M272,690 Q${262 + stringSwing},740 ${256 + stringSwing * 2},800 M328,690 Q${338 + stringSwing},740 ${344 + stringSwing * 2},800`} stroke={INK} strokeWidth={1.5} strokeLinecap="round" fill="none" opacity={0.5} />
            {/* chest shadow under the crossed panels */}
            <path d="M258,760 L300,706 L342,760 C330,790 270,790 258,760 Z" fill={shirtDark} opacity={0.7} />
          </g>
        );
      case 'collared':
        return (
          <g>
            <path d={body} fill={c.shirtColor} stroke={INK} strokeWidth={OUT} strokeLinejoin="round" />
            <path d="M30,900 L30,712 C30,660 96,630 168,606 L200,620 C120,650 60,690 56,730 L56,900 Z" fill={shirtDark} opacity={0.6} />
            <path d="M258,574 L300,660 L342,574 Z" fill={c.shirtAccent} />
            <path d="M258,574 L300,660 L262,680 L228,610 Z" fill={c.shirtColor} stroke={INK} strokeWidth={IN} strokeLinejoin="round" />
            <path d="M342,574 L300,660 L338,680 L372,610 Z" fill={c.shirtColor} stroke={INK} strokeWidth={IN} strokeLinejoin="round" />
            <path d="M300,660 L300,900" stroke={shirtDark} strokeWidth={3} />
            {[720, 800, 880].map((y) => (
              <circle key={y} cx={300} cy={y} r={5} fill="#fff" stroke={INK} strokeWidth={2} />
            ))}
          </g>
        );
      case 'jacket':
        return (
          <g>
            <path d={body} fill={c.shirtAccent} stroke={INK} strokeWidth={OUT} strokeLinejoin="round" />
            <path d="M30,900 L30,712 C30,660 96,630 168,606 L300,690 L300,900 Z" fill={c.shirtColor} stroke={INK} strokeWidth={IN} />
            <path d="M258,574 L300,690 L236,640 Z" fill={darken(c.shirtAccent, 0.2)} stroke={INK} strokeWidth={IN} />
            <path d="M342,574 L300,690 L364,640 Z" fill={darken(c.shirtAccent, 0.2)} stroke={INK} strokeWidth={IN} />
          </g>
        );
      default:
        return (
          <g>
            <path d={body} fill={c.shirtColor} stroke={INK} strokeWidth={OUT} strokeLinejoin="round" />
            <path d="M30,900 L30,712 C30,660 96,630 168,606 L200,620 C120,650 60,690 56,730 L56,900 Z" fill={shirtDark} opacity={0.6} />
            <path d="M250,580 Q300,640 350,580" fill="none" stroke={INK} strokeWidth={IN} />
          </g>
        );
    }
  })();

  return (
    <svg viewBox="-120 60 840 760" width={width} style={{overflow: 'visible', transform: flip ? 'scaleX(-1)' : undefined, ...style}}>
      <g transform={`translate(0 ${bob}) rotate(${B.bodyRot} 300 900) translate(300 900) scale(1 ${1 + breath * 0.006}) translate(-300 -900)`}>
        {arms.filter((a) => !a.arm.front).map((a) => (
          <Arm key={`b${a.key}`} from={a.from} arm={a.arm} skin={skin} sleeve={sleeve} />
        ))}
        {/* neck, with the chin's cast shadow */}
        <g transform={`translate(${headDx * 0.3} 0)`}>
          <path d="M256,420 L256,560 L344,560 L344,420 Z" fill={skin} />
          <path d="M256,420 L344,420 L344,516 C330,528 270,528 256,516 Z" fill={skinS} />
          <path d="M256,440 L256,556 M344,440 L344,556" stroke={INK} strokeWidth={IN + 0.5} />
        </g>
        <g transform={`translate(0 ${B.shoulderY * 0.5 - 44})`}>{torso}</g>
        <g transform={`translate(${headDx} ${headDy}) rotate(${headTilt} 300 560) translate(300 520) scale(1.07) translate(-300 -520)`}>
          {hairBack}
          {/* ears */}
          <g fill={skin} stroke={INK} strokeWidth={IN}>
            <path d="M206,334 C190,318 180,344 188,370 C194,388 208,388 212,374 Z" />
            <path d="M394,334 C410,318 420,344 412,370 C406,388 392,388 388,374 Z" />
            <path d="M200,346 C196,356 198,366 204,372" fill="none" strokeWidth={2} strokeLinecap="round" opacity={0.7} />
            <path d="M400,346 C404,356 402,366 396,372" fill="none" strokeWidth={2} strokeLinecap="round" opacity={0.7} />
          </g>
          {/* face */}
          <path d={facePath} fill={skin} />
          <clipPath id={`face-${uid}`}>
            <path d={facePath} />
          </clipPath>
          <g clipPath={`url(#face-${uid})`}>
            {/* cel shadows: hairline, brow sockets, shadow side of the face, nose side, under the lip */}
            <path d="M196,214 L404,214 L404,244 C380,262 330,266 300,266 C270,266 220,262 196,244 Z" fill={skinS} />
            <path d="M402,300 C404,360 394,400 376,428 C360,456 330,472 300,476 C332,466 356,446 370,420 C388,392 394,350 392,300 Z" fill={skinS} />
            <path d="M356,352 C372,366 376,386 368,404 C374,384 370,366 356,352 Z" fill={skinS} />
            <path d="M293,348 C287,364 285,380 289,394 C294,386 297,368 297,350 Z" fill={skinS} opacity={0.9} />
            <path d="M222,320 C240,312 266,314 280,324 C262,322 240,322 222,320 Z" fill={skinS} opacity={0.6} />
            <path d="M320,320 C334,314 360,312 378,320 C360,322 338,322 320,320 Z" fill={skinS} opacity={0.6} />
            {/* highlights */}
            <ellipse cx={294} cy={278} rx={34} ry={12} fill={skinH} opacity={0.3} />
            <path d="M298,344 L298,384" stroke={skinH} strokeWidth={5} strokeLinecap="round" opacity={0.6} />
            <ellipse cx={300} cy={458} rx={12} ry={4} fill={skinH} opacity={0.3} />
          </g>
          <path d={facePath} fill="none" stroke={INK} strokeWidth={OUT} strokeLinejoin="round" />
          {facialHair}
          {/* features slide a little when the head turns */}
          <g transform={`translate(${headTurn * 2} 0)`}>
            <Brow side={1} y={F.browLY - browLift} a={F.browLA} />
            <Brow side={-1} y={F.browRY - browLift} a={F.browRA} />
            <Eye side={1} />
            <Eye side={-1} />
            {/* nose */}
            <path d="M284,392 C280,402 288,409 300,408 C312,409 320,402 316,392" stroke={INK} strokeWidth={IN} fill="none" strokeLinecap="round" />
            <path d="M288,399 a4,3 0 1 0 1,0 M311,399 a4,3 0 1 0 1,0" fill={INK} opacity={0.7} />
            <ellipse cx={300} cy={413} rx={13} ry={4} fill={skinS} opacity={0.8} />
            {glasses}
            <Mouth />
          </g>
          {hairFront}
          {accessory}
          {facepalmAmt > 0 ? (
            <g transform={`translate(${(1 - facepalmAmt) * 120} ${(1 - facepalmAmt) * 160})`} opacity={facepalmAmt}>
              <polyline points="430,660 520,560 330,352" fill="none" stroke={INK} strokeWidth={62} strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="430,660 520,560 330,352" fill="none" stroke={sleeve} strokeWidth={54} strokeLinecap="round" strokeLinejoin="round" />
              <g transform="translate(300 346) rotate(-14)">
                {[-44, -22, 0, 22].map((x, i) => (
                  <rect key={i} x={x - 9} y={-66 + Math.abs(i - 1.5) * 6} width={18} height={60} rx={9} fill={skin} stroke={INK} strokeWidth={IN} />
                ))}
                <ellipse cx={0} cy={0} rx={62} ry={38} fill={skin} stroke={INK} strokeWidth={IN + 0.5} />
                <path d="M-50,10 Q0,30 50,10" fill={skinS} opacity={0.5} />
              </g>
            </g>
          ) : null}
        </g>
        {arms.filter((a) => a.arm.front && !(pose === 'facepalm' && a.key === 'R' && facepalmAmt > 0.5)).map((a) => (
          <Arm key={`f${a.key}`} from={a.from} arm={a.arm} skin={skin} sleeve={sleeve} />
        ))}
        <Emanata />
      </g>
    </svg>
  );
};
