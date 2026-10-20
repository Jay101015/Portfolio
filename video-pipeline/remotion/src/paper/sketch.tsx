import React from 'react';
import rough from 'roughjs';
import type {Options} from 'roughjs/bin/core';

/**
 * Hand-drawn primitives for the paper look, built on rough.js's generator (no DOM needed, so it renders the same
 * on every frame and every machine). Every shape takes a `seed` so the wobble is stable from frame to frame;
 * `draw` (0..1) draws the strokes on like a pen.
 */
const gen = rough.generator();
type PathInfo = ReturnType<typeof gen.toPaths>;

type Props = {draw?: number; opacity?: number};

const Paths: React.FC<{paths: PathInfo; draw: number; opacity?: number}> = ({paths, draw, opacity}) => (
  <g opacity={opacity}>
    {paths.map((p, i) => (
      <path key={i} d={p.d} stroke={p.stroke} strokeWidth={p.strokeWidth} fill={p.fill === 'none' ? 'none' : p.fill} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={draw < 1 ? 1 : undefined} strokeDashoffset={draw < 1 ? 1 - draw : undefined} />
    ))}
  </g>
);

export const SketchPath: React.FC<Props & {d: string; options?: Options}> = ({d, options, draw = 1, opacity}) => {
  const paths = React.useMemo(() => gen.toPaths(gen.path(d, {roughness: 1.3, bowing: 1, strokeWidth: 4, ...options})), [d, options]);
  return <Paths paths={paths} draw={draw} opacity={opacity} />;
};

export const SketchLine: React.FC<Props & {x1: number; y1: number; x2: number; y2: number; options?: Options}> = ({x1, y1, x2, y2, options, draw = 1, opacity}) => {
  const paths = React.useMemo(() => gen.toPaths(gen.line(x1, y1, x2, y2, {roughness: 1.2, strokeWidth: 4, ...options})), [x1, y1, x2, y2, options]);
  return <Paths paths={paths} draw={draw} opacity={opacity} />;
};

export const SketchRect: React.FC<Props & {x: number; y: number; w: number; h: number; options?: Options}> = ({x, y, w, h, options, draw = 1, opacity}) => {
  const paths = React.useMemo(() => gen.toPaths(gen.rectangle(x, y, w, h, {roughness: 1.1, strokeWidth: 4, ...options})), [x, y, w, h, options]);
  return <Paths paths={paths} draw={draw} opacity={opacity} />;
};

export const SketchEllipse: React.FC<Props & {cx: number; cy: number; w: number; h: number; options?: Options}> = ({cx, cy, w, h, options, draw = 1, opacity}) => {
  const paths = React.useMemo(() => gen.toPaths(gen.ellipse(cx, cy, w, h, {roughness: 1.4, strokeWidth: 4, ...options})), [cx, cy, w, h, options]);
  return <Paths paths={paths} draw={draw} opacity={opacity} />;
};

/** A hand-drawn underline that draws on left to right, slightly wavy, like a pen under a word. */
export const Underline: React.FC<{width: number; stroke: string; thickness?: number; draw: number; seed?: number; style?: React.CSSProperties}> = ({width, stroke, thickness = 6, draw, seed = 1, style}) => {
  const h = thickness * 4;
  const d = `M4,${h / 2} Q${width * 0.35},${h / 2 - thickness * 0.8} ${width * 0.6},${h / 2} T${width - 4},${h / 2}`;
  const options = React.useMemo(() => ({stroke, strokeWidth: thickness, roughness: 1.6, seed}), [stroke, thickness, seed]);
  return (
    <svg width={width} height={h} viewBox={`0 0 ${width} ${h}`} style={{display: 'block', overflow: 'visible', ...style}}>
      <SketchPath d={d} draw={draw} options={options} />
    </svg>
  );
};

/** A highlighter swipe behind text: a slightly skewed, uneven bar that wipes in. */
export const Marker: React.FC<{progress: number; color: string; children: React.ReactNode; pad?: number}> = ({progress, color, children, pad = 6}) => (
  <span style={{position: 'relative', display: 'inline-block'}}>
    <span style={{position: 'absolute', left: -pad, right: -pad, top: '14%', bottom: '4%', background: color, opacity: 0.8, transform: `skewX(-6deg) scaleX(${Math.max(0, Math.min(1, progress))})`, transformOrigin: 'left center', borderRadius: 4, zIndex: 0}} />
    <span style={{position: 'relative', zIndex: 1}}>{children}</span>
  </span>
);

/** A short hand-drawn arrow, pointing to the right by default; rotate with `angle`. */
export const Arrow: React.FC<{length: number; stroke: string; draw: number; angle?: number; seed?: number; thickness?: number; style?: React.CSSProperties}> = ({length, stroke, draw, angle = 0, seed = 2, thickness = 4, style}) => {
  const h = 60;
  const shaft = `M4,${h / 2} Q${length * 0.5},${h / 2 - 14} ${length - 10},${h / 2}`;
  const head = `M${length - 30},${h / 2 - 18} L${length - 6},${h / 2} L${length - 30},${h / 2 + 18}`;
  const o1 = React.useMemo(() => ({stroke, strokeWidth: thickness, roughness: 1.4, seed}), [stroke, thickness, seed]);
  const o2 = React.useMemo(() => ({stroke, strokeWidth: thickness, roughness: 1.4, seed: seed + 1}), [stroke, thickness, seed]);
  return (
    <svg width={length} height={h} viewBox={`0 0 ${length} ${h}`} style={{display: 'block', overflow: 'visible', transform: `rotate(${angle}deg)`, ...style}}>
      <SketchPath d={shaft} draw={Math.min(1, draw * 1.3)} options={o1} />
      <SketchPath d={head} draw={Math.max(0, draw * 1.6 - 0.6)} options={o2} />
    </svg>
  );
};

export {gen as roughGen};
