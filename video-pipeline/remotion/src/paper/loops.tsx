import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene} from '../types';
import {useLayout} from '../components/layout';
import {SketchEllipse, SketchPath, SketchRect} from './sketch';
import {PLACE} from './art';

/**
 * Drawn loops: small animations in the line style that any scene can place where a drawing would go
 * (`anim=coins-jar`, with the same art_at / art_size / art_start): coins dropping into a jar, notes stacking up, the
 * brand's arrow drawing itself, a clock sweeping, a plant growing. Each runs a few seconds, breathes, and goes again.
 * Built from the sketch primitives, so they boil with the rest of the page. The "little animations" Jeffrey asked
 * for, without a character.
 */
export const LOOPS = ['coins-jar', 'stack-grow', 'arrow-up', 'clock', 'plant-grow'] as const;
const clamp01 = (q: number) => Math.max(0, Math.min(1, q));
const easeOut = (q: number) => 1 - Math.pow(1 - clamp01(q), 3);

export const DrawnLoop: React.FC<{name: string; size: number; brand: Brand; start: number; seed: number; style?: React.CSSProperties}> = ({name, size, brand, start, seed, style}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = (frame - start) / fps;
  if (t < 0) return null;
  const sw = 2.2;
  const o = (stroke: string, k: number, extra: Record<string, unknown> = {}) => ({stroke, strokeWidth: sw, roughness: 1.1, seed: seed * 11 + k, ...extra});
  const ink = brand.ink;
  const green = brand.fill ?? brand.accent;
  let body: React.ReactNode = null;
  if (name === 'coins-jar') {
    // a jar; six coins drop in one by one, each squashing as it lands, then a breath, then again
    const P = 4.4;
    const tt = t % P;
    const coins: React.ReactNode[] = [];
    for (let i = 0; i < 6; i++) {
      const dt = tt - i * 0.5;
      if (dt < 0) continue;
      const fall = Math.pow(clamp01(dt / 0.38), 2);
      const level = 88 - i * 5.4;
      const y = -10 + (level + 10) * fall;
      const sq = dt > 0.38 && dt < 0.5 ? 1.22 : 1;
      const x = 50 + (i % 2 ? 7 : -7) * (i > 0 ? 1 : 0);
      coins.push(<SketchEllipse key={i} cx={x} cy={y} w={19 * sq} h={7.5 / sq} draw={1} options={o(ink, 20 + i, {fill: green, fillStyle: 'solid', strokeWidth: sw * 0.9})} />);
    }
    body = (
      <>
        <SketchPath d="M30,34 L30,88 Q30,94 36,94 L64,94 Q70,94 70,88 L70,34" draw={1} options={o(ink, 1, {strokeWidth: sw * 1.25})} />
        <SketchPath d="M26,34 L74,34" draw={1} options={o(ink, 2, {strokeWidth: sw * 1.25})} />
        <SketchPath d="M34,27 L66,27" draw={1} options={o(ink, 3)} />
        {coins}
      </>
    );
  } else if (name === 'stack-grow') {
    // notes slide in from the right and stack, the top one green
    const P = 4.6;
    const tt = t % P;
    const notes: React.ReactNode[] = [];
    for (let i = 0; i < 7; i++) {
      const dt = tt - i * 0.42;
      if (dt < 0) continue;
      const q = easeOut(dt / 0.35);
      const y = 84 - i * 7.2;
      const x = 50 + (1 - q) * 64;
      const top = i === 6;
      notes.push(<SketchRect key={i} x={x - 26} y={y - 4} w={52} h={9} draw={1} options={o(top ? green : ink, 30 + i, {fill: top ? green : '#ffffff', fillStyle: 'solid'})} />);
    }
    body = (
      <>
        {notes}
        <SketchPath d="M10,92 L90,92" draw={1} options={o(ink, 4)} />
      </>
    );
  } else if (name === 'arrow-up') {
    // the brand's arrow drawing itself up and to the right, the head landing with a pulse
    const P = 3.6;
    const tt = t % P;
    const pulse = tt > 1.3 && tt < 1.7 ? 1 + 0.14 * Math.sin(((tt - 1.3) / 0.4) * Math.PI) : 1;
    body = (
      <>
        <SketchPath d="M12,80 L34,60 L46,70 L84,28" draw={clamp01(tt / 1.3)} options={o(green, 5, {strokeWidth: sw * 2.4})} />
        <g transform={`translate(84 28) scale(${pulse}) translate(-84 -28)`}>
          <SketchPath d="M66,26 L86,26 L86,46" draw={clamp01((tt - 1.0) / 0.3)} options={o(green, 6, {strokeWidth: sw * 2.4})} />
        </g>
      </>
    );
  } else if (name === 'clock') {
    const P = 6;
    const tt = t % P;
    const a = (tt / P) * Math.PI * 4 - Math.PI / 2;
    const hr = ((tt / P) * Math.PI) / 3 - Math.PI / 2 + (seed % 7) * 0.9;
    body = (
      <>
        <SketchEllipse cx={50} cy={50} w={76} h={76} draw={1} options={o(ink, 7, {strokeWidth: sw * 1.3})} />
        {[0, 1, 2, 3].map((k) => {
          const ang = (k * Math.PI) / 2;
          return <SketchPath key={k} d={`M${50 + Math.cos(ang) * 31},${50 + Math.sin(ang) * 31} L${50 + Math.cos(ang) * 36},${50 + Math.sin(ang) * 36}`} draw={1} options={o(ink, 8 + k)} />;
        })}
        <SketchPath d={`M50,50 L${50 + Math.cos(hr) * 18},${50 + Math.sin(hr) * 18}`} draw={1} options={o(ink, 12, {strokeWidth: sw * 1.7})} />
        <SketchPath d={`M50,50 L${50 + Math.cos(a) * 28},${50 + Math.sin(a) * 28}`} draw={1} options={o(green, 13, {strokeWidth: sw * 1.3})} />
      </>
    );
  } else if (name === 'plant-grow') {
    // a pot; the stem grows, two leaves open, a flower the colour of the marker on top; then again
    const P = 5;
    const tt = t % P;
    const g = easeOut(tt / 2.4);
    body = (
      <>
        <SketchPath d="M34,86 L66,86 L62,97 L38,97 Z" draw={1} options={o(ink, 14)} />
        <SketchPath d="M50,86 Q48,70 50,56 Q52,42 50,30" draw={g} options={o(green, 15, {strokeWidth: sw * 1.5})} />
        {g > 0.45 ? <SketchPath d="M50,62 Q38,58 34,48 Q46,48 50,62" draw={clamp01((g - 0.45) / 0.25)} options={o(green, 16, {fill: green, fillStyle: 'hachure', hachureGap: 3})} /> : null}
        {g > 0.65 ? <SketchPath d="M50,50 Q62,46 66,36 Q54,36 50,50" draw={clamp01((g - 0.65) / 0.25)} options={o(green, 17, {fill: green, fillStyle: 'hachure', hachureGap: 3})} /> : null}
        {g > 0.9 ? <SketchEllipse cx={50} cy={27} w={13} h={13} draw={clamp01((g - 0.9) / 0.1)} options={o(brand.accent2, 18, {fill: brand.marker ?? '#ffe66d', fillStyle: 'solid'})} /> : null}
      </>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{overflow: 'visible', display: 'block', ...style}}>
      {body}
    </svg>
  );
};

/** A drawn loop placed on a scene the way a drawing is (`anim=`, art_at, art_size, art_start). */
export const LoopLayer: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  const {fps} = useVideoConfig();
  const {height, width, isVertical} = useLayout();
  const name = scene.props.anim ? String(scene.props.anim) : '';
  if (!name || !brand.board || !(LOOPS as readonly string[]).includes(name)) return null;
  const at = isVertical ? 'bl' : String(scene.props.art_at ?? 'tr');
  const size = height * (isVertical ? Math.min(0.2, Number(scene.props.art_size ?? 0.2)) : Math.max(0.12, Math.min(0.6, Number(scene.props.art_size ?? 0.28))));
  const start = Math.round(Number(scene.props.art_start ?? 0.6) * fps);
  const free = scene.props.art_x !== undefined && scene.props.art_y !== undefined;
  const place: React.CSSProperties = free ? {left: Number(scene.props.art_x) * width - size / 2, top: Number(scene.props.art_y) * height - size / 2} : PLACE[at] ?? PLACE.tr;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div style={{position: 'absolute', ...place, width: size, height: size}}>
        <DrawnLoop name={name} size={size} brand={brand} start={start} seed={scene.id * 3 + 2} />
      </div>
    </AbsoluteFill>
  );
};
