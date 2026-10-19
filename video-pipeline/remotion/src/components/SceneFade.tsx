import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';

export const SceneFade: React.FC<{durationInFrames: number; children: React.ReactNode}> = ({durationInFrames, children}) => {
  const frame = useCurrentFrame();
  const fadeLen = Math.min(10, Math.floor(durationInFrames / 3));
  const opacity = interpolate(
    frame,
    [0, fadeLen, Math.max(fadeLen + 1, durationInFrames - fadeLen), durationInFrames],
    [0, 1, 1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );
  return <AbsoluteFill style={{opacity}}>{children}</AbsoluteFill>;
};
