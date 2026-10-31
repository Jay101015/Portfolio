import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene} from '../types';
import {useLayout} from '../components/layout';
import {Arrow, SketchEllipse} from './sketch';
import {Write} from './write';

/**
 * Marks drawn on footage or a photo on the word that calls for them (`marks="circle 62,40@price; arrow 30,70@word;
 * note:the bit that matters 50,80@word"`, x and y as per cent of the picture): a marker ring round the thing, an
 * arrow pointing at it from lower left, a handwritten note beside it. Red unless the spec said green or ink. The
 * picture is what the viewer is looking at; the mark says where.
 */
export type MarkCue = {t: number; do: 'mark'; kind: 'circle' | 'arrow' | 'note'; x: number; y: number; color?: string; text?: string};

export const Marks: React.FC<{scene: Scene; brand: Brand; w: number; h: number}> = ({scene, brand, w, h}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u} = useLayout();
  const marks = ((scene.cues ?? []) as unknown as Array<{do?: string}>).filter((c) => c.do === 'mark') as MarkCue[];
  if (!marks.length) return null;
  return (
    <div style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
      {marks.map((m, i) => {
        const at = Math.round((m.t - scene.start) * fps);
        if (frame < at) return null;
        const x = (m.x / 100) * w;
        const y = (m.y / 100) * h;
        const col = m.color === 'green' ? brand.accent : m.color === 'ink' ? brand.ink : brand.accent2;
        const win: [number, number] = [at, at + Math.round(fps * 0.4)];
        if (m.kind === 'circle') {
          const rw = w * 0.17;
          const rh = h * 0.24;
          return (
            <svg key={i} width={rw} height={rh} viewBox={`0 0 ${rw} ${rh}`} style={{position: 'absolute', left: x - rw / 2, top: y - rh / 2, overflow: 'visible', transform: 'rotate(-4deg)'}}>
              <SketchEllipse cx={rw / 2} cy={rh / 2} w={rw} h={rh} win={win} easeOut options={{stroke: col, strokeWidth: 6 * u, roughness: 1.6, bowing: 1.8, seed: scene.id * 7 + i}} />
            </svg>
          );
        }
        if (m.kind === 'arrow') {
          // from lower left, pointing up and right at the spot: the arrow's box is centred between its tail and the spot
          const len = w * 0.16;
          const cx = x - 0.41 * len;
          const cy = y + 0.285 * len;
          return (
            <div key={i} style={{position: 'absolute', left: cx - len / 2, top: cy - 30}}>
              <Arrow length={len} stroke={col} win={win} angle={-35} seed={scene.id * 7 + i} thickness={6 * u} />
            </div>
          );
        }
        return (
          <div key={i} style={{position: 'absolute', left: x + 14 * u, top: y - 34 * u, background: '#fff', border: `${3 * u}px solid ${col}`, color: col, fontFamily: brand.hand ?? 'cursive', fontSize: 46 * u, lineHeight: 1.1, padding: `${4 * u}px ${16 * u}px`, transform: 'rotate(-2deg)', boxShadow: `${5 * u}px ${5 * u}px 0 ${brand.ink}`, whiteSpace: 'nowrap'}}>
            <Write text={m.text ?? ''} frame={frame} fps={fps} start={at} cps={30} color={col} />
          </div>
        );
      })}
    </div>
  );
};
