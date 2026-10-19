import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';

type Props = {
  delay?: number; // frames
  from?: 'up' | 'down' | 'left' | 'right' | 'none';
  distance?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
};

export const Reveal: React.FC<Props> = ({delay = 0, from = 'up', distance = 40, style, children}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const p = spring({frame: frame - delay, fps, config: {damping: 18, stiffness: 120, mass: 0.8}});
  const opacity = interpolate(frame - delay, [0, 10], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const off = (1 - p) * distance;
  const transform =
    from === 'up' ? `translateY(${off}px)`
    : from === 'down' ? `translateY(${-off}px)`
    : from === 'left' ? `translateX(${-off}px)`
    : from === 'right' ? `translateX(${off}px)`
    : 'none';
  return <div style={{opacity, transform, ...style}}>{children}</div>;
};
