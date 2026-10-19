import React from 'react';
import {AbsoluteFill} from 'remotion';
import type {Brand, Scene} from '../types';
import {Reveal} from '../components/Reveal';
import {useLayout} from '../components/layout';

/** Full-frame host moment: the character on one side, a headline on the other. The AvatarLayer draws the character. */
export const AvatarScene: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  const {u, pad, isVertical} = useLayout();
  const headline: string | undefined = scene.props.headline;
  const sub: string | undefined = scene.props.sub;
  const left = (scene.props.pos ?? 'side-left') === 'side-left';
  if (!headline && !sub) return null;
  return (
    <AbsoluteFill style={{justifyContent: isVertical ? 'flex-start' : 'center', alignItems: left ? 'flex-end' : 'flex-start', padding: pad, paddingTop: isVertical ? pad * 2 : pad}}>
      <div style={{width: isVertical ? '100%' : '52%'}}>
        {headline ? (
          <Reveal delay={6} distance={50}>
            <div style={{fontSize: (isVertical ? 72 : 88) * u, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 * u}}>{headline}</div>
          </Reveal>
        ) : null}
        {sub ? (
          <Reveal delay={16}>
            <div style={{fontSize: 38 * u, color: brand.muted, marginTop: 24 * u, lineHeight: 1.3}}>{sub}</div>
          </Reveal>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
