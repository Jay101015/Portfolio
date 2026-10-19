import React from 'react';
import {AbsoluteFill} from 'remotion';
import type {Brand, Scene} from '../types';
import {Reveal} from '../components/Reveal';
import {useLayout} from '../components/layout';

export const QuoteScene: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  const {u, pad, isVertical} = useLayout();
  const quote: string = scene.props.quote ?? scene.narration;
  const attribution: string | undefined = scene.props.attribution;
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad}}>
      <Reveal delay={0} from="none">
        <div style={{fontSize: 220 * u, lineHeight: 0.6, color: brand.accent2, fontWeight: 800, marginBottom: 10 * u}}>“</div>
      </Reveal>
      <Reveal delay={6} distance={50}>
        <div style={{fontSize: (isVertical ? 60 : 72) * u, fontWeight: 700, lineHeight: 1.2, maxWidth: '90%', letterSpacing: -1}}>{quote}</div>
      </Reveal>
      {attribution ? (
        <Reveal delay={20}>
          <div style={{fontSize: 36 * u, color: brand.muted, marginTop: 40 * u}}>— {attribution}</div>
        </Reveal>
      ) : null}
    </AbsoluteFill>
  );
};
