import React, {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene, Word} from '../types';
import {useLayout} from './layout';

type Chunk = {words: Word[]; s: number; e: number};

const chunkWords = (words: Word[], maxWords: number): Chunk[] => {
  const chunks: Chunk[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) chunks.push({words: cur, s: cur[0].s, e: cur[cur.length - 1].e});
    cur = [];
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const gapBefore = cur.length ? w.s - cur[cur.length - 1].e : 0;
    if (cur.length && gapBefore > 0.7) flush();
    cur.push(w);
    const endsSentence = /[.!?]$/.test(w.w);
    const endsClause = /[,;:]$/.test(w.w) && cur.length >= 3;
    if (cur.length >= maxWords || endsSentence || endsClause) flush();
  }
  flush();
  return chunks;
};

export const Captions: React.FC<{scenes: Scene[]; brand: Brand}> = ({scenes, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, isVertical, pad} = useLayout();
  const t = frame / fps;
  const chunks = useMemo(() => {
    const all = scenes.flatMap((s) => s.words ?? []);
    return chunkWords(all, isVertical ? 4 : 6);
  }, [scenes, isVertical]);
  const chunk = chunks.find((c) => t >= c.s - 0.05 && t <= c.e + 0.35);
  if (!chunk) return null;
  const inTextScene = scenes.some((s) => s.type === 'text' && t >= s.start && t < s.end);
  if (inTextScene) return null; // the kinetic text scene already shows these words
  if (!chunk) return null;
  return (
    <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', paddingBottom: (isVertical ? 260 : 56) * u}}>
      <div
        style={{
          maxWidth: `calc(100% - ${pad * 2}px)`,
          padding: `${14 * u}px ${28 * u}px`,
          borderRadius: 16 * u,
          background: 'rgba(5,8,20,0.72)',
          fontSize: (isVertical ? 44 : 36) * u,
          fontWeight: 700,
          lineHeight: 1.25,
          textAlign: 'center',
          textShadow: '0 2px 8px rgba(0,0,0,0.6)',
        }}
      >
        {chunk.words.map((w, i) => {
          const active = t >= w.s - 0.02 && t < w.e + 0.08;
          const spoken = t >= w.s;
          return (
            <span key={i} style={{color: active ? brand.accent2 : spoken ? brand.text : brand.muted, marginRight: 10 * u, transition: 'none'}}>
              {w.w}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
