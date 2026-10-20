import React from 'react';
import {FACES, POSES, defaultFaceFor, type Face, type Pose} from './Avatar';
import hostInfo from '../../public/host/host.json';

/**
 * The painted host: a generated portrait cut into layers (body, head, brows,
 * irises, glasses) by pipeline/host_rig.py and held still, like the host of a
 * storytime channel. Only the eyes, brows and mouth change: pupils glance and
 * blink, lids and brows follow the expression, a small opening is painted under
 * the lips when the host talks, and reaction marks pop beside the head on a
 * pose or expression change. A pose change is a cut, never a slide.
 */
export type HostInfo = typeof hostInfo;
export {FACES, POSES};

const W = 1856;
const VIEW_H = 1680; // the visible bust: 1856x1680 keeps the drawn character's 840:760 proportions
const INK = '#1a1012';
const MOUTH = '#2a1416';
const RED = '#e5484d';
const BLUE = '#3b7dd8';
const GOLD = '#ffb020';

type Pt = [number, number];
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
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


export type RasterHostProps = {
  pose: Pose;
  face?: Face;
  prevPose?: Pose;
  prevFace?: Face;
  sinceChange?: number;
  mouth: number;
  viseme?: number;
  lookX?: number;
  attention?: number;
  frame: number;
  width?: number;
  flip?: boolean;
  style?: React.CSSProperties;
  /** Loudness of the voice this frame, 0..1 (kept for callers; the mouth opens on `mouth` and `viseme`). */
  talk?: number;
  /** Resolves a layer file name to a URL (Remotion: staticFile; the studio: a relative path). */
  src: (name: string) => string;
  /** Decoded layers. When given, the painted layers are drawn on a canvas, synchronously, so a frame can never miss one. */
  bitmaps?: Map<string, ImageBitmap> | null;
  info?: HostInfo;
};

export const RasterHost: React.FC<RasterHostProps> = ({pose, face, prevPose, prevFace, sinceChange = 999, mouth, viseme = 0, lookX = 0, attention = 0.3, frame, width = 600, flip = false, style, src, bitmaps = null, info = hostInfo}) => {
  type DrawOp = (ctx: CanvasRenderingContext2D) => void;
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const ops: DrawOp[] | null = bitmaps ? [] : null;
  React.useLayoutEffect(() => {
    const c = canvasRef.current;
    if (!c || !ops) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, VIEW_H);
    ops.forEach((op) => op(ctx));
  });
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const since2 = Math.floor(Math.max(0, sinceChange) / 2) * 2;
  const twFace = clamp01(since2 / 6); // an expression settles over a few frames, on twos
  const expr: Face = face ?? defaultFaceFor(pose);
  const prevExpr: Face = prevFace ?? (prevPose ? defaultFaceFor(prevPose) : expr);
  const loud = clamp01(mouth);
  const skin = info.colors.skin;
  const hasGlasses = Boolean((info as {glasses?: boolean}).glasses) && 'glasses.png' in info.boxes;

  // ------------------------------------------------------------ glances and blinks
  const cycle = 120; // frames between chances to glance
  const ci = Math.floor(frame / cycle);
  const phase = (frame + Math.floor(hash(ci) * 40)) % cycle;
  const glanceLen = 20 + attention * 40;
  const glancing = lookX !== 0 && hash(ci + 7) < attention + 0.2 && phase < glanceLen && sinceChange > 24; // only the pupils move
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
  const Layer: React.FC<{name: keyof typeof info.boxes; dx?: number; dy?: number; rot?: number; pivot?: Pt; opacity?: number}> = ({name, dx = 0, dy = 0, rot = 0, pivot, opacity}) => {
    const [x0, y0, x1, y1] = box(name);
    if (ops) {
      ops.push((ctx) => {
        const bm = bitmaps?.get(name);
        if (!bm) return;
        ctx.save();
        if (opacity !== undefined) ctx.globalAlpha = opacity;
        ctx.translate(dx, dy);
        if (rot && pivot) {
          ctx.translate(pivot[0], pivot[1]);
          ctx.rotate((rot * Math.PI) / 180);
          ctx.translate(-pivot[0], -pivot[1]);
        }
        ctx.drawImage(bm, x0, y0, x1 - x0, y1 - y0);
        ctx.restore();
      });
      return null;
    }
    const transform = [dx || dy ? `translate(${dx} ${dy})` : '', rot && pivot ? `rotate(${rot} ${pivot[0]} ${pivot[1]})` : ''].join(' ').trim() || undefined;
    return <image href={src(name)} x={x0} y={y0} width={x1 - x0} height={y1 - y0} transform={transform} opacity={opacity} />;
  };

  // ------------------------------------------------------------ eyes: lids, blinks and laugh arcs painted over the portrait
  const eyesShut = blinking || F.closed > 0.5;
  type Prim = {d: string; fill?: string; stroke?: string; sw?: number; clipD?: string};
  const Eye: React.FC<{side: 'l' | 'r'}> = ({side}) => {
    const e = side === 'l' ? info.eye_shape_l : info.eye_shape_r;
    const sign = side === 'l' ? 1 : -1; // outer corner is toward the ear
    const outer = e.cx - sign * e.rx;
    const inner = e.cx + sign * e.rx;
    const top = e.cy - e.ry * F.eyeOpen - 6;
    const lidLine = (yo: number, yi: number) => `M${outer},${yo} Q${e.cx},${Math.min(yo, yi) - 6} ${inner},${yi}`;
    const ellipseD = (rx: number, ry: number) => `M${e.cx - rx},${e.cy} a${rx},${ry} 0 1,0 ${2 * rx},0 a${rx},${ry} 0 1,0 ${-2 * rx},0 Z`;
    const prims: Prim[] = [];
    let pupil: {clipD: string; dx: number; dy: number} | null = null;
    if (F.laughEyes > 0.5) {
      prims.push({d: ellipseD(e.rx + 10, e.ry + 10), fill: skin});
      prims.push({d: `M${outer},${e.cy + 6} Q${e.cx},${e.cy - 34} ${inner},${e.cy + 4}`, stroke: INK, sw: 9});
    } else if (eyesShut) {
      const droop = expr === 'sad' ? 14 : 8;
      prims.push({d: ellipseD(e.rx + 12, e.ry + 10), fill: skin});
      prims.push({d: `M${outer},${e.cy - 2} Q${e.cx},${e.cy + droop} ${inner},${e.cy - 4}`, stroke: INK, sw: 7});
      prims.push({d: `M${outer},${e.cy - 2} L${outer - sign * 12},${e.cy - 12}`, stroke: INK, sw: 5});
    } else {
      const lo = side === 'l' ? F.lidOuter : F.lidOuterR;
      const li = side === 'l' ? F.lidInner : F.lidInnerR;
      if (gazeInfo) pupil = {clipD: ellipseD(e.rx - 6, e.ry - 3), dx: gazeX, dy: gazeY};
      if (lo >= 0.05 || li >= 0.05) {
        // a skin-coloured lid comes down over the eye: 0 = open, 1 = shut
        const yo = e.cy - e.ry + lo * (2 * e.ry);
        const yi = e.cy - e.ry + li * (2 * e.ry);
        const clipD = ellipseD(e.rx + 4, e.ry + 4);
        prims.push({d: `M${outer - sign * 10},${top} L${inner + sign * 10},${top} L${inner + sign * 10},${yi} Q${e.cx},${Math.min(yo, yi) - 4} ${outer - sign * 10},${yo} Z`, fill: skin, clipD});
        prims.push({d: lidLine(yo, yi), stroke: INK, sw: 6, clipD});
      }
    }
    const irisName = `iris-${side}.png` as keyof typeof info.boxes;
    if (ops) {
      if (pupil) {
        const pp = pupil;
        const [x0, y0, x1, y1] = box(irisName);
        ops.push((ctx) => {
          const bm = bitmaps?.get(irisName);
          if (!bm) return;
          ctx.save();
          ctx.clip(new Path2D(pp.clipD));
          ctx.drawImage(bm, x0 + pp.dx, y0 + pp.dy, x1 - x0, y1 - y0);
          ctx.restore();
        });
      }
      prims.forEach((pr) =>
        ops.push((ctx) => {
          ctx.save();
          if (pr.clipD) ctx.clip(new Path2D(pr.clipD));
          const path = new Path2D(pr.d);
          if (pr.fill) {
            ctx.fillStyle = pr.fill;
            ctx.fill(path);
          }
          if (pr.stroke) {
            ctx.strokeStyle = pr.stroke;
            ctx.lineWidth = pr.sw ?? 6;
            ctx.lineCap = 'round';
            ctx.stroke(path);
          }
          ctx.restore();
        }),
      );
      return null;
    }
    return (
      <g>
        {pupil ? (
          <g>
            <clipPath id={`eye-${uid}-${side}`}>
              <path d={pupil.clipD} />
            </clipPath>
            <g clipPath={`url(#eye-${uid}-${side})`}>
              <Layer name={irisName} dx={pupil.dx} dy={pupil.dy} />
            </g>
          </g>
        ) : null}
        {prims.map((pr, k) => {
          const el = <path key={k} d={pr.d} fill={pr.fill ?? 'none'} stroke={pr.stroke} strokeWidth={pr.sw} strokeLinecap="round" />;
          if (!pr.clipD) return el;
          return (
            <g key={k}>
              <clipPath id={`lid-${uid}-${side}-${k}`}>
                <path d={pr.clipD} />
              </clipPath>
              <g clipPath={`url(#lid-${uid}-${side}-${k})`}>{el}</g>
            </g>
          );
        })}
      </g>
    );
  };

  // ------------------------------------------------------------ mouth
  // Only the lips move. The chin and jaw stay painted; the mouth line is the fixed roof of a small
  // opening and the lower lip line drops a little below it. Nothing lifts, nothing stretches.
  type LipShape = {gap: number; sx: number};
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
  const bl = box('brow-l.png');
  const br = box('brow-r.png');
  const browPivotL: Pt = [bl[2] - 10, (bl[1] + bl[3]) / 2];
  const browPivotR: Pt = [br[0] + 10, (br[1] + br[3]) / 2];

  const tree = (
    <g>
      <Layer name="body.png" />
      <Layer name="head.png" />
      <Layer name="brow-l.png" dy={F.browY - browLift} rot={F.browLA} pivot={browPivotL} />
      <Layer name="brow-r.png" dy={F.browRY - browLift} rot={-F.browRA} pivot={browPivotR} />
      <Eye side="l" />
      <Eye side="r" />
      <Mouth />
      {hasGlasses ? <Layer name={'glasses.png' as keyof typeof info.boxes} /> : null}
      <Emanata />
    </g>
  );
  if (ops) {
    // The painted layers, brows, pupils and lids are drawn on the canvas in the order they appear above;
    // the SVG on top carries only the drawn mouth and the reaction marks.
    return (
      <div style={{position: 'relative', width, aspectRatio: `${W} / ${VIEW_H}`, transform: flip ? 'scaleX(-1)' : undefined, ...style}}>
        <canvas ref={canvasRef} width={W} height={VIEW_H} style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />
        <svg viewBox={`0 0 ${W} ${VIEW_H}`} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible'}}>
          {tree}
        </svg>
      </div>
    );
  }
  return (
    <svg viewBox={`0 0 ${W} ${VIEW_H}`} width={width} style={{overflow: 'visible', transform: flip ? 'scaleX(-1)' : undefined, ...style}}>
      {tree}
    </svg>
  );
};
