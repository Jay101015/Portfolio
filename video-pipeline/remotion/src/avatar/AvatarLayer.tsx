import React from 'react';
import {AbsoluteFill, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {RasterHost} from './RasterHost';
import {useHostImages} from './useHostImages';
import {Avatar, type AvatarConfig, type Face, type Pose} from './Avatar';
import {useLayout} from '../components/layout';

export type AvatarPos = 'corner-right' | 'corner-left' | 'side-left' | 'side-right' | 'full' | 'none';

type Props = {
  config: AvatarConfig;
  pose: Pose;
  face?: Face;
  prevPose?: Pose;
  prevFace?: Face;
  pos: AvatarPos;
  mouth: number;
  viseme?: number;
  talk?: number;
  attention?: number;
  globalFrame: number;
  sinceChange: number; // frames since the pose/face last changed
  scale?: number;
  toon?: boolean;
  art?: 'drawn' | 'painted';
};

/** Places the character on top of a scene: a corner bust over footage, a half-body beside text, or full frame. */
export const AvatarLayer: React.FC<Props> = ({config, pose, face, prevPose, prevFace, pos, mouth, viseme, talk, attention, globalFrame, sinceChange, scale = 1, toon, art = 'painted'}) => {
  const frame = useCurrentFrame();
  const {width, height, u, isVertical} = useLayout();
  const ready = useHostImages();
  if (pos === 'none' || (art === 'painted' && !ready)) return null;
  // entrance: toon snaps in over 3 frames; glossy springs in
  const enter = toon ? interpolate(frame, [0, 3], [0, 1], {extrapolateRight: 'clamp'}) : interpolate(frame, [0, 10], [0, 1], {extrapolateRight: 'clamp'});
  // re-pose: a small squash as the body lands, on top of the rig's own tween
  const s2 = Math.floor(sinceChange / 2) * 2;
  const snap = toon ? interpolate(s2, [0, 4, 8, 12], [1, 1.03, 0.97, 1], {extrapolateRight: 'clamp', extrapolateLeft: 'clamp'}) : 1;
  const sx = 2 - snap;
  const sy = snap;
  // big reactions bounce the whole drawing
  const react = pose === 'shocked' ? interpolate(s2, [0, 4, 10], [1, 1.12, 1], {extrapolateRight: 'clamp'}) : pose === 'laugh' ? 1 + Math.abs(Math.sin(s2 / 4)) * 0.03 : 1;
  const shake = pose === 'crossed' && sinceChange < 12 ? Math.round(Math.sin(sinceChange * 2.6) * 6 * (1 - sinceChange / 12)) : 0;

  // On 9:16 the body overflows the drawing box by ~12%, and the captions sit in the bottom 250u: stand above both.
  const vBottom = 430 * u;
  let w = 0;
  let left = 0;
  let bottom = 0;
  if (pos === 'full') {
    w = (isVertical ? 1.0 : 0.54) * width;
    left = (width - w) / 2;
    bottom = isVertical ? vBottom : -0.1 * height;
  } else if (pos === 'side-left' || pos === 'side-right') {
    w = (isVertical ? 0.96 : 0.5) * width;
    left = pos === 'side-left' ? -0.06 * width : width - w + 0.06 * width;
    bottom = isVertical ? vBottom : -0.06 * height;
  } else {
    w = (isVertical ? 0.42 : 0.27) * width;
    left = pos === 'corner-left' ? 16 * u : width - w - 16 * u;
    bottom = isVertical ? vBottom : -30 * u;
  }
  w *= scale;
  const flip = pos === 'corner-left' || pos === 'side-left';
  const svgH = (w * 760) / 840;
  // The thing being talked about sits on the other side of the frame: in the drawing's own space that is always to the left.
  const lookX = pos === 'full' ? 0 : -1;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div
        style={{
          position: 'absolute',
          left: left + shake,
          bottom,
          width: w,
          height: svgH,
          opacity: toon ? 1 : enter,
          transform: `translateY(${(1 - enter) * 40}px) scale(${(0.94 + enter * 0.06) * sx * react}, ${(0.94 + enter * 0.06) * sy * react})`,
          transformOrigin: 'bottom center',
          filter: toon ? undefined : 'drop-shadow(0 18px 30px rgba(0,0,0,0.45))',
        }}
      >
        {art === 'painted' ? (
          <RasterHost pose={pose} face={face} prevPose={prevPose} prevFace={prevFace} sinceChange={sinceChange} mouth={mouth} viseme={viseme} talk={talk} lookX={lookX} attention={attention} frame={globalFrame} width={w} flip={flip} src={(n) => staticFile(`host/${n}`)} />
        ) : (
          <Avatar config={config} pose={pose} face={face} prevPose={prevPose} prevFace={prevFace} sinceChange={sinceChange} mouth={mouth} viseme={viseme} talk={talk} lookX={lookX} attention={attention} frame={globalFrame} width={w} flip={flip} />
        )}
      </div>
    </AbsoluteFill>
  );
};
