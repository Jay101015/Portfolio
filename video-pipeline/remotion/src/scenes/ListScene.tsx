import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene} from '../types';
import {Reveal} from '../components/Reveal';
import {findPhraseTime, useLayout} from '../components/layout';
import {card} from '../theme';
import {pop} from '../components/motion';

export const ListScene: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, isVertical} = useLayout();
  const items: string[] = scene.props.items ?? [];
  const title: string | undefined = scene.props.title;
  const sceneLen = scene.end - scene.start;
  const numbered = scene.props.numbered !== false;
  const delays = items.map((item, i) => {
    const spoken = findPhraseTime(scene.words, item);
    const delaySec = spoken !== null ? Math.max(0, spoken - scene.start) : Math.min(i * 0.9, sceneLen * 0.6 * (i / Math.max(1, items.length)));
    return Math.round(delaySec * fps) + 6;
  });
  if (brand.toon) {
    const body = (
      <>
        {title ? (
          <Reveal delay={0}>
            <div style={{fontFamily: brand.display, fontSize: (isVertical ? 58 : 60) * u, marginBottom: 26 * u}}>{title}</div>
          </Reveal>
        ) : null}
        {items.map((item, i) => (
          <Reveal key={i} delay={delays[i]} from="left" distance={50}>
            <div style={{display: 'flex', alignItems: 'center', gap: 24 * u, marginBottom: 22 * u}}>
              <div style={{width: 62 * u, height: 62 * u, borderRadius: 999, background: brand.accent2, color: brand.ink, fontFamily: brand.display, fontSize: 36 * u, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `${4 * u}px solid ${brand.ink}`, transform: `rotate(${((i * 13) % 9) - 4}deg)`}}>
                {numbered ? i + 1 : '✓'}
              </div>
              <div style={{fontSize: (isVertical ? 42 : 44) * u, lineHeight: 1.2}}>{item}</div>
            </div>
          </Reveal>
        ))}
      </>
    );
    return (
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'flex-start', padding: pad, paddingBottom: isVertical ? pad : pad + 120 * u}}>
        <Reveal delay={0} from="none">
          <div style={{...card(brand, u, -1), padding: `${36 * u}px ${48 * u}px`, maxWidth: isVertical ? '100%' : '54%', minWidth: isVertical ? '100%' : '46%'}}>{body}</div>
        </Reveal>
      </AbsoluteFill>
    );
  }
  // Motion-graphics look: a centred column; each row springs in as it is said and the badge lights up.
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', padding: pad}}>
      <div style={{width: isVertical ? '100%' : '72%'}}>
        {title ? (
          <Reveal delay={0}>
            <div style={{fontFamily: brand.display, fontSize: (isVertical ? 58 : 64) * u, fontWeight: 700, marginBottom: 36 * u, textAlign: 'center', letterSpacing: -1 * u}}>{title}</div>
          </Reveal>
        ) : null}
        {items.map((item, i) => {
          const s = pop(frame, fps, delays[i], 13);
          const lit = frame >= delays[i];
          return (
            <div key={i} style={{display: 'flex', alignItems: 'center', gap: 28 * u, marginBottom: 20 * u, padding: `${18 * u}px ${28 * u}px`, borderRadius: 22 * u, background: lit ? `${brand.panel}dd` : `${brand.panel}66`, border: `1px solid ${lit ? brand.accent + '55' : brand.text + '14'}`, opacity: 0.35 + 0.65 * Math.min(1, s * 1.5), transform: `translateX(${(1 - s) * -60 * u}px) scale(${0.96 + 0.04 * s})`}}>
              <div style={{width: 70 * u, height: 70 * u, borderRadius: 18 * u, background: lit ? brand.accent : `${brand.text}22`, color: lit ? brand.bg : brand.muted, fontFamily: brand.display, fontSize: 36 * u, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transform: `scale(${0.7 + 0.3 * s})`}}>
                {numbered ? i + 1 : '✓'}
              </div>
              <div style={{fontSize: (isVertical ? 42 : 46) * u, lineHeight: 1.2, fontWeight: 600, color: lit ? brand.text : brand.muted}}>{item}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
