import React from 'react';

/** A layered vector character. Same face every video; poses, blinks and mouth flap are parameters. */
export type AvatarConfig = {
  skin: string;
  hair: 'short' | 'curly' | 'buzz' | 'long' | 'bald' | 'fade' | 'locs' | 'afro' | 'bun';
  hairColor: string;
  facialHair: 'none' | 'stubble' | 'beard' | 'goatee' | 'mustache';
  glasses: 'none' | 'round' | 'square';
  eyeColor: string;
  shirt: 'tee' | 'hoodie' | 'jacket';
  shirtColor: string;
  shirtAccent: string;
  accessory: 'none' | 'cap' | 'headphones' | 'beanie';
  accessoryColor: string;
};

export type Pose = 'idle' | 'point' | 'crossed' | 'think' | 'shocked' | 'thumbsup' | 'facepalm' | 'laugh' | 'wave' | 'shrug';
export const POSES: Pose[] = ['idle', 'point', 'crossed', 'think', 'shocked', 'thumbsup', 'facepalm', 'laugh', 'wave', 'shrug'];

export const defaultAvatar: AvatarConfig = {
  skin: '#8d5524',
  hair: 'short',
  hairColor: '#1a1a1a',
  facialHair: 'stubble',
  glasses: 'none',
  eyeColor: '#3b2314',
  shirt: 'hoodie',
  shirtColor: '#2b2d42',
  shirtAccent: '#e63946',
  accessory: 'none',
  accessoryColor: '#e63946',
};

type Props = {
  config: AvatarConfig;
  pose: Pose;
  mouth: number; // 0..1 how open
  frame: number; // global frame, drives blink + idle motion
  width?: number;
  flip?: boolean;
  style?: React.CSSProperties;
};

const darken = (hex: string, amt = 0.25) => {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, ((n >> 16) & 255) * (1 - amt));
  const g = Math.max(0, ((n >> 8) & 255) * (1 - amt));
  const b = Math.max(0, (n & 255) * (1 - amt));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
};

type Pt = [number, number];
const SH_L: Pt = [150, 575]; // shoulders (character's right/left are swapped for the viewer; we just use L/R on screen)
const SH_R: Pt = [450, 575];

type ArmProps = {from: Pt; elbow: Pt; hand: Pt; skin: string; sleeve: string; handKind?: 'fist' | 'open' | 'point' | 'thumb' | 'none'; angle?: number};
type ArmSpec = Omit<ArmProps, 'skin' | 'sleeve'>;

const Arm: React.FC<ArmProps> = ({
  from,
  elbow,
  hand,
  skin,
  sleeve,
  handKind = 'open',
  angle = 0,
}) => (
  <g>
    <polyline points={`${from[0]},${from[1]} ${elbow[0]},${elbow[1]} ${hand[0]},${hand[1]}`} fill="none" stroke={skin} strokeWidth={54} strokeLinecap="round" strokeLinejoin="round" />
    <line x1={from[0]} y1={from[1]} x2={elbow[0]} y2={elbow[1]} stroke={sleeve} strokeWidth={66} strokeLinecap="round" />
    {handKind === 'none' ? null : (
      <g transform={`translate(${hand[0]} ${hand[1]}) rotate(${angle})`}>
        <circle r={34} fill={skin} />
        {handKind === 'point' ? <rect x={-14} y={-78} width={28} height={60} rx={14} fill={skin} /> : null}
        {handKind === 'thumb' ? <rect x={-12} y={-82} width={24} height={56} rx={12} fill={skin} transform="rotate(-15)" /> : null}
        {handKind === 'open' ? (
          <>
            <rect x={-30} y={-62} width={18} height={44} rx={9} fill={skin} transform="rotate(-18)" />
            <rect x={-9} y={-70} width={18} height={50} rx={9} fill={skin} />
            <rect x={12} y={-64} width={18} height={44} rx={9} fill={skin} transform="rotate(16)" />
          </>
        ) : null}
      </g>
    )}
  </g>
);

export const Avatar: React.FC<Props> = ({config: c, pose, mouth, frame, width = 600, flip = false, style}) => {
  const shirtDark = darken(c.shirtColor, 0.2);
  const hairDark = darken(c.hairColor, 0.2);
  // deterministic blink every ~3.5s, 4 frames long
  const blinkPeriod = 105;
  const blinkPhase = (frame + 37) % blinkPeriod;
  const blinking = blinkPhase < 4;
  const bob = Math.sin(frame / 14) * 4;
  const tilt = Math.sin(frame / 38) * 1.6;

  const expr = {
    browL: 0, // positive = raised
    browR: 0,
    browAngle: 0, // positive = angry/skeptical inner-down
    eyesClosed: blinking,
    happyEyes: false,
    mouthMode: 'talk' as 'talk' | 'o' | 'laugh' | 'flat' | 'smirk',
    headTilt: tilt,
  };
  if (pose === 'shocked') {
    expr.browL = expr.browR = 18;
    expr.mouthMode = 'o';
  } else if (pose === 'crossed') {
    expr.browAngle = 10;
    expr.mouthMode = 'flat';
  } else if (pose === 'think') {
    expr.browL = 12;
    expr.browAngle = -4;
    expr.mouthMode = 'smirk';
  } else if (pose === 'facepalm') {
    expr.eyesClosed = true;
    expr.browAngle = 8;
    expr.mouthMode = 'flat';
  } else if (pose === 'laugh') {
    expr.happyEyes = true;
    expr.mouthMode = 'laugh';
    expr.headTilt = tilt - 6;
  } else if (pose === 'thumbsup' || pose === 'wave') {
    expr.browL = expr.browR = 6;
  } else if (pose === 'shrug') {
    expr.browL = 14;
    expr.browR = 4;
    expr.mouthMode = 'flat';
  }

  const open = Math.max(0, Math.min(1, mouth));
  const mouthEl = (() => {
    const cx = 300;
    const cy = 415;
    switch (expr.mouthMode) {
      case 'o':
        return <ellipse cx={cx} cy={cy + 6} rx={26} ry={34} fill="#3a1218" />;
      case 'laugh':
        return (
          <g>
            <path d={`M${cx - 58},${cy - 6} Q${cx},${cy + 80} ${cx + 58},${cy - 6} Z`} fill="#3a1218" />
            <path d={`M${cx - 46},${cy - 2} Q${cx},${cy + 14} ${cx + 46},${cy - 2} L${cx + 46},${cy + 8} Q${cx},${cy + 22} ${cx - 46},${cy + 8} Z`} fill="#fff" />
          </g>
        );
      case 'flat':
        return <path d={`M${cx - 40},${cy + 8} L${cx + 40},${cy + 6}`} stroke="#3a1218" strokeWidth={9} strokeLinecap="round" fill="none" />;
      case 'smirk':
        return <path d={`M${cx - 40},${cy + 10} Q${cx + 10},${cy + 22} ${cx + 44},${cy - 4}`} stroke="#3a1218" strokeWidth={9} strokeLinecap="round" fill="none" />;
      default: {
        if (open < 0.12) return <path d={`M${cx - 44},${cy} Q${cx},${cy + 30} ${cx + 44},${cy}`} stroke="#3a1218" strokeWidth={9} strokeLinecap="round" fill="none" />;
        const h = 10 + open * 48;
        const w = 40 + open * 14;
        return (
          <g>
            <path d={`M${cx - w},${cy - 2} Q${cx},${cy - 2 + h * 1.6} ${cx + w},${cy - 2} Q${cx},${cy - 12} ${cx - w},${cy - 2} Z`} fill="#3a1218" />
            {open > 0.35 ? <path d={`M${cx - w * 0.7},${cy} Q${cx},${cy + 10} ${cx + w * 0.7},${cy} L${cx + w * 0.7},${cy + 6} Q${cx},${cy + 16} ${cx - w * 0.7},${cy + 6} Z`} fill="#fff" /> : null}
          </g>
        );
      }
    }
  })();

  const eye = (cx: number, raise: number) => {
    if (expr.happyEyes) return <path d={`M${cx - 24},${322} Q${cx},${296} ${cx + 24},${322}`} stroke="#1a1a1a" strokeWidth={8} fill="none" strokeLinecap="round" />;
    if (expr.eyesClosed) return <path d={`M${cx - 24},${324} Q${cx},${334} ${cx + 24},${324}`} stroke="#1a1a1a" strokeWidth={7} fill="none" strokeLinecap="round" />;
    return (
      <g>
        <ellipse cx={cx} cy={322} rx={25} ry={28} fill="#fff" />
        <circle cx={cx + 3} cy={326} r={13} fill={c.eyeColor} />
        <circle cx={cx + 4} cy={327} r={6.5} fill="#111" />
        <circle cx={cx + 9} cy={318} r={4} fill="#fff" />
        <path d={`M${cx - 27},${raise + 306} Q${cx},${raise + 290} ${cx + 27},${raise + 306}`} stroke={c.skin} strokeWidth={0} fill="none" />
      </g>
    );
  };

  const brow = (cx: number, raise: number, side: 1 | -1) => {
    const a = expr.browAngle * side;
    return <path d={`M${cx - 28},${282 - raise + a} Q${cx},${270 - raise} ${cx + 28},${280 - raise - a}`} stroke={hairDark} strokeWidth={10} strokeLinecap="round" fill="none" />;
  };

  const hairBack = (() => {
    switch (c.hair) {
      case 'afro':
        return <circle cx={300} cy={300} r={215} fill={c.hairColor} />;
      case 'long':
        return <path d="M150,300 Q140,520 170,600 L430,600 Q460,520 450,300 Z" fill={c.hairColor} />;
      case 'locs':
        return (
          <g fill={c.hairColor}>
            {[-130, -100, -70, 100, 130, 160].map((dx, i) => (
              <rect key={i} x={300 + dx - 14} y={260} width={28} height={300 + (i % 2) * 40} rx={14} />
            ))}
          </g>
        );
      case 'bun':
        return <circle cx={300} cy={150} r={60} fill={c.hairColor} />;
      default:
        return null;
    }
  })();

  const hairFront = (() => {
    switch (c.hair) {
      case 'bald':
        return null;
      case 'buzz':
        return <path d="M150,300 Q150,150 300,150 Q450,150 450,300 Q440,260 300,250 Q160,260 150,300 Z" fill={c.hairColor} opacity={0.85} />;
      case 'fade':
        return <path d="M165,290 Q165,140 300,140 Q435,140 435,290 Q420,220 300,215 Q180,220 165,290 Z" fill={c.hairColor} />;
      case 'curly':
        return (
          <g fill={c.hairColor}>
            <path d="M150,310 Q150,150 300,150 Q450,150 450,310 Q440,250 300,240 Q160,250 150,310 Z" />
            {[160, 200, 245, 300, 355, 400, 440].map((x, i) => (
              <circle key={i} cx={x} cy={i % 2 ? 170 : 200} r={42} />
            ))}
          </g>
        );
      case 'long':
        return <path d="M150,330 Q150,150 300,150 Q450,150 450,330 Q440,250 330,235 Q250,230 150,330 Z" fill={c.hairColor} />;
      case 'afro':
        return <path d="M150,310 Q150,150 300,150 Q450,150 450,310 Q440,250 300,240 Q160,250 150,310 Z" fill={c.hairColor} />;
      case 'locs':
      case 'bun':
      case 'short':
      default:
        return <path d="M150,310 Q150,150 300,150 Q450,150 450,310 Q440,250 300,245 Q160,250 150,310 Z" fill={c.hairColor} />;
    }
  })();

  const facialHair = (() => {
    switch (c.facialHair) {
      case 'stubble':
        return <path d="M165,370 Q190,500 300,505 Q410,500 435,370 Q400,470 300,470 Q200,470 165,370 Z" fill={hairDark} opacity={0.28} />;
      case 'beard':
        return <path d="M160,360 Q180,520 300,530 Q420,520 440,360 Q410,445 300,450 Q190,445 160,360 Z" fill={c.hairColor} />;
      case 'goatee':
        return <path d="M255,440 Q300,520 345,440 Q300,470 255,440 Z" fill={c.hairColor} />;
      case 'mustache':
        return <path d="M248,398 Q300,382 352,398 Q330,406 300,402 Q270,406 248,398 Z" fill={c.hairColor} />;
      default:
        return null;
    }
  })();

  const glasses = (() => {
    if (c.glasses === 'none') return null;
    const stroke = '#1f1f1f';
    return c.glasses === 'round' ? (
      <g fill="none" stroke={stroke} strokeWidth={7}>
        <circle cx={245} cy={325} r={36} />
        <circle cx={355} cy={325} r={36} />
        <path d="M281,325 Q300,312 319,325" />
        <path d="M209,322 L160,312" />
        <path d="M391,322 L440,312" />
      </g>
    ) : (
      <g fill="none" stroke={stroke} strokeWidth={7}>
        <rect x={205} y={293} width={78} height={62} rx={14} />
        <rect x={317} y={293} width={78} height={62} rx={14} />
        <path d="M283,322 L317,322" />
        <path d="M205,318 L160,310" />
        <path d="M395,318 L440,310" />
      </g>
    );
  })();

  const accessory = (() => {
    switch (c.accessory) {
      case 'cap':
        return (
          <g>
            <path d="M140,300 Q140,135 300,135 Q460,135 460,300 Z" fill={c.accessoryColor} />
            <path d="M120,300 L480,300 Q520,300 520,330 Q400,345 120,330 Z" fill={darken(c.accessoryColor, 0.3)} />
          </g>
        );
      case 'beanie':
        return (
          <g>
            <path d="M140,330 Q140,120 300,120 Q460,120 460,330 Z" fill={c.accessoryColor} />
            <rect x={135} y={280} width={330} height={60} rx={20} fill={darken(c.accessoryColor, 0.25)} />
          </g>
        );
      case 'headphones':
        return (
          <g>
            <path d="M135,330 Q135,120 300,120 Q465,120 465,330" fill="none" stroke={c.accessoryColor} strokeWidth={16} />
            <rect x={110} y={300} width={50} height={90} rx={22} fill={c.accessoryColor} />
            <rect x={440} y={300} width={50} height={90} rx={22} fill={c.accessoryColor} />
          </g>
        );
      default:
        return null;
    }
  })();

  // Arms per pose. "Right" means screen-right (the viewer's right).
  const armsBack: React.ReactNode[] = [];
  const armsFront: React.ReactNode[] = [];
  const A = (p: ArmSpec) => <Arm {...p} skin={c.skin} sleeve={c.shirtColor} />;
  const w = frame;
  switch (pose) {
    case 'point':
      armsBack.push(A({from: SH_R, elbow: [540, 700], hand: [560, 820], handKind: 'none'}));
      armsFront.push(A({from: SH_L, elbow: [40, 620], hand: [-70, 540], handKind: 'point', angle: -90}));
      break;
    case 'crossed':
      armsBack.push(A({from: SH_L, elbow: [130, 650], hand: [410, 625], handKind: 'none'}));
      armsFront.push(A({from: SH_R, elbow: [470, 655], hand: [185, 640], handKind: 'fist'}));
      break;
    case 'think':
      armsBack.push(A({from: SH_L, elbow: [90, 720], hand: [80, 830], handKind: 'none'}));
      armsFront.push(A({from: SH_R, elbow: [540, 700], hand: [370, 470], handKind: 'fist'}));
      break;
    case 'shocked':
      armsFront.push(A({from: SH_L, elbow: [40, 480], hand: [110, 330], handKind: 'open', angle: -20}));
      armsFront.push(A({from: SH_R, elbow: [560, 480], hand: [490, 330], handKind: 'open', angle: 20}));
      break;
    case 'thumbsup':
      armsBack.push(A({from: SH_L, elbow: [90, 720], hand: [80, 830], handKind: 'none'}));
      armsFront.push(A({from: SH_R, elbow: [560, 640], hand: [560, 470], handKind: 'thumb'}));
      break;
    case 'facepalm':
      armsBack.push(A({from: SH_L, elbow: [90, 720], hand: [80, 830], handKind: 'none'}));
      break;
    case 'laugh':
      armsFront.push(A({from: SH_L, elbow: [110, 720], hand: [250, 720], handKind: 'fist'}));
      armsBack.push(A({from: SH_R, elbow: [520, 720], hand: [540, 830], handKind: 'none'}));
      break;
    case 'wave': {
      const wob = Math.sin(w / 4) * 40;
      armsBack.push(A({from: SH_L, elbow: [90, 720], hand: [80, 830], handKind: 'none'}));
      armsFront.push(A({from: SH_R, elbow: [560, 560], hand: [600 + wob, 380], handKind: 'open', angle: wob / 2}));
      break;
    }
    case 'shrug':
      armsFront.push(A({from: SH_L, elbow: [60, 680], hand: [10, 600], handKind: 'open', angle: -80}));
      armsFront.push(A({from: SH_R, elbow: [540, 680], hand: [590, 600], handKind: 'open', angle: 80}));
      break;
    default:
      armsBack.push(A({from: SH_L, elbow: [90, 720], hand: [80, 830], handKind: 'none'}));
      armsBack.push(A({from: SH_R, elbow: [510, 720], hand: [520, 830], handKind: 'none'}));
  }

  return (
    <svg viewBox="-120 60 840 760" width={width} style={{overflow: 'visible', transform: flip ? 'scaleX(-1)' : undefined, ...style}}>
      <g transform={`translate(0 ${bob})`}>
        {armsBack}
        {/* torso */}
        <path d={`M120,840 L120,660 Q120,560 220,545 L380,545 Q480,560 480,660 L480,840 Z`} fill={c.shirtColor} />
        {c.shirt === 'hoodie' ? (
          <g>
            <path d="M210,548 Q300,640 390,548 Q300,590 210,548 Z" fill={shirtDark} />
            <path d="M160,760 L440,760 L440,840 L160,840 Z" fill={shirtDark} opacity={0.5} />
            <path d="M300,600 L300,840" stroke={c.shirtAccent} strokeWidth={6} />
            <circle cx={300} cy={640} r={7} fill={c.shirtAccent} />
          </g>
        ) : c.shirt === 'jacket' ? (
          <g>
            <path d="M120,660 Q120,560 220,545 L300,640 L300,840 L120,840 Z" fill={shirtDark} />
            <path d="M220,545 L300,640 L262,560 Z" fill={c.shirtAccent} />
            <path d="M380,545 L300,640 L338,560 Z" fill={c.shirtAccent} />
          </g>
        ) : (
          <path d="M230,548 Q300,610 370,548" fill="none" stroke={shirtDark} strokeWidth={14} />
        )}
        {/* neck */}
        <rect x={258} y={430} width={84} height={140} rx={30} fill={darken(c.skin, 0.15)} />
        <g transform={`rotate(${expr.headTilt} 300 440)`}>
          {hairBack}
          {/* ears */}
          <ellipse cx={150} cy={340} rx={22} ry={32} fill={c.skin} />
          <ellipse cx={450} cy={340} rx={22} ry={32} fill={c.skin} />
          {/* head */}
          <path d="M150,310 Q150,150 300,150 Q450,150 450,310 L450,370 Q450,500 300,510 Q150,500 150,370 Z" fill={c.skin} />
          {facialHair}
          {hairFront}
          {accessory}
          {brow(245, expr.browL, 1)}
          {brow(355, expr.browR, -1)}
          {eye(245, expr.browL)}
          {eye(355, expr.browR)}
          {glasses}
          <path d="M292,340 Q278,380 300,386 Q322,380 308,340" fill="none" stroke={darken(c.skin, 0.3)} strokeWidth={6} strokeLinecap="round" />
          {mouthEl}
          {pose === 'facepalm' ? (
            <g>
              <polyline points="450,575 540,540 340,320" fill="none" stroke={c.skin} strokeWidth={54} strokeLinecap="round" strokeLinejoin="round" />
              <line x1={450} y1={575} x2={540} y2={540} stroke={c.shirtColor} strokeWidth={66} strokeLinecap="round" />
              <ellipse cx={305} cy={325} rx={92} ry={58} fill={c.skin} transform="rotate(-12 305 325)" />
              <path d="M225,345 L385,300" stroke={darken(c.skin, 0.25)} strokeWidth={5} strokeLinecap="round" />
            </g>
          ) : null}
        </g>
        {armsFront}
      </g>
    </svg>
  );
};
