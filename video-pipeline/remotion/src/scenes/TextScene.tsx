import React, {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene, Word} from '../types';
import {Reveal} from '../components/Reveal';
import {useLayout} from '../components/layout';
import {pop} from '../components/motion';

/** Kinetic narration: the sentence currently being spoken, words lighting up as they land. */
export const TextScene: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, isVertical} = useLayout();
  const t = scene.start + frame / fps;
  const headline: string | undefined = scene.props.headline;

  const sentences = useMemo(() => {
    const words: Word[] = scene.words ?? [];
    const groups: Word[][] = [];
    let cur: Word[] = [];
    for (const w of words) {
      cur.push(w);
      if (/[.!?]$/.test(w.w) || cur.length >= (isVertical ? 10 : 14)) {
        groups.push(cur);
        cur = [];
      }
    }
    if (cur.length) groups.push(cur);
    return groups;
  }, [scene.words, isVertical]);

  const idx = Math.max(
    0,
    sentences.findIndex((g) => t <= g[g.length - 1].e + 0.3),
  );
  const group = sentences[idx === -1 ? sentences.length - 1 : idx] ?? [];
  const groupStartFrame = group.length ? Math.round((group[0].s - scene.start) * fps) : 0;
  const glossy = !brand.toon;

  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: glossy ? 'center' : 'flex-start', padding: pad, textAlign: glossy ? 'center' : 'left'}}>
      {headline ? (
        <Reveal delay={0}>
          <div style={{fontFamily: brand.display, fontSize: 36 * u, letterSpacing: brand.toon ? 0 : 4, color: brand.accent, marginBottom: 30 * u, fontWeight: glossy ? 700 : 400}}>{brand.toon ? headline : headline.toUpperCase()}</div>
        </Reveal>
      ) : null}
      <Reveal key={idx} delay={Math.max(0, groupStartFrame - 2)} distance={30}>
        <div style={{fontFamily: brand.display, fontSize: (isVertical ? 64 : glossy ? 92 : 84) * u, fontWeight: brand.toon ? 400 : 700, lineHeight: 1.15, letterSpacing: brand.toon ? 0 : -2 * u, maxWidth: isVertical ? '100%' : '88%'}}>
          {group.map((w, i) => {
            const lit = t >= w.s - 0.03;
            const wf = Math.round((w.s - scene.start) * fps) - 1;
            const s = glossy ? pop(frame, fps, wf, 14) : 1;
            return (
              <span key={i} style={{color: lit ? brand.text : `${brand.text}44`, marginRight: 20 * u, display: 'inline-block', transform: brand.toon && lit ? `rotate(${((i * 7) % 5) - 2}deg)` : glossy ? `translateY(${(1 - s) * 18 * u}px) scale(${0.92 + 0.08 * s})` : undefined}}>
                {w.w}
              </span>
            );
          })}
        </div>
      </Reveal>
    </AbsoluteFill>
  );
};
