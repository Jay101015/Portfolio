import React, {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene, Word} from '../types';
import {displayWidth, stickerFootOld, stickerSettle, useLayout, useUpright} from './layout';
import {hostPosFor} from '../hostPos';
import {setCaptionsHigh} from '../paper/setpiece';

type Chunk = {words: Word[]; s: number; e: number; tilt: number};

// A Short's caption is always one line, on a pill of one height, in the place upright.json gives its scene. The type is
// 76 px; words too wide for the line at that size are set smaller, down to 56 px, and a chunk that would need smaller
// still, or runs over about 28 characters, hands its last word on to a chunk of its own. A single word longer than the
// line is set as small as it takes. Nothing wraps, so the pill never changes height. (px on a 1080 px wide frame)
const LINE = {min: 56, chars: 28, gap: 12, padH: 30};
/** the size (px) at which these words sit on one line `room` wide: `base` when they fit, smaller when they do not
 * (the gap after each word counted as the browser counts it) */
const fitLine = (words: Word[], base: number, room: number, u: number, family: string) => {
  const em = words.reduce((n, w) => n + displayWidth(w.w, 1, family), 0);
  return Math.min(base, (room - LINE.gap * u * words.length) / Math.max(0.01, em));
};
/** chunks cut so that every one passes `fits`: the longest run of a chunk's first words that fits stays, the rest
 * follow as chunks of their own (a single word is kept whole) */
const cutToLine = (chunks: Chunk[], fits: (words: Word[]) => boolean): Chunk[] => {
  const out: Chunk[] = [];
  for (const c of chunks) {
    let rest = c.words;
    while (rest.length) {
      let n = rest.length;
      while (n > 1 && !fits(rest.slice(0, n))) n--;
      const words = rest.slice(0, n);
      out.push({words, s: words[0].s, e: words[words.length - 1].e, tilt: ((out.length * 7) % 5) - 2});
      rest = rest.slice(n);
    }
  }
  return out;
};

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

export const Captions: React.FC<{scenes: Scene[]; brand: Brand; host?: string; always?: boolean; hook?: string}> = ({scenes, brand, host, always, hook}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, isVertical, pad, width, height} = useLayout();
  const up = useUpright();
  const t = frame / fps;
  const oneLine = !!up && !!brand.paper; // a Short in the paper and board looks: one line, always
  const room = width - pad * 2 - LINE.padH * 2 * u; // the widest the words may run inside the pill
  const chunks = useMemo(() => {
    const three = chunkWords(scenes.flatMap((s) => s.words ?? []), isVertical ? 3 : 6); // a Short: three big words at a time
    if (!oneLine) return three;
    return cutToLine(three, (words) => words.map((w) => w.w).join(' ').length <= LINE.chars && fitLine(words, LINE.min * u, room, u, brand.display) >= LINE.min * u);
  }, [scenes, isVertical, oneLine, room, u, brand.display]);
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
      <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', paddingBottom: isVertical ? height * 0.3 : 48 * u, ...sideStyle}}>
        <div style={{maxWidth: shift === 0 ? `calc(100% - ${pad * 2}px)` : width * 0.52, fontFamily: brand.display, fontSize: (isVertical ? 80 : 50) * u, lineHeight: 1.15, textAlign: 'center', transform: `rotate(${chunk.tilt * 0.4}deg)`, textShadow: halo, color: brand.ink}}>
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
    // ink on the page, the word being said swiped with a highlighter. A Short with set pieces carries them high, on a
    // white pill (as the £25K Short did): under the hook, over his head, clear of the Shorts title and buttons.
    // on a board in a Short the board's own lines take the top: the caption goes in the middle, under them and over
    // the character's head (he stands lower right), clear of the title band and the buttons
    // ...except on a stat, chart or other figure scene, whose figure sits in the middle: there the caption goes high,
    // under the hook banner and over the figure's label
    // a list's rows run down the middle and a clip is fitted under the sticker: both carry the caption high too
    // Where each kind of scene carries it is in upright.json (components/layout.ts): the caption band, under the
    // sticker's band and over the stage, on every scene whose content sits in the stage; the middle of a board; and
    // on a set piece (and a compare, until its boxes are laid into the stage) a little higher, over the head or the
    // title that sits just under 22%.
    const place = up ? up.captionPlace(current?.type) : 'band';
    const onBoard = !!up && !!current && place === 'board';
    const high = isVertical && (onBoard || setCaptionsHigh(scenes) || (!!current && current.type !== 'outro'));
    let top = up ? up.captionTop(current?.type) : 0;
    // on a set piece the sticker keeps its older place, and for its first three seconds it is big enough to reach the
    // caption's: the caption rides just under it until it has settled
    if (up && place === 'set' && hook) top = Math.max(top, stickerFootOld(hook, stickerSettle(frame, fps), width, height, brand.display) + 14 * u);
    const base = (isVertical ? (high ? 76 : 78) : 40) * u;
    const size = oneLine ? fitLine(chunk.words, base, high ? room : width - pad * 2, u, brand.display) : base;
    return (
      <AbsoluteFill style={high ? {justifyContent: 'flex-start', alignItems: 'center', paddingTop: top} : {justifyContent: 'flex-end', alignItems: 'center', paddingBottom: isVertical ? height * 0.3 : 52 * u, ...sideStyle}}>
        <div style={{...(oneLine ? {whiteSpace: 'nowrap'} : {maxWidth: `calc(100% - ${pad * 2}px)`}), fontFamily: isVertical ? brand.display : brand.font, fontSize: size, fontWeight: isVertical ? 800 : 700, lineHeight: oneLine ? `${base * 1.2}px` : 1.2, textAlign: 'center', color: brand.ink, ...(high ? {background: 'rgba(255,255,255,0.94)', borderRadius: 24 * u, padding: `${10 * u}px ${30 * u}px`} : {})}}>
          {chunk.words.map((w, i) => {
            const since = t - w.s;
            const swipe = Math.max(0, Math.min(1, (since + 0.02) / 0.16));
            return (
              <span key={i} style={{display: 'inline-block', marginRight: 12 * u, position: 'relative', ...(oneLine ? {lineHeight: 1.2} : {}), color: since >= -0.02 ? brand.ink : brand.muted}}>
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
    <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', paddingBottom: isVertical ? height * 0.3 : 56 * u, ...sideStyle}}>
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
