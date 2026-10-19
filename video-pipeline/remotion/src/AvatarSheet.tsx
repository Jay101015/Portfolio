import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Avatar, FACES, POSES, defaultAvatar, type AvatarConfig} from './avatar/Avatar';
import {presets} from './theme';

/** Every pose and every expression on one sheet, for approving the character before any video is made. */
export const AvatarSheet: React.FC<{avatar?: Partial<AvatarConfig>; theme?: string}> = ({avatar, theme}) => {
  const frame = useCurrentFrame();
  const brand = presets[theme ?? 'toon'] ?? presets.toon;
  const config: AvatarConfig = {...defaultAvatar, ...(avatar ?? {})};
  const mouth = 0.25 + 0.35 * Math.max(0, Math.sin(frame / 3));
  const cell: React.CSSProperties = {background: brand.panel, border: `4px solid ${brand.ink}`, borderRadius: 18, overflow: 'hidden', position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'flex-end'};
  const label: React.CSSProperties = {position: 'absolute', top: 8, left: 14, fontSize: 24, fontFamily: brand.display, color: brand.accent};
  return (
    <AbsoluteFill style={{background: brand.bg, fontFamily: brand.font, color: brand.text, padding: 28, display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gridTemplateRows: '1.15fr 1fr', gap: 14}}>
      {POSES.map((pose) => (
        <div key={pose} style={cell}>
          <Avatar config={config} pose={pose} mouth={pose === 'idle' ? mouth : 0} frame={frame} width={250} style={{marginBottom: 40}} />
          <div style={label}>{pose}</div>
        </div>
      ))}
      {FACES.map((face) => (
        <div key={face} style={{...cell, alignItems: 'flex-start'}}>
          <Avatar config={config} pose="idle" face={face} mouth={face === 'neutral' ? mouth : 0} frame={frame} width={340} style={{marginTop: 10}} />
          <div style={label}>{face}</div>
        </div>
      ))}
    </AbsoluteFill>
  );
};
