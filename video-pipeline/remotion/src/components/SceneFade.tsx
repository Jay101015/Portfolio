import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';

/** Scene entrance. Toon: a hard cut with a 4-frame settle (no cross-fade, which reads as "slideshow"). */
export const SceneFade: React.FC<{durationInFrames: number; toon?: boolean; children: React.ReactNode}> = ({durationInFrames, toon, children}) => {
  const frame = useCurrentFrame();
  if (toon) {
    const s = interpolate(frame, [0, 2, 5], [1.04, 0.985, 1], {extrapolateRight: 'clamp'});
    return <AbsoluteFill style={{transform: `scale(${s})`, transformOrigin: '50% 60%'}}>{children}</AbsoluteFill>;
  }
  const fadeLen = Math.min(10, Math.floor(durationInFrames / 3));
  const opacity = interpolate(frame, [0, fadeLen, Math.max(fadeLen + 1, durationInFrames - fadeLen), durationInFrames], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return <AbsoluteFill style={{opacity}}>{children}</AbsoluteFill>;
};
