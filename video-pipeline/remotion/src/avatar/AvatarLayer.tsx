import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Avatar, type AvatarConfig, type Pose} from './Avatar';
import {useLayout} from '../components/layout';

export type AvatarPos = 'corner-right' | 'corner-left' | 'side-left' | 'side-right' | 'full' | 'none';

type Props = {
  config: AvatarConfig;
  pose: Pose;
  pos: AvatarPos;
  mouth: number;
  globalFrame: number;
  scale?: number;
};

/** Places the character on top of a scene: a corner bust over footage, a half-body beside text, or full frame. */
export const AvatarLayer: React.FC<Props> = ({config, pose, pos, mouth, globalFrame, scale = 1}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {width, height, u, isVertical} = useLayout();
  if (pos === 'none') return null;
  const pop = spring({frame, fps, config: {damping: 14, stiffness: 140, mass: 0.7}});
  const opacity = interpolate(frame, [0, 6], [0, 1], {extrapolateRight: 'clamp'});

  // character box width as a fraction of the canvas, then anchored to the bottom edge
  let w = 0;
  let left = 0;
  let bottom = 0;
  // On 9:16 the captions sit ~260u up from the bottom, so the character stands above them.
  const vBottom = 330 * u;
  if (pos === 'full') {
    w = (isVertical ? 1.0 : 0.52) * width;
    left = (width - w) / 2;
    bottom = isVertical ? vBottom : -0.12 * height;
  } else if (pos === 'side-left' || pos === 'side-right') {
    w = (isVertical ? 0.9 : 0.4) * width;
    left = pos === 'side-left' ? -0.03 * width : width - w + 0.03 * width;
    bottom = isVertical ? vBottom : -0.14 * height;
  } else {
    w = (isVertical ? 0.42 : 0.24) * width;
    left = pos === 'corner-left' ? 16 * u : width - w - 16 * u;
    bottom = isVertical ? vBottom : -40 * u;
  }
  w *= scale;
  const flip = pos === 'corner-left' || pos === 'side-left';
  const svgH = (w * 760) / 840;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div
        style={{
          position: 'absolute',
          left,
          bottom,
          width: w,
          height: svgH,
          opacity,
          transform: `translateY(${(1 - pop) * 60}px) scale(${0.9 + pop * 0.1})`,
          transformOrigin: 'bottom center',
          filter: 'drop-shadow(0 18px 30px rgba(0,0,0,0.45))',
        }}
      >
        <Avatar config={config} pose={pose} mouth={mouth} frame={globalFrame} width={w} flip={flip} />
      </div>
    </AbsoluteFill>
  );
};
