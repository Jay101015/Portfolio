import React from 'react';
import {AbsoluteFill} from 'remotion';
import type {Brand, Scene} from '../types';
import {Reveal} from '../components/Reveal';
import {useLayout} from '../components/layout';

/** Full-frame host moment: the character on one side, a headline on the other. */
export const AvatarScene: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  const {u, pad, isVertical} = useLayout();
  const headline: string | undefined = scene.props.headline;
  const sub: string | undefined = scene.props.sub;
  const left = (scene.props.pos ?? 'side-left') === 'side-left';
  if (!headline && !sub) return null;
  return (
    <AbsoluteFill style={{justifyContent: isVertical ? 'flex-start' : 'center', alignItems: left ? 'flex-end' : 'flex-start', padding: pad, paddingTop: isVertical ? pad * 2 : pad}}>
      <div style={{width: isVertical ? '100%' : '50%'}}>
        {headline ? (
          <Reveal delay={4} distance={40}>
            <div style={{fontFamily: brand.display, fontSize: (isVertical ? 76 : 96) * u, lineHeight: 1.02, fontWeight: brand.toon ? 400 : 800, transform: brand.toon ? 'rotate(-1.5deg)' : undefined, color: brand.toon ? brand.ink : brand.text}}>{headline}</div>
          </Reveal>
        ) : null}
        {sub ? (
          <Reveal delay={14}>
            <div style={{fontSize: 42 * u, color: brand.muted, marginTop: 22 * u, lineHeight: 1.3}}>{sub}</div>
          </Reveal>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
