import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene} from '../types';
import {Reveal} from '../components/Reveal';
import {useLayout} from '../components/layout';
import {pop} from '../components/motion';

export const OutroScene: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, isVertical} = useLayout();
  const title: string = scene.props.title ?? 'Thanks for watching';
  const cta: string = scene.props.cta ?? 'Subscribe for weekly money breakdowns';
  const glossy = !brand.toon;
  const s = pop(frame, fps, 0, 12);
  const breathe = glossy ? 1 + 0.03 * Math.sin(frame / 10) : 1;
  const c = pop(frame, fps, 10, 10);
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: glossy ? 'center' : 'flex-start', padding: pad, textAlign: glossy ? 'center' : 'left'}}>
      <div style={{fontFamily: brand.display, fontSize: (isVertical ? 80 : glossy ? 112 : 100) * u, fontWeight: brand.toon ? 400 : 700, lineHeight: 1.05, letterSpacing: glossy ? -3 * u : 0, maxWidth: isVertical ? '100%' : glossy ? '80%' : '58%', transform: brand.toon ? 'rotate(-1.5deg)' : `translateY(${(1 - s) * 40 * u}px)`, opacity: brand.toon ? 1 : Math.min(1, s * 1.4)}}>{title}</div>
      <div style={{display: 'inline-flex', marginTop: 40 * u, padding: `${18 * u}px ${44 * u}px`, borderRadius: 999, background: brand.accent, color: brand.toon ? '#fff' : brand.bg, fontFamily: brand.display, fontSize: 46 * u, fontWeight: brand.toon ? 400 : 700, border: brand.toon ? `${5 * u}px solid ${brand.ink}` : undefined, boxShadow: brand.toon ? `${7 * u}px ${7 * u}px 0 ${brand.ink}` : `0 ${12 * u}px ${40 * u}px ${brand.accent}66`, transform: brand.toon ? 'rotate(1deg)' : `scale(${c * breathe})`, opacity: brand.toon ? 1 : Math.min(1, c * 1.5)}}>
        {cta}
      </div>
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
    </AbsoluteFill>
  );
};
