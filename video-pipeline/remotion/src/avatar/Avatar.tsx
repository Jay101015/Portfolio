import React from 'react';

/**
 * Hand-drawn style host character: thick ink outlines, big eyes, flat colour,
 * a line "boil" that re-draws every few frames, and motion held on twos so it
 * reads as animated by hand rather than tweened.
 */
export type AvatarConfig = {
  skin: string;
  hair: 'short' | 'curly' | 'buzz' | 'long' | 'bald' | 'fade' | 'locs' | 'afro' | 'bun';
  hairColor: string;
  facialHair: 'none' | 'stubble' | 'beard' | 'goatee' | 'mustache' | 'chinstrap';
  glasses: 'none' | 'round' | 'square';
  eyeColor: string;
  shirt: 'tee' | 'hoodie' | 'jacket' | 'collared';
  shirtColor: string;
  shirtAccent: string;
  accessory: 'none' | 'cap' | 'headphones' | 'beanie';
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
  skin: '#7a4a28',
  hair: 'fade',
  hairColor: '#17130f',
  facialHair: 'chinstrap',
  glasses: 'none',
  eyeColor: '#3a2214',
  shirt: 'collared',
  shirtColor: '#bfd6f2',
  shirtAccent: '#232838',
  accessory: 'none',
  accessoryColor: '#e5484d',
};

const INK = '#1a1714';
const LIP = '#8a4a44';
const LIP_DARK = '#4a2320';
const MOUTH = '#3a1414';
const TEETH = '#fbf7f0';
const TONGUE = '#c2514f';

const darken = (hex: string, amt = 0.25) => {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, ((n >> 16) & 255) * (1 - amt));
  const g = Math.max(0, ((n >> 8) & 255) * (1 - amt));
  const b = Math.max(0, (n & 255) * (1 - amt));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
};

type Pt = [number, number];
const SH_L: Pt = [168, 640];
const SH_R: Pt = [432, 640];

type HandKind = 'fist' | 'open' | 'point' | 'thumb' | 'none';
type ArmSpec = {from: Pt; elbow: Pt; hand: Pt; handKind?: HandKind; angle?: number};

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

const Arm: React.FC<ArmSpec & {skin: string; sleeve: string}> = ({from, elbow, hand, skin, sleeve, handKind = 'open', angle = 0}) => {
  const pts = `${from[0]},${from[1]} ${elbow[0]},${elbow[1]} ${hand[0]},${hand[1]}`;
  return (
    <g>
      <polyline points={pts} fill="none" stroke={INK} strokeWidth={72} strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={pts} fill="none" stroke={sleeve} strokeWidth={58} strokeLinecap="round" strokeLinejoin="round" />
      <g transform={`translate(${hand[0]} ${hand[1]})`}>
        <Hand kind={handKind} skin={skin} angle={angle} />
      </g>
    </g>
  );
};

type Props = {
  config: AvatarConfig;
  pose: Pose;
  face?: Face;
  mouth: number; // 0..1
  frame: number; // global frame
  width?: number;
  flip?: boolean;
  style?: React.CSSProperties;
};

export const Avatar: React.FC<Props> = ({config: c, pose, face, mouth, frame, width = 600, flip = false, style}) => {
  const f2 = Math.floor(frame / 2) * 2; // hold on twos
  const boilSeed = Math.floor(frame / 3) % 6; // re-draw the line every 3 frames
  const bob = Math.round(Math.sin(f2 / 16) * 3);
  const tilt = Math.round(Math.sin(f2 / 44) * 2);
  const blinkPhase = (frame + 41) % 112;
  const blinking = blinkPhase < 5;
  const expr: Face = face ?? defaultFaceFor(pose);
  const skinDark = darken(c.skin, 0.22);
  const sleeve = c.shirt === 'tee' ? c.skin : c.shirtColor;

  // ------------------------------------------------------------ brows
  const browSpec = (() => {
    switch (expr) {
      case 'angry':
        return {l: {y: 300, a: 16}, r: {y: 300, a: -16}};
      case 'sad':
        return {l: {y: 290, a: -16}, r: {y: 290, a: 16}};
      case 'surprised':
        return {l: {y: 268, a: -4}, r: {y: 268, a: 4}};
      case 'confused':
        return {l: {y: 270, a: -10}, r: {y: 298, a: 8}};
      case 'smug':
        return {l: {y: 292, a: -2}, r: {y: 278, a: 10}};
      case 'laugh':
      case 'happy':
        return {l: {y: 282, a: -6}, r: {y: 282, a: 6}};
      case 'closed':
        return {l: {y: 296, a: 10}, r: {y: 296, a: -10}};
      default:
        return {l: {y: 290, a: -4}, r: {y: 290, a: 4}};
    }
  })();
  const Brow: React.FC<{cx: number; y: number; a: number}> = ({cx, y, a}) => (
    <rect x={cx - 44} y={y - 11} width={88} height={22} rx={11} fill={darken(c.hairColor, 0.1)} stroke={INK} strokeWidth={5} transform={`rotate(${a} ${cx} ${y})`} />
  );

  // ------------------------------------------------------------ eyes
  const eyesClosed = blinking || expr === 'closed';
  const Eye: React.FC<{cx: number; side: 1 | -1}> = ({cx, side}) => {
    const cy = 352;
    const rx = 34;
    const ry = expr === 'surprised' ? 44 : 40;
    const id = `eye-${cx}`;
    if (expr === 'laugh') {
      return <path d={`M${cx - 30},${cy + 4} Q${cx},${cy - 34} ${cx + 30},${cy + 4}`} stroke={INK} strokeWidth={8} fill="none" strokeLinecap="round" />;
    }
    if (eyesClosed) {
      const lid = expr === 'sad' ? `M${cx - 30},${cy - 2} Q${cx},${cy + 16} ${cx + 30},${cy - 2}` : `M${cx - 30},${cy} Q${cx},${cy + 12} ${cx + 30},${cy}`;
      return <path d={lid} stroke={INK} strokeWidth={7} fill="none" strokeLinecap="round" />;
    }
    // lid cover per expression, as a polygon inside the eye clip
    let lid: string | null = null;
    const inner = cx + 40 * side;
    const outer = cx - 40 * side;
    if (expr === 'angry') lid = `M${outer},${cy - 48} L${inner},${cy - 48} L${inner},${cy - 6} L${outer},${cy - 30} Z`;
    if (expr === 'sad') lid = `M${outer},${cy - 48} L${inner},${cy - 48} L${inner},${cy - 30} L${outer},${cy - 6} Z`;
    if (expr === 'smug') lid = `M${outer},${cy - 48} L${inner},${cy - 48} L${inner},${cy - 14} L${outer},${cy - 10} Z`;
    if (expr === 'confused' && side === -1) lid = `M${outer},${cy - 48} L${inner},${cy - 48} L${inner},${cy - 16} L${outer},${cy - 16} Z`;
    const lidEdge = lid ? lid.split('L').slice(2).map((p) => p.replace('Z', '').trim()) : null;
    return (
      <g>
        <defs>
          <clipPath id={id}>
            <ellipse cx={cx} cy={cy} rx={rx} ry={ry} />
          </clipPath>
        </defs>
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#fbf7f0" />
        <g clipPath={`url(#${id})`}>
          <circle cx={cx + 4} cy={cy + 6} r={20} fill={c.eyeColor} />
          <circle cx={cx + 5} cy={cy + 7} r={11} fill={INK} />
          <circle cx={cx + 12} cy={cy - 6} r={6} fill="#fff" />
          {lid ? <path d={lid} fill={c.skin} /> : null}
        </g>
        {lidEdge ? <path d={`M${lidEdge[0]} L${lidEdge[1]}`} stroke={INK} strokeWidth={6} strokeLinecap="round" /> : null}
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={INK} strokeWidth={6} />
      </g>
    );
  };

  // ------------------------------------------------------------ mouth
  const Mouth: React.FC = () => {
    const cx = 300;
    const cy = 474;
    const open = Math.max(0, Math.min(1, mouth));
    const talking = open > 0.12 && expr !== 'closed' && expr !== 'laugh' && expr !== 'surprised' && expr !== 'flat';
    if (expr === 'laugh') {
      return (
        <g>
          <path d={`M${cx - 54},${cy - 10} Q${cx},${cy + 2} ${cx + 54},${cy - 10} Q${cx + 40},${cy + 74} ${cx},${cy + 78} Q${cx - 40},${cy + 74} ${cx - 54},${cy - 10} Z`} fill={MOUTH} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
          <path d={`M${cx - 46},${cy - 4} Q${cx},${cy + 6} ${cx + 46},${cy - 4} L${cx + 42},${cy + 14} Q${cx},${cy + 22} ${cx - 42},${cy + 14} Z`} fill={TEETH} />
          <ellipse cx={cx} cy={cy + 58} rx={26} ry={16} fill={TONGUE} />
        </g>
      );
    }
    if (expr === 'surprised') {
      return <ellipse cx={cx} cy={cy + 14} rx={22 + open * 6} ry={30 + open * 10} fill={MOUTH} stroke={INK} strokeWidth={6} />;
    }
    if (talking) {
      const h = 14 + open * 54;
      const w = 44 + open * 12;
      return (
        <g>
          <path d={`M${cx - w},${cy - 4} Q${cx},${cy - 12} ${cx + w},${cy - 4} Q${cx + w * 0.9},${cy + h} ${cx},${cy + h} Q${cx - w * 0.9},${cy + h} ${cx - w},${cy - 4} Z`} fill={MOUTH} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
          <path d={`M${cx - w * 0.85},${cy - 2} Q${cx},${cy + 2} ${cx + w * 0.85},${cy - 2} L${cx + w * 0.8},${cy + Math.min(14, h * 0.35)} Q${cx},${cy + Math.min(18, h * 0.4)} ${cx - w * 0.8},${cy + Math.min(14, h * 0.35)} Z`} fill={TEETH} />
          {open > 0.5 ? <ellipse cx={cx} cy={cy + h * 0.78} rx={w * 0.45} ry={h * 0.18} fill={TONGUE} /> : null}
        </g>
      );
    }
    switch (expr) {
      case 'happy':
      case 'smug': {
        const lift = expr === 'smug' ? 1 : 0;
        return (
          <g>
            <path d={`M${cx - 48},${cy - 6 + lift * 6} Q${cx},${cy + 30} ${cx + 50},${cy - 10 - lift * 8}`} stroke={INK} strokeWidth={7} fill="none" strokeLinecap="round" />
            <path d={`M${cx - 48},${cy - 6 + lift * 6} Q${cx},${cy + 30} ${cx + 50},${cy - 10 - lift * 8} Q${cx},${cy + 12} ${cx - 48},${cy - 6 + lift * 6} Z`} fill={LIP} />
          </g>
        );
      }
      case 'sad':
        return <path d={`M${cx - 40},${cy + 10} Q${cx},${cy - 16} ${cx + 40},${cy + 10}`} stroke={INK} strokeWidth={7} fill="none" strokeLinecap="round" />;
      case 'angry':
        return (
          <g>
            <path d={`M${cx - 44},${cy + 6} Q${cx},${cy - 10} ${cx + 44},${cy + 6}`} stroke={INK} strokeWidth={7} fill="none" strokeLinecap="round" />
            <path d={`M${cx - 44},${cy + 6} Q${cx},${cy - 10} ${cx + 44},${cy + 6} Q${cx},${cy + 18} ${cx - 44},${cy + 6} Z`} fill={LIP_DARK} />
          </g>
        );
      case 'confused':
        return <path d={`M${cx - 40},${cy + 2} Q${cx - 10},${cy + 18} ${cx + 10},${cy + 2} Q${cx + 28},${cy - 10} ${cx + 44},${cy + 4}`} stroke={INK} strokeWidth={7} fill="none" strokeLinecap="round" />;
      case 'flat':
      case 'closed':
        return <path d={`M${cx - 42},${cy + 2} L${cx + 42},${cy}`} stroke={INK} strokeWidth={7} strokeLinecap="round" />;
      default:
        return (
          <g>
            <path d={`M${cx - 46},${cy} Q${cx - 22},${cy - 12} ${cx},${cy - 4} Q${cx + 22},${cy - 12} ${cx + 46},${cy} Q${cx},${cy + 8} ${cx - 46},${cy} Z`} fill={LIP_DARK} />
            <path d={`M${cx - 44},${cy + 2} Q${cx},${cy + 30} ${cx + 44},${cy + 2} Q${cx},${cy + 12} ${cx - 44},${cy + 2} Z`} fill={LIP} />
            <path d={`M${cx - 46},${cy} Q${cx},${cy + 8} ${cx + 46},${cy}`} stroke={INK} strokeWidth={5} fill="none" strokeLinecap="round" />
          </g>
        );
    }
  };

  // ------------------------------------------------------------ hair
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
      case 'curly':
      case 'afro':
        return (
          <g fill={c.hairColor} stroke={INK} strokeWidth={7}>
            <path d={cap} />
            {[165, 205, 250, 300, 350, 395, 435].map((x, i) => (
              <circle key={i} cx={x} cy={i % 2 ? 176 : 206} r={44} />
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

  // ------------------------------------------------------------ arms
  const back: ArmSpec[] = [];
  const front: ArmSpec[] = [];
  switch (pose) {
    case 'point':
      back.push({from: SH_R, elbow: [520, 760], hand: [540, 860], handKind: 'none'});
      front.push({from: SH_L, elbow: [40, 690], hand: [-70, 590], handKind: 'point', angle: -92});
      break;
    case 'crossed':
      back.push({from: SH_L, elbow: [130, 716], hand: [412, 690], handKind: 'none'});
      front.push({from: SH_R, elbow: [470, 722], hand: [186, 704], handKind: 'fist'});
      break;
    case 'think':
      back.push({from: SH_L, elbow: [90, 780], hand: [80, 880], handKind: 'none'});
      front.push({from: SH_R, elbow: [540, 760], hand: [372, 522], handKind: 'fist'});
      break;
    case 'shocked':
      front.push({from: SH_L, elbow: [30, 540], hand: [110, 380], handKind: 'open', angle: -20});
      front.push({from: SH_R, elbow: [570, 540], hand: [490, 380], handKind: 'open', angle: 20});
      break;
    case 'thumbsup':
      back.push({from: SH_L, elbow: [90, 780], hand: [80, 880], handKind: 'none'});
      front.push({from: SH_R, elbow: [570, 700], hand: [570, 520], handKind: 'thumb'});
      break;
    case 'facepalm':
      back.push({from: SH_L, elbow: [90, 780], hand: [80, 880], handKind: 'none'});
      break;
    case 'laugh':
      front.push({from: SH_L, elbow: [110, 780], hand: [250, 770], handKind: 'fist'});
      back.push({from: SH_R, elbow: [520, 780], hand: [540, 880], handKind: 'none'});
      break;
    case 'wave': {
      const wob = Math.round(Math.sin(f2 / 5) * 40);
      back.push({from: SH_L, elbow: [90, 780], hand: [80, 880], handKind: 'none'});
      front.push({from: SH_R, elbow: [570, 600], hand: [610 + wob, 420], handKind: 'open', angle: wob / 2});
      break;
    }
    case 'shrug':
      front.push({from: SH_L, elbow: [50, 740], hand: [0, 650], handKind: 'open', angle: -80});
      front.push({from: SH_R, elbow: [550, 740], hand: [600, 650], handKind: 'open', angle: 80});
      break;
    default:
      back.push({from: SH_L, elbow: [90, 780], hand: [80, 880], handKind: 'none'});
      back.push({from: SH_R, elbow: [510, 780], hand: [520, 880], handKind: 'none'});
  }

  const shirtDark = darken(c.shirtColor, 0.18);

  return (
    <svg viewBox="-120 60 840 760" width={width} style={{overflow: 'visible', transform: flip ? 'scaleX(-1)' : undefined, ...style}}>
      <defs>
        <filter id="boil" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves={2} seed={boilSeed} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={5} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <g filter="url(#boil)" transform={`translate(0 ${bob})`}>
        {back.map((a, i) => (
          <Arm key={`b${i}`} {...a} skin={c.skin} sleeve={sleeve} />
        ))}
        {/* neck */}
        <rect x={250} y={520} width={100} height={150} rx={30} fill={skinDark} stroke={INK} strokeWidth={7} />
        {/* torso */}
        <path d="M96,900 L96,730 Q98,620 215,604 L385,604 Q502,620 504,730 L504,900 Z" fill={c.shirtColor} stroke={INK} strokeWidth={7} strokeLinejoin="round" />
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
            <path d="M206,606 Q300,700 394,606 Q300,650 206,606 Z" fill={shirtDark} stroke={INK} strokeWidth={6} />
            <path d="M300,660 L300,900" stroke={c.shirtAccent} strokeWidth={8} />
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
        <g transform={`rotate(${tilt} 300 460)`}>
          {hairBack}
          <g stroke={INK} strokeWidth={7}>
            <ellipse cx={148} cy={360} rx={28} ry={40} fill={c.skin} />
            <ellipse cx={452} cy={360} rx={28} ry={40} fill={c.skin} />
            <path d="M144,346 Q136,362 146,380" fill="none" strokeWidth={5} strokeLinecap="round" />
            <path d="M456,346 Q464,362 454,380" fill="none" strokeWidth={5} strokeLinecap="round" />
          </g>
          {/* head */}
          <path d="M300,150 C402,150 452,222 452,336 C452,428 440,478 410,526 C382,566 340,584 300,584 C260,584 218,566 190,526 C160,478 148,428 148,336 C148,222 198,150 300,150 Z" fill={c.skin} stroke={INK} strokeWidth={7} strokeLinejoin="round" />
          {facialHair}
          {hairFront}
          {accessory}
          <Brow cx={236} y={browSpec.l.y} a={browSpec.l.a} />
          <Brow cx={364} y={browSpec.r.y} a={browSpec.r.a} />
          <Eye cx={236} side={1} />
          <Eye cx={364} side={-1} />
          {/* nose */}
          <path d="M292,372 C288,398 274,414 272,428 Q300,442 328,428 C326,414 312,398 308,372" fill={skinDark} stroke={INK} strokeWidth={5} strokeLinejoin="round" />
          <ellipse cx={282} cy={428} rx={8} ry={5} fill={INK} />
          <ellipse cx={318} cy={428} rx={8} ry={5} fill={INK} />
          {glasses}
          <Mouth />
          {pose === 'facepalm' ? (
            <g>
              <polyline points="432,640 548,560 352,330" fill="none" stroke={INK} strokeWidth={72} strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="432,640 548,560 352,330" fill="none" stroke={sleeve} strokeWidth={58} strokeLinecap="round" strokeLinejoin="round" />
              <ellipse cx={312} cy={342} rx={96} ry={62} fill={c.skin} stroke={INK} strokeWidth={6} transform="rotate(-12 312 342)" />
              <path d="M232,362 L390,318 M240,384 L392,342" stroke={INK} strokeWidth={4} strokeLinecap="round" opacity={0.6} />
            </g>
          ) : null}
        </g>
        {front.map((a, i) => (
          <Arm key={`f${i}`} {...a} skin={c.skin} sleeve={sleeve} />
        ))}
      </g>
    </svg>
  );
};
