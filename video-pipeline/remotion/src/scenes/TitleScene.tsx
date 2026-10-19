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
          <div style={{fontFamily: brand.display, fontSize: 36 * u, letterSpacing: brand.toon ? 0 : 4, color: brand.accent, marginBottom: 20 * u}}>
            {brand.toon ? kicker : kicker.toUpperCase()}
          </div>
        </Reveal>
      ) : null}
      <Reveal delay={4} distance={60}>
        <div style={{fontFamily: brand.display, fontSize: (isVertical ? 96 : 112) * u, fontWeight: brand.toon ? 400 : 800, lineHeight: 1.04, letterSpacing: brand.toon ? 0 : -2 * u, maxWidth: isVertical ? '100%' : '60%', transform: brand.toon ? 'rotate(-1.5deg)' : undefined}}>
          {title}
        </div>
      </Reveal>
      <div style={{height: 12 * u, width: `${bar * 26}%`, background: brand.accent2, marginTop: 30 * u, borderRadius: 999, border: brand.toon ? `${4 * u}px solid ${brand.ink}` : undefined}} />
      {subtitle ? (
        <Reveal delay={14}>
          <div style={{fontSize: 42 * u, color: brand.muted, marginTop: 28 * u, maxWidth: '58%', lineHeight: 1.3}}>{subtitle}</div>
        </Reveal>
      ) : null}
      <Reveal delay={24} from="none">
        <div style={{fontSize: 20 * u, color: brand.muted, opacity: 0.8, marginTop: 60 * u}}>For education only. Not financial advice.</div>
      </Reveal>
    </AbsoluteFill>
  );
};
