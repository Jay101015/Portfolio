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
        <div style={{fontFamily: brand.display, fontSize: 220 * u, lineHeight: 0.6, color: brand.accent2, marginBottom: 10 * u, WebkitTextStroke: brand.toon ? `${3 * u}px ${brand.ink}` : undefined}}>“</div>
      </Reveal>
      <Reveal delay={6} distance={50}>
        <div style={{fontFamily: brand.display, fontSize: (isVertical ? 60 : 76) * u, fontWeight: brand.toon ? 400 : 700, lineHeight: 1.2, maxWidth: isVertical ? '100%' : '62%', transform: brand.toon ? 'rotate(-1deg)' : undefined}}>{quote}</div>
      </Reveal>
      {attribution ? (
        <Reveal delay={20}>
          <div style={{fontSize: 36 * u, color: brand.muted, marginTop: 40 * u}}>— {attribution}</div>
        </Reveal>
      ) : null}
    </AbsoluteFill>
  );
};
