import React from 'react';
import {AbsoluteFill, useVideoConfig} from 'remotion';
import type {Brand, Scene} from '../types';
import {Reveal} from '../components/Reveal';
import {findPhraseTime, useLayout} from '../components/layout';
import {card} from '../theme';

export const ListScene: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  const {fps} = useVideoConfig();
  const {u, pad, isVertical} = useLayout();
  const items: string[] = scene.props.items ?? [];
  const title: string | undefined = scene.props.title;
  const sceneLen = scene.end - scene.start;
  const numbered = scene.props.numbered !== false;
  const body = (
    <>
      {title ? (
        <Reveal delay={0}>
          <div style={{fontFamily: brand.display, fontSize: (isVertical ? 58 : 66) * u, marginBottom: 30 * u, fontWeight: brand.toon ? 400 : 800}}>{title}</div>
        </Reveal>
      ) : null}
      {items.map((item, i) => {
        const spoken = findPhraseTime(scene.words, item);
        const delaySec = spoken !== null ? Math.max(0, spoken - scene.start) : Math.min(i * 0.9, sceneLen * 0.6 * (i / Math.max(1, items.length)));
        return (
          <Reveal key={i} delay={Math.round(delaySec * fps) + 6} from="left" distance={50}>
            <div style={{display: 'flex', alignItems: 'center', gap: 24 * u, marginBottom: 22 * u}}>
              <div style={{width: 62 * u, height: 62 * u, borderRadius: brand.toon ? 999 : 16 * u, background: brand.toon ? brand.accent2 : brand.accent, color: brand.toon ? brand.ink : brand.bg, fontFamily: brand.display, fontSize: 36 * u, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: brand.toon ? `${4 * u}px solid ${brand.ink}` : undefined, transform: brand.toon ? `rotate(${((i * 13) % 9) - 4}deg)` : undefined}}>
                {numbered ? i + 1 : '✓'}
              </div>
              <div style={{fontSize: (isVertical ? 42 : 48) * u, lineHeight: 1.2, fontWeight: brand.toon ? 400 : 600}}>{item}</div>
            </div>
          </Reveal>
        );
      })}
    </>
  );
  if (brand.toon) {
    return (
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'flex-start', padding: pad}}>
        <Reveal delay={0} from="none">
          <div style={{...card(brand, u, -1), padding: `${36 * u}px ${48 * u}px`, maxWidth: isVertical ? '100%' : '58%', minWidth: isVertical ? '100%' : '46%'}}>{body}</div>
        </Reveal>
      </AbsoluteFill>
    );
  }
  return <AbsoluteFill style={{justifyContent: 'center', padding: pad}}>{body}</AbsoluteFill>;
};
