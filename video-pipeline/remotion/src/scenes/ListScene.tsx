import React from 'react';
import {AbsoluteFill, useVideoConfig} from 'remotion';
import type {Brand, Scene} from '../types';
import {Reveal} from '../components/Reveal';
import {findPhraseTime, useLayout} from '../components/layout';

export const ListScene: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  const {fps} = useVideoConfig();
  const {u, pad, isVertical} = useLayout();
  const items: string[] = scene.props.items ?? [];
  const title: string | undefined = scene.props.title;
  const sceneLen = scene.end - scene.start;
  const numbered = scene.props.numbered !== false;
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad}}>
      {title ? (
        <Reveal delay={0}>
          <div style={{fontSize: (isVertical ? 56 : 64) * u, fontWeight: 800, marginBottom: 44 * u, letterSpacing: -1}}>{title}</div>
        </Reveal>
      ) : null}
      {items.map((item, i) => {
        const spoken = findPhraseTime(scene.words, item);
        const delaySec = spoken !== null ? Math.max(0, spoken - scene.start) : Math.min(i * 0.9, sceneLen * 0.6 * (i / Math.max(1, items.length)));
        return (
          <Reveal key={i} delay={Math.round(delaySec * fps) + 6} from="left" distance={50}>
            <div style={{display: 'flex', alignItems: 'center', gap: 28 * u, marginBottom: 28 * u}}>
              <div
                style={{
                  width: 64 * u,
                  height: 64 * u,
                  borderRadius: 16 * u,
                  background: brand.accent,
                  color: brand.bg,
                  fontWeight: 800,
                  fontSize: 34 * u,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {numbered ? i + 1 : '✓'}
              </div>
              <div style={{fontSize: (isVertical ? 44 : 52) * u, fontWeight: 600, lineHeight: 1.2}}>{item}</div>
            </div>
          </Reveal>
        );
      })}
    </AbsoluteFill>
  );
};
