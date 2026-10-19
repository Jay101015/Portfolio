import React, {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene, Word} from '../types';
import {Reveal} from '../components/Reveal';
import {useLayout} from '../components/layout';

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

  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad}}>
      {headline ? (
        <Reveal delay={0}>
          <div style={{fontSize: 34 * u, fontWeight: 700, letterSpacing: 3, color: brand.accent, marginBottom: 30 * u}}>{headline.toUpperCase()}</div>
        </Reveal>
      ) : null}
      <Reveal key={idx} delay={Math.max(0, groupStartFrame - 2)} distance={30}>
        <div style={{fontSize: (isVertical ? 64 : 80) * u, fontWeight: 800, lineHeight: 1.15, letterSpacing: -1.5 * u, maxWidth: isVertical ? '100%' : '88%'}}>
          {group.map((w, i) => {
            const lit = t >= w.s - 0.03;
            return (
              <span key={i} style={{color: lit ? brand.text : `${brand.text}44`, marginRight: 18 * u}}>
                {w.w}
              </span>
            );
          })}
        </div>
      </Reveal>
    </AbsoluteFill>
  );
};
