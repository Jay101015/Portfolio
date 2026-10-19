import React from 'react';
import {AbsoluteFill} from 'remotion';
import type {Brand, Scene} from '../types';
import {Reveal} from '../components/Reveal';
import {useLayout} from '../components/layout';

export const OutroScene: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  const {u, pad, isVertical} = useLayout();
  const title: string = scene.props.title ?? 'Thanks for watching';
  const cta: string = scene.props.cta ?? 'Subscribe for weekly money breakdowns';
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad}}>
      <Reveal delay={0} distance={50}>
        <div style={{fontFamily: brand.display, fontSize: (isVertical ? 80 : 100) * u, fontWeight: brand.toon ? 400 : 800, lineHeight: 1.05, maxWidth: isVertical ? '100%' : '58%', transform: brand.toon ? 'rotate(-1.5deg)' : undefined}}>{title}</div>
      </Reveal>
      <Reveal delay={10}>
        <div style={{display: 'inline-flex', marginTop: 36 * u, padding: `${16 * u}px ${36 * u}px`, borderRadius: 999, background: brand.accent, color: '#fff', fontFamily: brand.display, fontSize: 44 * u, border: brand.toon ? `${5 * u}px solid ${brand.ink}` : undefined, boxShadow: brand.toon ? `${7 * u}px ${7 * u}px 0 ${brand.ink}` : undefined, transform: brand.toon ? 'rotate(1deg)' : undefined}}>
          {cta}
        </div>
      </Reveal>
      {!isVertical ? (
        <div style={{display: 'flex', gap: 40 * u, marginTop: 70 * u}}>
          {['Next video', 'Playlist'].map((label, i) => (
            <Reveal key={label} delay={18 + i * 6} from="none">
              <div style={{width: 480 * u, height: 270 * u, borderRadius: 24 * u, border: `${brand.toon ? 4 * u : 2}px dashed ${brand.muted}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: brand.muted, fontSize: 30 * u}}>
                {label} (end screen slot)
              </div>
            </Reveal>
          ))}
        </div>
      ) : null}
      <Reveal delay={30} from="none">
        <div style={{fontSize: 22 * u, color: brand.muted, marginTop: 50 * u, maxWidth: '80%'}}>
          This video is for education and entertainment only and is not financial, tax, or legal advice. Do your own research.
        </div>
      </Reveal>
    </AbsoluteFill>
  );
};
