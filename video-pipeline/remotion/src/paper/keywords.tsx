import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene} from '../types';
import {useLayout} from '../components/layout';
import {Marker} from './sketch';

/**
 * Key words: the figure being said pops up big in the band along the bottom of the page, on a highlighter swipe,
 * holds a second and goes. pipeline/craft.py picks them (scene.keys): never the scene's own figure, never one a card
 * already carries. For the viewer watching muted on a phone, and for everyone when the number is the point.
 * Not on a Short (its captions say every word) and not without the board look.
 */
const HOLD = 1.3;
const FADE = 0.3;

export const KeyWords: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, width, height, isVertical} = useLayout();
  const keys = scene.keys ?? [];
  if (!keys.length || isVertical || !brand.board) return null;
  const t = scene.start + frame / fps;
  const k = [...keys].reverse().find((x) => t >= x.t && t < x.t + HOLD + FADE);
  if (!k) return null;
  const age = t - k.t;
  const q = Math.min(1, age / 0.18);
  const pop = 1 - Math.pow(1 - q, 3);
  const out = age > HOLD ? Math.max(0, 1 - (age - HOLD) / FADE) : 1;
  const onFootage = scene.type === 'broll' || scene.type === 'still' || scene.type === 'image';
  // a board with a drawing has its cards low on the left: the key word goes under the drawing, on the right
  const underLines = scene.type === 'text' && !!scene.props.art && scene.props.art !== 'off';
  const size = (onFootage ? 58 : 76) * u;
  const x = underLines ? width * 0.76 : width * 0.5;
  const y = onFootage ? height * 0.955 : height * 0.905;
  const color = k.color === 'red' ? brand.accent2 : k.color === 'green' ? brand.accent : brand.ink;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div style={{position: 'absolute', left: x, top: y, transform: `translate(-50%, -50%) scale(${0.9 + 0.1 * pop}) rotate(-1deg)`, opacity: Math.min(1, q * 1.5) * out, fontFamily: brand.display, fontSize: size, lineHeight: 1, color, whiteSpace: 'nowrap', maxWidth: width * 0.5}}>
        <Marker progress={pop} color={brand.marker ?? '#ffe66d'} pad={10 * u}>
          {k.text}
        </Marker>
      </div>
    </AbsoluteFill>
  );
};
