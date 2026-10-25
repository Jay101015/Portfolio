import React, {useMemo} from 'react';
import {AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Check, X} from 'lucide-react';
import type {Brand, Scene, Word} from '../types';
import {compactNum, findPhraseTime, formatNum, parseValue, useLayout} from '../components/layout';
import {fadeIn, pop, rnd} from '../components/motion';
import {Arrow, Marker, SketchEllipse, SketchLine, SketchPath, SketchRect, Underline, roughGen} from './sketch';
import {Doodle, Write, WriteSpoken, pickDoodle, writeFrames} from './write';
import {Art, PaperArt, isTraced, pickArt, pickArtAmong} from './art';
import {PaperBite, PaperGrow, PaperPie, PaperShrink} from './money';
import {Erase} from './erase';
import {keyWords, keyPhrase} from './phrase';
import {Media} from './media';
import {Loop} from 'remotion';

/**
 * The paper look: every scene is laid out like a page someone wrote on. Big words in a serif, notes in
 * handwriting, charts sketched with a pen, the word being said swiped with a highlighter. Layouts sit
 * left with room on the right for a margin note, not centred like a slide.
 *
 * The whiteboard look (brand.board) keeps the layouts but writes everything on: text appears a character at a
 * time at a marker's pace, shapes draw stroke by stroke, a doodle is sketched in the corner, and the hand layer
 * in Video.tsx follows whatever is mid-stroke. Nothing fades in on a board; it gets written or it is not there.
 */

type P = {scene: Scene; brand: Brand};
const hand = (b: Brand) => b.hand ?? 'cursive';
const marker = (b: Brand) => b.marker ?? '#ffe66d';
const ease = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
const lin = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
/** headline weight: the serif wants 900, a marker face has one weight */
const dw = (b: Brand, w = 900) => (b.board ? 400 : w);

/** Words that land one at a time, each with its own tiny settle so the rhythm is not mechanical. */
const Words: React.FC<{text: string; frame: number; fps: number; start?: number; per?: number; style?: React.CSSProperties; seed?: number}> = ({text, frame, fps, start = 4, per = 3, style, seed = 0}) => (
  <span style={style}>
    {text.split(/\s+/).filter(Boolean).map((w, i) => {
      const s = pop(frame, fps, start + i * per + Math.round(rnd(seed + i) * 2), 12 + rnd(seed + 40 + i) * 6);
      return (
        <span key={i} style={{display: 'inline-block', marginRight: '0.26em', opacity: Math.min(1, s * 1.5), transform: `translateY(${(1 - s) * 18}px) rotate(${(1 - s) * (rnd(seed + 80 + i) - 0.5) * 4}deg)`}}>
          {w}
        </span>
      );
    })}
  </span>
);

/** Text on the page: written on with the marker on a board, landing word by word on paper. Returns when it is done via `writeFrames`. */
const Txt: React.FC<{brand: Brand; text: string; frame: number; fps: number; start?: number; per?: number; cps?: number; seed?: number; color?: string; style?: React.CSSProperties}> = ({brand, text, frame, fps, start = 4, per = 3, cps, seed, color, style}) =>
  brand.board ? <Write text={text} frame={frame} fps={fps} start={start} cps={cps} color={color} style={style} /> : <Words text={text} frame={frame} fps={fps} start={start} per={per} seed={seed} style={style} />;

/** frames until a run of text is fully on the page, in either look */
const doneAt = (brand: Brand, text: string, fps: number, start: number, per = 3, cps?: number) => (brand.board ? start + writeFrames(text, fps, cps) : start + text.split(/\s+/).filter(Boolean).length * per + 8);

/** Something fading in on paper, written (clip-wiped) on a board. */
const Soft: React.FC<{brand: Brand; frame: number; delay: number; len?: number; children: React.ReactNode; style?: React.CSSProperties}> = ({brand, frame, delay, len = 10, children, style}) => {
  const p = lin(frame, delay, delay + len);
  if (brand.board) return <div style={{...style, clipPath: p >= 1 ? undefined : `inset(-4px ${(1 - p) * 100}% -4px 0)`, visibility: p <= 0 ? 'hidden' : undefined}}>{children}</div>;
  return <div style={{...style, opacity: ease(frame, delay, delay + len)}}>{children}</div>;
};

const Source: React.FC<{brand: Brand; source?: string; delay?: number}> = ({brand, source, delay = 24}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u} = useLayout();
  if (!source) return null;
  const style = {fontFamily: hand(brand), fontSize: 30 * u, color: brand.muted};
  if (brand.board) return <div style={style}><Write text={`source: ${source}`} frame={frame} fps={fps} start={delay} cps={40} color={brand.muted} /></div>;
  return <div style={{...style, opacity: fadeIn(frame, delay, 8)}}>source: {source}</div>;
};

/** The corner drawing a scene gets by itself: an `icon=` always; otherwise one picked from the words only when the
 * header says `brand.doodles: on` (off by default: a drawing on every scene gets tiring). */
const autoDoodle = (brand: Brand, icon: string | undefined, ...texts: (string | undefined)[]) => (icon || brand.autoArt ? pickDoodle(icon, ...texts) : undefined);
/** the drawing a scene's words call up: in the illustrated style one of the traced people-and-scene drawings, else (when
 * `brand.doodles: on`) any drawing in the library */
const autoArt = (brand: Brand, ...texts: (string | undefined)[]) => (brand.illustrated ? pickArtAmong(isTraced, ...texts) : brand.autoArt ? pickArt(undefined, ...texts) : undefined);
/** a traced illustration on a scene in the illustrated style is the picture, not a corner note: it gets the right half */
const bigArt = (brand: Brand, art: string | undefined) => !!(brand.illustrated && art && isTraced(art));

/** A doodle in the top-right corner of the board, drawn after the headline is written. */
const CornerDoodle: React.FC<{brand: Brand; name?: string; art?: string; frame: number; fps: number; start: number; seed?: number; color?: string}> = ({brand, name, art, frame, fps, start, seed = 1, color}) => {
  const {u, pad, isVertical} = useLayout();
  if (!brand.board || (!name && !art)) return null;
  void frame;
  if (bigArt(brand, art)) {
    const size = (isVertical ? 760 : 760) * u; // picture first: 70% of the board's height
    return (
      <div style={{position: 'absolute', right: pad * 0.5, width: size, height: size, ...(isVertical ? {bottom: pad * 1.0, left: '50%', transform: 'translateX(-50%)'} : {top: '50%', transform: 'translateY(-50%)'})}}>
        <Art name={art as string} size={size} brand={brand} start={start} seed={seed} />
      </div>
    );
  }
  const size = (isVertical ? 200 : 260) * u * (art ? 1.3 : 1);
  return (
    <div style={{position: 'absolute', top: isVertical ? pad * 1.3 : pad * 0.9, right: pad * 0.9, width: size, height: size}}>
      {art ? <Art name={art} size={size} brand={brand} start={start} seed={seed} /> : <Doodle name={name as string} size={size} win={[start, start + fps * 0.9]} stroke={color ?? brand.ink} width={1.5} seed={seed} />}
    </div>
  );
};

// ------------------------------------------------------------------ title
export const PaperTitle: React.FC<P> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, isVertical, width} = useLayout();
  const title: string = scene.props.title ?? scene.narration;
  const subtitle: string | undefined = scene.props.subtitle;
  const kicker: string | undefined = scene.props.kicker;
  const words = title.split(/\s+/).filter(Boolean);
  const kickerDone = kicker ? doneAt(brand, kicker, fps, 0, 2, 34) : 0;
  const titleStart = brand.board ? kickerDone + 2 : 4;
  const titleDone = brand.board ? doneAt(brand, title, fps, titleStart, 3, 20) : 10 + words.length * 3;
  const ul = ease(frame, titleDone, titleDone + fps * 0.6);
  const subStart = titleDone + Math.round(fps * 0.5);
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad, paddingLeft: pad * 1.2}}>
      {kicker ? (
        <div style={{fontFamily: hand(brand), fontSize: 46 * u, color: brand.accent2, marginBottom: 10 * u, transform: 'rotate(-2deg)', transformOrigin: 'left', opacity: brand.board ? 1 : fadeIn(frame, 0, 8)}}>
          {brand.board ? <Write text={kicker} frame={frame} fps={fps} start={0} cps={34} color={brand.accent2} /> : kicker}
        </div>
      ) : null}
      <div style={{fontFamily: brand.display, fontWeight: dw(brand), fontSize: (isVertical ? 96 : 124) * u * (brand.board ? 1.08 : 1), lineHeight: 1.02, letterSpacing: brand.board ? 0 : -2 * u, color: brand.ink, maxWidth: isVertical ? '100%' : '82%'}}>
        <Txt brand={brand} text={title} frame={frame} fps={fps} start={titleStart} cps={20} seed={3} />
      </div>
      <Underline width={Math.min(width * 0.42, 640 * u)} stroke={brand.accent2} thickness={7 * u} win={[titleDone, titleDone + fps * 0.6]} easeOut seed={5} style={{marginTop: 18 * u}} />
      {subtitle ? (
        <div style={{fontSize: (isVertical ? 40 : 44) * u, color: brand.muted, marginTop: 26 * u, maxWidth: isVertical ? '100%' : '62%', lineHeight: 1.35, opacity: brand.board ? 1 : fadeIn(frame, 18, 10)}}>
          {brand.board ? <Write text={subtitle} frame={frame} fps={fps} start={subStart} cps={34} color={brand.muted} /> : subtitle}
        </div>
      ) : null}
      <div style={{fontFamily: hand(brand), fontSize: 28 * u, color: brand.muted, marginTop: 60 * u, opacity: fadeIn(frame, brand.board ? subStart + fps : 30, 10)}}>for education, not advice</div>
      <CornerDoodle brand={brand} name={scene.props.sticker || scene.props.art ? undefined : autoDoodle(brand, scene.props.icon, title, subtitle)} art={scene.props.sticker || scene.props.art || scene.props.icon ? undefined : autoArt(brand, title, subtitle, scene.narration)} frame={frame} fps={fps} start={titleDone + fps * 0.7} seed={1} color={brand.blue} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ stat
export const PaperStat: React.FC<P> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, isVertical, width} = useLayout();
  const raw = String(scene.props.value ?? '');
  const parsed = parseValue(raw);
  const from = scene.props.from !== undefined ? parseValue(String(scene.props.from))?.num ?? 0 : 0;
  const countSec = Number(scene.props.countSeconds ?? 1.4);
  const label: string | undefined = scene.props.label;
  const sub: string | undefined = scene.props.sub;
  const labelDone = label ? doneAt(brand, label, fps, 0, 2, 34) : 0;
  const numStart = brand.board ? labelDone + 2 : 6;
  // on the board the number is written, not counted: a marker cannot count up
  const p = brand.board ? 1 : ease(frame, numStart, numStart + fps * countSec);
  const display = parsed ? `${parsed.prefix}${formatNum(from + (parsed.num - from) * p, parsed.decimals, parsed.grouped || parsed.num >= 1000)}${parsed.suffix}` : raw;
  const s = pop(frame, fps, 3, 13);
  const digits = display.length;
  const size = (isVertical ? 190 : 300) * u * (digits > 9 ? 0.7 : digits > 7 ? 0.85 : 1);
  const numDone = brand.board ? doneAt(brand, display, fps, numStart, 3, 9) : 8 + fps * countSec * 0.6;
  const ul = ease(frame, numDone, numDone + fps * 0.5);
  const noteStart = brand.board ? numDone + Math.round(fps * 0.3) : 20;
  const note = brand.board ? lin(frame, noteStart, noteStart + 8) : fadeIn(frame, 20, 10);
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad, paddingLeft: pad * 1.2}}>
      {label ? (
        <div style={{fontFamily: hand(brand), fontSize: 50 * u, color: brand.accent2, transform: 'rotate(-1.5deg)', transformOrigin: 'left', opacity: brand.board ? 1 : fadeIn(frame, 0, 8), marginBottom: 4 * u}}>
          {brand.board ? <Write text={label} frame={frame} fps={fps} start={0} cps={34} color={brand.accent2} /> : label}
        </div>
      ) : null}
      <div style={{display: 'flex', alignItems: 'flex-end', gap: 50 * u, flexWrap: isVertical ? 'wrap' : 'nowrap'}}>
        <div>
          <div style={{fontFamily: brand.display, fontWeight: dw(brand), fontSize: size, lineHeight: 1, letterSpacing: brand.board ? 0 : -5 * u, color: brand.ink, fontVariantNumeric: 'tabular-nums', transform: brand.board ? undefined : `scale(${0.85 + 0.15 * s})`, transformOrigin: 'left bottom', opacity: brand.board ? 1 : Math.min(1, s * 1.5)}}>
            {brand.board ? <Write text={display} frame={frame} fps={fps} start={numStart} cps={9} wordGap="0.2em" /> : display}
          </div>
          <Underline width={Math.min(size * 2.4, width * 0.5)} stroke={brand.accent} thickness={8 * u} win={[numDone, numDone + fps * 0.5]} easeOut seed={7} style={{marginTop: 8 * u}} />
        </div>
        {sub ? (
          <div style={{display: 'flex', alignItems: 'center', gap: 16 * u, marginBottom: 40 * u, opacity: brand.board ? 1 : note, maxWidth: isVertical ? '100%' : width * 0.34}}>
            {!isVertical ? <Arrow length={120 * u} stroke={brand.accent2} win={brand.board ? [noteStart, noteStart + 8] : [20, 30]} angle={-8} seed={9} thickness={4 * u} /> : null}
            <div style={{fontFamily: hand(brand), fontSize: 44 * u, lineHeight: 1.15, color: brand.accent2, transform: 'rotate(-2deg)'}}>
              {brand.board ? <Write text={sub} frame={frame} fps={fps} start={noteStart + 8} cps={30} color={brand.accent2} /> : sub}
            </div>
          </div>
        ) : null}
      </div>
      <div style={{marginTop: 30 * u}}>
        <Source brand={brand} source={scene.props.source} delay={brand.board ? noteStart + (sub ? writeFrames(sub, fps, 30) + 12 : 4) : 24} />
      </div>
      <CornerDoodle brand={brand} name={scene.props.sticker || scene.props.art ? undefined : autoDoodle(brand, scene.props.icon, label, sub, scene.narration)} art={scene.props.sticker || scene.props.art || scene.props.icon ? undefined : autoArt(brand, label, sub, scene.narration, scene.narration)} frame={frame} fps={fps} start={brand.board ? Math.max(numDone + 6, 10) : 0} seed={scene.id} color={brand.blue} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ text (kinetic narration)
export const PaperText: React.FC<P> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, isVertical, width, height} = useLayout();
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
  const artName = scene.props.sticker || scene.props.art || scene.props.icon ? undefined : autoArt(brand, headline, scene.narration);
  const big = bigArt(brand, artName) && !isVertical; // the words keep to the left half, the picture has the right
  const corner = <CornerDoodle brand={brand} name={scene.props.sticker || scene.props.art ? undefined : autoDoodle(brand, scene.props.icon, headline, scene.narration)} art={artName} frame={frame} fps={fps} start={brand.board ? 6 : 0} seed={scene.id} />;
  const head = headline ? (
    <div style={{fontFamily: hand(brand), fontSize: 44 * u, color: brand.accent2, marginBottom: 24 * u, transform: 'rotate(-1.5deg)', transformOrigin: 'left', opacity: brand.board ? 1 : fadeIn(frame, 0, 8)}}>
      {brand.board ? <Write text={headline} frame={frame} fps={fps} start={0} cps={34} color={brand.accent2} /> : headline}
    </div>
  ) : null;
  if (!brand.board || brand.fullText) {
    // every word, as it is said: the paper look's kinetic type, and the board when the header asks for `brand.text: full`
    const idx = Math.max(0, sentences.findIndex((g) => t <= g[g.length - 1].e + 0.3));
    const group = sentences[idx === -1 ? sentences.length - 1 : idx] ?? [];
    return (
      <AbsoluteFill style={{justifyContent: 'center', padding: pad, paddingLeft: pad * 1.2}}>
        {head}
        <div key={idx} style={{fontFamily: brand.display, fontWeight: dw(brand, 700), fontSize: (isVertical ? 64 : 88) * u, lineHeight: 1.2, letterSpacing: brand.board ? 0 : -1 * u, color: brand.ink, maxWidth: isVertical ? '100%' : '86%'}}>
          {brand.board ? (
            <WriteSpoken words={group} t={t} fps={fps} sceneStart={scene.start} />
          ) : (
            group.map((w, i) => {
              const since = t - w.s;
              const lit = since >= -0.03;
              const swipe = Math.max(0, Math.min(1, (since + 0.03) / 0.18));
              return (
                <span key={i} style={{display: 'inline-block', marginRight: '0.28em', opacity: lit ? 1 : 0.28}}>
                  <Marker progress={swipe} color={marker(brand)}>{w.w}</Marker>
                </span>
              );
            })
          )}
        </div>
        {corner}
      </AbsoluteFill>
    );
  }
  // The board: the voice says the sentence, the marker writes the few words that carry it. Phrases build up a
  // page at a time; when the page is full it clears and the next page starts. `board="a | b"` sets the lines
  // yourself; `wrong="..."` writes a wrong idea first and clears it before the point is made.
  const MAX = isVertical || brand.illustrated ? 3 : 4; // the illustrated style keeps the board sparse: the picture is the point
  // beside a big picture the board gets one written line: `board=` if given, else the phrase that carries the scene
  const oneLine = big ? [scene.props.board ? String(scene.props.board).split('|')[0].trim() : keyPhrase(scene.narration, 6)] : null;
  const explicit: string[] | null = oneLine ?? (scene.props.board ? String(scene.props.board).split('|').map((x) => x.trim()).filter(Boolean) : null);
  const lines = oneLine
    ? [{words: keyWords(sentences[0] ?? [], 4), text: oneLine[0], at: Math.round(((sentences[0]?.[0]?.s ?? scene.start) - scene.start) * fps)}]
    : sentences.map((g, i) => ({words: keyWords(g, isVertical || brand.illustrated ? 4 : 5), text: explicit ? explicit[i] ?? '' : '', at: Math.round((g[0].s - scene.start) * fps)}));
  const pages: (typeof lines)[] = [];
  for (let i = 0; i < lines.length; i += MAX) pages.push(lines.slice(i, i + MAX));
  const wrong: string | undefined = scene.props.wrong;
  const wrongDone = wrong ? 4 + writeFrames(wrong, fps, 30) : 0;
  const firstAt = lines.length ? lines[0].at : fps;
  const wrongErase: [number, number] = [wrongDone + Math.round(fps * 0.6), 0];
  wrongErase[1] = wrongErase[0] + Math.round(fps * 0.6);
  // with a wrong idea on the board first, the real phrases wait until it has cleared (the voice runs on; the writing catches up)
  const shift = wrong ? Math.max(0, wrongErase[1] + 4 - firstAt) : 0;
  if (shift) for (const ln of lines) { ln.at += shift; ln.words = ln.words.map((w) => ({w: w.w, s: w.s + shift / fps, e: w.e + shift / fps})); }
  const lead = Math.round(fps * 0.8); // the page starts clearing this long before the first word of the next page
  let pageIdx = 0;
  for (let j = 1; j < pages.length; j++) if (frame >= pages[j][0].at - lead) pageIdx = j;
  const eraseWin: [number, number] | null = pageIdx > 0 ? [pages[pageIdx][0].at - lead, pages[pageIdx][0].at - Math.round(fps * 0.1)] : null;
  const boxW = big ? width * 0.42 - pad * 0.6 : width - pad * 2.4;
  const boxH = (isVertical ? 0.5 : 0.6) * height;
  const lineStyle: React.CSSProperties = {fontFamily: brand.display, fontWeight: dw(brand, 700), fontSize: (isVertical ? 66 : big ? 80 : 84) * u, lineHeight: 1.18, color: brand.ink, marginBottom: 14 * u, maxWidth: '100%'};
  const renderPage = (pg: typeof lines, offset: number) => (
    <div style={{position: 'absolute', inset: 0}}>
      {pg.map((ln, i) => (
        <div key={offset + i} style={lineStyle}>
          {explicit ? <Write text={ln.text} frame={frame} fps={fps} start={ln.at} cps={22} /> : <WriteSpoken words={ln.words} t={t} fps={fps} sceneStart={scene.start} />}
        </div>
      ))}
    </div>
  );
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad, paddingLeft: pad * 1.2}}>
      {head}
      <div style={{position: 'relative', width: boxW, height: boxH}}>
        {wrong ? (
          <Erase win={wrongErase} brand={brand} width={boxW} height={boxH * 0.45} style={{position: 'absolute', left: 0, top: 0}}>
            <div style={{...lineStyle, color: brand.accent2}}>
              <Write text={wrong} frame={frame} fps={fps} start={4} cps={30} color={brand.accent2} />
            </div>
          </Erase>
        ) : null}
        {eraseWin ? (
          <Erase win={eraseWin} brand={brand} width={boxW} height={boxH} style={{position: 'absolute', left: 0, top: 0}}>
            {renderPage(pages[pageIdx - 1], (pageIdx - 1) * MAX)}
          </Erase>
        ) : null}
        {pages[pageIdx] ? renderPage(pages[pageIdx], pageIdx * MAX) : null}
      </div>
      {corner}
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ takeaway card
/** A numbered section card: "Takeaway 2 of 5" in small hand above, the big number drawn in a ring, the title written
 * large beside it. The re-hook the money channels use every minute or so. */
export const PaperTakeaway: React.FC<P> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, isVertical, width, height} = useLayout();
  const n = String(scene.props.n ?? '1');
  const of = String(scene.props.of ?? '');
  const title: string = scene.props.title ?? scene.narration;
  const kicker = of ? `Takeaway ${n} of ${of}` : `Takeaway ${n}`;
  const kickDone = writeFrames(kicker, fps, 34) + 4;
  const ring = Math.round(fps * 0.6);
  const ringWin: [number, number] = [kickDone, kickDone + ring];
  const numAt = ringWin[1] + 2;
  const numDone = numAt + writeFrames(n, fps, 6) + 4;
  const R = (isVertical ? 300 : 340) * u;
  const hand = brand.hand ?? 'cursive';
  return (
    <AbsoluteFill style={{padding: pad, justifyContent: 'center'}}>
      <div style={{fontFamily: hand, fontSize: (isVertical ? 52 : 58) * u, color: brand.accent2, transform: 'rotate(-1.5deg)', transformOrigin: 'left', marginBottom: 18 * u}}>
        <Write text={kicker} frame={frame} fps={fps} start={2} cps={34} color={brand.accent2} />
      </div>
      <div style={{display: 'flex', flexDirection: isVertical ? 'column' : 'row', alignItems: 'center', gap: (isVertical ? 30 : 60) * u}}>
        <div style={{position: 'relative', width: R, height: R, flex: '0 0 auto'}}>
          <svg width={R} height={R} viewBox={`0 0 ${R} ${R}`} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
            <SketchEllipse cx={R / 2} cy={R / 2} w={R * 0.92} h={R * 0.92} win={ringWin} options={{stroke: brand.ink, strokeWidth: 7 * u, roughness: 1.4, seed: scene.id * 3 + 1}} />
          </svg>
          <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: brand.display, fontWeight: dw(brand, 700), fontSize: R * 0.56, color: brand.accent, lineHeight: 1}}>
            <Write text={n} frame={frame} fps={fps} start={numAt} cps={6} color={brand.accent} />
          </div>
        </div>
        <div style={{fontFamily: brand.display, fontWeight: dw(brand, 700), fontSize: (isVertical ? 70 : 92) * u, lineHeight: 1.15, color: brand.ink, maxWidth: isVertical ? '100%' : width - pad * 2 - R - 60 * u, textAlign: isVertical ? 'center' : 'left'}}>
          <Write text={title} frame={frame} fps={fps} start={numDone} cps={20} />
        </div>
      </div>
      {void height}
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ list
export const PaperList: React.FC<P> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, isVertical} = useLayout();
  const items: string[] = scene.props.items ?? [];
  const title: string | undefined = scene.props.title;
  const sceneLen = scene.end - scene.start;
  const numbered = scene.props.numbered !== false;
  const titleDone = title ? doneAt(brand, title, fps, 4, 2, 22) : 0;
  const delays = items.map((item, i) => {
    const spoken = findPhraseTime(scene.words, item);
    const delaySec = spoken !== null ? Math.max(0, spoken - scene.start) : Math.min(i * 0.9, sceneLen * 0.6 * (i / Math.max(1, items.length)));
    return Math.max(brand.board ? titleDone + 4 : 0, Math.round(delaySec * fps) + 6);
  });
  for (let i = 1; i < delays.length; i++) delays[i] = Math.max(delays[i], delays[i - 1] + (brand.board ? writeFrames(items[i - 1], fps, 30) + 14 : 8));
  const ul = ease(frame, brand.board ? titleDone : 6, (brand.board ? titleDone : 6) + fps * 0.5);
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad, paddingLeft: pad * 1.2}}>
      {title ? (
        <div style={{marginBottom: 34 * u, display: 'inline-block'}}>
          <div style={{fontFamily: brand.display, fontWeight: dw(brand, 700), fontSize: (isVertical ? 60 : 70) * u * (brand.board ? 1.1 : 1), color: brand.ink, letterSpacing: brand.board ? 0 : -1 * u}}>
            <Txt brand={brand} text={title} frame={frame} fps={fps} seed={11} per={2} cps={22} />
          </div>
          <Underline width={Math.min(560 * u, title.length * 28 * u)} stroke={brand.accent2} thickness={6 * u} win={[brand.board ? titleDone : 6, (brand.board ? titleDone : 6) + fps * 0.5]} easeOut seed={12} />
        </div>
      ) : null}
      {items.map((item, i) => {
        const s = pop(frame, fps, delays[i], 14);
        const lit = frame >= delays[i];
        const tick = ease(frame, delays[i] + 4, delays[i] + 14);
        const circle = brand.board ? lin(frame, delays[i], delays[i] + 8) : Math.min(1, s * 1.2);
        return (
          <div key={i} style={{display: 'flex', alignItems: 'center', gap: 30 * u, marginBottom: 26 * u, opacity: brand.board ? 1 : 0.3 + 0.7 * Math.min(1, s * 1.5), transform: brand.board ? undefined : `translateX(${(1 - s) * -30 * u}px)`}}>
            <svg width={76 * u} height={76 * u} viewBox="0 0 76 76" style={{flexShrink: 0, overflow: 'visible', visibility: brand.board && circle <= 0 ? 'hidden' : undefined}}>
              <SketchEllipse cx={38} cy={38} w={64} h={64} draw={circle} win={brand.board ? [delays[i], delays[i] + 8] : undefined} options={{stroke: brand.ink, strokeWidth: 3, seed: 20 + i, fill: lit && !brand.board ? marker(brand) : undefined, fillStyle: 'solid'}} />
              {numbered ? (
                <text x={38} y={50} textAnchor="middle" fontFamily={hand(brand)} fontSize={40} fontWeight={700} fill={brand.ink} opacity={brand.board ? lin(frame, delays[i] + 8, delays[i] + 10) : 1}>{i + 1}</text>
              ) : (
                <SketchPath d="M20,40 L33,53 L58,24" win={[delays[i] + 4, delays[i] + 14]} easeOut options={{stroke: brand.accent, strokeWidth: 5, seed: 30 + i, roughness: 1}} />
              )}
            </svg>
            <div style={{fontSize: (isVertical ? 42 : 48) * u * (brand.board ? 1.08 : 1), lineHeight: 1.25, fontWeight: brand.board ? 400 : 600, color: lit ? brand.ink : brand.muted}}>
              {brand.board ? <Write text={item} frame={frame} fps={fps} start={delays[i] + 10} cps={30} /> : item}
            </div>
          </div>
        );
      })}
      <CornerDoodle brand={brand} name={scene.props.sticker || scene.props.art ? undefined : autoDoodle(brand, scene.props.icon, title, items.join(' '))} art={scene.props.sticker || scene.props.art || scene.props.icon ? undefined : autoArt(brand, title, items.join(' '), scene.narration)} frame={frame} fps={fps} start={titleDone + 6} seed={scene.id + 5} color={brand.blue} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ compare
type Side = {title: string; value?: string; items?: string[]; color?: string};
export const PaperCompare: React.FC<P> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, isVertical, width} = useLayout();
  const left: Side = scene.props.left ?? {title: 'A'};
  const right: Side = scene.props.right ?? {title: 'B'};
  const title: string | undefined = scene.props.title;
  const cardW = isVertical ? width - pad * 2 : (width - pad * 2 - 90 * u) / 2;
  const cardH = (isVertical ? 400 : 480) * u;
  const titleDone = title ? doneAt(brand, title, fps, 4, 2, 24) : 0;
  const Card: React.FC<{side: Side; bad: boolean; delay: number; tilt: number; seed: number}> = ({side, bad, delay, tilt, seed}) => {
    const s = pop(frame, fps, delay, 14);
    const color = bad ? brand.accent2 : brand.accent;
    const Icon = bad ? X : Check;
    const box = brand.board ? lin(frame, delay, delay + Math.round(fps * 0.6)) : Math.min(1, s * 1.3);
    const textAt = brand.board ? delay + Math.round(fps * 0.6) + 2 : delay;
    const valueAt = textAt + (brand.board ? writeFrames(side.title, fps, 30) + 2 : 0);
    const itemsAt = valueAt + (brand.board && side.value ? writeFrames(side.value, fps, 12) + 2 : 12);
    return (
      <div style={{position: 'relative', width: cardW, height: cardH, transform: `rotate(${tilt}deg) translateY(${brand.board ? 0 : (1 - s) * 30 * u}px)`, opacity: brand.board ? 1 : Math.min(1, s * 1.4)}}>
        <svg width={cardW} height={cardH} viewBox={`0 0 ${cardW} ${cardH}`} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
          <SketchRect x={6} y={6} w={cardW - 12} h={cardH - 12} draw={box} win={brand.board ? [delay, delay + Math.round(fps * 0.6)] : undefined} options={{stroke: brand.ink, strokeWidth: 3.5 * u, seed, fill: brand.board ? undefined : brand.panel, fillStyle: 'solid', roughness: 1.2}} />
        </svg>
        <div style={{position: 'relative', padding: 40 * u, display: 'flex', flexDirection: 'column', gap: 14 * u, height: '100%'}}>
          <div style={{fontFamily: hand(brand), fontSize: 46 * u, color, lineHeight: 1}}>{brand.board ? <Write text={side.title} frame={frame} fps={fps} start={textAt} cps={30} color={color} /> : side.title}</div>
          {side.value ? (
            <div style={{fontFamily: brand.display, fontWeight: dw(brand), fontSize: 120 * u, lineHeight: 1, letterSpacing: brand.board ? 0 : -4 * u, color: brand.ink, fontVariantNumeric: 'tabular-nums'}}>
              {brand.board ? <Write text={side.value} frame={frame} fps={fps} start={valueAt} cps={12} /> : side.value}
            </div>
          ) : null}
          {(side.items ?? []).map((it, i) => {
            const at = itemsAt + i * (brand.board ? writeFrames(it, fps, 34) + 6 : 5);
            return (
              <div key={i} style={{fontSize: 34 * u, color: brand.ink, display: 'flex', gap: 14 * u, alignItems: 'flex-start', opacity: brand.board ? 1 : fadeIn(frame, at, 8)}}>
                {brand.board ? (
                  <svg width={34 * u} height={34 * u} viewBox="0 0 24 24" style={{flexShrink: 0, marginTop: 4 * u, overflow: 'visible', visibility: frame < at ? 'hidden' : undefined}}>
                    <SketchPath d={bad ? 'M5,5 L19,19 M19,5 L5,19' : 'M4,13 L10,19 L20,6'} win={[at, at + 5]} options={{stroke: color, strokeWidth: 3.5, seed: seed + i, roughness: 0.8}} />
                  </svg>
                ) : (
                  <Icon size={34 * u} color={color} strokeWidth={3} style={{flexShrink: 0, marginTop: 4 * u}} />
                )}
                <span>{brand.board ? <Write text={it} frame={frame} fps={fps} start={at + 5} cps={34} /> : it}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  const leftAt = brand.board ? titleDone + 4 : 4;
  const rightAt = brand.board ? leftAt + Math.round(fps * 0.6) + writeFrames(`${left.title} ${left.value ?? ''} ${(left.items ?? []).join(' ')}`, fps, 30) + 10 : 9;
  const vs = brand.board ? lin(frame, rightAt - 8, rightAt - 2) : pop(frame, fps, 14, 10);
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad}}>
      {title ? (
        <div style={{fontFamily: brand.display, fontWeight: dw(brand, 700), fontSize: (isVertical ? 56 : 68) * u * (brand.board ? 1.1 : 1), color: brand.ink, marginBottom: 36 * u, letterSpacing: brand.board ? 0 : -1 * u}}>
          <Txt brand={brand} text={title} frame={frame} fps={fps} seed={21} per={2} cps={24} />
        </div>
      ) : null}
      <div style={{display: 'flex', flexDirection: isVertical ? 'column' : 'row', gap: 90 * u, alignItems: 'center', position: 'relative'}}>
        <Card side={left} bad delay={leftAt} tilt={-1.2} seed={41} />
        <div style={{position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%,-50%) scale(${vs}) rotate(-6deg)`, fontFamily: hand(brand), fontSize: 64 * u, fontWeight: 700, color: brand.ink, zIndex: 2}}>vs</div>
        <Card side={right} bad={false} delay={rightAt} tilt={1} seed={42} />
      </div>
      <div style={{marginTop: 26 * u}}>
        <Source brand={brand} source={scene.props.source} delay={brand.board ? rightAt + fps : 24} />
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ chart (sketched)
type Series = {name?: string; points: [number, number][]; color?: string};
type Bar = {label: string; value: number; color?: string};
const niceAxis = (v: number, want = 4) => {
  if (v <= 0) return {max: 1, step: 0.25, ticks: 4};
  const raw = v / want;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  let step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st >= raw) ?? 10 * mag;
  let ticks = Math.ceil(v / step);
  if (ticks > 6) {
    step *= 2;
    ticks = Math.ceil(v / step);
  }
  return {max: ticks * step, step, ticks};
};

export const PaperChart: React.FC<P> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, isVertical, width, height} = useLayout();
  const chartType: 'line' | 'bar' = scene.props.chartType ?? (scene.props.bars ? 'bar' : 'line');
  const title: string | undefined = scene.props.title;
  const yFormat: string | undefined = scene.props.yFormat;
  const xLabel: string | undefined = scene.props.xLabel;
  const W = width - pad * 2;
  const H = Math.min(height * (isVertical ? 0.42 : 0.56), 640 * u);
  const left = 150 * u;
  const bottom = 70 * u;
  const top = 60 * u;
  const plotW = W - left - 200 * u;
  const plotH = H - bottom - top;
  const colors = [brand.accent, brand.accent2, brand.blue ?? '#3b5bdb', '#b83280'];
  const titleDone = title ? doneAt(brand, title, fps, 4, 2, 24) : 0;
  const axesAt = brand.board ? titleDone + 2 : 2;
  const axes = brand.board ? lin(frame, axesAt, axesAt + Math.round(fps * 0.5)) : ease(frame, 2, 14);
  const lineAt = brand.board ? axesAt + Math.round(fps * 0.5) + 4 : 10;
  const reveal = brand.board ? lin(frame, lineAt, lineAt + fps * 2.2) : ease(frame, 10, 10 + fps * 2.2);
  let yMax = 1;
  let ticks = 4;
  let body: React.ReactNode = null;
  const yLab = (v: number) => compactNum(v, yFormat);
  const labelWipe = (at: number) => (brand.board ? {opacity: lin(frame, at, at + 3)} : {});
  if (chartType === 'line') {
    const series: Series[] = scene.props.series ?? [];
    const allY = series.flatMap((s) => s.points.map((q) => q[1]));
    const allX = series.flatMap((s) => s.points.map((q) => q[0]));
    const axis = niceAxis(Math.max(...allY, 0));
    yMax = axis.max;
    ticks = axis.ticks;
    const xMin = Math.min(...allX);
    const xMax = Math.max(...allX);
    const sx = (x: number) => left + ((x - xMin) / Math.max(1e-9, xMax - xMin)) * plotW;
    const sy = (y: number) => top + plotH - (y / yMax) * plotH;
    const xNow = xMin + (xMax - xMin) * reveal;
    const valueAt = (s: Series, x: number) => {
      const pts = s.points;
      if (x <= pts[0][0]) return pts[0][1];
      for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * ((x - pts[i - 1][0]) / Math.max(1e-9, pts[i][0] - pts[i - 1][0]));
      return pts[pts.length - 1][1];
    };
    body = (
      <>
        {series.map((s, i) => {
          const c = s.color ?? colors[i % colors.length];
          // the curve is smoothed through the points so the pen does not corner at every sample
          const pts = s.points.map(([x, y]) => [sx(x), sy(y)] as [number, number]);
          // Catmull-Rom through the samples, so the pen flows through each point instead of flattening at it
          let d = `M${pts[0][0]},${pts[0][1]}`;
          for (let k = 0; k < pts.length - 1; k++) {
            const p0 = pts[Math.max(0, k - 1)];
            const p1 = pts[k];
            const p2 = pts[k + 1];
            const p3 = pts[Math.min(pts.length - 1, k + 2)];
            const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
            const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
            d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
          }
          const vNow = valueAt(s, xNow);
          const cx = sx(Math.min(xNow, s.points[s.points.length - 1][0]));
          const cy = sy(vNow);
          return (
            <g key={i} visibility={brand.board && reveal <= 0 ? 'hidden' : undefined}>
              <SketchPath d={d} win={brand.board ? [lineAt, lineAt + fps * 2.2] : [10, 10 + fps * 2.2]} easeOut={!brand.board} options={{stroke: c, strokeWidth: 6 * u, roughness: 1.1, bowing: 0.6, seed: 60 + i}} />
              <circle cx={cx} cy={cy} r={9 * u} fill={c} />
              <text x={cx + 18 * u} y={cy + 12 * u} fontFamily={hand(brand)} fontSize={38 * u} fontWeight={700} fill={c}>{yLab(vNow)}</text>
              {s.name ? <text x={left + 10 * u + i * 300 * u} y={28 * u} fontFamily={hand(brand)} fontSize={34 * u} fill={c} {...labelWipe(lineAt)}>— {s.name}</text> : null}
            </g>
          );
        })}
        {[xMin, (xMin + xMax) / 2, xMax].map((x, i) => (
          <text key={i} x={sx(x)} y={H - 18 * u} fontFamily={hand(brand)} fontSize={30 * u} fill={brand.muted} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} {...labelWipe(axesAt + Math.round(fps * 0.5) + i * 3)}>{xLabel ? `${xLabel} ${Math.round(x)}` : Math.round(x)}</text>
        ))}
      </>
    );
  } else {
    const bars: Bar[] = scene.props.bars ?? [];
    const axis = niceAxis(Math.max(...bars.map((b) => b.value), 0));
    yMax = axis.max;
    ticks = axis.ticks;
    const gap = 40 * u;
    const bw = (plotW - gap * (bars.length + 1)) / Math.max(1, bars.length);
    body = (
      <>
        {bars.map((b, i) => {
          const at = lineAt + i * (brand.board ? Math.round(fps * 0.7) : 8);
          const grow = brand.board ? lin(frame, at, at + fps * 0.6) : ease(frame, 8 + i * 8, 8 + i * 8 + fps * 0.9);
          const h = Math.max(0, (b.value / yMax) * plotH * grow);
          const hq = Math.round(h / 3) * 3; // the sketch only redraws when the bar has visibly grown, so it does not boil
          const x = left + gap + i * (bw + gap);
          const y = top + plotH - hq;
          const c = b.color ?? colors[i % colors.length];
          return (
            <g key={i}>
              {hq > 2 ? <SketchRect x={x} y={y} w={bw} h={hq} options={{stroke: c, strokeWidth: 3.5 * u, seed: 70 + i, fill: c, fillStyle: 'hachure', hachureGap: 12 * u, fillWeight: 2.5 * u, hachureAngle: -41, roughness: 1}} /> : null}
              <text x={x + bw / 2} y={y - 16 * u} textAnchor="middle" fontFamily={hand(brand)} fontSize={40 * u} fontWeight={700} fill={brand.ink} opacity={grow}>{yLab(b.value * grow)}</text>
              <text x={x + bw / 2} y={H - 18 * u} textAnchor="middle" fontFamily={hand(brand)} fontSize={30 * u} fill={brand.muted} {...labelWipe(axesAt + Math.round(fps * 0.5) + i * 3)}>{b.label}</text>
            </g>
          );
        })}
      </>
    );
  }
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad}}>
      {title ? (
        <div style={{fontFamily: brand.display, fontWeight: dw(brand, 700), fontSize: (isVertical ? 54 : 64) * u * (brand.board ? 1.1 : 1), color: brand.ink, marginBottom: 14 * u, letterSpacing: brand.board ? 0 : -1 * u}}>
          <Txt brand={brand} text={title} frame={frame} fps={fps} seed={31} per={2} cps={24} />
        </div>
      ) : null}
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{overflow: 'visible'}}>
        {Array.from({length: ticks + 1}).map((_, i) => {
          const v = (yMax * i) / ticks;
          const y = top + plotH - (i / ticks) * plotH;
          return (
            <g key={i} opacity={axes}>
              {i > 0 ? <line x1={left} x2={left + plotW} y1={y} y2={y} stroke={brand.ink} strokeOpacity={0.12} strokeWidth={2} strokeDasharray="6 10" /> : null}
              <text x={left - 16 * u} y={y + 10 * u} fontFamily={hand(brand)} fontSize={30 * u} fill={brand.muted} textAnchor="end">{yLab(v)}</text>
            </g>
          );
        })}
        <SketchLine x1={left} y1={top + plotH} x2={left + plotW} y2={top + plotH} draw={Math.min(1, axes * 2)} win={brand.board ? [axesAt, axesAt + Math.round(fps * 0.5) / 2] : undefined} options={{stroke: brand.ink, strokeWidth: 3.5 * u, seed: 50}} />
        <SketchLine x1={left} y1={top + plotH} x2={left} y2={top} draw={Math.max(0, axes * 2 - 1)} win={brand.board ? [axesAt + Math.round(fps * 0.5) / 2, axesAt + Math.round(fps * 0.5)] : undefined} options={{stroke: brand.ink, strokeWidth: 3.5 * u, seed: 51}} />
        {body}
      </svg>
      <div style={{marginTop: 10 * u}}>
        <Source brand={brand} source={scene.props.source} delay={brand.board ? lineAt + Math.round(fps * 2.4) : 24} />
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ quote
export const PaperQuote: React.FC<P> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, isVertical} = useLayout();
  const quote: string = scene.props.quote ?? scene.narration;
  const attribution: string | undefined = scene.props.attribution;
  const words = quote.split(/\s+/).filter(Boolean);
  const spokenAt = findPhraseTime(scene.words, quote);
  const start = spokenAt !== null ? Math.round((spokenAt - scene.start) * fps) : 8;
  const per = spokenAt !== null ? Math.max(2, Math.round(((scene.end - scene.start) * fps * 0.5) / Math.max(1, words.length))) : 3;
  const cps = spokenAt !== null ? Math.max(14, Math.min(30, (quote.replace(/\s+/g, '').length / Math.max(1, ((scene.end - scene.start) * 0.55))))) : 24;
  const quoteDone = doneAt(brand, quote, fps, start, per, cps);
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad, paddingLeft: pad * 1.4}}>
      <div style={{fontFamily: brand.display, fontSize: 200 * u, lineHeight: 0.5, color: brand.accent2, marginBottom: 20 * u, opacity: fadeIn(frame, 0, 8)}}>“</div>
      <div style={{fontFamily: brand.display, fontStyle: brand.board ? 'normal' : 'italic', fontWeight: 400, fontSize: (isVertical ? 64 : 84) * u, lineHeight: 1.25, color: brand.ink, maxWidth: isVertical ? '100%' : '80%'}}>
        <Txt brand={brand} text={quote} frame={frame} fps={fps} start={start} per={per} cps={cps} seed={51} />
      </div>
      {attribution ? (
        <div style={{fontFamily: hand(brand), fontSize: 44 * u, color: brand.muted, marginTop: 40 * u, opacity: brand.board ? 1 : fadeIn(frame, quoteDone, 10)}}>
          {brand.board ? <Write text={`— ${attribution}`} frame={frame} fps={fps} start={quoteDone + 4} cps={30} color={brand.muted} /> : `— ${attribution}`}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ outro
export const PaperOutro: React.FC<P> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, isVertical} = useLayout();
  const title: string = scene.props.title ?? 'Thanks for watching';
  const cta: string = scene.props.cta ?? 'Subscribe for one money idea a week';
  const titleDone = doneAt(brand, title, fps, 4, 3, 20);
  const btnAt = brand.board ? titleDone + 4 : 10;
  const s = pop(frame, fps, btnAt, 12);
  const box = brand.board ? lin(frame, btnAt, btnAt + Math.round(fps * 0.5)) : Math.min(1, s * 1.2);
  const btnW = Math.min(1000 * u, cta.length * 26 * u + 120 * u);
  const btnH = 110 * u;
  const ctaAt = btnAt + Math.round(fps * 0.5) + 2;
  const slotsAt = brand.board ? ctaAt + writeFrames(cta, fps, 30) + 6 : 20;
  // the two end-screen boxes (for YouTube's end-screen links) only when `cards=on`: a new channel has nothing to put in them
  const cards = ['on', 'yes', 'true', '1'].includes(String(scene.props.cards ?? 'off').toLowerCase());
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad, paddingLeft: pad * 1.2}}>
      <div style={{fontFamily: brand.display, fontWeight: dw(brand), fontSize: (isVertical ? 84 : 110) * u, lineHeight: 1.04, letterSpacing: brand.board ? 0 : -2 * u, color: brand.ink, maxWidth: isVertical ? '100%' : '70%'}}>
        <Txt brand={brand} text={title} frame={frame} fps={fps} seed={61} cps={20} />
      </div>
      <div style={{position: 'relative', width: btnW, height: btnH, marginTop: 44 * u, transform: `rotate(-1deg) scale(${brand.board ? 1 : 0.9 + 0.1 * s})`, transformOrigin: 'left center', opacity: brand.board ? 1 : Math.min(1, s * 1.5)}}>
        <svg width={btnW} height={btnH} viewBox={`0 0 ${btnW} ${btnH}`} style={{position: 'absolute', inset: 0, overflow: 'visible', visibility: brand.board && box <= 0 ? 'hidden' : undefined}}>
          <SketchRect x={4} y={4} w={btnW - 8} h={btnH - 8} draw={box} win={brand.board ? [btnAt, btnAt + Math.round(fps * 0.5)] : undefined} options={{stroke: brand.ink, strokeWidth: 4 * u, seed: 71, fill: marker(brand), fillStyle: brand.board ? 'zigzag' : 'solid', hachureGap: 14 * u, fillWeight: 10 * u, roughness: 1.3}} />
        </svg>
        <div style={{position: 'relative', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: hand(brand), fontWeight: 700, fontSize: 48 * u, color: brand.ink}}>
          {brand.board ? <Write text={cta} frame={frame} fps={fps} start={ctaAt} cps={30} /> : cta}
        </div>
      </div>
      {!isVertical && cards ? (
        <div style={{display: 'flex', gap: 40 * u, marginTop: 70 * u}}>
          {['Next video', 'Playlist'].map((label, i) => {
            const at = slotsAt + i * (brand.board ? Math.round(fps * 0.5) : 6);
            const d = brand.board ? lin(frame, at, at + Math.round(fps * 0.45)) : 1;
            return (
              <div key={label} style={{position: 'relative', width: 480 * u, height: 270 * u, opacity: brand.board ? 1 : fadeIn(frame, at, 10)}}>
                <svg width={480 * u} height={270 * u} viewBox={`0 0 ${480 * u} ${270 * u}`} style={{position: 'absolute', inset: 0, overflow: 'visible', visibility: d <= 0 ? 'hidden' : undefined}}>
                  <SketchRect x={4} y={4} w={472 * u} h={262 * u} draw={d} win={brand.board ? [at, at + Math.round(fps * 0.45)] : undefined} options={{stroke: brand.muted, strokeWidth: 2.5 * u, seed: 80 + i, roughness: 1.4}} />
                </svg>
                <div style={{position: 'relative', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: hand(brand), color: brand.muted, fontSize: 34 * u}}>
                  {brand.board ? <Write text={`${label} goes here`} frame={frame} fps={fps} start={at + Math.round(fps * 0.45)} cps={34} color={brand.muted} /> : `${label} goes here`}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      <div style={{fontFamily: hand(brand), fontSize: 28 * u, color: brand.muted, marginTop: 50 * u, maxWidth: '80%', opacity: fadeIn(frame, brand.board ? slotsAt + fps : 30, 10)}}>education and entertainment only, not financial, tax or legal advice. do your own research.</div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ still: a photo taped to the page (a magnet on the board)
export const PaperStill: React.FC<P> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, width, isVertical} = useLayout();
  const total = Math.max(1, Math.round((scene.end - scene.start) * fps));
  const src: string | undefined = scene.props.src;
  const caption: string | undefined = scene.props.caption;
  const w = isVertical ? width - pad * 2 : width * 0.62;
  const h = (w * 9) / 16;
  const s = pop(frame, fps, 0, 14);
  const tilt = isVertical ? -1 : -1.5;
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', padding: pad}}>
      <div style={{position: 'relative', transform: `rotate(${tilt}deg) translateY(${(1 - s) * 40 * u}px)`, opacity: Math.min(1, s * 1.4)}}>
        <div style={{width: w, height: h, background: '#fff', padding: 18 * u, paddingBottom: 18 * u, boxShadow: `0 ${14 * u}px ${40 * u}px rgba(40,30,10,0.25)`}}>
          <div style={{position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: brand.board ? '#f1f1ee' : '#e9e2d6'}}>
            {src ? (
              scene.props.loop && scene.props.clipDur ? (
                <Loop durationInFrames={Math.max(1, Math.round(Number(scene.props.clipDur) * fps))}>
                  <Media src={src} props={scene.props} durationFrames={total} width={w - 36 * u} height={h - 36 * u} />
                </Loop>
              ) : (
                <Media src={src} props={scene.props} durationFrames={total} width={w - 36 * u} height={h - 36 * u} />
              )
            ) : (
              <div style={{width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 * u, textAlign: 'center', fontFamily: hand(brand), fontSize: 40 * u, lineHeight: 1.2, color: brand.muted}}>
                {scene.props.want ?? scene.props.prompt ?? 'picture goes here'}
              </div>
            )}
          </div>
        </div>
        {brand.board ? (
          // a round magnet holds the photo to the board
          <div style={{position: 'absolute', left: '50%', top: -22 * u, width: 56 * u, height: 56 * u, borderRadius: '50%', background: `radial-gradient(circle at 35% 30%, #ff8a80, ${brand.accent2} 70%)`, boxShadow: `0 ${4 * u}px ${8 * u}px rgba(0,0,0,0.3)`, transform: 'translateX(-50%)'}} />
        ) : (
          // a strip of tape over the top edge
          <div style={{position: 'absolute', left: '50%', top: -16 * u, width: 180 * u, height: 44 * u, background: marker(brand), opacity: 0.75, transform: 'translateX(-50%) rotate(-3deg)'}} />
        )}
        {caption ? (
          <div style={{position: 'absolute', left: 30 * u, bottom: -70 * u, fontFamily: hand(brand), fontSize: 48 * u, color: brand.ink, transform: 'rotate(1deg)', opacity: brand.board ? 1 : fadeIn(frame, 10, 10)}}>
            {brand.board ? <Write text={caption} frame={frame} fps={fps} start={12} cps={30} /> : caption}
          </div>
        ) : null}
        {scene.props.credit ? <div style={{position: 'absolute', right: 10 * u, bottom: -46 * u, fontFamily: hand(brand), fontSize: 26 * u, color: brand.muted, opacity: fadeIn(frame, 14, 10)}}>{scene.props.credit}</div> : null}
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ sticker: a GIF or picture on top of any scene
const STICK: Record<string, React.CSSProperties> = {
  tr: {top: '9%', right: '5%'},
  tl: {top: '9%', left: '5%'},
  br: {bottom: '16%', right: '5%'},
  bl: {bottom: '16%', left: '5%'},
  r: {top: '50%', right: '5%', transform: 'translateY(-50%)'},
  l: {top: '50%', left: '5%', transform: 'translateY(-50%)'},
  c: {top: '50%', left: '50%', transform: 'translate(-50%, -50%)'},
};
export const Sticker: React.FC<P> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {height, width} = useLayout();
  const src: string | undefined = scene.props.sticker;
  if (!src) return null;
  const at = String(scene.props.sticker_at ?? 'tr');
  const size = height * Math.max(0.1, Math.min(0.8, Number(scene.props.sticker_size ?? 0.32)));
  // `sticker_x` / `sticker_y`: where its centre sits, as a share of the width and height (dragged into place in the studio)
  const free = scene.props.sticker_x !== undefined && scene.props.sticker_y !== undefined;
  const s = pop(frame, fps, Math.round(fps * 0.4), 11);
  const total = Math.max(1, Math.round((scene.end - scene.start) * fps));
  const tilt = (rnd(scene.id * 7) - 0.5) * 8;
  const place: React.CSSProperties = free ? {left: Number(scene.props.sticker_x) * width - size / 2, top: Number(scene.props.sticker_y) * height - size / 2} : STICK[at] ?? STICK.tr;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div style={{position: 'absolute', ...place, width: size, height: size}}>
        <div style={{position: 'relative', width: '100%', height: '100%', overflow: 'hidden', borderRadius: size * 0.06, border: brand.board ? `${Math.max(2, size * 0.012)}px solid ${brand.ink}` : undefined, transform: `rotate(${tilt}deg) scale(${s})`, opacity: Math.min(1, s * 1.5), background: '#fff'}}>
          <Media src={src} props={{zoom: 'none', ...Object.fromEntries(Object.entries(scene.props).filter(([k]) => k.startsWith('sticker_')).map(([k, v]) => [k.slice(8), v]))}} durationFrames={total} width={size} height={size} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Dispatch for the paper look; returns null for scene types it does not draw so the caller can fall back. */
export const PaperSwitch: React.FC<P> = ({scene, brand}) => {
  switch (scene.type) {
    case 'title':
      return <PaperTitle scene={scene} brand={brand} />;
    case 'stat':
      return <PaperStat scene={scene} brand={brand} />;
    case 'text':
      return <PaperText scene={scene} brand={brand} />;
    case 'list':
      return <PaperList scene={scene} brand={brand} />;
    case 'compare':
      return <PaperCompare scene={scene} brand={brand} />;
    case 'chart':
      return <PaperChart scene={scene} brand={brand} />;
    case 'quote':
      return <PaperQuote scene={scene} brand={brand} />;
    case 'outro':
      return <PaperOutro scene={scene} brand={brand} />;
    case 'art':
      return <PaperArt scene={scene} brand={brand} />;
    case 'takeaway':
      return <PaperTakeaway scene={scene} brand={brand} />;
    case 'bite':
      return <PaperBite scene={scene} brand={brand} />;
    case 'grow':
      return <PaperGrow scene={scene} brand={brand} />;
    case 'pie':
      return <PaperPie scene={scene} brand={brand} />;
    case 'shrink':
      return <PaperShrink scene={scene} brand={brand} />;
    case 'still':
    case 'image':
    case 'clip':
      return <PaperStill scene={scene} brand={brand} />;
    default:
      return null;
  }
};
void roughGen;
void Soft;
