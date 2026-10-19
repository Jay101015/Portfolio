import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Avatar, defaultAvatar, type AvatarConfig, type Face, type Pose} from './avatar/Avatar';

/** One big drawing of the host, for checking the art close up. */
export const Portrait: React.FC<{avatar?: Partial<AvatarConfig>; pose?: Pose; face?: Face; mouth?: number; viseme?: number; bg?: string}> = ({avatar, pose = 'idle', face, mouth = 0, viseme = 0, bg = '#e9e4da'}) => {
  const frame = useCurrentFrame();
  const config: AvatarConfig = {...defaultAvatar, ...(avatar ?? {})};
  return (
    <AbsoluteFill style={{background: bg, display: 'flex', justifyContent: 'center', alignItems: 'flex-start'}}>
      <Avatar config={config} pose={pose} face={face} mouth={mouth} viseme={viseme} frame={frame} width={1000} style={{marginTop: -20}} />
    </AbsoluteFill>
  );
};
