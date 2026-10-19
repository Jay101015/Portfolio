import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Avatar, POSES, defaultAvatar, type AvatarConfig} from './avatar/Avatar';
import {presets} from './theme';

/** Every pose side by side, for approving the character before any video is made. */
export const AvatarSheet: React.FC<{avatar?: Partial<AvatarConfig>; theme?: string}> = ({avatar, theme}) => {
  const frame = useCurrentFrame();
  const brand = presets[theme ?? 'movie'] ?? presets.movie;
  const config: AvatarConfig = {...defaultAvatar, ...(avatar ?? {})};
  const mouth = 0.25 + 0.35 * Math.max(0, Math.sin(frame / 3));
  return (
    <AbsoluteFill style={{background: brand.bg, fontFamily: brand.font, color: brand.text, padding: 40, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 24}}>
      {POSES.map((pose) => (
        <div key={pose} style={{background: brand.panel, borderRadius: 24, overflow: 'hidden', position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'flex-end'}}>
          <Avatar config={config} pose={pose} mouth={pose === 'idle' ? mouth : 0} frame={frame} width={300} style={{marginBottom: -40}} />
          <div style={{position: 'absolute', top: 16, left: 20, fontSize: 24, fontWeight: 700, letterSpacing: 2, color: brand.accent2}}>{pose.toUpperCase()}</div>
        </div>
      ))}
    </AbsoluteFill>
  );
};
