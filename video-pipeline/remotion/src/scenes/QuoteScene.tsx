import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene} from '../types';
import {Reveal} from '../components/Reveal';
import {findPhraseTime, useLayout} from '../components/layout';
import {pop} from '../components/motion';

export const QuoteScene: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, isVertical} = useLayout();
  const quote: string = scene.props.quote ?? scene.narration;
  const attribution: string | undefined = scene.props.attribution;
  if (brand.toon) {
    return (
      <AbsoluteFill style={{justifyContent: 'center', padding: pad}}>
        <Reveal delay={0} from="none">
          <div style={{fontFamily: brand.display, fontSize: 220 * u, lineHeight: 0.6, color: brand.accent2, marginBottom: 10 * u, WebkitTextStroke: `${3 * u}px ${brand.ink}`}}>“</div>
        </Reveal>
        <Reveal delay={6} distance={50}>
          <div style={{fontFamily: brand.display, fontSize: (isVertical ? 60 : 76) * u, lineHeight: 1.2, maxWidth: isVertical ? '100%' : '62%', transform: 'rotate(-1deg)'}}>{quote}</div>
        </Reveal>
        {attribution ? (
          <Reveal delay={20}>
            <div style={{fontSize: 36 * u, color: brand.muted, marginTop: 40 * u}}>— {attribution}</div>
          </Reveal>
        ) : null}
      </AbsoluteFill>
    );
  }
  // Motion-graphics look: centred; the words land one by one, timed to the voice when the quote is read aloud.
  const words = quote.split(/\s+/).filter(Boolean);
  const spokenAt = findPhraseTime(scene.words, quote);
  const start = spokenAt !== null ? Math.round((spokenAt - scene.start) * fps) : 8;
  const per = spokenAt !== null && scene.words ? Math.max(2, Math.round(((scene.end - scene.start) * fps * 0.5) / Math.max(1, words.length))) : 3;
  const q = pop(frame, fps, 0, 10);
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', padding: pad, textAlign: 'center'}}>
      <div style={{fontFamily: brand.display, fontSize: 240 * u, lineHeight: 0.5, color: brand.accent2, marginBottom: 30 * u, transform: `scale(${q})`, opacity: 0.9}}>“</div>
      <div style={{fontFamily: brand.display, fontSize: (isVertical ? 62 : 80) * u, fontWeight: 700, lineHeight: 1.2, letterSpacing: -1.5 * u, maxWidth: isVertical ? '100%' : '78%'}}>
        {words.map((w, i) => {
          const s = pop(frame, fps, start + i * per, 14);
          return (
            <span key={i} style={{display: 'inline-block', marginRight: 20 * u, opacity: Math.min(1, s * 1.5), transform: `translateY(${(1 - s) * 24 * u}px)`}}>
              {w}
            </span>
          );
        })}
      </div>
      {attribution ? (
        <Reveal delay={start + words.length * per + 6}>
          <div style={{fontSize: 38 * u, color: brand.muted, marginTop: 44 * u}}>— {attribution}</div>
        </Reveal>
      ) : null}
    </AbsoluteFill>
  );
};
