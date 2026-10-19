import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene} from '../types';
import {Reveal} from '../components/Reveal';
import {useLayout} from '../components/layout';

export const TitleScene: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, isVertical} = useLayout();
  const bar = interpolate(frame, [8, 8 + fps * 0.8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const title: string = scene.props.title ?? scene.narration;
  const subtitle: string | undefined = scene.props.subtitle;
  const kicker: string | undefined = scene.props.kicker;
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad}}>
      {kicker ? (
        <Reveal delay={0}>
          <div style={{fontSize: 30 * u, fontWeight: 700, letterSpacing: 4, color: brand.accent, marginBottom: 24 * u}}>
            {kicker.toUpperCase()}
          </div>
        </Reveal>
      ) : null}
      <Reveal delay={4} distance={60}>
        <div style={{fontSize: (isVertical ? 96 : 112) * u, fontWeight: 800, lineHeight: 1.04, letterSpacing: -2 * u, maxWidth: isVertical ? '100%' : '82%'}}>
          {title}
        </div>
      </Reveal>
      <div style={{height: 10 * u, width: `${bar * 28}%`, background: brand.accent2, marginTop: 36 * u, borderRadius: 999}} />
      {subtitle ? (
        <Reveal delay={14}>
          <div style={{fontSize: 40 * u, color: brand.muted, marginTop: 32 * u, maxWidth: '80%', lineHeight: 1.3}}>{subtitle}</div>
        </Reveal>
      ) : null}
      <Reveal delay={24} from="none">
        <div style={{fontSize: 20 * u, color: brand.muted, opacity: 0.8, marginTop: 60 * u}}>For education only. Not financial advice.</div>
      </Reveal>
    </AbsoluteFill>
  );
};
