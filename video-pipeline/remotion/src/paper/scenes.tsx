import React, {useMemo} from 'react';
import {AbsoluteFill, Easing, Freeze, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Check, X} from 'lucide-react';
import type {Brand, Scene, Word} from '../types';
import {compactNum, displayLines, displayWidth, findPhraseTime, formatNum, parseValue, useLayout, useUpright} from '../components/layout';
import zones from '../components/upright.json';
import {fadeIn, pop, rnd} from '../components/motion';
import {Arrow, Marker, Ring, SketchEllipse, SketchLine, SketchPath, SketchRect, Underline, figureHeight, figureWidth, roughGen} from './sketch';
import {Doodle, Write, WriteSpoken, fitCps, fitStart, pickDoodle, writeFrames} from './write';
import {Art, PaperArt, isTraced, pickArt, pickArtAmong} from './art';
import {PaperBite, PaperGrow, PaperPie, PaperShrink} from './money';
import {Erase} from './erase';
import {Marks} from './marks';
import {PageMarks, hasPageMarks} from './pagework';
import {cardsTakeFoot, stageUnder, uprightWhole, writtenEm, writtenLines} from './setpiece';
import {captionLine, isLoss, keyWords, moneyTint} from './phrase';
import {Media} from './media';
import {Loop, Sequence} from 'remotion';
import {CharacterOn, isPersonArt} from './character';
import {Opener} from './opener';
import {figureTime, lineIndex, lineIndices} from './lineMatch';
import {PaperReceipt} from './receipt';

/**
 * The paper look: every scene is laid out like a page someone wrote on. Big words in a serif, notes in
 * handwriting, charts sketched with a pen, the word being said swiped with a highlighter. Layouts sit
 * left with room on the right for a margin note, not centred like a slide.
 *
 * The whiteboard look (brand.board) keeps the layouts but writes everything on: text appears a character at a
 * time at a marker's pace, shapes draw stroke by stroke, a doodle is sketched in the corner, and the hand layer
 * in Video.tsx follows whatever is mid-stroke. Nothing fades in on a board; it gets written or it is not there.
 */

/** the colour of a handwritten label, note or source line: slate on the brand board (red is only ever a loss) */
const noteColor = (b: Brand) => b.note ?? b.accent2;
/** the channel's navy (library/brand/palette.md), for a block that carries white type on a photo in any look */
const NAVY = '#041B3C';
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
    {text.split(/[ \t\n\r]+/).filter(Boolean).map((w, i) => {
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
  const style = {fontFamily: hand(brand), fontSize: 38 * u, color: brand.muted};
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

/** board= lines that do not pair one to one with the spoken sentences: each written where the voice says it (its
 * first words, its figure or its key word, after the line above: paper/lineMatch.ts), else at its share of the scene */
const boardLinesAt = (texts: string[], words: Word[]): {text: string; from: Word | undefined}[] => {
  const at = lineIndices(texts, words);
  return texts.map((text, k) => ({text, from: words.length ? words[at[k]] : undefined}));
};

/** A doodle in the top-right corner of the board, drawn after the headline is written. */
const CornerDoodle: React.FC<{brand: Brand; name?: string; art?: string; frame: number; fps: number; start: number; seed?: number; color?: string; by?: number}> = ({brand, name, art, frame, fps, start, seed = 1, color, by}) => {
  const {u, pad, isVertical} = useLayout();
  const character = React.useContext(CharacterOn);
  if (!brand.board || (!name && !art)) return null;
  void frame;
  if (bigArt(brand, art)) {
    // with the character on a Short: no second person, and an object drawing moves left out of his way
    if (character && isPersonArt(art)) return null;
    if (character && isVertical) {
      const small = 560 * u;
      return (
        <div style={{position: 'absolute', left: pad * 0.6, bottom: pad * 1.0 + 150 * u, width: small, height: small}}>
          <Art name={art as string} size={small} brand={brand} start={start} seed={seed} by={by} />
        </div>
      );
    }
    const size = (isVertical ? 760 : 760) * u; // picture first: 70% of the board's height
    return (
      <div style={{position: 'absolute', right: pad * 0.5, width: size, height: size, ...(isVertical ? {bottom: pad * 1.0 + 170 * u, left: '50%', transform: 'translateX(-50%)'} : {top: '50%', transform: 'translateY(-50%)'})}}>
        <Art name={art as string} size={size} brand={brand} start={start} seed={seed} by={by} />
      </div>
    );
  }
  const size = (isVertical ? 200 : 260) * u * (art ? 1.3 : 1);
  return (
    <div style={{position: 'absolute', top: isVertical ? pad * 1.3 : pad * 0.9, right: pad * 0.9, width: size, height: size}}>
      {art ? <Art name={art} size={size} brand={brand} start={start} seed={seed} by={by} /> : <Doodle name={name as string} size={size} win={[start, start + fps * 0.9]} stroke={color ?? brand.ink} width={1.5} seed={seed} />}
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
  const kickerDone = kicker ? doneAt(brand, kicker, fps, 0, 2, 60) : 0;
  const titleStart = brand.board ? kickerDone + 2 : 4;
  const titleDone = brand.board ? doneAt(brand, title, fps, titleStart, 3, 48) : 10 + words.length * 3;
  const ul = ease(frame, titleDone, titleDone + fps * 0.6);
  const subStart = titleDone + Math.round(fps * 0.25);
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad, paddingLeft: pad * 1.2}}>
      {kicker ? (
        <div style={{fontFamily: hand(brand), fontSize: 56 * u, color: noteColor(brand), marginBottom: 10 * u, transform: 'rotate(-2deg)', transformOrigin: 'left', opacity: brand.board ? 1 : fadeIn(frame, 0, 8)}}>
          {brand.board ? <Write text={kicker} frame={frame} fps={fps} start={0} cps={60} color={noteColor(brand)} /> : kicker}
        </div>
      ) : null}
      <div style={{fontFamily: brand.display, fontWeight: dw(brand), fontSize: (isVertical ? 96 : 124) * u * (brand.board ? 1.08 : 1), lineHeight: 1.02, letterSpacing: brand.board ? 0 : -2 * u, color: brand.ink, maxWidth: isVertical ? '100%' : '82%'}}>
        <Txt brand={brand} text={title} frame={frame} fps={fps} start={titleStart} cps={48} seed={3} />
      </div>
      <Underline width={Math.min(width * 0.42, 640 * u)} stroke={(brand.fill ?? brand.accent)} thickness={7 * u} win={[titleDone, titleDone + fps * 0.6]} easeOut seed={5} style={{marginTop: 18 * u}} />
      {subtitle ? (
        <div style={{fontSize: (isVertical ? 40 : 44) * u, color: brand.muted, marginTop: 26 * u, maxWidth: isVertical ? '100%' : '62%', lineHeight: 1.35, opacity: brand.board ? 1 : fadeIn(frame, 18, 10)}}>
          {brand.board ? <Write text={subtitle} frame={frame} fps={fps} start={subStart} cps={60} color={brand.muted} /> : subtitle}
        </div>
      ) : null}
      <CornerDoodle brand={brand} name={scene.props.sticker || scene.props.art ? undefined : autoDoodle(brand, scene.props.icon, title, subtitle)} art={scene.props.sticker || scene.props.art || scene.props.icon || brand.illustrated ? undefined : autoArt(brand, title, subtitle, scene.narration)} frame={frame} fps={fps} start={titleDone + fps * 0.7} seed={1} color={brand.blue} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ stat
export const PaperStat: React.FC<P> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, width} = useLayout();
  const up = useUpright();
  const characterOn = React.useContext(CharacterOn);
  const raw = String(scene.props.value ?? '');
  const parsed = parseValue(raw);
  const from = scene.props.from !== undefined ? parseValue(String(scene.props.from))?.num ?? 0 : 0;
  const countSec = Number(scene.props.countSeconds ?? 1.4);
  const label: string | undefined = scene.props.label;
  const sub: string | undefined = scene.props.sub;
  const total = Math.max(1, Math.round((scene.end - scene.start) * fps)); // a one-second stat writes its number fast
  const labelCps = label ? fitCps(label, fps, 0, 34, total, 0.3) : 34;
  const labelDone = label ? doneAt(brand, label, fps, 0, 2, labelCps) : 0;
  // the count-up ends as the figure is said (scene.punch, from the build), not seconds before it
  const countTo = scene.punch !== undefined && scene.start >= 0 ? Math.round((scene.punch - scene.start) * fps) : null; // a Short's opening stat (start < 0) counts at once
  const numStart0 = brand.board ? labelDone + 2 : 6;
  // on the board the figure counts up to its value (count=off writes it with the marker instead)
  const counting = brand.board && !!parsed && String(scene.props.count ?? 'on') !== 'off';
  const countFrames = Math.round(fps * Math.min(1.4, Math.max(0.5, Number(scene.props.countSeconds ?? 0.9))));
  const finalText = parsed ? `${parsed.prefix}${formatNum(parsed.num, parsed.decimals, parsed.grouped || parsed.num >= 1000)}${parsed.suffix}` : raw;
  const s = pop(frame, fps, 3, 13);
  const digits = finalText.length;
  const size = 300 * u * (digits > 9 ? 0.7 : digits > 7 ? 0.85 : 1); // the long video's figure; a Short's is fitted to its stage (below)
  const numCps = fitCps(finalText, fps, numStart0, 9, total, 0.65);
  // the figure lands on its word: a count-up ends there, a written figure (count=off) finishes writing there
  const writeLen = brand.board && !counting ? doneAt(brand, finalText, fps, 0, 3, numCps) : 0;
  const numStart = countTo !== null && brand.board && !!parsed ? Math.max(numStart0, countTo - (counting ? countFrames : writeLen)) : numStart0;
  const numDone = counting ? numStart + countFrames : brand.board ? doneAt(brand, finalText, fps, numStart, 3, numCps) : 8 + fps * countSec * 0.6;
  const p = brand.board && !counting ? 1 : ease(frame, numStart, numStart + (counting ? countFrames : fps * countSec));
  const display = parsed ? `${parsed.prefix}${formatNum(from + (parsed.num - from) * p, parsed.decimals, parsed.grouped || parsed.num >= 1000)}${parsed.suffix}` : raw;
  const ul = ease(frame, numDone, numDone + fps * 0.5);
  const noteStart = brand.board ? numDone + Math.round(fps * 0.3) : 20;
  const note = brand.board ? lin(frame, noteStart, noteStart + 8) : fadeIn(frame, 20, 10);
  const loss = isLoss(`${raw} ${label ?? ''} ${sub ?? ''}`);
  const subColor = sub && isLoss(sub) ? brand.accent2 : noteColor(brand);
  // with a loop or a drawing on the right the note goes under the figure, not beside it, where it would run into the picture
  const stacked = !!scene.props.anim || (!!scene.props.art && scene.props.art !== 'off');
  // the ring round the figure lands on the word that says it (scene.punch, from the build), once it is written
  const ringAt = scene.punch !== undefined ? Math.max(numDone, Math.round((scene.punch - scene.start) * fps)) : null;
  const corner = <CornerDoodle brand={brand} name={scene.props.sticker || scene.props.art ? undefined : autoDoodle(brand, scene.props.icon, label, sub, scene.narration)} art={scene.props.sticker || scene.props.art || scene.props.icon || brand.illustrated ? undefined : autoArt(brand, label, sub, scene.narration, scene.narration)} frame={frame} fps={fps} start={brand.board ? Math.max(numDone + 6, 10) : 0} seed={scene.id} color={brand.blue} />;
  if (up) {
    // A Short: the label, the figure and the sub-line are laid in the stage (components/upright.json), centred. They
    // used to hang from 29% of the height with a 190 px figure, top left of a page that stayed bare down to its cards.
    // The figure is fitted to 78% of the stage's width, 420 px at most and 190 px at least; a string so long that its
    // ring would leave the stage is set smaller still. The label and the sub-line grow with it, up to 1.6 times their
    // usual type, while they still set on one line. Where the stage is short (over a drawing, over the character's
    // head) the figure and the lines give way together until the block fits; what room is left over goes between the
    // lines, and the block sits in the middle of the stage. If it cannot fit, it runs over the stage's foot, never up
    // into the caption.
    const stage = up.stage(stageUnder(scene, brand, characterOn));
    const source: string | undefined = scene.props.source;
    const base = 190 * u;
    const em = displayWidth(finalText, 1, brand.display); // the figure's width in ems
    const ringed = (stage.w - 60 * u) / 1.14; // the widest figure whose ring (a seventh wider, and its pen) stays in the stage
    const most = Math.min(Math.max((stage.w * 0.78) / em, base), 420 * u, ringed / em);
    const least = Math.min(most, base);
    const ring = ringAt !== null && !!brand.board;
    // the block with the figure at `figure` px and the lines grown by `grow`: its type sizes, its pen and its height
    const lay = (figure: number, grow: number) => {
      // the largest type, between its usual size and that size grown, at which a written line sets on one line
      const oneLine = (text: string, usual: number) => Math.max(usual, Math.min(usual * grow, (stage.w * 0.94) / (writtenEm(text) * 1.03)));
      const labelSize = label ? oneLine(label, 60 * u) : 0;
      const subSize = sub ? oneLine(sub, 54 * u) : 0;
      const pen = Math.sqrt(figure / base); // the ring and the underline thicken with the figure
      const over = ring ? 18 * u * pen : 0; // the ring stands this far over the figure's line: the label keeps clear of it
      const under = 8 * u + figure * 0.04; // and the underline this far below, clear of the ring's lower arc
      const lines = (text: string, type: number) => writtenLines(text, type, stage.w);
      const h = (label ? lines(label, labelSize) * labelSize * 1.1 + 6 * u + over : 0) + figure + under + 32 * u * pen + (sub ? 10 * u + lines(sub, subSize) * subSize * 1.15 : 0) + (source ? 24 * u + lines(`source: ${source}`, 38 * u) * 38 * u * 1.15 : 0);
      return {figure, labelSize, subSize, pen, over, under, h};
    };
    const room = stage.h - 24 * u;
    // from the fullest setting down: figure and lines shrink together to their usual sizes, then the figure alone
    let fit = lay(most, 1.6);
    for (let q = 0.95; fit.h > room && q > -0.01; q -= 0.05) fit = lay(least + (most - least) * q, 1 + 0.6 * q);
    for (let f = least - 4 * u; fit.h > room && f >= 130 * u; f -= 4 * u) fit = lay(f, 1);
    const {figure, labelSize, subSize, pen, over, under, h} = fit;
    const air = Math.max(0, Math.min(1, (room - h) / (200 * u))); // 0 when the block only just fits, 1 when the stage has room to spare
    const gap = brand.board ? '0.28em' : 0; // a written line ends in the marker's word gap: the same on its left centres the words
    return (
      <AbsoluteFill>
        <div style={{position: 'absolute', left: stage.x, top: stage.y, width: stage.w, height: stage.h, display: 'flex', flexDirection: 'column'}}>
          <div style={{margin: 'auto 0', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center'}}>
            {label ? (
              <div style={{fontFamily: hand(brand), fontSize: labelSize, lineHeight: 1.1, color: noteColor(brand), transform: 'rotate(-1.5deg)', opacity: brand.board ? 1 : fadeIn(frame, 0, 8), marginBottom: (6 + 26 * air) * u + over, paddingLeft: gap}}>
                {brand.board ? <Write text={label} frame={frame} fps={fps} start={0} cps={labelCps} color={noteColor(brand)} /> : label}
              </div>
            ) : null}
            <div style={{position: 'relative', display: 'inline-block'}}>
              <div style={{fontFamily: brand.display, fontWeight: dw(brand), fontSize: figure, lineHeight: 1, letterSpacing: brand.board ? 0 : -5 * u, color: brand.ink, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', marginRight: brand.board && !counting ? '-0.2em' : 0, transform: brand.board ? undefined : `scale(${0.85 + 0.15 * s})`, transformOrigin: 'center bottom', opacity: brand.board ? 1 : Math.min(1, s * 1.5)}}>
                {counting ? (
                  // the count-up keeps the finished figure's place: the box is as wide as the last number, so nothing slides as the digits change
                  <span style={{position: 'relative', display: 'inline-block'}}>
                    <span style={{visibility: 'hidden'}}>{finalText}</span>
                    <span style={{position: 'absolute', left: 0, top: 0, visibility: frame >= numStart ? 'visible' : 'hidden'}}>{display}</span>
                  </span>
                ) : brand.board ? <Write text={display} frame={frame} fps={fps} start={numStart} cps={numCps} wordGap="0.2em" /> : display}
              </div>
              {ring && ringAt !== null ? <Ring width={figureWidth(finalText, figure, brand.display, dw(brand))} height={figureHeight(figure)} stroke={loss ? brand.accent2 : brand.accent} win={[ringAt, ringAt + Math.round(fps * 0.35)]} thickness={7 * u * pen} seed={scene.id * 3 + 1} /> : null}
            </div>
            <Underline width={Math.min(stage.w, em * figure * 1.15)} stroke={loss ? brand.accent2 : brand.accent} thickness={8 * u * pen} win={[numDone, numDone + fps * 0.5]} easeOut seed={7} style={{marginTop: under}} />
            {sub ? (
              <div style={{fontFamily: hand(brand), fontSize: subSize, lineHeight: 1.15, color: subColor, transform: 'rotate(-2deg)', opacity: brand.board ? 1 : note, marginTop: (10 + 30 * air) * u, paddingLeft: gap}}>
                {brand.board ? <Write text={sub} frame={frame} fps={fps} start={noteStart + 8} cps={30} color={subColor} /> : sub}
              </div>
            ) : null}
            {source ? (
              <div style={{marginTop: (24 + 56 * air) * u, lineHeight: 1.15, paddingLeft: gap}}>
                <Source brand={brand} source={source} delay={brand.board ? noteStart + (sub ? writeFrames(sub, fps, 30) + 12 : 4) : 24} />
              </div>
            ) : null}
          </div>
        </div>
        {corner}
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad, paddingLeft: pad * 1.2}}>
      {label ? (
        <div style={{fontFamily: hand(brand), fontSize: 60 * u, color: noteColor(brand), transform: 'rotate(-1.5deg)', transformOrigin: 'left', opacity: brand.board ? 1 : fadeIn(frame, 0, 8), marginBottom: 4 * u}}>
          {brand.board ? <Write text={label} frame={frame} fps={fps} start={0} cps={labelCps} color={noteColor(brand)} /> : label}
        </div>
      ) : null}
      <div style={{display: 'flex', flexDirection: stacked ? 'column' : 'row', alignItems: stacked ? 'flex-start' : 'flex-end', gap: (stacked ? 10 : 50) * u}}>
        <div>
          <div style={{position: 'relative', display: 'inline-block'}}>
            <div style={{fontFamily: brand.display, fontWeight: dw(brand), fontSize: size, lineHeight: 1, letterSpacing: brand.board ? 0 : -5 * u, color: brand.ink, fontVariantNumeric: 'tabular-nums', transform: brand.board ? undefined : `scale(${0.85 + 0.15 * s})`, transformOrigin: 'left bottom', opacity: brand.board ? 1 : Math.min(1, s * 1.5)}}>
              {counting ? <span style={{visibility: frame >= numStart ? 'visible' : 'hidden'}}>{display}</span> : brand.board ? <Write text={display} frame={frame} fps={fps} start={numStart} cps={numCps} wordGap="0.2em" /> : display}
            </div>
            {ringAt !== null && brand.board ? <Ring width={figureWidth(finalText, size, brand.display, dw(brand))} height={figureHeight(size)} stroke={loss ? brand.accent2 : brand.accent} win={[ringAt, ringAt + Math.round(fps * 0.35)]} thickness={7 * u} seed={scene.id * 3 + 1} /> : null}
          </div>
          <Underline width={Math.min(size * 2.4, width * 0.5)} stroke={loss ? brand.accent2 : brand.accent} thickness={8 * u} win={[numDone, numDone + fps * 0.5]} easeOut seed={7} style={{marginTop: 8 * u}} />
        </div>
        {sub ? (
          <div style={{display: 'flex', alignItems: 'center', gap: 16 * u, marginBottom: (stacked ? 0 : 40) * u, marginTop: stacked ? 18 * u : 0, opacity: brand.board ? 1 : note, maxWidth: width * (stacked ? 0.5 : 0.34)}}>
            <Arrow length={120 * u} stroke={subColor} win={brand.board ? [noteStart, noteStart + 8] : [20, 30]} angle={-8} seed={9} thickness={4 * u} />
            <div style={{fontFamily: hand(brand), fontSize: 54 * u, lineHeight: 1.15, color: subColor, transform: 'rotate(-2deg)'}}>
              {brand.board ? <Write text={sub} frame={frame} fps={fps} start={noteStart + 8} cps={30} color={subColor} /> : sub}
            </div>
          </div>
        ) : null}
      </div>
      <div style={{marginTop: 30 * u}}>
        <Source brand={brand} source={scene.props.source} delay={brand.board ? noteStart + (sub ? writeFrames(sub, fps, 30) + 12 : 4) : 24} />
      </div>
      {corner}
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
  // a named drawing (`art=payday`) that is one of the traced illustrations is the scene's picture in the illustrated style;
  // dragged into place (art_x) it is a placed drawing instead, and anything else is left to the ArtLayer
  const named = scene.props.art && brand.illustrated && isTraced(String(scene.props.art)) && scene.props.art_x === undefined ? String(scene.props.art) : undefined;
  const clipSrc: string | undefined = scene.props.clip_src; // stock b-roll in the picture column (clip="...", fetched by the footage finder)
  const artName = clipSrc || scene.props.sticker || scene.props.icon ? undefined : named ?? (scene.props.art ? undefined : autoArt(brand, headline, scene.narration));
  const big = bigArt(brand, artName) || !!clipSrc || !!scene.props.anim; // picture first: the words keep to a column (landscape) or the top (vertical), the picture has the rest
  const total = Math.max(1, Math.round((scene.end - scene.start) * fps)); // a quick cut writes and draws faster than a long scene
  const corner = <CornerDoodle brand={brand} name={scene.props.sticker || scene.props.art ? undefined : autoDoodle(brand, scene.props.icon, headline, scene.narration)} art={artName} frame={frame} fps={fps} start={brand.board ? 6 : 0} seed={scene.id} by={Math.round(total * 0.7)} />;
  const head = headline ? (
    <div style={{fontFamily: hand(brand), fontSize: 54 * u, color: noteColor(brand), marginBottom: 24 * u, transform: 'rotate(-1.5deg)', transformOrigin: 'left', opacity: brand.board ? 1 : fadeIn(frame, 0, 8)}}>
      {brand.board ? <Write text={headline} frame={frame} fps={fps} start={0} cps={34} color={noteColor(brand)} /> : headline}
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
  const boardLines: string[] | null = scene.props.board ? String(scene.props.board).split('|').map((x) => x.trim()).filter(Boolean) : null;
  // beside a big picture one line, unless board= lists several: then every one of them is written, down the column
  const oneLine = big && !(boardLines && boardLines.length > 1) ? [boardLines ? boardLines[0] : captionLine(scene.narration)] : null;
  const explicit: string[] | null = oneLine ?? boardLines;
  const lines = oneLine
    ? [{words: keyWords(sentences[0] ?? [], 4), text: oneLine[0], at: Math.round(((sentences[0]?.[0]?.s ?? scene.start) - scene.start) * fps)}]
    : explicit && explicit.length !== sentences.length
      ? boardLinesAt(explicit, sentences.flat()).map(({text, from}) => ({words: [] as Word[], text, at: Math.round(((from?.s ?? scene.start) - scene.start) * fps)}))
      : sentences.map((g, i) => ({words: keyWords(g, isVertical || brand.illustrated ? 4 : 5), text: explicit ? explicit[i] ?? '' : '', at: Math.round((g[0].s - scene.start) * fps)}));
  const pages: (typeof lines)[] = [];
  for (let i = 0; i < lines.length; i += MAX) pages.push(lines.slice(i, i + MAX));
  const wrong: string | undefined = scene.props.wrong;
  const wrongDone = wrong ? 4 + writeFrames(wrong, fps, 30) : 0;
  const firstAt = lines.length ? lines[0].at : fps;
  // the wrong idea is struck through first, then rubbed out, so nobody reads it as the point
  const strikeWin: [number, number] = [wrongDone + 2, wrongDone + 2 + Math.round(fps * 0.3)];
  const wrongErase: [number, number] = [strikeWin[1] + Math.round(fps * 0.45), 0];
  wrongErase[1] = wrongErase[0] + Math.round(fps * 0.6);
  // with a wrong idea on the board first, the real phrases wait until it has cleared (the voice runs on; the writing catches up)
  const shift = wrong ? Math.max(0, wrongErase[1] + 4 - firstAt) : 0;
  if (shift) for (const ln of lines) { ln.at += shift; ln.words = ln.words.map((w) => ({w: w.w, s: w.s + shift / fps, e: w.e + shift / fps})); }
  const lead = Math.round(fps * 0.8); // the page starts clearing this long before the first word of the next page
  let pageIdx = 0;
  for (let j = 1; j < pages.length; j++) if (frame >= pages[j][0].at - lead) pageIdx = j;
  const eraseWin: [number, number] | null = pageIdx > 0 ? [pages[pageIdx][0].at - lead, pages[pageIdx][0].at - Math.round(fps * 0.1)] : null;
  const boxW = big && !isVertical ? width * 0.42 - pad * 0.6 : width - pad * 2.4;
  const boxH = (isVertical ? (big ? 0.22 : 0.5) : 0.6) * height;
  const lineStyle: React.CSSProperties = {fontFamily: brand.display, fontWeight: dw(brand, 700), fontSize: (isVertical ? 66 : big ? 80 : 84) * u, lineHeight: 1.18, color: brand.ink, marginBottom: 14 * u, maxWidth: '100%'};
  const tint = (line: string) => moneyTint(String(scene.props.tint ?? '') === 'red' ? `${line} loss` : line, brand.accent, brand.accent2); // the figure in green, or red when the line is about a cost (tint=red: every line)
  const renderPage = (pg: typeof lines, offset: number) => (
    <div style={{position: 'absolute', inset: 0}}>
      {pg.map((ln, i) => {
        const at = offset + i === 0 && !wrong ? fitStart(ln.at, total) : ln.at; // the first line of a quick cut does not wait for the voice (unless a wrong idea is still being cleared)
        return (
          <div key={offset + i} style={lineStyle}>
            {explicit ? <Write text={ln.text} frame={frame} fps={fps} start={at} cps={fitCps(ln.text, fps, at, 22, total)} tint={tint(ln.text)} /> : <WriteSpoken words={ln.words} t={t} fps={fps} sceneStart={scene.start} tint={tint(ln.words.map((w) => w.w).join(' '))} />}
          </div>
        );
      })}
    </div>
  );
  return (
    <AbsoluteFill style={{justifyContent: isVertical && big ? 'flex-start' : 'center', padding: pad, paddingLeft: pad * 1.2, paddingTop: isVertical && big ? height * 0.2 : pad}}>
      {head}
      <div style={{position: 'relative', width: boxW, height: boxH}}>
        {wrong ? (
          <Erase win={wrongErase} brand={brand} width={boxW} height={boxH * 0.45} style={{position: 'absolute', left: 0, top: 0}}>
            <div style={{...lineStyle, color: brand.accent2}}>
              <span style={{position: 'relative', display: 'inline-block'}}>
                <Write text={wrong} frame={frame} fps={fps} start={4} cps={30} color={brand.accent2} />
                {frame < strikeWin[0] ? null : <span style={{position: 'absolute', left: -6 * u, top: '52%', height: 7 * u, borderRadius: 4 * u, background: brand.ink, transform: 'rotate(-2deg)', transformOrigin: 'left',
                  width: `calc(${100 * Math.min(1, Math.max(0, (frame - strikeWin[0]) / (strikeWin[1] - strikeWin[0])))}% + ${12 * u}px)`}} />}
              </span>
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
      {clipSrc ? <ClipCard src={clipSrc} props={scene.props} frame={frame} fps={fps} total={Math.max(1, Math.round((scene.end - scene.start) * fps))} brand={brand} /> : null}
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
  const total = Math.max(1, Math.round((scene.end - scene.start) * fps));
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
      <div style={{fontFamily: hand, fontSize: (isVertical ? 52 : 58) * u, color: noteColor(brand), transform: 'rotate(-1.5deg)', transformOrigin: 'left', marginBottom: 18 * u}}>
        <Write text={kicker} frame={frame} fps={fps} start={2} cps={34} color={noteColor(brand)} />
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
        <div style={{fontFamily: brand.display, fontWeight: dw(brand, 700), fontSize: (isVertical ? 70 : 92) * u, lineHeight: 1.15, color: brand.ink, width: isVertical ? '100%' : undefined, maxWidth: isVertical ? '100%' : width - pad * 2 - R - 60 * u, textAlign: isVertical ? 'center' : 'left'}}>
          <Write text={title} frame={frame} fps={fps} start={numDone} cps={fitCps(title, fps, numDone, 20, total, 0.75)} tint={moneyTint(title, brand.accent, brand.accent2)} />
        </div>
      </div>
      {void height}
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ b-roll in the picture column
/** A stock clip where the drawing would go: a white-framed card held by a magnet, the right half in landscape, the
 * band under the words in vertical, looping if it is shorter than the scene, its credit under the frame. */
const ClipCard: React.FC<{src: string; props: Record<string, any>; frame: number; fps: number; total: number; brand: Brand}> = ({src, props, frame, fps, total, brand}) => {  // eslint-disable-line @typescript-eslint/no-explicit-any
  const {u, pad, isVertical, width} = useLayout();
  const w = isVertical ? width - pad * 2 : width * 0.5 - pad;
  const h = (w * 9) / 16;
  const s = pop(frame, fps, 4, 14);
  const dur = Number(props.clip_dur ?? 0);
  const inner = <Media src={src} props={{zoom: 'in'}} durationFrames={total} width={w - 30 * u} height={h - 30 * u} />;
  return (
    <div style={{position: 'absolute', width: w, height: h, ...(isVertical ? {top: '40%', left: '50%', transform: `translateX(-50%) rotate(-1deg)`} : {right: pad * 0.7, top: '50%', transform: `translateY(-50%) rotate(-1.5deg)`}), opacity: Math.min(1, s * 1.4)}}>
      <div style={{width: '100%', height: '100%', background: '#fff', padding: 15 * u, boxShadow: `0 ${12 * u}px ${36 * u}px rgba(40,30,10,0.22)`}}>
        <div style={{position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#f1f1ee'}}>
          {dur > 0 && dur * fps < total ? <Loop durationInFrames={Math.max(1, Math.round(dur * fps))}>{inner}</Loop> : inner}
        </div>
      </div>
      <div style={{position: 'absolute', left: '50%', top: -20 * u, width: 50 * u, height: 50 * u, borderRadius: '50%', background: `radial-gradient(circle at 35% 30%, #9db4ff, ${brand.blue ?? '#3b5bdb'} 70%)`, boxShadow: `0 ${4 * u}px ${8 * u}px rgba(0,0,0,0.3)`, transform: 'translateX(-50%)'}} />
      {props.clip_credit && brand.creditsOnScreen ? <div style={{position: 'absolute', right: 8 * u, bottom: -40 * u, fontFamily: hand(brand), fontSize: 24 * u, color: brand.muted}}>{String(props.clip_credit)}</div> : null}
    </div>
  );
};

// ------------------------------------------------------------------ hook
/** The first five seconds: one line, big, in the middle of a clean board, before the title. `board=` sets the words,
 * else the first clause of what is said. The figure in it lands in colour and a marker line goes under it. */
export const PaperHook: React.FC<P> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, isVertical, width, height} = useLayout();
  const line: string = scene.props.board ? String(scene.props.board).split('|')[0].trim() : captionLine(scene.narration, 9);
  // a drawing beside the hook (`art=payday`): the picture has the right (or, vertical, the band under the words)
  const art = scene.props.art && isTraced(String(scene.props.art)) ? String(scene.props.art) : undefined;
  const beside = !!art || !!scene.props.anim; // a drawing or a loop on the right: the line keeps to the left column
  const total = Math.max(1, Math.round((scene.end - scene.start) * fps));
  // the line is already being written on the first frame: an autoplay preview never opens on blank paper
  // (at most a third of a second in, whenever the first word comes: there is ink on frame 0, a few letters already down)
  const at0 = Math.min(fitStart(Math.max(2, Math.round(((scene.words?.[0]?.s ?? scene.start) - scene.start) * fps) - 2), total) - Math.round(fps * 0.35), -Math.round(fps * 0.25));
  const cps = fitCps(line, fps, Math.max(0, at0), 20, total);
  // the video's opening line is fully written by 0.3 s: the first frame carries the number, like the thumbnail
  // (a viewer deciding in the first second saw "The st" on an empty page)
  const at = scene.start <= 0.01 ? Math.min(at0, Math.round(fps * 0.3) - writeFrames(line, fps, cps)) : at0;
  const done = at + writeFrames(line, fps, cps) + 4;
  const colW = beside && !isVertical ? width * (scene.start <= 0.01 ? 0.56 : 0.46) - pad : width - pad * 2;
  const w = Math.min(colW, Math.max(360 * u, line.length * (beside ? 36 : 44) * u));
  const size = (isVertical ? 700 : 760) * u;
  return (
    <AbsoluteFill style={{padding: pad, justifyContent: beside && isVertical ? 'flex-start' : 'center', alignItems: beside && !isVertical ? 'flex-start' : 'center', paddingTop: beside && isVertical ? height * 0.2 : pad}}>
      <div style={{fontFamily: brand.display, fontWeight: dw(brand, 700), fontSize: (isVertical ? 92 : (beside ? 100 : 118) * (scene.start <= 0.01 ? 1.3 : 1)) * u, lineHeight: 1.1, color: brand.ink, textAlign: beside && !isVertical ? 'left' : 'center', maxWidth: beside && !isVertical ? colW : '92%'}}>
        <Write text={line} frame={frame} fps={fps} start={at} cps={cps} tint={moneyTint(line, brand.accent, brand.accent2)} />
      </div>
      <svg width={w} height={30 * u} viewBox={`0 0 ${w} ${30 * u}`} style={{overflow: 'visible', marginTop: 10 * u}}>
        <SketchPath d={`M${w * 0.04},${16 * u} Q${w * 0.5},${6 * u} ${w * 0.96},${18 * u}`} win={[done, done + Math.round(fps * 0.5)]} easeOut options={{stroke: isLoss(line) ? brand.accent2 : brand.accent, strokeWidth: 9 * u, seed: scene.id * 5 + 2, roughness: 1.5}} />
      </svg>
      {art ? (
        <div style={{position: 'absolute', width: size, height: size, ...(isVertical ? {bottom: pad + 170 * u, left: '50%', transform: 'translateX(-50%)'} : {right: pad * 0.5, top: '50%', transform: 'translateY(-50%)'})}}>
          <Art name={art} size={size} brand={brand} start={2} seed={scene.id} by={Math.round(total * 0.7)} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ recap
/** The takeaways again, as a checklist: a box drawn, the line written, a green tick, one by one as the voice reaches
 * each (or spaced out when it does not say them). What every money channel puts before the sign-off. */
export const PaperRecap: React.FC<P> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, isVertical} = useLayout();
  const items: string[] = scene.props.items ?? [];
  const title: string = scene.props.title ?? 'Takeaways';
  const sceneLen = scene.end - scene.start;
  const titleDone = writeFrames(title, fps, 22) + 4;
  const delays = items.map((item, i) => {
    // the figure first: the whole line is rarely said word for word ("Start at 25: about £483 a month"), and its first two words match the first row: so its figure, then
    // its last number, so each row lands on its own word, not on an even share (retirement round 2: all three
    // age rows were up 5 s before "£1,492" was said)
    const fig = item.match(/£[\d,.]+(?:\s*(?:million|billion|k))?|\d[\d,.]*%?/gi) ?? [];
    const spoken = (fig.length ? figureTime(scene.words, fig[fig.length - 1]) : null) ?? findPhraseTime(scene.words, item);
    const delaySec = spoken !== null ? Math.max(0, spoken - scene.start) : titleDone / fps + 0.4 + (i * Math.max(0, sceneLen - titleDone / fps - 2.0)) / Math.max(1, items.length);
    return Math.max(titleDone + 4, Math.round(delaySec * fps));
  });
  for (let i = 1; i < delays.length; i++) delays[i] = Math.max(delays[i], delays[i - 1] + writeFrames(items[i - 1], fps, 30) + Math.round(fps * 0.6));
  const box = 72 * u;
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad, paddingLeft: pad * 1.2}}>
      <div style={{marginBottom: 30 * u, display: 'inline-block'}}>
        <div style={{fontFamily: hand(brand), fontSize: (isVertical ? 54 : 62) * u, color: noteColor(brand), transform: 'rotate(-1.5deg)', transformOrigin: 'left'}}>
          <Write text={title} frame={frame} fps={fps} start={2} cps={22} color={noteColor(brand)} />
        </div>
      </div>
      {items.map((item, i) => {
        const at = delays[i];
        const written = at + 8 + writeFrames(item, fps, 30);
        const tickWin: [number, number] = [written + 4, written + 4 + Math.round(fps * 0.35)];
        return (
          <div key={i} style={{display: 'flex', alignItems: 'center', gap: 28 * u, marginBottom: 24 * u}}>
            <svg width={box} height={box} viewBox="0 0 72 72" style={{flexShrink: 0, overflow: 'visible', visibility: frame < at ? 'hidden' : undefined}}>
              <SketchRect x={8} y={8} w={56} h={56} win={[at, at + 8]} options={{stroke: brand.ink, strokeWidth: 3.5, seed: 40 + i, roughness: 1.2}} />
              <SketchPath d="M18,38 L31,51 L56,22" win={tickWin} easeOut options={{stroke: brand.accent, strokeWidth: 7, seed: 50 + i, roughness: 0.8}} />
            </svg>
            <div style={{fontFamily: brand.display, fontWeight: dw(brand, 700), fontSize: (isVertical ? 44 : 54) * u, lineHeight: 1.2, color: brand.ink}}>
              <Write text={item} frame={frame} fps={fps} start={at + 8} cps={30} tint={moneyTint(item, brand.accent, brand.accent2)} />
            </div>
          </div>
        );
      })}
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
    // each row on its own figure ("£1,492"), not its first two words ("Start at" matched the first row: retirement
    // round 2 wrote all three age rows within 2 s of each other)
    const fig = item.match(/£[\d,.]+(?:\s*(?:million|billion|k))?|\d[\d,.]*%?/gi) ?? [];
    const spoken = (fig.length ? figureTime(scene.words, fig[fig.length - 1]) : null) ?? findPhraseTime(scene.words, item);
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
          <Underline width={Math.min(560 * u, title.length * 28 * u)} stroke={(brand.fill ?? brand.accent)} thickness={6 * u} win={[brand.board ? titleDone : 6, (brand.board ? titleDone : 6) + fps * 0.5]} easeOut seed={12} />
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
              {brand.board ? <Write text={item} frame={frame} fps={fps} start={delays[i] + 10} cps={30} tint={moneyTint(item, brand.accent, brand.accent2)} /> : item}
            </div>
          </div>
        );
      })}
      <CornerDoodle brand={brand} name={scene.props.sticker || scene.props.art ? undefined : autoDoodle(brand, scene.props.icon, title, items.join(' '))} art={scene.props.sticker || scene.props.art || scene.props.icon || brand.illustrated ? undefined : autoArt(brand, title, items.join(' '), scene.narration)} frame={frame} fps={fps} start={titleDone + 6} seed={scene.id + 5} color={brand.blue} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ compare
type Side = {title: string; value?: string; items?: string[]; color?: string};
/** a start so far back (20 seconds) that whatever it times, a written title, heading or value, is finished on the
 * scene's first frame: how a Short's opening chart or compare is posed (paper/opener.ts). No further back than that:
 * on the paper look a word's landing is a spring, which is worked out frame by frame from its start. */
const POSED = -600;
export const PaperCompare: React.FC<P> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, isVertical, width} = useLayout();
  const up = useUpright();
  const characterOn = React.useContext(CharacterOn);
  const posed = React.useContext(Opener); // a Short's first scene: both boxes, their headings and their values are on frame 0
  const left: Side = scene.props.left ?? {title: 'A'};
  const right: Side = scene.props.right ?? {title: 'B'};
  const title: string | undefined = scene.props.title;
  const source: string | undefined = scene.props.source;
  const titleSize = (isVertical ? 56 : 68) * u * (brand.board ? 1.1 : 1);
  let cardW = (width - pad * 2 - 90 * u) / 2; // the long video: two boxes side by side
  let cardH = 480 * u;
  // A Short: the two boxes are stacked in the stage (components/upright.json) and fill it. The title is at the top of
  // the stage, the source line along its foot, and the boxes share what is between (about 325 px each over cards with
  // a two-line source). They used to be a fixed 400 px, hung from the middle of the frame, with the caption pushed up
  // to 13.5% to clear them. Heading, value and items are centred in their box. The value is fitted to 80% of the box's
  // width (176 px for "Down £950"; it was 120 px), both boxes at the size the wider value takes, so the two figures
  // are compared at one size, and no bigger than the box's height allows or 240 px. The items are 50 px. In a box too
  // short for all that the items drop to 40 px first, then the value gives way, to 96 px at least.
  const stage = up ? up.stage(stageUnder(scene, brand, characterOn)) : null;
  let lay: {value: number; item: number; padV: number; gap: number; between: number} | null = null;
  if (stage) {
    const titleH = title ? displayLines(title, titleSize, stage.wide.w, brand.display) * titleSize * 1.15 + 10 * u : 0;
    const sourceH = source ? writtenLines(`source: ${source}`, 38 * u, stage.w) * 38 * u * 1.15 + 10 * u : 0;
    const between = 52 * u; // the gap the "vs" stands in
    cardW = stage.w;
    cardH = Math.max(220 * u, (stage.h - titleH - sourceH - between) / 2);
    const sides = [left, right];
    // the wider value in ems, as the marker writes it: its words and the gap between them
    const valueEm = Math.max(0, ...sides.map((s) => (s.value ? String(s.value).split(/\s+/).filter(Boolean).reduce((w, word) => w + displayWidth(word, 1, brand.display) + 0.28, -0.28) : 0)));
    // the lines the longer list of items takes at `item` px (about 0.46 em a character in the body face, beside its tick)
    const rows = (item: number) => Math.max(0, ...sides.map((s) => (s.items ?? []).reduce((n, it) => n + Math.max(1, Math.ceil((it.length * 0.46 * item + item * 1.3) / (cardW - 48 * u))), 0)));
    const padV = 16 * u;
    const gap = 8 * u;
    // the height a box's content takes with the value at `value` px and the items at `item` px
    const need = (value: number, item: number) => padV * 2 + 56 * u + (valueEm ? gap + value * 0.9 : 0) + (rows(item) ? gap + rows(item) * item * 1.2 : 0);
    const byHeight = (item: number) => (cardH - need(0, item)) / 0.9;
    const item = valueEm && byHeight(50 * u) < 120 * u ? 40 * u : 50 * u;
    const value = valueEm ? Math.max(96 * u, Math.min((cardW * 0.8) / valueEm, byHeight(item), 240 * u)) : 0;
    const spare = Math.max(0, cardH - need(value, item)); // room left over in the box: some of it goes between its lines
    lay = {value, item, padV, gap: gap + Math.min(20 * u, spare / 4), between};
  }
  const titleDone = title ? doneAt(brand, title, fps, 4, 2, 24) : 0;
  const Card: React.FC<{side: Side; bad: boolean; delay: number; tilt: number; seed: number; itemsFrom: number}> = ({side, bad, delay, tilt, seed, itemsFrom}) => {
    const s = posed ? 1 : pop(frame, fps, delay, 14);
    const color = bad ? brand.accent2 : brand.accent;
    const Icon = bad ? X : Check;
    const box = posed ? 1 : brand.board ? lin(frame, delay, delay + Math.round(fps * 0.6)) : Math.min(1, s * 1.3);
    const textAt = posed ? POSED : brand.board ? delay + Math.round(fps * 0.6) + 2 : delay;
    const valueAt = posed ? POSED : textAt + (brand.board ? writeFrames(side.title, fps, 30) + 2 : 0);
    const itemsAt = posed ? itemsFrom : valueAt + (brand.board && side.value ? writeFrames(side.value, fps, 12) + 2 : 12);
    const itemSize = lay ? lay.item : 40 * u;
    const tick = lay ? lay.item * 0.85 : 34 * u;
    // a written line ends in the marker's word gap: the same on its left centres the words in a Short's box
    const centred: React.CSSProperties = lay ? {paddingLeft: brand.board ? '0.28em' : 0} : {};
    return (
      <div style={{position: 'relative', width: cardW, height: cardH, transform: `rotate(${tilt}deg) translateY(${brand.board ? 0 : (1 - s) * 30 * u}px)`, opacity: brand.board ? 1 : Math.min(1, s * 1.4)}}>
        <svg width={cardW} height={cardH} viewBox={`0 0 ${cardW} ${cardH}`} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
          <SketchRect x={6} y={6} w={cardW - 12} h={cardH - 12} draw={box} win={brand.board && !posed ? [delay, delay + Math.round(fps * 0.6)] : undefined} options={{stroke: brand.ink, strokeWidth: 3.5 * u, seed, fill: brand.board ? undefined : brand.panel, fillStyle: 'solid', roughness: 1.2}} />
        </svg>
        <div style={lay ? {position: 'relative', boxSizing: 'border-box', height: '100%', padding: `${lay.padV}px ${24 * u}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: lay.gap} : {position: 'relative', padding: 40 * u, display: 'flex', flexDirection: 'column', gap: 14 * u, height: '100%'}}>
          <div style={{fontFamily: hand(brand), fontSize: 56 * u, color, lineHeight: 1, ...centred}}>{brand.board ? <Write text={side.title} frame={frame} fps={fps} start={textAt} cps={30} color={color} /> : side.title}</div>
          {side.value ? (
            <div style={{fontFamily: brand.display, fontWeight: dw(brand), fontSize: lay ? lay.value : 120 * u, lineHeight: lay ? 0.9 : 1, letterSpacing: brand.board ? 0 : -4 * u, color: brand.ink, fontVariantNumeric: 'tabular-nums', ...centred, ...(lay ? {whiteSpace: 'nowrap'} : {})}}>
              {brand.board ? <Write text={side.value} frame={frame} fps={fps} start={valueAt} cps={12} /> : side.value}
            </div>
          ) : null}
          {(side.items ?? []).map((it, i) => {
            const at = itemsAt + i * (brand.board ? writeFrames(it, fps, 34) + 6 : 5);
            return (
              <div key={i} style={{fontSize: itemSize, color: brand.ink, display: 'flex', gap: 14 * u, alignItems: 'flex-start', opacity: brand.board ? 1 : fadeIn(frame, at, 8), ...(lay ? {lineHeight: 1.2} : {})}}>
                {brand.board ? (
                  <svg width={tick} height={tick} viewBox="0 0 24 24" style={{flexShrink: 0, marginTop: lay ? lay.item * 0.14 : 4 * u, overflow: 'visible', visibility: frame < at ? 'hidden' : undefined}}>
                    <SketchPath d={bad ? 'M5,5 L19,19 M19,5 L5,19' : 'M4,13 L10,19 L20,6'} win={[at, at + 5]} options={{stroke: color, strokeWidth: 3.5, seed: seed + i, roughness: 0.8}} />
                  </svg>
                ) : (
                  <Icon size={tick} color={color} strokeWidth={3} style={{flexShrink: 0, marginTop: lay ? lay.item * 0.14 : 4 * u}} />
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
  const vs = posed ? 1 : brand.board ? lin(frame, rightAt - 8, rightAt - 2) : pop(frame, fps, 14, 10);
  // a Short's opener: the boxes are there before the first frame; their items are written on just after it, the first
  // box's and then the second's, and the source line after them
  const itemsLen = (side: Side) => (side.items ?? []).reduce((n, it) => n + (brand.board ? writeFrames(it, fps, 34) + 6 : 5), 0);
  const leftItems = Math.max(0, Math.round(-scene.start * fps)) + 4;
  const rightItems = leftItems + itemsLen(left) + 4;
  const sourceAt = posed ? rightItems + itemsLen(right) + 4 : brand.board ? rightAt + fps : 24;
  const good = scene.props.good;
  if (stage && lay) {
    return (
      <AbsoluteFill>
        <div style={{position: 'absolute', left: stage.x, top: stage.y, width: stage.w, height: stage.h, display: 'flex', flexDirection: 'column'}}>
          {title ? (
            // the title is above the height YouTube's buttons start at: it may run to the right margin
            <div style={{width: stage.wide.w, fontFamily: brand.display, fontWeight: dw(brand, 700), fontSize: titleSize, lineHeight: 1.15, color: brand.ink, marginBottom: 10 * u, letterSpacing: brand.board ? 0 : -1 * u}}>
              <Txt brand={brand} text={title} frame={frame} fps={fps} start={posed ? POSED : 4} seed={21} per={2} cps={24} />
            </div>
          ) : null}
          <div style={{display: 'flex', flexDirection: 'column', gap: lay.between, alignItems: 'center', position: 'relative'}}>
            <Card side={left} bad={good !== 'left' && good !== 'both'} delay={leftAt} tilt={-0.6} seed={41} itemsFrom={leftItems} />
            <div style={{position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%,-50%) scale(${vs}) rotate(-6deg)`, fontFamily: hand(brand), fontSize: 64 * u, lineHeight: 1, fontWeight: 700, color: brand.ink, zIndex: 2}}>vs</div>
            <Card side={right} bad={good === 'left' && good !== 'both'} delay={rightAt} tilt={0.5} seed={42} itemsFrom={rightItems} />
          </div>
          {source ? (
            <div style={{marginTop: 'auto', lineHeight: 1.15}}>
              <Source brand={brand} source={source} delay={sourceAt} />
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad}}>
      {title ? (
        <div style={{fontFamily: brand.display, fontWeight: dw(brand, 700), fontSize: titleSize, color: brand.ink, marginBottom: 36 * u, letterSpacing: brand.board ? 0 : -1 * u}}>
          <Txt brand={brand} text={title} frame={frame} fps={fps} start={posed ? POSED : 4} seed={21} per={2} cps={24} />
        </div>
      ) : null}
      <div style={{display: 'flex', flexDirection: 'row', gap: 90 * u, alignItems: 'center', position: 'relative'}}>
        <Card side={left} bad={good !== 'left' && good !== 'both'} delay={leftAt} tilt={-1.2} seed={41} itemsFrom={leftItems} />
        <div style={{position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%,-50%) scale(${vs}) rotate(-6deg)`, fontFamily: hand(brand), fontSize: 64 * u, fontWeight: 700, color: brand.ink, zIndex: 2}}>vs</div>
        <Card side={right} bad={good === 'left' && good !== 'both'} delay={rightAt} tilt={1} seed={42} itemsFrom={rightItems} />
      </div>
      <div style={{marginTop: 26 * u}}>
        <Source brand={brand} source={source} delay={sourceAt} />
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
  const up = useUpright();
  const characterOn = React.useContext(CharacterOn);
  const posed = React.useContext(Opener); // a Short's first scene: its title, axes, labels and every bar's outline are on frame 0
  // every bar in pencil outline before its figure is said: on a Short's opener, and on any chart of a script whose header
  // says `brand.pencil: on`, so the chart never waits on empty axes for the voice to reach its first number
  const pencil = posed || !!brand.pencil;
  const chartType: 'line' | 'bar' = scene.props.chartType ?? (scene.props.bars ? 'bar' : 'line');
  const isLine = chartType === 'line';
  const title: string | undefined = scene.props.title;
  const source: string | undefined = scene.props.source;
  const yFormat: string | undefined = scene.props.yFormat;
  const xLabel: string | undefined = scene.props.xLabel;
  const yLab = (v: number) => compactNum(v, yFormat);
  const series: Series[] = isLine ? scene.props.series ?? [] : [];
  const bars: Bar[] = isLine ? [] : scene.props.bars ?? [];
  const yMin = isLine ? 0 : Number(scene.props.yMin ?? 0) || 0; // a bar chart's floor (ymin=150); line charts keep nought
  const axis = niceAxis(isLine ? Math.max(...series.flatMap((s) => s.points.map((q) => q[1])), 0) : Math.max(...bars.map((b) => b.value - yMin), 0));
  const yMax = yMin + axis.max;
  const ticks = axis.ticks;
  // the long video: the plot is 56% of the height (640 px at most), with room on its right for a line's tip figure
  let W = width - pad * 2;
  let H = Math.min(height * 0.56, 640 * u);
  let left = 150 * u;
  let right = 200 * u;
  let bottom = 70 * u;
  let top = 60 * u;
  let tickSize = 30 * u; // the figures down the axis
  let figSize = 40 * u; // a bar's figure
  let labSize = 30 * u; // a bar's label
  const gap = 40 * u; // between bars
  const titleSize = (isVertical ? 54 : 64) * u * (brand.board ? 1.1 : 1);
  const stage = up ? up.stage(stageUnder(scene, brand, characterOn)) : null;
  if (stage) {
    // A Short: the chart is laid in the stage (components/upright.json). The title is at the top of the stage, the
    // source line along its foot, and the plot is everything between: about 700 px over cards with a two-line source,
    // over 900 px with nothing under the stage. It used to be a band 31% of the height tall (595 px) hanging from 29%,
    // over a page left bare down to its cards. It runs from the left margin to 84% of the width, because it reaches
    // down beside YouTube's buttons. A line chart keeps the room its tip figures need inside that width; a bar chart
    // needs none, so its bars run to the edge. The type grows with the plot: the axis figures are 34 px, and a bar's
    // figure and its label are as big as the bars' pitch lets them sit on one line (56 px and 40 px at most).
    const widest = (texts: string[]) => Math.max(0.5, ...texts.map(writtenEm)); // the widest of these, in ems of the hand face
    tickSize = 34 * u;
    left = widest(Array.from({length: ticks + 1}, (_, i) => yLab(yMin + ((yMax - yMin) * i) / ticks))) * tickSize + 20 * u;
    if (isLine) {
      right = 24 * u + widest(series.map((s) => (s.points.length ? yLab(s.points[s.points.length - 1][1]) : ''))) * 48 * u;
    } else {
      right = 6 * u;
      const pitch = (stage.w - left - right - gap) / Math.max(1, bars.length); // a bar and the gap beside it
      figSize = Math.max(34 * u, Math.min(56 * u, (pitch - 10 * u) / widest(bars.map((b) => yLab(b.value)))));
      labSize = Math.max(26 * u, Math.min(40 * u, (pitch - 14 * u) / widest(bars.map((b) => b.label))));
      top = figSize * 0.8 + 22 * u;
      bottom = labSize + 40 * u;
    }
    const titleH = title ? displayLines(title, titleSize, stage.wide.w, brand.display) * titleSize * 1.15 + 12 * u : 0;
    const sourceH = source ? writtenLines(`source: ${source}`, 38 * u, stage.w) * 38 * u * 1.15 + 10 * u : 0;
    W = stage.w;
    H = Math.max(300 * u, stage.h - titleH - sourceH);
  }
  const plotW = W - left - right;
  const plotH = H - bottom - top;
  const labelY = stage ? H - bottom + 22 * u + labSize * 0.8 : H - 18 * u; // the baseline of a bar's label
  // a second line is never the loss red by default: green, ink, blue; `data: Name:red = ...` asks for red
  const colors = [brand.accent, brand.ink, brand.blue ?? '#3b5bdb', brand.note ?? brand.muted];
  const named: Record<string, string> = {ink: brand.ink, green: brand.accent, red: brand.accent2, blue: brand.blue ?? '#3b5bdb', note: brand.note ?? brand.muted};
  const drawSec = Number(scene.props.drawSeconds) > 0 ? Number(scene.props.drawSeconds) : 2.2;
  // a Short: a line's end figure prints when it is said ("about £9,000"), else once the line is drawn
  const tipAt = (label: string) => {
    const said = findPhraseTime(scene.words, label);
    return said !== null ? Math.round((said - scene.start) * fps) : 0;
  };
  const drawFrames = Math.round(fps * (isVertical ? Math.min(drawSec, 5) : drawSec)); // a Short has no time for an eight-second draw
  const titleDone = title ? doneAt(brand, title, fps, 4, 2, 24) : 0;
  // the axes draw while the title is written, not after it: a chart opened on a bare page for a second
  const axesAt = brand.board ? Math.min(titleDone + 2, Math.round(fps * 0.25)) : 2;
  const axes = posed ? 1 : brand.board ? lin(frame, axesAt, axesAt + Math.round(fps * 0.5)) : ease(frame, 2, 14);
  const lineAt = brand.board ? axesAt + Math.round(fps * 0.5) + 4 : 10;
  const reveal = brand.board ? lin(frame, lineAt, lineAt + drawFrames) : ease(frame, 10, 10 + drawFrames);
  let body: React.ReactNode = null;
  const labelWipe = (at: number) => (brand.board && !posed ? {opacity: lin(frame, at, at + 3)} : {});
  if (isLine) {
    const allX = series.flatMap((s) => s.points.map((q) => q[0]));
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
          const c = s.color ? (named[s.color] ?? s.color) : colors[i % colors.length];
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
            <g key={i} visibility={brand.board && reveal <= 0 && !posed ? 'hidden' : undefined}>
              <SketchPath d={d} win={brand.board ? [lineAt, lineAt + drawFrames] : [10, 10 + drawFrames]} easeOut={!brand.board} options={{stroke: c, strokeWidth: 6 * u, roughness: 1.1, bowing: 0.6, seed: 60 + i}} />
              <circle cx={cx} cy={cy} r={9 * u} fill={c} />
              {!isVertical || (reveal >= 1 && frame >= tipAt(yLab(vNow))) ? <text x={cx + 18 * u} y={cy + 12 * u} fontFamily={hand(brand)} fontSize={(isVertical ? 48 : 38) * u} fontWeight={700} fill={c}>{yLab(vNow)}</text> : null}
              {s.name ? <text x={left + 10 * u + i * 300 * u} y={28 * u} fontFamily={hand(brand)} fontSize={(isVertical ? 42 : 34) * u} fill={c} {...labelWipe(lineAt)}>— {s.name}</text> : null}
            </g>
          );
        })}
        {[xMin, (xMin + xMax) / 2, xMax].map((x, i) => (
          <text key={i} x={sx(x)} y={H - 18 * u} fontFamily={hand(brand)} fontSize={(isVertical ? 38 : 30) * u} fill={brand.muted} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} {...labelWipe(axesAt + Math.round(fps * 0.5) + i * 3)}>{xLabel ? `${xLabel} ${Math.round(x)}` : Math.round(x)}</text>
        ))}
      </>
    );
  } else {
    const barColors: string[] = scene.props.barColors ?? [];
    // a bar whose own figure is never said (a share price) lands where its label is: "Monday 9 Nov" on "Monday"
    let from = 0;
    let lastAt: number | null = null;
    const labelAt = bars.map((b) => {
      const i = lineIndex(b.label, scene.words ?? [], from);
      if (i === null) return lastAt === null ? null : (lastAt += 0.7); // no word of its own: just after the bar before
      from = i + 1;
      lastAt = (scene.words ?? [])[i].s;
      return lastAt;
    });
    const bw = (plotW - gap * (bars.length + 1)) / Math.max(1, bars.length);
    body = (
      <>
        {bars.map((b, i) => {
          const seq = lineAt + i * (brand.board ? Math.round(fps * 0.7) : 8);
          // each bar grows as its figure is said ("just 9%"), not all three before the voice gets there
          const said = figureTime(scene.words, String(b.value)) ?? labelAt[i];
          const at = said !== null ? Math.max(seq, Math.round((said - scene.start) * fps) - Math.round(fps * 0.3)) : seq;
          const grow = brand.board ? lin(frame, at, at + fps * 0.6) : ease(frame, 8 + i * 8, 8 + i * 8 + fps * 0.9);
          const h = Math.max(0, ((b.value - yMin) / Math.max(1e-9, yMax - yMin)) * plotH * grow);
          const hq = Math.round(h / 3) * 3; // the sketch only redraws when the bar has visibly grown, so it does not boil
          const x = left + gap + i * (bw + gap);
          const y = top + plotH - hq;
          const c = b.color ?? (barColors[i] ? named[barColors[i]] ?? barColors[i] : colors[i % colors.length]);
          // the pencil outline: the bar's whole shape in a thin slate line, sketched once the axes are down (there
          // from the first frame on a Short's opener) and gone when the marker has filled the bar
          const full = Math.max(0, ((b.value - yMin) / Math.max(1e-9, yMax - yMin)) * plotH);
          const sketchAt = lineAt + i * 3;
          return (
            <g key={i}>
              {pencil && grow < 1 && full > 2 ? <SketchRect x={x} y={top + plotH - full} w={bw} h={full} win={posed ? undefined : [sketchAt, sketchAt + Math.round(fps * 0.4)]} options={{stroke: brand.note ?? brand.muted, strokeWidth: 3 * u, seed: 90 + i, roughness: 0.9}} /> : null}
              {hq > 2 ? <SketchRect x={x} y={y} w={bw} h={hq} options={{stroke: c, strokeWidth: 3.5 * u, seed: 70 + i, fill: c, fillStyle: 'hachure', hachureGap: 12 * u, fillWeight: 2.5 * u, hachureAngle: -41, roughness: 1}} /> : null}
              <text x={x + bw / 2} y={y - 16 * u} textAnchor="middle" fontFamily={hand(brand)} fontSize={figSize} fontWeight={700} fill={brand.ink} opacity={grow}>{yLab(yMin + (b.value - yMin) * grow)}</text>
              <text x={x + bw / 2} y={labelY} textAnchor="middle" fontFamily={hand(brand)} fontSize={labSize} fill={brand.muted} {...labelWipe(axesAt + Math.round(fps * 0.5) + i * 3)}>{b.label}</text>
            </g>
          );
        })}
      </>
    );
  }
  const plot = (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{overflow: 'visible'}}>
      {Array.from({length: ticks + 1}).map((_, i) => {
        const v = yMin + ((yMax - yMin) * i) / ticks;
        const y = top + plotH - (i / ticks) * plotH;
        return (
          <g key={i} opacity={axes}>
            {i > 0 ? <line x1={left} x2={left + plotW} y1={y} y2={y} stroke={brand.ink} strokeOpacity={0.12} strokeWidth={2} strokeDasharray="6 10" /> : null}
            <text x={left - 16 * u} y={y + (stage ? 11 : 10) * u} fontFamily={hand(brand)} fontSize={tickSize} fill={brand.muted} textAnchor="end">{yLab(v)}</text>
          </g>
        );
      })}
      <SketchLine x1={left} y1={top + plotH} x2={left + plotW} y2={top + plotH} draw={Math.min(1, axes * 2)} win={brand.board && !posed ? [axesAt, axesAt + Math.round(fps * 0.5) / 2] : undefined} options={{stroke: brand.ink, strokeWidth: 3.5 * u, seed: 50}} />
      <SketchLine x1={left} y1={top + plotH} x2={left} y2={top} draw={Math.max(0, axes * 2 - 1)} win={brand.board && !posed ? [axesAt + Math.round(fps * 0.5) / 2, axesAt + Math.round(fps * 0.5)] : undefined} options={{stroke: brand.ink, strokeWidth: 3.5 * u, seed: 51}} />
      {body}
    </svg>
  );
  const sourceAt = brand.board ? lineAt + drawFrames + Math.round(fps * 0.2) : 24;
  if (stage) {
    return (
      <AbsoluteFill>
        <div style={{position: 'absolute', left: stage.x, top: stage.y, width: stage.w, height: stage.h, display: 'flex', flexDirection: 'column'}}>
          {title ? (
            // the title is above the height YouTube's buttons start at: it may run to the right margin
            <div style={{width: stage.wide.w, fontFamily: brand.display, fontWeight: dw(brand, 700), fontSize: titleSize, lineHeight: 1.15, color: brand.ink, marginBottom: 12 * u, letterSpacing: brand.board ? 0 : -1 * u}}>
              <Txt brand={brand} text={title} frame={frame} fps={fps} start={posed ? POSED : 4} seed={31} per={2} cps={24} />
            </div>
          ) : null}
          {plot}
          {source ? (
            <div style={{marginTop: 'auto', lineHeight: 1.15}}>
              <Source brand={brand} source={source} delay={sourceAt} />
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad}}>
      {title ? (
        <div style={{fontFamily: brand.display, fontWeight: dw(brand, 700), fontSize: titleSize, color: brand.ink, marginBottom: 14 * u, letterSpacing: brand.board ? 0 : -1 * u}}>
          <Txt brand={brand} text={title} frame={frame} fps={fps} start={posed ? POSED : 4} seed={31} per={2} cps={24} />
        </div>
      ) : null}
      {plot}
      <div style={{marginTop: 10 * u}}>
        <Source brand={brand} source={source} delay={sourceAt} />
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
      <div style={{fontFamily: brand.display, fontSize: 200 * u, lineHeight: 0.5, color: (brand.fill ?? brand.accent), marginBottom: 20 * u, opacity: fadeIn(frame, 0, 8)}}>“</div>
      <div style={{fontFamily: brand.display, fontStyle: brand.board ? 'normal' : 'italic', fontWeight: 400, fontSize: (isVertical ? 64 : 84) * u, lineHeight: 1.25, color: brand.ink, maxWidth: isVertical ? '100%' : '80%'}}>
        <Txt brand={brand} text={quote} frame={frame} fps={fps} start={start} per={per} cps={cps} seed={51} />
      </div>
      {attribution ? (
        <div style={{fontFamily: hand(brand), fontSize: 54 * u, color: brand.muted, marginTop: 40 * u, opacity: brand.board ? 1 : fadeIn(frame, quoteDone, 10)}}>
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
  const title: string = scene.props.title ?? 'The Everyday Investor';
  const cta: string = scene.props.cta ?? 'Subscribe for the next one';
  const titleDone = doneAt(brand, title, fps, 4, 3, 20);
  const btnAt = brand.board ? titleDone + 4 : 10;
  const s = pop(frame, fps, btnAt, 12);
  const box = brand.board ? lin(frame, btnAt, btnAt + Math.round(fps * 0.5)) : Math.min(1, s * 1.2);
  const btnW = Math.min(1000 * u, cta.length * 26 * u + 120 * u);
  const btnH = 110 * u;
  const ctaAt = btnAt + Math.round(fps * 0.5) + 2;
  const slotsAt = brand.board ? ctaAt + writeFrames(cta, fps, 30) + 6 : 20;
  // the two end-screen boxes (for YouTube's end-screen links) only when `cards=on`: a new channel has nothing to put in them.
  // Plain outlines, no "goes here" labels: YouTube's own video and playlist tiles sit on top of them.
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
              </div>
            );
          })}
        </div>
      ) : null}
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
  // page work (paper/pagework.tsx): the picture holds still under a highlight, box or underline, so the mark stays on its words
  const mprops = hasPageMarks(scene) ? {...scene.props, zoom: 'none'} : scene.props;
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', padding: pad}}>
      <div style={{position: 'relative', transform: `rotate(${tilt}deg) translateY(${(1 - s) * 40 * u}px)`, opacity: Math.min(1, s * 1.4)}}>
        <div style={{width: w, height: h, background: '#fff', padding: 18 * u, paddingBottom: 18 * u, boxShadow: `0 ${14 * u}px ${40 * u}px rgba(40,30,10,0.25)`}}>
          <div style={{position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: brand.board ? '#f1f1ee' : '#e9e2d6'}}>
            {src ? (
              scene.props.loop && scene.props.clipDur ? (
                <Loop durationInFrames={Math.max(1, Math.round(Number(scene.props.clipDur) * fps))}>
                  <Media src={src} props={mprops} durationFrames={total} width={w - 36 * u} height={h - 36 * u} />
                </Loop>
              ) : (
                <Media src={src} props={mprops} durationFrames={total} width={w - 36 * u} height={h - 36 * u} />
              )
            ) : (
              <div style={{width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 * u, textAlign: 'center', fontFamily: hand(brand), fontSize: 40 * u, lineHeight: 1.2, color: brand.muted}}>
                {scene.props.want ?? scene.props.prompt ?? 'picture goes here'}
              </div>
            )}
            <Marks scene={scene} brand={brand} w={w - 36 * u} h={h - 36 * u} />
          </div>
        </div>
        {brand.board ? (
          // a round magnet holds the photo to the board
          <div style={{position: 'absolute', left: '50%', top: -22 * u, width: 56 * u, height: 56 * u, borderRadius: '50%', background: `radial-gradient(circle at 35% 30%, #9db4ff, ${brand.blue ?? '#3b5bdb'} 70%)`, boxShadow: `0 ${4 * u}px ${8 * u}px rgba(0,0,0,0.3)`, transform: 'translateX(-50%)'}} />
        ) : (
          // a strip of tape over the top edge
          <div style={{position: 'absolute', left: '50%', top: -16 * u, width: 180 * u, height: 44 * u, background: marker(brand), opacity: 0.75, transform: 'translateX(-50%) rotate(-3deg)'}} />
        )}
        {caption ? (
          <div style={{position: 'absolute', left: 30 * u, bottom: -70 * u, fontFamily: hand(brand), fontSize: 48 * u, color: brand.ink, transform: 'rotate(1deg)', opacity: brand.board ? 1 : fadeIn(frame, 10, 10)}}>
            {brand.board ? <Write text={caption} frame={frame} fps={fps} start={12} cps={30} /> : caption}
          </div>
        ) : null}
        {scene.props.credit && brand.creditsOnScreen ? <div style={{position: 'absolute', right: 10 * u, bottom: -46 * u, fontFamily: hand(brand), fontSize: 26 * u, color: brand.muted, opacity: fadeIn(frame, 14, 10)}}>{scene.props.credit}</div> : null}
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ watch next: another video, framed as one
/** `[broll ... next=on]`: a preview of another of the channel's videos, framed as a card on a dark backdrop under a
 * written "Watch next", so it reads as a different video and not as more of this one (a whiteboard video full-frame
 * after a whiteboard video was seamless). The card lands under a second in and the clip (and its sound) starts with it,
 * so there is a beat of silence at the cut; the caption, the other video's title, is written under the frame. */
const WatchNext: React.FC<P> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, width, height, isVertical} = useLayout();
  const total = Math.max(1, Math.round((scene.end - scene.start) * fps));
  const src: string | undefined = scene.props.src;
  const caption = String(scene.props.caption ?? '').replace(/^watch next:\s*/i, '');
  // `cont`: the same preview carrying on from the scene before (the sign-off, then its sound): no second entrance
  const cont = String(scene.props.cont ?? '') === 'on';
  const delay = cont ? 0 : Math.round(fps * 0.8);
  const s = cont ? 1 : pop(frame, fps, delay, 14);
  const w = isVertical ? width - pad * 1.2 : width * 0.64;
  const h = (w * 9) / 16;
  const top = isVertical ? height * 0.3 : height * 0.22;
  const head = (isVertical ? 110 : 100) * u;
  const dark = '#1f2326';
  return (
    <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 45%, #2d3236 0%, ${dark} 70%)`}}>
      <div style={{position: 'absolute', left: 0, right: 0, top: top - head * 1.5, textAlign: 'center', fontFamily: brand.display, fontWeight: dw(brand, 700), fontSize: head, lineHeight: 1, color: '#fff'}}>
        {brand.board && !cont ? <Write text="Watch next" frame={frame} fps={fps} start={0} cps={22} color="#fff" /> : 'Watch next'}
      </div>
      <div style={{position: 'absolute', left: (width - w) / 2, top, width: w, height: h, transform: `rotate(-1deg) scale(${0.85 + 0.15 * s})`, opacity: Math.min(1, s * 1.5)}}>
        <div style={{width: '100%', height: '100%', background: '#fff', padding: 16 * u, boxSizing: 'border-box', boxShadow: `0 ${18 * u}px ${60 * u}px rgba(0,0,0,0.55)`}}>
          <div style={{position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#111'}}>
            {src ? (
              <Sequence from={delay} layout="none">
                <Media src={src} props={{zoom: 'none', vol: scene.props.vol, from: scene.props.from}} durationFrames={total - delay} width={w - 40 * u} height={h - 40 * u} />
              </Sequence>
            ) : null}
          </div>
        </div>
        <div style={{position: 'absolute', left: -34 * u, top: -34 * u, width: 92 * u, height: 92 * u, borderRadius: '50%', background: brand.accent2, boxShadow: `0 ${6 * u}px ${14 * u}px rgba(0,0,0,0.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
          <div style={{width: 0, height: 0, marginLeft: 8 * u, borderTop: `${20 * u}px solid transparent`, borderBottom: `${20 * u}px solid transparent`, borderLeft: `${32 * u}px solid #fff`}} />
        </div>
      </div>
      {caption ? (
        <div style={{position: 'absolute', left: pad, right: pad, top: top + h + 40 * u, textAlign: 'center', fontFamily: hand(brand), fontSize: (isVertical ? 64 : 56) * u, lineHeight: 1.15, color: '#fff'}}>
          {brand.board && !cont ? <Write text={caption} frame={frame} fps={fps} start={delay + 6} cps={30} color="#fff" /> : caption}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/** The caption as a tab on the top-left edge of a frame, for a scene whose cards have the foot of the frame
 * (`cards_at=strip`, paper/setpiece.tsx). It sits inside the frame's own box, so it turns with the frame, and stands
 * wholly above the picture: `lift` is the frame's height less the part of its border the tab laps onto. */
const CaptionTab: React.FC<{text: string; brand: Brand; left: number; lift: number; size: number; room: number; s: number}> = ({text, brand, left, lift, size, room, s}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u} = useLayout();
  const fs = Math.min(size, room / Math.max(1, text.length) / 0.4); // a long caption is written smaller, never onto the tape
  return (
    <div style={{position: 'absolute', left, bottom: lift, transform: `scale(${0.9 + 0.1 * s})`, transformOrigin: 'left bottom', opacity: Math.min(1, s * 1.5), background: '#fff', color: brand.ink, fontFamily: hand(brand), fontSize: fs, lineHeight: 1.15, padding: `${5 * u}px ${20 * u}px ${3 * u}px`, border: `${3 * u}px solid ${brand.ink}`, borderBottom: 'none', borderRadius: `${10 * u}px ${10 * u}px 0 0`, whiteSpace: 'nowrap'}}>
      <Write text={text} frame={frame} fps={fps} start={Math.round(fps * 0.4)} cps={30} />
    </div>
  );
};

/** true while a Short shows a photo opener with its big number (`big=` on footage: PaperBroll's branch for it, which
 * on a Short comes after the watch-next card and after a page or phone screen shown whole). The number is the hook
 * there, so the hook sticker stays off the picture (Video.tsx HookBanner). */
export const bigOpener = (scene: Scene | undefined): boolean => {
  if (!scene || scene.type !== 'broll') return false;
  const p = scene.props;
  return !!p.big && !!(p.vsrc || p.src) && String(p.next ?? '') !== 'on' && String(p.phone ?? '') !== 'on' && String(p.vfit ?? '') !== 'contain';
};

// ------------------------------------------------------------------ b-roll: the footage fills the frame
/** Stock footage as its own scene, How Money Works style: the clip covers the whole frame with a slow push-in, a short
 * caption on a white label in the corner (the credit beside it only with `credits: screen`). With no footage yet the frame says what was
 * asked for, so the cut still reads in a preview render. */
export const PaperBroll: React.FC<P> = ({scene, brand}) => {
  if (String(scene.props.next ?? '') === 'on') return <WatchNext scene={scene} brand={brand} />;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, width, height, isVertical} = useLayout();
  const up = useUpright();
  const total = Math.max(1, Math.round((scene.end - scene.start) * fps));
  // `vsrc=`: a second crop of a page or photo for the upright cut (a wide page loses its headline when it fills a Short)
  const src: string | undefined = (isVertical && scene.props.vsrc) || scene.props.src;
  const caption: string | undefined = scene.props.caption;
  const credit: string | undefined = brand.creditsOnScreen ? scene.props.credit : undefined; // credits go to credits.txt unless asked for on screen
  const s = pop(frame, fps, Math.round(fps * 0.35), 12);
  const sf = pop(frame, fps, 0, 9); // the frame itself lands from the cut: a blank page at a cut is the one thing a cut must never show
  const labelSize = (isVertical ? 60 : 54) * u;
  const bottom = isVertical ? height * 0.2 : pad * 0.9;
  // hold: a clip shorter than its scene (the build slows it to 0.3x at least) plays once and holds its last frame
  const holdAt = scene.props.hold && scene.props.clipDur ? Math.max(1, Math.round(((Number(scene.props.clipDur) - Number(scene.props.from ?? 0)) / Math.max(0.05, Number(scene.props.rate ?? 1))) * fps) - 2) : null;
  const mediaAt = (w: number, h: number, over: Record<string, unknown> = {}) => (src ? (
    holdAt !== null && frame >= holdAt ? (
      <Freeze frame={holdAt}>
        <Media src={src} props={{zoom: 'in', ...scene.props, ...over}} durationFrames={total} width={w} height={h} />
      </Freeze>
    ) : scene.props.loop && scene.props.clipDur ? (
      <Loop durationInFrames={Math.max(1, Math.round(Number(scene.props.clipDur) * fps))}>
        <Media src={src} props={{zoom: 'in', ...scene.props, ...over}} durationFrames={total} width={w} height={h} />
      </Loop>
    ) : (
      <Media src={src} props={{zoom: 'in', ...scene.props, ...over}} durationFrames={total} width={w} height={h} />
    )
  ) : null);
  const media = mediaAt(width, height);
  const fitted = String(scene.props.vfit ?? '') === 'contain'; // `vfit=contain`: the whole picture on the page of a Short, not cropped to fill it
  // page work (paper/pagework.tsx): a highlight, box or underline on the real words. Drawn on the landscape page, and
  // on a Short only where the same file is shown whole (vfit=contain and no vsrc): the rectangles were read off that
  // picture, and on a cropped upright page they would land on other words. Where they are drawn the page holds still:
  // no push-in (Media zooms the picture about its focus point while the marks stay put, so they would slide off their
  // words) and no rock of the taped frame.
  const paged = hasPageMarks(scene) && (!isVertical || (fitted && !scene.props.vsrc));
  const still: Record<string, unknown> = paged ? {zoom: 'none'} : {};
  // the cards have the foot of the frame (cards_at=strip, or bl): the caption label is a tab on the frame's top-left edge
  const tab = !isVertical && cardsTakeFoot(scene, brand);
  if (src && (String(scene.props.phone ?? '') === 'on' || fitted) && isVertical) {
    // a Short: the phone's whole screen fitted between the caption band and the Shorts title strip (29% to 84% of the
    // height: 72% of the width on a 1080x1480 recording), its marks on it, the caption label on its lower right
    // (paper/setpiece.tsx uprightWhole has the box: a page's cards hang under its foot, FootageCards)
    const {x: cx, y: cy, w: cw, h: ch} = uprightWhole(scene, width, height);
    return (
      <AbsoluteFill style={{background: brand.bg, overflow: 'hidden'}}>
        <div style={{position: 'absolute', left: cx, top: cy, width: cw, height: ch, transform: `translateY(${(1 - sf) * 40 * u}px)`, opacity: Math.min(1, sf * 1.5), borderRadius: 36 * u, overflow: 'hidden', background: '#000', boxShadow: `0 ${14 * u}px ${40 * u}px rgba(40,30,10,0.28)`}}>
          <div style={{position: 'relative', width: cw, height: ch, overflow: 'hidden'}}>
            {mediaAt(cw, ch, {zoom: 'none', fit: 'contain'})}
            <Marks scene={scene} brand={brand} w={cw} h={ch} page={paged} />
          </div>
        </div>
        {caption ? (
          <div style={{position: 'absolute', right: cx + pad * 0.3, top: cy + ch - labelSize * 2.2, transform: `rotate(-1deg) scale(${0.9 + 0.1 * s})`, transformOrigin: 'right bottom', opacity: Math.min(1, s * 1.5), background: '#fff', color: brand.ink, fontFamily: hand(brand), fontSize: labelSize * 0.85, lineHeight: 1.15, padding: `${8 * u}px ${22 * u}px`, boxShadow: `0 ${8 * u}px ${24 * u}px rgba(0,0,0,0.3)`, maxWidth: cw * 0.8}}>
            <Write text={caption} frame={frame} fps={fps} start={Math.round(fps * 0.4)} cps={30} />
          </div>
        ) : null}
      </AbsoluteFill>
    );
  }
  if (src && String(scene.props.phone ?? '') === 'on' && !isVertical) {
    // a phone's screen recording: the phone stands on the board left of centre, upright, the cards in the column on the right
    const ph = height * 0.86;
    const pw = ph * 0.47;
    const bez = 16 * u;
    const tilt = -2 + 0.6 * Math.sin(frame / fps);
    return (
      <AbsoluteFill style={{background: brand.bg, overflow: 'hidden'}}>
        <div style={{position: 'absolute', left: width * 0.36 - pw / 2, top: (height - ph) / 2, width: pw, height: ph, transform: `rotate(${tilt}deg) translateY(${(1 - s) * 60 * u}px)`, opacity: Math.min(1, s * 1.5),
          background: '#1d1d1f', borderRadius: 54 * u, padding: bez, boxShadow: `0 ${18 * u}px ${48 * u}px rgba(40,30,10,0.3)`}}>
          <div style={{position: 'relative', width: '100%', height: '100%', borderRadius: 40 * u, overflow: 'hidden', background: '#000'}}>
            <Media src={src} props={{...scene.props, zoom: 'none', fit: 'contain'}} durationFrames={total} width={pw - bez * 2} height={ph - bez * 2} />
            <Marks scene={scene} brand={brand} w={pw - bez * 2} h={ph - bez * 2} />
          </div>
        </div>
        {caption ? (
          <div style={{position: 'absolute', left: pad * 0.8, ...(tab ? {top: pad * 0.45} : {bottom: pad * 0.9}), transform: `rotate(-1deg) scale(${0.9 + 0.1 * s})`, transformOrigin: 'left bottom', opacity: Math.min(1, s * 1.5), background: '#fff', color: brand.ink, fontFamily: hand(brand), fontSize: labelSize, lineHeight: 1.15, padding: `${10 * u}px ${26 * u}px`, boxShadow: `0 ${8 * u}px ${24 * u}px rgba(0,0,0,0.2)`, border: `${3 * u}px solid ${brand.ink}`}}>
            <Write text={caption} frame={frame} fps={fps} start={Math.round(fps * 0.4)} cps={30} />
          </div>
        ) : null}
      </AbsoluteFill>
    );
  }
  if (src && brand.board && !isVertical && String(scene.props.screen ?? '') === 'laptop') {
    // a screen recording in a drawn laptop: a navy screen with a browser bar, a base under it, no tilt, the caption under the base
    const bez = 14 * u;
    const bar = 40 * u;
    const fw = width * 0.66;
    const fh = (fw * 10) / 16;
    const fx = (width - fw) / 2;
    const fy = (height - fh) / 2 - height * 0.07;
    const mw = fw - bez * 2;
    const mh = fh - bez * 2 - bar;
    return (
      <AbsoluteFill style={{background: brand.bg, overflow: 'hidden'}}>
        <div style={{position: 'absolute', left: fx, top: fy, width: fw, height: fh, transform: `translateY(${(1 - sf) * 40 * u}px)`, opacity: Math.min(1, sf * 1.5), background: brand.ink, padding: bez, boxSizing: 'border-box', borderRadius: 24 * u, boxShadow: `${12 * u}px ${12 * u}px 0 ${brand.ink}`}}>
          <div style={{width: '100%', height: bar, background: '#EEF2F8', borderRadius: `${8 * u}px ${8 * u}px 0 0`, display: 'flex', alignItems: 'center', gap: 10 * u, padding: `0 ${18 * u}px`, boxSizing: 'border-box'}}>
            {[0, 1, 2].map((k) => <span key={k} style={{width: 12 * u, height: 12 * u, borderRadius: '50%', background: brand.muted, opacity: 0.7}} />)}
            <span style={{marginLeft: 18 * u, flex: 1, height: bar * 0.55, borderRadius: bar * 0.3, background: '#fff', border: `${2 * u}px solid ${brand.muted}55`}} />
          </div>
          <div style={{position: 'relative', width: mw, height: mh, overflow: 'hidden', background: '#111'}}>
            {mediaAt(mw, mh, still)}
            <Marks scene={scene} brand={brand} w={mw} h={mh} page={paged} />
          </div>
          <div style={{position: 'absolute', left: '50%', top: bez * 0.35, width: 10 * u, height: 10 * u, borderRadius: '50%', background: brand.muted, transform: 'translateX(-50%)'}} />
          {caption && tab ? <CaptionTab text={caption} brand={brand} left={pad * 0.4} lift={fh - bez} size={labelSize * 0.8} room={fw * 0.8} s={s} /> : null}
        </div>
        <div style={{position: 'absolute', left: fx - fw * 0.04, top: fy + fh + 2 * u, width: fw * 1.08, height: 26 * u, background: brand.ink, borderRadius: `0 0 ${16 * u}px ${16 * u}px`, boxShadow: `${12 * u}px ${12 * u}px 0 ${brand.ink}`, opacity: Math.min(1, sf * 1.5)}}>
          <div style={{position: 'absolute', left: '50%', top: 0, width: fw * 0.16, height: 8 * u, background: brand.muted, borderRadius: `0 0 ${6 * u}px ${6 * u}px`, transform: 'translateX(-50%)', opacity: 0.6}} />
        </div>
        {caption && !tab ? (
          <div style={{position: 'absolute', left: fx, top: fy + fh + 48 * u, transform: `rotate(-1deg) scale(${0.9 + 0.1 * s})`, transformOrigin: 'left top', opacity: Math.min(1, s * 1.5), background: '#fff', color: brand.ink, fontFamily: hand(brand), fontSize: labelSize, lineHeight: 1.15, padding: `${8 * u}px ${24 * u}px`, border: `${3 * u}px solid ${brand.ink}`, boxShadow: `${6 * u}px ${6 * u}px 0 ${brand.ink}`, maxWidth: width * 0.6}}>
            <Write text={caption} frame={frame} fps={fps} start={Math.round(fps * 0.4)} cps={30} />
          </div>
        ) : null}
      </AbsoluteFill>
    );
  }
  if (src && scene.props.big) {
    // big="−$400 BILLION | in 2 days": the picture edge to edge with the number across its lower third, complete on the
    // first frame. A news video's opening: one real picture and one figure, never half a page of handwriting
    // (Jeffrey: "I really hate the way we start the vid with half text").
    const [l1, l2] = String(scene.props.big).split('|').map((x) => x.trim());
    const inAt = scene.start <= 0.01 ? 1 : pop(frame, fps, 2, 10);
    // red only ever means a loss: the block is red when the figure reads as one (a leading minus, or a losing word in
    // either line) and navy otherwise. It used to be red whatever the figure said.
    const block = /^\s*[−-]/.test(l1) || isLoss(`${l1} ${l2 ?? ''}`) ? brand.accent2 : NAVY;
    // On a Short the block's foot sits above YouTube's title strip and its right edge left of the buttons
    // (upright.json opener); at the foot of the frame the number was under the title. The type gives way if the block,
    // with its shadow, would cross that right edge.
    const place = up ? {right: width * (1 - zones.opener.right), bottom: height * (1 - zones.opener.foot)} : {right: pad * 0.7, bottom: pad * 0.55};
    const most = (isVertical ? 150 : 180) * u;
    const size1 = Math.min(most, (width * 0.9) / Math.max(4, l1.length) * 1.75, up ? (width - place.right - pad * 0.7 - 68 * u) / displayWidth(l1, 1, brand.display) : most);
    return (
      <AbsoluteFill style={{background: '#111', overflow: 'hidden'}}>
        <div style={{position: 'absolute', inset: 0, overflow: 'hidden'}}>{media}</div>
        <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 38%, rgba(4,27,60,0.86) 100%)'}} />
        <div style={{position: 'absolute', left: pad * 0.7, right: place.right, bottom: place.bottom, transform: `scale(${0.96 + 0.04 * inAt})`, transformOrigin: 'left bottom'}}>
          <div style={{display: 'inline-block', background: block, color: '#fff', fontFamily: brand.display, fontSize: size1, lineHeight: 1.02, padding: `${6 * u}px ${28 * u}px ${14 * u}px`, transform: 'rotate(-1.2deg)', boxShadow: `${10 * u}px ${10 * u}px 0 rgba(0,0,0,0.35)`}}>{l1}</div>
          {l2 ? <div style={{marginTop: 14 * u, color: '#fff', fontFamily: brand.display, fontSize: size1 * 0.58, lineHeight: 1.05, textShadow: '0 3px 14px rgba(0,0,0,0.6)'}}>{l2}</div> : null}
        </div>
        {credit ? <div style={{position: 'absolute', right: pad * 0.4, top: pad * 0.3, fontFamily: hand(brand), fontSize: 24 * u, color: 'rgba(255,255,255,0.85)', textShadow: '0 1px 4px rgba(0,0,0,0.6)'}}>{credit}</div> : null}
      </AbsoluteFill>
    );
  }
  if (src && brand.board && !isVertical) {
    // footage taped to the board: a navy frame with an offset shadow, a degree or two of tilt, a lighter grade so the
    // photo sits with the ink rather than cutting hard against it, the caption on the frame's bottom edge
    const bord = 6 * u;
    const fw = width * 0.84;
    const fh = (fw * 9) / 16;
    const fx = (width - fw) / 2;
    const fy = (height - fh) / 2 - height * 0.015;
    const tilt = paged ? -1.6 : -1.6 + 0.35 * Math.sin(frame / (fps * 1.9));
    return (
      <AbsoluteFill style={{background: brand.bg, overflow: 'hidden'}}>
        <div style={{position: 'absolute', left: fx, top: fy, width: fw, height: fh, transform: `rotate(${tilt}deg) translateY(${(1 - sf) * 40 * u}px)`, opacity: Math.min(1, sf * 1.5), background: brand.ink, padding: bord, boxSizing: 'border-box', boxShadow: `${12 * u}px ${12 * u}px 0 ${brand.ink}`}}>
          <div style={{position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#111', filter: 'saturate(0.88) contrast(1.04) sepia(0.06)'}}>
            {mediaAt(fw - bord * 2, fh - bord * 2, still)}
            <Marks scene={scene} brand={brand} w={fw - bord * 2} h={fh - bord * 2} page={paged} />
          </div>
          <div style={{position: 'absolute', left: '50%', top: -12 * u, width: 150 * u, height: 28 * u, background: brand.marker, opacity: 0.85, transform: 'translateX(-50%) rotate(1.5deg)'}} />
          {caption && tab ? <CaptionTab text={caption} brand={brand} left={pad * 0.25} lift={fh - bord * 0.5} size={labelSize * 0.8} room={fw * 0.42} s={s} /> : null}
        </div>
        {caption && !tab ? (
          <div style={{position: 'absolute', left: fx + pad * 0.25, top: fy + fh - labelSize * 0.9, transform: `rotate(-1deg) scale(${0.9 + 0.1 * s})`, transformOrigin: 'left bottom', opacity: Math.min(1, s * 1.5), background: '#fff', color: brand.ink, fontFamily: hand(brand), fontSize: labelSize, lineHeight: 1.15, padding: `${8 * u}px ${24 * u}px`, border: `${3 * u}px solid ${brand.ink}`, boxShadow: `${6 * u}px ${6 * u}px 0 ${brand.ink}`, maxWidth: width * 0.6}}>
            <Write text={caption} frame={frame} fps={fps} start={Math.round(fps * 0.4)} cps={30} />
          </div>
        ) : null}
        {credit ? <div style={{position: 'absolute', right: fx, top: fy + fh + 26 * u, fontFamily: hand(brand), fontSize: 26 * u, color: brand.muted, opacity: fadeIn(frame, 14, 10)}}>{credit}</div> : null}
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{background: src ? '#111' : brand.bg, overflow: 'hidden'}}>
      {src ? (
        <>
          <div style={{position: 'absolute', inset: 0, overflow: 'hidden'}}>
            {paged ? mediaAt(width, height, still) : media}
            {paged ? <PageMarks scene={scene} brand={brand} w={width} h={height} /> : null}
          </div>
          <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)'}} />
        </>
      ) : (
        <div style={{position: 'absolute', left: pad, right: pad, top: pad, bottom: pad, border: `${4 * u}px dashed ${brand.muted}`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: pad, textAlign: 'center', fontFamily: hand(brand), fontSize: 46 * u, lineHeight: 1.2, color: brand.muted}}>
          {`footage: ${scene.props.want ?? scene.props.search ?? 'b-roll'}`}
        </div>
      )}
      {caption ? (
        <div style={{position: 'absolute', left: pad * 0.8, ...(tab ? {top: pad * 0.45} : {bottom}), transform: `rotate(-1deg) scale(${0.9 + 0.1 * s})`, transformOrigin: 'left bottom', opacity: Math.min(1, s * 1.5), background: '#fff', color: brand.ink, fontFamily: hand(brand), fontSize: labelSize, lineHeight: 1.15, padding: `${10 * u}px ${26 * u}px`, boxShadow: `0 ${8 * u}px ${24 * u}px rgba(0,0,0,0.3)`, maxWidth: isVertical ? width - pad * 1.6 : width * 0.6}}>
          <Write text={caption} frame={frame} fps={fps} start={Math.round(fps * 0.4)} cps={30} />
        </div>
      ) : null}
      {credit ? <div style={{position: 'absolute', right: pad * 0.6, bottom: pad * 0.45, fontFamily: hand(brand), fontSize: 26 * u, color: src ? 'rgba(255,255,255,0.85)' : brand.muted, opacity: fadeIn(frame, 14, 10), textShadow: src ? '0 1px 4px rgba(0,0,0,0.6)' : undefined}}>{credit}</div> : null}
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ news: a real headline on a clipping
/** A headline pinned to the board like a newspaper clipping: outlet and date along the top, the line big, the source's
 * address small underneath. The render fills headline/outlet/date/url from a real article (`search=`), or the editor
 * writes them in. */
export const PaperNews: React.FC<P> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, width, isVertical} = useLayout();
  const headline: string | undefined = scene.props.headline;
  const outlet: string = String(scene.props.outlet ?? '');
  const date: string = String(scene.props.date ?? '');
  const url: string = String(scene.props.url ?? '');
  const caption: string | undefined = scene.props.caption;
  const domain = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  const w = isVertical ? width - pad * 2 : width * 0.74;
  const s = pop(frame, fps, 0, 14);
  const headSize = (isVertical ? 62 : 72) * u * ((headline ?? '').length > 80 ? 0.8 : 1);
  const lineAt = Math.round(fps * 0.35);
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', padding: pad}}>
      <div style={{position: 'relative', width: w, transform: `rotate(-1.2deg) translateY(${(1 - s) * 40 * u}px)`, opacity: Math.min(1, s * 1.4)}}>
        <div style={{background: '#fff', padding: `${34 * u}px ${44 * u}px ${30 * u}px`, boxShadow: `0 ${14 * u}px ${40 * u}px rgba(40,30,10,0.25)`, border: `${2 * u}px solid rgba(0,0,0,0.08)`}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 20 * u, marginBottom: 14 * u}}>
            <div style={{fontFamily: brand.display, fontWeight: 700, fontSize: 30 * u, letterSpacing: '0.14em', textTransform: 'uppercase', color: brand.ink, opacity: fadeIn(frame, 4, 8)}}>{outlet || (domain || 'the press')}</div>
            <div style={{fontFamily: hand(brand), fontSize: 32 * u, color: brand.muted, opacity: fadeIn(frame, 6, 8)}}>{date}</div>
          </div>
          <div style={{height: 3 * u, background: brand.ink, opacity: 0.85, marginBottom: 22 * u, transform: `scaleX(${lin(frame, 4, 14)})`, transformOrigin: 'left'}} />
          <div style={{fontFamily: brand.display, fontWeight: 800, fontSize: headSize, lineHeight: 1.08, color: headline ? brand.ink : brand.muted, letterSpacing: -1 * u, opacity: fadeIn(frame, lineAt, 10), transform: `translateY(${(1 - ease(frame, lineAt, lineAt + 12)) * 14 * u}px)`}}>
            {headline ?? `headline: ${scene.props.search ?? 'a real one, found at render'}`}
          </div>
          {domain ? <div style={{marginTop: 22 * u, fontFamily: hand(brand), fontSize: 26 * u, color: brand.muted, opacity: fadeIn(frame, lineAt + 10, 10)}}>{domain}</div> : null}
        </div>
        {brand.board ? (
          <div style={{position: 'absolute', left: '50%', top: -22 * u, width: 56 * u, height: 56 * u, borderRadius: '50%', background: `radial-gradient(circle at 35% 30%, #9db4ff, ${brand.blue ?? '#3b5bdb'} 70%)`, boxShadow: `0 ${4 * u}px ${8 * u}px rgba(0,0,0,0.3)`, transform: 'translateX(-50%)'}} />
        ) : null}
        {caption ? (
          <div style={{position: 'absolute', left: 30 * u, bottom: -74 * u, fontFamily: hand(brand), fontSize: 48 * u, color: noteColor(brand), transform: 'rotate(1deg)'}}>
            <Write text={caption} frame={frame} fps={fps} start={lineAt + 16} cps={30} color={noteColor(brand)} />
          </div>
        ) : null}
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
    case 'receipt':
      return <PaperReceipt scene={scene} brand={brand} />;
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
    case 'hook':
      return <PaperHook scene={scene} brand={brand} />;
    case 'takeaway':
      return <PaperTakeaway scene={scene} brand={brand} />;
    case 'recap':
      return <PaperRecap scene={scene} brand={brand} />;
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
    case 'broll':
      return <PaperBroll scene={scene} brand={brand} />;
    case 'news':
      return <PaperNews scene={scene} brand={brand} />;
    default:
      return null;
  }
};
void roughGen;
void Soft;
