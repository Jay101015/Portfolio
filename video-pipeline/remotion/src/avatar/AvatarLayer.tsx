import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {Avatar, type AvatarConfig, type Face, type Pose} from './Avatar';
import {useLayout} from '../components/layout';

export type AvatarPos = 'corner-right' | 'corner-left' | 'side-left' | 'side-right' | 'full' | 'none';

type Props = {
  config: AvatarConfig;
  pose: Pose;
  face?: Face;
  pos: AvatarPos;
  mouth: number;
  globalFrame: number;
  sinceChange: number; // frames since the pose/face last changed (for the snap)
  scale?: number;
  toon?: boolean;
};

/** Places the character on top of a scene: a corner bust over footage, a half-body beside text, or full frame. */
export const AvatarLayer: React.FC<Props> = ({config, pose, face, pos, mouth, globalFrame, sinceChange, scale = 1, toon}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {width, height, u, isVertical} = useLayout();
  if (pos === 'none') return null;
  // entrance: toon snaps in over 3 frames with a squash; glossy springs in
  const enter = toon ? interpolate(frame, [0, 3], [0, 1], {extrapolateRight: 'clamp'}) : interpolate(frame, [0, 10], [0, 1], {extrapolateRight: 'clamp'});
  // pose/face change: quick squash-and-stretch so cuts read as a drawn re-pose
  const snap = toon ? interpolate(sinceChange, [0, 2, 5], [1, 0.9, 1], {extrapolateRight: 'clamp', extrapolateLeft: 'clamp'}) : 1;
  const sx = 2 - snap;
  const sy = snap;

  // On 9:16 the body overflows the drawing box by ~12%, and the captions sit in the bottom 250u: stand above both.
  const vBottom = 430 * u;
  let w = 0;
  let left = 0;
  let bottom = 0;
  if (pos === 'full') {
    w = (isVertical ? 1.0 : 0.52) * width;
    left = (width - w) / 2;
    bottom = isVertical ? vBottom : -0.12 * height;
  } else if (pos === 'side-left' || pos === 'side-right') {
    w = (isVertical ? 0.9 : 0.42) * width;
    left = pos === 'side-left' ? -0.03 * width : width - w + 0.03 * width;
    bottom = isVertical ? vBottom : -0.16 * height;
  } else {
    w = (isVertical ? 0.42 : 0.26) * width;
    left = pos === 'corner-left' ? 16 * u : width - w - 16 * u;
    bottom = isVertical ? vBottom : -44 * u;
  }
  w *= scale;
  const flip = pos === 'corner-left' || pos === 'side-left';
  const svgH = (w * 760) / 840;
  const _fps = fps;
  void _fps;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div
        style={{
          position: 'absolute',
          left,
          bottom,
          width: w,
          height: svgH,
          opacity: toon ? 1 : enter,
          transform: `translateY(${(1 - enter) * 40}px) scale(${(0.94 + enter * 0.06) * sx}, ${(0.94 + enter * 0.06) * sy})`,
          transformOrigin: 'bottom center',
          filter: toon ? undefined : 'drop-shadow(0 18px 30px rgba(0,0,0,0.45))',
        }}
      >
        <Avatar config={config} pose={pose} face={face} mouth={mouth} frame={globalFrame} width={w} flip={flip} />
      </div>
    </AbsoluteFill>
  );
};
