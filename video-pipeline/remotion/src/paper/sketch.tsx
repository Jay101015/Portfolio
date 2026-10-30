import React from 'react';
import {useCurrentFrame} from 'remotion';

/** Living lines: on, every sketched shape is regenerated with a fresh wobble every few frames (drawn animation's
 * "boil"), so a finished board never sits dead still. Video.tsx provides it from brand.boil. */
export const BoilContext = React.createContext<boolean>(false);
const BOIL_EVERY = 4; // frames per wobble: about 7 a second at 30 fps, the pace of animation drawn on threes
const BOIL_VARIANTS = 3;
export const useBoil = () => {
  const on = React.useContext(BoilContext);
  const frame = useCurrentFrame();
  return on ? Math.floor(frame / BOIL_EVERY) % BOIL_VARIANTS : 0;
};
const boiled = (options: Options | undefined, boil: number): Options => (boil ? {...options, seed: ((options?.seed ?? 1) + boil * 7919) % 2147483647} : {...options, seed: options?.seed ?? 1});
import rough from 'roughjs';
import type {Options} from 'roughjs/bin/core';

/**
 * Hand-drawn primitives for the paper look, built on rough.js's generator (no DOM needed, so it renders the same
 * on every frame and every machine). Every shape takes a `seed` so the wobble is stable from frame to frame;
 * `draw` (0..1) draws the strokes on like a pen. Pass `win` ([from, to] in scene frames, `easeOut` for a cubic ease)
 * instead and the shape draws itself over that window and publishes the timing, so the whiteboard hand can travel
 * to it and along it.
 */
const gen = rough.generator();
type PathInfo = ReturnType<typeof gen.toPaths>;

type Win = [number, number];
type Props = {draw?: number; win?: Win; easeOut?: boolean; opacity?: number};

/** how far a shape is drawn at this frame: from its window when it has one, else the `draw` it was given */
const useDraw = (draw: number | undefined, win: Win | undefined, easeOut: boolean | undefined) => {
  const frame = useCurrentFrame();
  if (!win) return draw ?? 1;
  const u = Math.max(0, Math.min(1, (frame - win[0]) / Math.max(1e-6, win[1] - win[0])));
  return easeOut ? 1 - Math.pow(1 - u, 3) : u;
};

/** rough length of a subpath: the polyline through its coordinates (control points included; close enough to pace a pen) */
const approxLen = (d: string) => {
  const nums = d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
  let len = 0;
  for (let i = 2; i + 1 < nums.length; i += 2) len += Math.hypot(nums[i] - nums[i - 2], nums[i + 1] - nums[i - 1]);
  return len;
};

/** split a path into its subpaths and pace them one after another, so the pen finishes a stroke before starting the next */
const Strokes: React.FC<{p: PathInfo[number]; draw: number; pen: boolean; win?: Win; easeOut?: boolean}> = ({p, draw, pen, win, easeOut}) => {
  const parts = React.useMemo(() => {
    const subs = p.d.split(/(?=M)/i).map((x) => x.trim()).filter(Boolean);
    const lens = subs.map(approxLen);
    const total = lens.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    return subs.map((d, i) => {
      const from = acc / total;
      acc += lens[i];
      return {d, from, to: acc / total};
    });
  }, [p.d]);
  const fill = p.fill === 'none' ? 'none' : p.fill;
  // with a window, the pen stroke's subpaths stay in the DOM (hidden until drawn) so the hand can read the timeline
  const timed = pen && !!win;
  if (draw >= 1 && !timed) return <path d={p.d} stroke={p.stroke} strokeWidth={p.strokeWidth} fill={fill} strokeLinecap="round" strokeLinejoin="round" />;
  return (
    <>
      {parts.map((part, i) => {
        const q = Math.max(0, Math.min(1, (draw - part.from) / Math.max(1e-6, part.to - part.from)));
        if (q <= 0 && !timed) return null;
        const writing = q < 1;
        return (
          <path
            key={i}
            d={part.d}
            stroke={p.stroke}
            strokeWidth={p.strokeWidth}
            fill={fill}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={writing ? 1 : undefined}
            strokeDasharray={writing ? 1 : undefined}
            strokeDashoffset={writing ? 1 - q : undefined}
            visibility={q <= 0 ? 'hidden' : undefined}
            data-pen-win={timed ? `${win![0]},${win![1]},${easeOut ? 'e' : 'l'}` : undefined}
            data-pen-sub={timed ? `${part.from},${part.to}` : undefined}
          />
        );
      })}
    </>
  );
};

const Paths: React.FC<{paths: PathInfo; draw?: number; win?: Win; easeOut?: boolean; opacity?: number}> = ({paths, draw, win, easeOut, opacity}) => {
  const d = useDraw(draw, win, easeOut);
  // rough.js emits the fill paths first and the pen stroke last; the hand follows the pen stroke
  const penIdx = paths.length - 1;
  return (
    <g opacity={opacity}>
      {paths.map((p, i) => (
        <Strokes key={i} p={p} draw={d} pen={i === penIdx} win={win} easeOut={easeOut} />
      ))}
    </g>
  );
};

export const SketchPath: React.FC<Props & {d: string; options?: Options}> = ({d, options, draw, win, easeOut, opacity}) => {
  const boil = useBoil();
  const paths = React.useMemo(() => gen.toPaths(gen.path(d, {roughness: 1.3, bowing: 1, strokeWidth: 4, ...boiled(options, boil)})), [d, options, boil]);
  return <Paths paths={paths} draw={draw} win={win} easeOut={easeOut} opacity={opacity} />;
};

export const SketchLine: React.FC<Props & {x1: number; y1: number; x2: number; y2: number; options?: Options}> = ({x1, y1, x2, y2, options, draw, win, easeOut, opacity}) => {
  const boil = useBoil();
  const paths = React.useMemo(() => gen.toPaths(gen.line(x1, y1, x2, y2, {roughness: 1.2, strokeWidth: 4, ...boiled(options, boil)})), [x1, y1, x2, y2, options, boil]);
  return <Paths paths={paths} draw={draw} win={win} easeOut={easeOut} opacity={opacity} />;
};

export const SketchRect: React.FC<Props & {x: number; y: number; w: number; h: number; options?: Options}> = ({x, y, w, h, options, draw, win, easeOut, opacity}) => {
  const boil = useBoil();
  const paths = React.useMemo(() => gen.toPaths(gen.rectangle(x, y, w, h, {roughness: 1.1, strokeWidth: 4, ...boiled(options, boil)})), [x, y, w, h, options, boil]);
  return <Paths paths={paths} draw={draw} win={win} easeOut={easeOut} opacity={opacity} />;
};

export const SketchEllipse: React.FC<Props & {cx: number; cy: number; w: number; h: number; options?: Options}> = ({cx, cy, w, h, options, draw, win, easeOut, opacity}) => {
  const boil = useBoil();
  const paths = React.useMemo(() => gen.toPaths(gen.ellipse(cx, cy, w, h, {roughness: 1.4, strokeWidth: 4, ...boiled(options, boil)})), [cx, cy, w, h, options, boil]);
  return <Paths paths={paths} draw={draw} win={win} easeOut={easeOut} opacity={opacity} />;
};

/** A hand-drawn underline that draws on left to right, slightly wavy, like a pen under a word. */
export const Underline: React.FC<{width: number; stroke: string; thickness?: number; draw?: number; win?: Win; easeOut?: boolean; seed?: number; style?: React.CSSProperties}> = ({width, stroke, thickness = 6, draw, win, easeOut, seed = 1, style}) => {
  const h = thickness * 4;
  const d = `M4,${h / 2} Q${width * 0.35},${h / 2 - thickness * 0.8} ${width * 0.6},${h / 2} T${width - 4},${h / 2}`;
  const options = React.useMemo(() => ({stroke, strokeWidth: thickness, roughness: 1.6, seed}), [stroke, thickness, seed]);
  return (
    <svg width={width} height={h} viewBox={`0 0 ${width} ${h}`} style={{display: 'block', overflow: 'visible', ...style}}>
      <SketchPath d={d} draw={draw} win={win} easeOut={easeOut} options={options} />
    </svg>
  );
};

/** A marker ring drawn round a figure as it is said: one pass of the pen, a little tilted, over `win`. Put it inside
 * a `position: relative` box the size of the figure (give it that width and height); it draws outside the box. */
export const Ring: React.FC<{width: number; height: number; stroke: string; win: Win; thickness?: number; seed?: number}> = ({width, height, stroke, win, thickness = 6, seed = 4}) => {
  const px = width * 0.07 + thickness * 2;
  const py = height * 0.1 + thickness * 2;
  const w = width + px * 2;
  const h = height + py * 2;
  const options = React.useMemo(() => ({stroke, strokeWidth: thickness, roughness: 1.6, bowing: 1.8, seed, curveStepCount: 14}), [stroke, thickness, seed]);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{position: 'absolute', left: -px, top: -py, overflow: 'visible', pointerEvents: 'none', transform: 'rotate(-3deg)'}}>
      <SketchEllipse cx={w / 2} cy={h / 2} w={w - thickness * 2} h={h - thickness * 2} win={win} easeOut options={options} />
    </svg>
  );
};

/** about how wide a figure is in the display face (Caveat Brush: narrow digits), for the ring round it */
export const figureWidth = (text: string, fontSize: number) => text.length * fontSize * 0.38;
export const figureHeight = (fontSize: number) => fontSize * 0.82;

/** A highlighter swipe behind text: a slightly skewed, uneven bar that wipes in. */
export const Marker: React.FC<{progress: number; color: string; children: React.ReactNode; pad?: number}> = ({progress, color, children, pad = 6}) => (
  <span style={{position: 'relative', display: 'inline-block'}}>
    <span style={{position: 'absolute', left: -pad, right: -pad, top: '14%', bottom: '4%', background: color, opacity: 0.8, transform: `skewX(-6deg) scaleX(${Math.max(0, Math.min(1, progress))})`, transformOrigin: 'left center', borderRadius: 4, zIndex: 0}} />
    <span style={{position: 'relative', zIndex: 1}}>{children}</span>
  </span>
);

/** A short hand-drawn arrow, pointing to the right by default; rotate with `angle`. */
export const Arrow: React.FC<{length: number; stroke: string; draw?: number; win?: Win; angle?: number; seed?: number; thickness?: number; style?: React.CSSProperties}> = ({length, stroke, draw = 1, win, angle = 0, seed = 2, thickness = 4, style}) => {
  const h = 60;
  const shaft = `M4,${h / 2} Q${length * 0.5},${h / 2 - 14} ${length - 10},${h / 2}`;
  const head = `M${length - 30},${h / 2 - 18} L${length - 6},${h / 2} L${length - 30},${h / 2 + 18}`;
  const o1 = React.useMemo(() => ({stroke, strokeWidth: thickness, roughness: 1.4, seed}), [stroke, thickness, seed]);
  const o2 = React.useMemo(() => ({stroke, strokeWidth: thickness, roughness: 1.4, seed: seed + 1}), [stroke, thickness, seed]);
  return (
    <svg width={length} height={h} viewBox={`0 0 ${length} ${h}`} style={{display: 'block', overflow: 'visible', transform: `rotate(${angle}deg)`, ...style}}>
      {win ? (
        // the shaft takes the first 77% of the window, the head the last 62% (they overlap a little, as a hand does)
        <>
          <SketchPath d={shaft} win={[win[0], win[0] + (win[1] - win[0]) / 1.3]} options={o1} />
          <SketchPath d={head} win={[win[0] + ((win[1] - win[0]) * 0.6) / 1.6, win[1]]} options={o2} />
        </>
      ) : (
        <>
          <SketchPath d={shaft} draw={Math.min(1, draw * 1.3)} options={o1} />
          <SketchPath d={head} draw={Math.max(0, draw * 1.6 - 0.6)} options={o2} />
        </>
      )}
    </svg>
  );
};

export {gen as roughGen};
