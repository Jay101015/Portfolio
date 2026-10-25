import React, {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene, Word} from '../types';
import {useLayout} from './layout';
import {hostPosFor} from '../hostPos';

type Chunk = {words: Word[]; s: number; e: number; tilt: number};

const chunkWords = (words: Word[], maxWords: number): Chunk[] => {
  const chunks: Chunk[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) chunks.push({words: cur, s: cur[0].s, e: cur[cur.length - 1].e, tilt: ((chunks.length * 7) % 5) - 2});
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

export const Captions: React.FC<{scenes: Scene[]; brand: Brand; host?: string; always?: boolean}> = ({scenes, brand, host, always}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, isVertical, pad, width} = useLayout();
  const t = frame / fps;
  const chunks = useMemo(() => chunkWords(scenes.flatMap((s) => s.words ?? []), isVertical ? 4 : 6), [scenes, isVertical]);
  const chunk = chunks.find((c) => t >= c.s - 0.05 && t <= c.e + 0.35);
  if (!chunk) return null;
  const current = scenes.find((s) => t >= s.start && t < s.end);
  if (current?.type === 'text' && !always) return null; // the board already has the words; a Short captions everything
  // keep the caption out from under the host: shift it to the side the character is not on
  const hostPos = current ? hostPosFor(current, brand.toon, host) : 'none';
  const shift = isVertical || hostPos === 'none' || hostPos === 'full' ? 0 : hostPos.endsWith('left') ? 1 : -1;
  const sideStyle: React.CSSProperties = shift === 0 ? {} : {alignItems: shift > 0 ? 'flex-end' : 'flex-start', paddingLeft: shift > 0 ? width * 0.42 : pad, paddingRight: shift < 0 ? width * 0.42 : pad};

  if (brand.toon) {
    // hand-lettered, no pill: ink text with a paper halo so it sits on footage too
    const halo = `0 0 ${6 * u}px ${brand.bg}, 0 0 ${6 * u}px ${brand.bg}, ${3 * u}px ${3 * u}px 0 ${brand.bg}, -${3 * u}px -${3 * u}px 0 ${brand.bg}, ${3 * u}px -${3 * u}px 0 ${brand.bg}, -${3 * u}px ${3 * u}px 0 ${brand.bg}`;
    return (
      <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', paddingBottom: (isVertical ? 120 : 48) * u, ...sideStyle}}>
        <div style={{maxWidth: shift === 0 ? `calc(100% - ${pad * 2}px)` : width * 0.52, fontFamily: brand.display, fontSize: (isVertical ? 60 : 50) * u, lineHeight: 1.15, textAlign: 'center', transform: `rotate(${chunk.tilt * 0.4}deg)`, textShadow: halo, color: brand.ink}}>
          {chunk.words.map((w, i) => {
            const active = t >= w.s - 0.02 && t < w.e + 0.08;
            return (
              <span key={i} style={{color: active ? brand.accent : brand.ink, marginRight: 16 * u, display: 'inline-block', transform: active ? 'translateY(-3px) rotate(-2deg)' : undefined}}>
                {w.w}
              </span>
            );
          })}
        </div>
      </AbsoluteFill>
    );
  }
  if (brand.paper) {
    // ink on the page, the word being said swiped with a highlighter
    return (
      <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', paddingBottom: (isVertical ? 120 : 52) * u, ...sideStyle}}>
        <div style={{maxWidth: `calc(100% - ${pad * 2}px)`, fontFamily: brand.font, fontSize: (isVertical ? 46 : 40) * u, fontWeight: 700, lineHeight: 1.3, textAlign: 'center', color: brand.ink}}>
          {chunk.words.map((w, i) => {
            const since = t - w.s;
            const swipe = Math.max(0, Math.min(1, (since + 0.02) / 0.16));
            return (
              <span key={i} style={{display: 'inline-block', marginRight: 12 * u, position: 'relative', color: since >= -0.02 ? brand.ink : brand.muted}}>
                <span style={{position: 'absolute', left: -4 * u, right: -4 * u, top: '14%', bottom: '4%', background: brand.marker ?? '#ffe66d', opacity: 0.8, transform: `skewX(-6deg) scaleX(${swipe})`, transformOrigin: 'left center', borderRadius: 3}} />
                <span style={{position: 'relative'}}>{w.w}</span>
              </span>
            );
          })}
        </div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', paddingBottom: (isVertical ? 120 : 56) * u, ...sideStyle}}>
      <div style={{maxWidth: shift === 0 ? `calc(100% - ${pad * 2}px)` : width * 0.52, padding: `${14 * u}px ${30 * u}px`, borderRadius: 18 * u, background: 'rgba(5,8,20,0.74)', border: `1px solid ${brand.text}14`, fontSize: (isVertical ? 46 : 40) * u, fontWeight: 700, lineHeight: 1.25, textAlign: 'center', textShadow: '0 2px 8px rgba(0,0,0,0.6)'}}>
        {chunk.words.map((w, i) => {
          const active = t >= w.s - 0.02 && t < w.e + 0.08;
          const spoken = t >= w.s;
          return (
            <span key={i} style={{color: active ? brand.accent2 : spoken ? brand.text : brand.muted, marginRight: 10 * u}}>
              {w.w}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
