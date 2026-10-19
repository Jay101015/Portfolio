import React from 'react';
import {AbsoluteFill, staticFile, useCurrentFrame} from 'remotion';
import {RasterHost} from './avatar/RasterHost';
import {useHostImages} from './avatar/useHostImages';
import {Avatar, defaultAvatar, type AvatarConfig, type Face, type Pose} from './avatar/Avatar';

/** One big drawing of the host, for checking the art close up. */
export const Portrait: React.FC<{avatar?: Partial<AvatarConfig>; pose?: Pose; face?: Face; mouth?: number; viseme?: number; bg?: string; art?: 'drawn' | 'painted'; sinceChange?: number; prevPose?: Pose}> = ({avatar, pose = 'idle', face, mouth = 0, viseme = 0, bg = '#e9e4da', art = 'painted', sinceChange, prevPose}) => {
  const frame = useCurrentFrame();
  const ready = useHostImages();
  const config: AvatarConfig = {...defaultAvatar, ...(avatar ?? {})};
  return (
    <AbsoluteFill style={{background: bg, display: 'flex', justifyContent: 'center', alignItems: 'flex-start'}}>
      {art === 'painted' && !ready ? null : art === 'painted' ? (
        <RasterHost pose={pose} face={face} prevPose={prevPose} sinceChange={sinceChange} mouth={mouth} viseme={viseme} frame={frame} width={1000} src={(n) => staticFile(`host/${n}`)} />
      ) : (
        <Avatar config={config} pose={pose} face={face} mouth={mouth} viseme={viseme} frame={frame} width={1000} style={{marginTop: -20}} />
      )}
    </AbsoluteFill>
  );
};
