import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand} from '../types';
import {useLayout} from './layout';

export const Chrome: React.FC<{brand: Brand; durationSec: number}> = ({brand, durationSec}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, isVertical} = useLayout();
  if (brand.toon) return null; // no dashboard furniture on the hand-drawn look
  const progress = Math.min(1, frame / fps / Math.max(1, durationSec));
  if (brand.paper) {
    // a page corner: the channel name in handwriting and a thin ink line that fills as the video plays
    return (
      <AbsoluteFill style={{pointerEvents: 'none'}}>
        <div style={{position: 'absolute', top: (isVertical ? 36 : 30) * u, right: pad, fontFamily: brand.hand, fontSize: 30 * u, color: brand.muted, transform: 'rotate(2deg)'}}>{brand.name.toLowerCase()}</div>
        <div style={{position: 'absolute', bottom: 0, left: 0, height: 5 * u, width: `${progress * 100}%`, background: brand.accent, opacity: 0.6}} />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div style={{position: 'absolute', top: 0, left: 0, height: 6 * u, width: `${progress * 100}%`, background: brand.accent}} />
      <div style={{position: 'absolute', top: (isVertical ? 40 : 36) * u, left: pad, display: 'flex', alignItems: 'center', gap: 12 * u, fontSize: 22 * u, fontWeight: 700, letterSpacing: 3, color: brand.muted}}>
        <div style={{width: 12 * u, height: 12 * u, borderRadius: 999, background: brand.accent}} />
        {brand.name}
      </div>
    </AbsoluteFill>
  );
};
