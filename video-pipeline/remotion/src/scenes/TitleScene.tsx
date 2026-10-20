import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene} from '../types';
import {Reveal} from '../components/Reveal';
import {useLayout} from '../components/layout';
import {fadeIn, pop} from '../components/motion';

export const TitleScene: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, isVertical} = useLayout();
  const bar = interpolate(frame, [8, 8 + fps * 0.8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const title: string = scene.props.title ?? scene.narration;
  const subtitle: string | undefined = scene.props.subtitle;
  const kicker: string | undefined = scene.props.kicker;
  if (brand.toon) {
    return (
      <AbsoluteFill style={{justifyContent: 'center', padding: pad}}>
        {kicker ? (
          <Reveal delay={0}>
            <div style={{fontFamily: brand.display, fontSize: 36 * u, color: brand.accent, marginBottom: 20 * u}}>{kicker}</div>
          </Reveal>
        ) : null}
        <Reveal delay={4} distance={60}>
          <div style={{fontFamily: brand.display, fontSize: (isVertical ? 96 : 112) * u, lineHeight: 1.04, maxWidth: isVertical ? '100%' : '60%', transform: 'rotate(-1.5deg)'}}>{title}</div>
        </Reveal>
        <div style={{height: 12 * u, width: `${bar * 26}%`, background: brand.accent2, marginTop: 30 * u, borderRadius: 999, border: `${4 * u}px solid ${brand.ink}`}} />
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
  }
  // Motion-graphics look: centred, the title lands one word at a time, a gold bar sweeps under it.
  const words = title.split(/\s+/).filter(Boolean);
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', padding: pad, textAlign: 'center'}}>
      {kicker ? (
        <div style={{opacity: fadeIn(frame, 0, 8), display: 'inline-flex', padding: `${10 * u}px ${28 * u}px`, borderRadius: 999, border: `${2 * u}px solid ${brand.accent}66`, background: `${brand.accent}14`, fontSize: 30 * u, fontWeight: 700, letterSpacing: 4, color: brand.accent, marginBottom: 40 * u}}>
          {kicker.toUpperCase()}
        </div>
      ) : null}
      <div style={{fontFamily: brand.display, fontSize: (isVertical ? 100 : 128) * u, fontWeight: 700, lineHeight: 1.04, letterSpacing: -3 * u, maxWidth: isVertical ? '100%' : '84%'}}>
        {words.map((w, i) => {
          const s = pop(frame, fps, 4 + i * 3, 13);
          return (
            <span key={i} style={{display: 'inline-block', marginRight: 0.28 * 128 * u * (isVertical ? 0.78 : 1) * 0.5, opacity: Math.min(1, s * 1.4), transform: `translateY(${(1 - s) * 40 * u}px) scale(${0.9 + 0.1 * s})`}}>
              {w}
            </span>
          );
        })}
      </div>
      <div style={{height: 12 * u, width: `${bar * (isVertical ? 40 : 22)}%`, background: `linear-gradient(90deg, ${brand.accent2}, ${brand.accent})`, marginTop: 36 * u, borderRadius: 999}} />
      {subtitle ? (
        <Reveal delay={16}>
          <div style={{fontSize: (isVertical ? 42 : 46) * u, color: brand.muted, marginTop: 30 * u, maxWidth: isVertical ? '100%' : '64%', lineHeight: 1.3}}>{subtitle}</div>
        </Reveal>
      ) : null}
      <Reveal delay={26} from="none">
        <div style={{fontSize: 22 * u, color: brand.muted, opacity: 0.8, marginTop: 70 * u}}>For education only. Not financial advice.</div>
      </Reveal>
    </AbsoluteFill>
  );
};
