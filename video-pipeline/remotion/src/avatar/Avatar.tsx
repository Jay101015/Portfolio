import React from 'react';

/**
 * Hand-drawn style host character.
 *
 * Everything that moves is a number: each pose and each expression is a set of
 * parameters, and the character tweens between the previous and current set with
 * a little anticipation and overshoot, held on twos so it still reads as drawn.
 * The mouth is driven by visemes (sound shapes) plus loudness, and the idle has
 * gaze, nods on stressed words, breathing, blinks and secondary motion.
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
  skin: '#5e3a22',
  hair: 'hightop',
  hairColor: '#15110e',
  facialHair: 'none',
  glasses: 'round',
  eyeColor: '#2c1a10',
  shirt: 'hoodie',
  shirtColor: '#2a2a30',
  shirtAccent: '#d8323a',
  accessory: 'earring',
  accessoryColor: '#e9e9ec',
};

const INK = '#1a1714';
const LINE = 8;
const LIP = '#8a4a44';
const LIP_DARK = '#4a2320';
const MOUTH = '#3a1414';
const TEETH = '#fbf7f0';
const TONGUE = '#c2514f';
const RED = '#e5484d';
const BLUE = '#3b7dd8';
const GOLD = '#ffb020';

const darken = (hex: string, amt = 0.25) => {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, ((n >> 16) & 255) * (1 - amt));
  const g = Math.max(0, ((n >> 8) & 255) * (1 - amt));
  const b = Math.max(0, (n & 255) * (1 - amt));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
};

// ------------------------------------------------------------------ maths
type Pt = [number, number];
const SH_L: Pt = [176, 648];
const SH_R: Pt = [424, 648];
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
/** Deterministic noise in 0..1 for a seed. */
const hash = (n: number) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// ------------------------------------------------------------------ pose params
type HandKind = 'fist' | 'open' | 'point' | 'thumb' | 'none';
type ArmP = {elbow: Pt; hand: Pt; kind: HandKind; angle: number; front: boolean};
type PoseP = {L: ArmP; R: ArmP; tilt: number; lean: number; headY: number; shoulderY: number; bodyRot: number};
type Motion = {f2: number; talk: number};

const REST_L: ArmP = {elbow: [90, 780], hand: [80, 880], kind: 'none', angle: 0, front: false};
const REST_R: ArmP = {elbow: [510, 780], hand: [520, 880], kind: 'none', angle: 0, front: false};

/** The numbers behind each pose. 'gesture' is an internal pose: idle while talking, one hand up and moving with the voice. */
const poseParams = (pose: Pose | 'gesture', m: Motion): PoseP => {
  const base: PoseP = {L: REST_L, R: REST_R, tilt: 0, lean: 0, headY: 0, shoulderY: 0, bodyRot: 0};
  switch (pose) {
    case 'gesture': {
      const beat = Math.round(m.talk * 26);
      const sway = Math.round(Math.sin(m.f2 / 9) * 10);
      return {...base, R: {elbow: [570, 740], hand: [536 + sway, 556 - beat], kind: 'open', angle: 28 + sway, front: true}, lean: 2};
    }
    case 'point':
      return {
        ...base,
        R: {elbow: [520, 760], hand: [540, 860], kind: 'none', angle: 0, front: false},
        L: {elbow: [40, 690], hand: [-70, 590], kind: 'point', angle: -92, front: true},
        lean: -8,
        tilt: -3,
        bodyRot: -2,
      };
    case 'crossed':
      return {
        ...base,
        L: {elbow: [130, 716], hand: [412, 690], kind: 'none', angle: 0, front: false},
        R: {elbow: [470, 722], hand: [186, 704], kind: 'fist', angle: 0, front: true},
        tilt: 4,
        headY: 4,
      };
    case 'think':
      return {...base, R: {elbow: [540, 760], hand: [372, 522], kind: 'fist', angle: 0, front: true}, tilt: -7, lean: 6, headY: 2};
    case 'shocked':
      return {
        ...base,
        L: {elbow: [30, 540], hand: [110, 380], kind: 'open', angle: -20, front: true},
        R: {elbow: [570, 540], hand: [490, 380], kind: 'open', angle: 20, front: true},
        headY: -14,
        shoulderY: -10,
      };
    case 'thumbsup':
      return {...base, R: {elbow: [570, 700], hand: [570, 520], kind: 'thumb', angle: 0, front: true}, tilt: 3, lean: -3};
    case 'facepalm':
      return {...base, R: {elbow: [560, 700], hand: [420, 470], kind: 'none', angle: 0, front: true}, tilt: 6, headY: 14, lean: 4};
    case 'laugh': {
      const ha = Math.abs(Math.sin(m.f2 / 4)) * 10;
      return {...base, L: {elbow: [110, 780], hand: [250, 770 - ha], kind: 'fist', angle: 0, front: true}, R: {elbow: [520, 780], hand: [540, 880], kind: 'none', angle: 0, front: false}, headY: -8 + ha, tilt: 5, shoulderY: -ha * 0.6};
    }
    case 'wave': {
      const wob = Math.round(Math.sin(m.f2 / 5) * 40);
      return {...base, R: {elbow: [570, 600], hand: [610 + wob, 420], kind: 'open', angle: wob / 2, front: true}, tilt: 2};
    }
    case 'shrug':
      return {
        ...base,
        L: {elbow: [50, 740], hand: [0, 650], kind: 'open', angle: -80, front: true},
        R: {elbow: [550, 740], hand: [600, 650], kind: 'open', angle: 80, front: true},
        tilt: 6,
        shoulderY: -16,
        headY: 6,
      };
    default:
      return base;
  }
};

const blendArm = (a: ArmP, b: ArmP, t: number): ArmP => {
  // The hand shape and the layer can't tween: swap them part-way, early when a hand is coming out from behind.
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
  browLY: number;
  browLA: number;
  browRY: number;
  browRA: number;
  lidOuterL: number; // lid line heights relative to eye centre (-58 = fully open)
  lidInnerL: number;
  lidOuterR: number;
  lidInnerR: number;
  eyeRy: number;
  cornerL: number; // mouth corner offsets (negative = up)
  cornerR: number;
  lipMid: number; // closed-mouth centre line offset (positive = smile curve)
  dark: number; // 0..1 how much the lips darken (anger)
  closed: number; // 0..1 eyes shut (happy-shut / facepalm)
  laughEyes: number; // 0..1 upturned arc eyes
};
const faceParams = (expr: Face): FaceP => {
  const open = -58;
  const base: FaceP = {browLY: 290, browLA: -4, browRY: 290, browRA: 4, lidOuterL: open, lidInnerL: open, lidOuterR: open, lidInnerR: open, eyeRy: 48, cornerL: 0, cornerR: 0, lipMid: 6, dark: 0, closed: 0, laughEyes: 0};
  switch (expr) {
    case 'angry':
      return {...base, browLY: 300, browLA: 16, browRY: 300, browRA: -16, lidOuterL: -34, lidInnerL: -6, lidOuterR: -34, lidInnerR: -6, cornerL: 8, cornerR: 8, lipMid: -12, dark: 1};
    case 'sad':
      return {...base, browLY: 290, browLA: -16, browRY: 290, browRA: 16, lidOuterL: -6, lidInnerL: -34, lidOuterR: -6, lidInnerR: -34, cornerL: 12, cornerR: 12, lipMid: -16};
    case 'surprised':
      return {...base, browLY: 266, browLA: -4, browRY: 266, browRA: 4, eyeRy: 55, cornerL: 2, cornerR: 2, lipMid: 2};
    case 'confused':
      return {...base, browLY: 270, browLA: -10, browRY: 298, browRA: 8, lidOuterR: -16, lidInnerR: -16, cornerL: 4, cornerR: -6, lipMid: 4};
    case 'smug':
      return {...base, browLY: 292, browLA: -2, browRY: 278, browRA: 10, lidOuterL: -8, lidInnerL: -14, lidOuterR: -8, lidInnerR: -14, cornerL: 2, cornerR: -18, lipMid: 26};
    case 'happy':
      return {...base, browLY: 282, browLA: -6, browRY: 282, browRA: 6, cornerL: -10, cornerR: -10, lipMid: 30};
    case 'laugh':
      return {...base, browLY: 278, browLA: -6, browRY: 278, browRA: 6, cornerL: -12, cornerR: -12, lipMid: 30, laughEyes: 1};
    case 'closed':
      return {...base, browLY: 296, browLA: 10, browRY: 296, browRA: -10, cornerL: 0, cornerR: 0, lipMid: 0, closed: 1};
    case 'flat':
      return {...base, cornerL: 0, cornerR: 0, lipMid: 0};
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
      return {w: 46, top: -6, bot: 12 + open * 52, teeth: 0.6, tongue: open > 0.5 ? 1 : 0, round: 0};
    case 2:
      return {w: 60, top: -2, bot: 8 + open * 20, teeth: 1, tongue: 0, round: 0};
    case 3:
      return {w: 26 + open * 4, top: -14 - open * 8, bot: 16 + open * 30, teeth: 0, tongue: 0, round: 1};
    case 4:
      return {w: 42, top: 0, bot: 3, teeth: 0, tongue: 0, round: 0};
    case 5:
      return {w: 50, top: -4, bot: 9, teeth: 1, tongue: 0, round: 0};
    case 6:
      return {w: 46, top: -4, bot: 12 + open * 24, teeth: 0.3, tongue: 1, round: 0};
    default:
      return {w: 46, top: 0, bot: 0, teeth: 0, tongue: 0, round: 0};
  }
};

// ------------------------------------------------------------------ parts
const Hand: React.FC<{kind: HandKind; skin: string; angle: number}> = ({kind, skin, angle}) => {
  if (kind === 'none') return null;
  const finger = (x: number, rot: number, h = 46) => (
    <rect key={`${x}${rot}`} x={x - 10} y={-h - 24} width={20} height={h + 10} rx={10} fill={skin} stroke={INK} strokeWidth={6} transform={`rotate(${rot})`} />
  );
  return (
    <g transform={`rotate(${angle})`}>
      {kind === 'open' ? [finger(-22, -22), finger(0, -4, 54), finger(20, 14)] : null}
      {kind === 'point' ? finger(0, 0, 60) : null}
      {kind === 'thumb' ? finger(-6, -18, 52) : null}
      <circle r={36} fill={skin} stroke={INK} strokeWidth={6} />
      {kind === 'fist' ? <path d="M-22,-6 Q0,-18 22,-6 M-22,8 Q0,-2 22,8" stroke={INK} strokeWidth={5} fill="none" strokeLinecap="round" /> : null}
    </g>
  );
};

const Arm: React.FC<{from: Pt; arm: ArmP; skin: string; sleeve: string}> = ({from, arm, skin, sleeve}) => {
  const pts = `${from[0]},${from[1]} ${arm.elbow[0]},${arm.elbow[1]} ${arm.hand[0]},${arm.hand[1]}`;
  return (
    <g>
      <polyline points={pts} fill="none" stroke={INK} strokeWidth={72} strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={pts} fill="none" stroke={sleeve} strokeWidth={58} strokeLinecap="round" strokeLinejoin="round" />
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
  /** The pose/face before the last change, for the tween. */
  prevPose?: Pose;
  prevFace?: Face;
  /** Frames since the pose/face last changed. */
  sinceChange?: number;
  mouth: number; // loudness 0..1
  viseme?: number; // 0..6, see visemeShape
  /** Smoothed "is talking" level 0..1 over the last half second. */
  talk?: number;
  /** Where the thing being talked about is, in the character's own space: -1 left, 0 camera, 1 right. */
  lookX?: number;
  /** How much of the time to look at that thing (0..1). */
  attention?: number;
  frame: number; // global frame
  width?: number;
  flip?: boolean;
  style?: React.CSSProperties;
};

export const Avatar: React.FC<AvatarProps> = ({config: c, pose, face, prevPose, prevFace, sinceChange = 999, mouth, viseme = 0, talk = 0, lookX = 0, attention = 0.3, frame, width = 600, flip = false, style}) => {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const f2 = Math.floor(frame / 2) * 2; // hold on twos
  const boilSeed = Math.floor(frame / 3) % 6; // re-draw the line every 3 frames
  const since2 = Math.floor(Math.max(0, sinceChange) / 2) * 2;
  const tw = poseTween(since2, 10);
  const twFace = clamp01(since2 / 6);
  const expr: Face = face ?? defaultFaceFor(pose);
  const prevExpr: Face = prevFace ?? (prevPose ? defaultFaceFor(prevPose) : expr);
  const skinDark = darken(c.skin, 0.22);
  const sleeve = c.shirt === 'tee' ? c.skin : c.shirtColor;
  const loud = clamp01(mouth);
  const talking = talk > 0.2;

  // ------------------------------------------------------------ body: tween previous pose -> current pose
  const motion: Motion = {f2, talk: loud};
  const effective = (p: Pose, isCurrent: boolean): Pose | 'gesture' => (p === 'idle' && talking && (isCurrent ? sinceChange > 12 : true) ? 'gesture' : p);
  const cur = poseParams(effective(pose, true), motion);
  const prev = poseParams(effective(prevPose ?? pose, false), motion);
  const body = blendPose(prev, cur, tw);
  // idle -> gesture and back tween on their own clock (when the voice starts/stops)
  const gestureBlend = pose === 'idle' && sinceChange > 12 ? clamp01((talk - 0.2) / 0.3) : 1;
  const bodyIdle = pose === 'idle' && sinceChange > 12 ? blendPose(poseParams('idle', motion), cur, easeOutBack(gestureBlend)) : body;
  const B = pose === 'idle' && sinceChange > 12 ? bodyIdle : body;

  // ------------------------------------------------------------ idle acting
  const breath = Math.sin(f2 / 22);
  const bob = Math.round(Math.sin(f2 / 16) * 3 + breath * 2);
  const nod = Math.round(loud * 7); // head dips on stressed words
  const slowTilt = Math.sin(f2 / 44) * 2;
  // gaze: every ~4s glance at the content for ~1.2s, more often when attention is high; dart straight back on a re-pose
  const cycle = 120;
  const ci = Math.floor(frame / cycle);
  const phase = (frame + Math.floor(hash(ci) * 40)) % cycle;
  const glanceLen = 20 + attention * 40;
  const glancing = lookX !== 0 && hash(ci + 7) < attention + 0.2 && phase < glanceLen && sinceChange > 24;
  const microX = Math.round((hash(Math.floor(frame / 9)) - 0.5) * 4);
  const microY = Math.round((hash(Math.floor(frame / 11) + 3) - 0.5) * 3);
  const gazeX = glancing ? lookX * 15 : microX;
  const gazeY = glancing ? 4 : microY;
  const headTurn = glancing ? lookX * 4 : 0; // the head follows the eyes a little
  // blinks: irregular, plus one on every re-pose and when the eyes dart
  const blinkSlot = Math.floor((frame + 23) / 41);
  const blinkFrame = (frame + 23) % 41;
  const randomBlink = hash(blinkSlot * 3) < 0.75 && blinkFrame < 4;
  const blinking = randomBlink || sinceChange < 3 || (glancing && phase < 3);

  // ------------------------------------------------------------ face tween
  const F = blendFace(faceParams(prevExpr), faceParams(expr), easeOutBack(twFace));
  const browLift = Math.round(loud * 5) + (glancing ? 2 : 0);
  const Brow: React.FC<{cx: number; y: number; a: number}> = ({cx, y, a}) => (
    <path
      d={`M${cx - 50},${y + 6} Q${cx - 44},${y - 12} ${cx},${y - 14} Q${cx + 46},${y - 14} ${cx + 52},${y + 2} L${cx + 50},${y + 12} Q${cx + 6},${y + 4} ${cx - 48},${y + 14} Z`}
      fill={darken(c.hairColor, 0.1)}
      stroke={INK}
      strokeWidth={5}
      strokeLinejoin="round"
      transform={`rotate(${a} ${cx} ${y})`}
    />
  );

  // ------------------------------------------------------------ eyes
  const eyesShut = blinking || F.closed > 0.5;
  const Eye: React.FC<{cx: number; side: 1 | -1}> = ({cx, side}) => {
    const cy = 350;
    const rx = 42;
    const ry = F.eyeRy;
    const id = `eye-${uid}-${cx}`;
    if (F.laughEyes > 0.5) {
      return <path d={`M${cx - 30},${cy + 4} Q${cx},${cy - 34} ${cx + 30},${cy + 4}`} stroke={INK} strokeWidth={8} fill="none" strokeLinecap="round" />;
    }
    if (eyesShut) {
      const droop = expr === 'sad' ? 16 : 12;
      return <path d={`M${cx - 30},${cy} Q${cx},${cy + droop} ${cx + 30},${cy}`} stroke={INK} strokeWidth={7} fill="none" strokeLinecap="round" />;
    }
    const outerY = side === 1 ? F.lidOuterL : F.lidOuterR;
    const innerY = side === 1 ? F.lidInnerL : F.lidInnerR;
    const inner = cx + 48 * side;
    const outer = cx - 48 * side;
    const lidVisible = outerY > -56 || innerY > -56;
    const lid = `M${outer},${cy - 58} L${inner},${cy - 58} L${inner},${cy + innerY} L${outer},${cy + outerY} Z`;
    const px = cx + 5 + gazeX;
    const py = cy + 8 + gazeY;
    return (
      <g>
        <defs>
          <clipPath id={id}>
            <ellipse cx={cx} cy={cy} rx={rx} ry={ry} />
          </clipPath>
        </defs>
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#fbf7f0" />
        <g clipPath={`url(#${id})`}>
          <circle cx={px} cy={py} r={25} fill={c.eyeColor} />
          <circle cx={px + 1} cy={py + 1} r={14} fill={INK} />
          <circle cx={px + 10} cy={py - 14} r={8} fill="#fff" />
          <circle cx={px - 7} cy={py + 12} r={4} fill="#fff" opacity={0.8} />
          {lidVisible ? <path d={lid} fill={c.skin} /> : null}
        </g>
        {lidVisible ? <path d={`M${inner},${cy + innerY} L${outer},${cy + outerY}`} stroke={INK} strokeWidth={6} strokeLinecap="round" /> : null}
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={INK} strokeWidth={6} />
      </g>
    );
  };

  // ------------------------------------------------------------ mouth
  const Mouth: React.FC = () => {
    const cx = 300;
    const cy = 482;
    const open = 0.3 + 0.7 * loud;
    const isLaugh = expr === 'laugh' && twFace >= 1;
    const isSurprised = expr === 'surprised' && twFace >= 1;
    // what shape are the lips making right now
    let v = viseme;
    if (expr === 'closed' || expr === 'flat') v = 0;
    if (v === 0 && loud > 0.3 && expr !== 'closed' && expr !== 'flat') v = 1; // loud but no word timing: fall back to open
    let S: MouthShape;
    if (isLaugh) S = {w: 54, top: -10, bot: 78, teeth: 1, tongue: 1, round: 0};
    else if (isSurprised && v === 0) S = {w: 22, top: -20, bot: 44, teeth: 0, tongue: 0, round: 1};
    else S = visemeShape(v, open);
    const cl = F.cornerL;
    const cr = F.cornerR;
    const opening = S.bot - S.top;
    if (opening > 6) {
      // an open mouth: upper lip curve, cavity, teeth strip, tongue
      const w = S.w;
      const kx = S.round ? w * 0.55 : w;
      const top = `M${cx - w},${cy + cl} C${cx - kx},${cy + S.top} ${cx + kx},${cy + S.top} ${cx + w},${cy + cr}`;
      const bottom = `C${cx + kx},${cy + S.bot} ${cx - kx},${cy + S.bot} ${cx - w},${cy + cl} Z`;
      const teethH = Math.min(16, opening * 0.35);
      return (
        <g>
          <path d={`${top} ${bottom}`} fill={MOUTH} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
          <clipPath id={`mouth-${uid}`}>
            <path d={`${top} ${bottom}`} />
          </clipPath>
          <g clipPath={`url(#mouth-${uid})`}>
            {S.teeth > 0 ? <rect x={cx - w} y={cy + S.top - 4} width={w * 2} height={teethH + 6 + Math.max(0, cl, cr)} fill={TEETH} opacity={S.teeth} /> : null}
            {v === 5 ? <rect x={cx - w * 0.8} y={cy + S.bot - 8} width={w * 1.6} height={8} fill={TEETH} /> : null}
            {S.tongue > 0 ? <ellipse cx={cx} cy={cy + S.bot - 2} rx={w * 0.55} ry={Math.max(8, opening * 0.22)} fill={TONGUE} opacity={S.tongue} /> : null}
          </g>
        </g>
      );
    }
    // closed lips: the expression shape, pressed shut for m/b/p
    const w = S.w;
    const lipFill = F.dark > 0.5 ? LIP_DARK : LIP;
    const mid = F.lipMid + (v === 4 ? -3 : 0);
    const above = cy + mid - (v === 4 ? 8 : 14);
    const below = cy + mid + (mid < 2 ? 12 : 0);
    return (
      <g>
        <path d={`M${cx - w},${cy + cl} Q${cx},${above} ${cx + w},${cy + cr} Q${cx},${below} ${cx - w},${cy + cl} Z`} fill={lipFill} />
        <path d={`M${cx - w},${cy + cl} Q${cx},${cy + mid} ${cx + w},${cy + cr}`} stroke={INK} strokeWidth={7} fill="none" strokeLinecap="round" />
        {v === 4 ? <path d={`M${cx - w * 0.6},${cy + mid + 8} Q${cx},${cy + mid + 12} ${cx + w * 0.6},${cy + mid + 8}`} stroke={INK} strokeWidth={4} fill="none" strokeLinecap="round" opacity={0.6} /> : null}
      </g>
    );
  };

  // ------------------------------------------------------------ hair
  const curlJig = sinceChange < 8 ? Math.round(Math.sin(sinceChange * 1.3) * (8 - sinceChange)) : 0;
  const hairBack = (() => {
    switch (c.hair) {
      case 'afro':
        return <circle cx={300} cy={320} r={225} fill={c.hairColor} stroke={INK} strokeWidth={7} />;
      case 'long':
        return <path d="M150,320 Q140,540 170,640 L430,640 Q460,540 450,320 Z" fill={c.hairColor} stroke={INK} strokeWidth={7} />;
      case 'locs':
        return (
          <g fill={c.hairColor} stroke={INK} strokeWidth={6}>
            {[-130, -100, -70, 100, 130, 160].map((dx, i) => (
              <rect key={i} x={300 + dx - 14} y={280} width={28} height={300 + (i % 2) * 40} rx={14} />
            ))}
          </g>
        );
      case 'bun':
        return <circle cx={300} cy={170} r={64} fill={c.hairColor} stroke={INK} strokeWidth={7} />;
      default:
        return null;
    }
  })();
  const hairFront = (() => {
    const cap = 'M150,330 C150,212 212,148 300,148 C388,148 450,212 450,330 C446,262 392,238 300,238 C208,238 154,262 150,330 Z';
    switch (c.hair) {
      case 'bald':
        return null;
      case 'buzz':
      case 'fade':
        return (
          <g>
            <path d={cap} fill={c.hairColor} stroke={INK} strokeWidth={7} strokeLinejoin="round" />
            <path d="M150,330 C154,280 166,250 184,240 L176,350 Z" fill={c.hairColor} opacity={0.5} />
            <path d="M450,330 C446,280 434,250 416,240 L424,350 Z" fill={c.hairColor} opacity={0.5} />
          </g>
        );
      case 'hightop':
        return (
          <g>
            <path d="M158,322 C160,286 176,262 196,250 L186,350 Z" fill={c.hairColor} opacity={0.45} />
            <path d="M442,322 C440,286 424,262 404,250 L414,350 Z" fill={c.hairColor} opacity={0.45} />
            <path d="M166,262 C168,150 206,60 300,62 C394,60 432,150 434,262 C430,236 404,222 300,222 C196,222 170,236 166,262 Z" fill={c.hairColor} stroke={INK} strokeWidth={LINE} strokeLinejoin="round" />
            <g fill={c.hairColor} stroke={INK} strokeWidth={6} transform={`translate(0 ${curlJig})`}>
              {[184, 226, 268, 310, 352, 394].map((x, i) => (
                <circle key={x} cx={x} cy={i % 2 ? 84 : 102} r={30} />
              ))}
              {[205, 247, 289, 331, 373].map((x) => (
                <circle key={x} cx={x} cy={64} r={24} />
              ))}
            </g>
            <path d="M172,262 Q300,236 428,262" fill="none" stroke={INK} strokeWidth={5} opacity={0.5} />
          </g>
        );
      case 'curly':
      case 'afro':
        return (
          <g fill={c.hairColor} stroke={INK} strokeWidth={7}>
            <path d={cap} />
            {[165, 205, 250, 300, 350, 395, 435].map((x, i) => (
              <circle key={i} cx={x} cy={(i % 2 ? 176 : 206) + curlJig} r={44} />
            ))}
          </g>
        );
      default:
        return <path d={cap} fill={c.hairColor} stroke={INK} strokeWidth={7} strokeLinejoin="round" />;
    }
  })();

  const facialHair = (() => {
    const mustache = <path d="M250,450 Q300,434 350,450 Q330,458 300,452 Q270,458 250,450 Z" fill={c.hairColor} stroke={INK} strokeWidth={4} strokeLinejoin="round" />;
    switch (c.facialHair) {
      case 'stubble':
        return <path d="M176,420 C190,500 236,548 300,556 C364,548 410,500 424,420 Q400,520 300,528 Q200,520 176,420 Z" fill={INK} opacity={0.18} />;
      case 'beard':
        return <path d="M166,400 C180,520 236,576 300,580 C364,576 420,520 434,400 Q410,470 300,476 Q190,470 166,400 Z" fill={c.hairColor} stroke={INK} strokeWidth={6} />;
      case 'goatee':
        return <path d="M262,496 Q300,488 338,496 Q336,560 300,568 Q264,560 262,496 Z" fill={c.hairColor} stroke={INK} strokeWidth={5} />;
      case 'mustache':
        return mustache;
      case 'chinstrap':
        return (
          <g>
            <path d="M176,420 C186,496 232,548 300,558 C368,548 414,496 424,420 C414,512 368,540 300,544 C232,540 186,512 176,420 Z" fill={c.hairColor} opacity={0.85} />
            <path d="M262,498 Q300,490 338,498 Q336,562 300,570 Q264,562 262,498 Z" fill={c.hairColor} stroke={INK} strokeWidth={5} strokeLinejoin="round" />
            {mustache}
          </g>
        );
      default:
        return null;
    }
  })();

  const glasses = (() => {
    if (c.glasses === 'none') return null;
    return c.glasses === 'round' ? (
      <g fill="none" stroke={INK} strokeWidth={8}>
        <circle cx={240} cy={352} r={46} />
        <circle cx={360} cy={352} r={46} />
        <path d="M286,348 Q300,338 314,348 M194,346 L150,336 M406,346 L450,336" />
      </g>
    ) : (
      <g fill="none" stroke={INK} strokeWidth={8}>
        <rect x={192} y={312} width={96} height={78} rx={16} />
        <rect x={312} y={312} width={96} height={78} rx={16} />
        <path d="M288,348 L312,348 M192,344 L150,336 M408,344 L450,336" />
      </g>
    );
  })();

  const accessory = (() => {
    switch (c.accessory) {
      case 'cap':
        return (
          <g stroke={INK} strokeWidth={7} strokeLinejoin="round">
            <path d="M142,320 Q142,130 300,130 Q458,130 458,320 Z" fill={c.accessoryColor} />
            <path d="M120,320 L480,320 Q530,320 530,352 Q400,368 120,350 Z" fill={darken(c.accessoryColor, 0.3)} />
          </g>
        );
      case 'beanie':
        return (
          <g stroke={INK} strokeWidth={7} strokeLinejoin="round">
            <path d="M140,350 Q140,118 300,118 Q460,118 460,350 Z" fill={c.accessoryColor} />
            <rect x={134} y={296} width={332} height={64} rx={20} fill={darken(c.accessoryColor, 0.25)} />
          </g>
        );
      case 'earring': {
        const swing = Math.round(Math.sin(f2 / 7) * 2) - Math.round(B.tilt * 0.4);
        return <circle cx={150 + swing} cy={404} r={9} fill={c.accessoryColor} stroke={INK} strokeWidth={4} />;
      }
      case 'headphones':
        return (
          <g stroke={INK} strokeWidth={7}>
            <path d="M135,350 Q135,118 300,118 Q465,118 465,350" fill="none" strokeWidth={18} />
            <rect x={106} y={316} width={56} height={96} rx={24} fill={c.accessoryColor} />
            <rect x={438} y={316} width={56} height={96} rx={24} fill={c.accessoryColor} />
          </g>
        );
      default:
        return null;
    }
  })();

  // ------------------------------------------------------------ emanata (the drawn reaction marks)
  const Emanata: React.FC = () => {
    const life = 40;
    if (sinceChange >= life || sinceChange < 2) return null;
    const pop = easeOutBack(clamp01((sinceChange - 2) / 6));
    const fade = sinceChange > life - 8 ? (life - sinceChange) / 8 : 1;
    const unflip = flip ? 'scale(-1 1)' : '';
    const text = (x: number, y: number, s: string, size: number, color: string, rot = 0) => (
      <text x={0} y={0} fontSize={size} fontFamily="'Gochi Hand', 'Patrick Hand', cursive" fontWeight={700} fill={color} stroke={INK} strokeWidth={6} paintOrder="stroke" textAnchor="middle" transform={`translate(${x} ${y}) rotate(${rot}) ${unflip}`}>
        {s}
      </text>
    );
    const kind = expr === 'surprised' ? 'bang' : expr === 'confused' ? 'question' : expr === 'angry' ? 'anger' : expr === 'laugh' ? 'ha' : expr === 'sad' || pose === 'facepalm' ? 'sweat' : pose === 'thumbsup' ? 'sparkle' : expr === 'smug' ? 'smug' : null;
    if (!kind) return null;
    const wob = Math.sin(sinceChange / 3) * 4;
    return (
      <g opacity={fade}>
        {kind === 'bang' ? (
          <g transform={`translate(470 140) scale(${pop})`}>
            {[...Array(8)].map((_, i) => {
              const a = (i / 8) * Math.PI * 2;
              return <line key={i} x1={Math.cos(a) * 70} y1={Math.sin(a) * 70} x2={Math.cos(a) * (96 + (i % 2) * 14)} y2={Math.sin(a) * (96 + (i % 2) * 14)} stroke={INK} strokeWidth={7} strokeLinecap="round" />;
            })}
            {text(0, 40, '!', 150, RED, flip ? 12 : -12)}
          </g>
        ) : null}
        {kind === 'question' ? <g transform={`translate(${468 + wob} ${150 - sinceChange * 0.8}) scale(${pop})`}>{text(0, 40, '?', 130, GOLD, flip ? -14 : 14)}</g> : null}
        {kind === 'anger' ? (
          <g transform={`translate(452 180) scale(${pop})`} stroke={RED} strokeWidth={9} fill="none" strokeLinecap="round">
            <path d="M-24,-10 Q-10,-22 4,-10 M4,-10 Q18,2 4,14 M4,14 Q-10,26 -24,14 M-24,14 Q-38,2 -24,-10" transform={`rotate(${sinceChange * 2})`} />
            <path d="M-70,-70 l-22,-26 M70,-70 l22,-26 M0,-94 l0,-30" stroke={INK} strokeWidth={7} opacity={sinceChange % 6 < 3 ? 1 : 0.4} />
          </g>
        ) : null}
        {kind === 'ha' ? (
          <g>
            <g transform={`translate(${560 + wob} ${330 - sinceChange * 1.5}) scale(${pop})`}>{text(0, 0, 'HA', 120, GOLD, 16)}</g>
            <g transform={`translate(${600 - wob} ${200 - sinceChange * 2}) scale(${pop * 0.75})`}>{text(0, 0, 'HA', 100, GOLD, -10)}</g>
          </g>
        ) : null}
        {kind === 'sweat' ? (
          <g transform={`translate(436 ${250 + Math.min(60, sinceChange * 2.2)})`}>
            <path d="M0,-30 C12,-10 20,0 20,12 A20,20 0 1,1 -20,12 C-20,0 -12,-10 0,-30 Z" fill={BLUE} stroke={INK} strokeWidth={5} transform={`scale(${pop})`} />
            <circle cx={-7} cy={10} r={5} fill="#fff" opacity={0.7} />
            <g stroke={INK} strokeWidth={6} strokeLinecap="round" opacity={0.6}>
              <line x1={-170} y1={-150} x2={-170} y2={-110} />
              <line x1={-140} y1={-170} x2={-140} y2={-120} />
              <line x1={-110} y1={-150} x2={-110} y2={-110} />
            </g>
          </g>
        ) : null}
        {kind === 'sparkle' ? (
          <g fill={GOLD} stroke={INK} strokeWidth={4}>
            {[
              [470, 160, 1],
              [500, 250, 0.7],
              [120, 180, 0.8],
            ].map(([x, y, s], i) => {
              const tw2 = 0.6 + 0.4 * Math.abs(Math.sin(sinceChange / 4 + i));
              return <path key={i} d="M0,-26 L7,-7 L26,0 L7,7 L0,26 L-7,7 L-26,0 L-7,-7 Z" transform={`translate(${x} ${y}) scale(${pop * s * tw2})`} />;
            })}
          </g>
        ) : null}
        {kind === 'smug' ? <g transform={`translate(488 300) scale(${pop})`}>{text(0, 0, '~', 90, GOLD, 10)}</g> : null}
      </g>
    );
  };

  // ------------------------------------------------------------ assemble
  const shirtDark = darken(c.shirtColor, 0.18);
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

  return (
    <svg viewBox="-120 60 840 760" width={width} style={{overflow: 'visible', transform: flip ? 'scaleX(-1)' : undefined, ...style}}>
      <defs>
        <filter id={`boil-${uid}`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves={2} seed={boilSeed} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={5} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <g filter={`url(#boil-${uid})`} transform={`translate(0 ${bob}) rotate(${B.bodyRot} 300 900) translate(300 900) scale(1 ${1 + breath * 0.006}) translate(-300 -900)`}>
        {arms.filter((a) => !a.arm.front).map((a) => (
          <Arm key={`b${a.key}`} from={a.from} arm={a.arm} skin={c.skin} sleeve={sleeve} />
        ))}
        {/* neck */}
        <rect x={258} y={540} width={84} height={130} rx={30} fill={skinDark} stroke={INK} strokeWidth={LINE} />
        {/* torso */}
        <g transform={`translate(0 ${B.shoulderY * 0.5})`}>
          <path d="M116,900 L116,740 Q118,632 222,612 L378,612 Q482,632 484,740 L484,900 Z" fill={c.shirtColor} stroke={INK} strokeWidth={LINE} strokeLinejoin="round" />
          {c.shirt === 'collared' ? (
            <g>
              <path d="M226,604 L300,712 L374,604 Z" fill={c.shirtAccent} />
              <path d="M226,604 L300,712 L258,730 L204,640 Z" fill={c.shirtColor} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
              <path d="M374,604 L300,712 L342,730 L396,640 Z" fill={c.shirtColor} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
              <path d="M300,712 L300,900" stroke={shirtDark} strokeWidth={4} />
              {[770, 850].map((y) => (
                <circle key={y} cx={300} cy={y} r={7} fill="#fff" stroke={INK} strokeWidth={4} />
              ))}
            </g>
          ) : c.shirt === 'hoodie' ? (
            <g>
              <path d="M150,700 C150,610 210,580 262,592 L300,640 L338,592 C390,580 450,610 450,700 L420,700 C412,660 380,640 338,632 L300,670 L262,632 C220,640 188,660 180,700 Z" fill={c.shirtAccent} stroke={INK} strokeWidth={LINE} strokeLinejoin="round" />
              <path d="M262,632 Q300,690 338,632" fill={darken(c.shirtAccent, 0.35)} stroke={INK} strokeWidth={6} />
              <path d={`M282,660 Q${276 + stringSwing},710 ${272 + stringSwing * 2},760 M318,660 Q${324 + stringSwing},710 ${328 + stringSwing * 2},760`} stroke="#f1efe8" strokeWidth={7} strokeLinecap="round" fill="none" />
              <path d="M300,700 L300,900" stroke={shirtDark} strokeWidth={4} />
            </g>
          ) : c.shirt === 'jacket' ? (
            <g>
              <path d="M96,730 Q98,620 215,604 L300,712 L300,900 L96,900 Z" fill={shirtDark} stroke={INK} strokeWidth={6} />
              <path d="M215,604 L300,712 L262,626 Z" fill={c.shirtAccent} />
              <path d="M385,604 L300,712 L338,626 Z" fill={c.shirtAccent} />
            </g>
          ) : (
            <path d="M236,606 Q300,670 364,606" fill="none" stroke={INK} strokeWidth={7} />
          )}
        </g>
        <g transform={`translate(${headDx} ${headDy}) translate(300 610) scale(1.17) translate(-300 -610) rotate(${headTilt} 300 560)`}>
          {hairBack}
          <g stroke={INK} strokeWidth={7}>
            <ellipse cx={146} cy={362} rx={34} ry={46} fill={c.skin} />
            <ellipse cx={454} cy={362} rx={34} ry={46} fill={c.skin} />
            <path d="M144,346 Q136,362 146,380" fill="none" strokeWidth={5} strokeLinecap="round" />
            <path d="M456,346 Q464,362 454,380" fill="none" strokeWidth={5} strokeLinecap="round" />
          </g>
          {/* head */}
          <path d="M300,146 C410,146 456,226 456,336 C456,420 442,474 410,520 C382,560 340,578 300,578 C260,578 218,560 190,520 C158,474 144,420 144,336 C144,226 190,146 300,146 Z" fill={c.skin} stroke={INK} strokeWidth={LINE} strokeLinejoin="round" />
          {facialHair}
          {hairFront}
          {accessory}
          {/* features slide a little when the head turns */}
          <g transform={`translate(${headTurn * 3} 0)`}>
            <Brow cx={230} y={F.browLY - 8 - browLift} a={F.browLA} />
            <Brow cx={370} y={F.browRY - 8 - browLift} a={F.browRA} />
            <Eye cx={230} side={1} />
            <Eye cx={370} side={-1} />
            {/* nose */}
            <path d="M300,392 C290,412 282,426 296,432 Q310,436 318,426" fill="none" stroke={INK} strokeWidth={6} strokeLinecap="round" />
            <ellipse cx={304} cy={436} rx={14} ry={6} fill={skinDark} opacity={0.5} />
            {glasses}
            <Mouth />
          </g>
          {facepalmAmt > 0 ? (
            <g transform={`translate(${(1 - facepalmAmt) * 120} ${(1 - facepalmAmt) * 160})`} opacity={facepalmAmt}>
              <polyline points="432,640 548,560 352,330" fill="none" stroke={INK} strokeWidth={72} strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="432,640 548,560 352,330" fill="none" stroke={sleeve} strokeWidth={58} strokeLinecap="round" strokeLinejoin="round" />
              <ellipse cx={312} cy={342} rx={96} ry={62} fill={c.skin} stroke={INK} strokeWidth={6} transform="rotate(-12 312 342)" />
              <path d="M232,362 L390,318 M240,384 L392,342" stroke={INK} strokeWidth={4} strokeLinecap="round" opacity={0.6} />
            </g>
          ) : null}
        </g>
        {arms.filter((a) => a.arm.front && !(pose === 'facepalm' && a.key === 'R' && facepalmAmt > 0.5)).map((a) => (
          <Arm key={`f${a.key}`} from={a.from} arm={a.arm} skin={c.skin} sleeve={sleeve} />
        ))}
        <Emanata />
      </g>
    </svg>
  );
};
