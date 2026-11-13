import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene} from '../types';
import {displayLines, useLayout, useUpright} from '../components/layout';
import {Marker} from './sketch';
import {Write, writeFrames} from './write';
import {Art, isTraced, pickArt} from './art';
import {figureTime} from './lineMatch';

/**
 * One month's money as a till receipt that keeps printing through the video. Every receipt scene carries the whole
 * strip (pipeline/script_parser.py fill_receipts): the rows printed by earlier scenes are there on the first frame,
 * this scene's rows print as their figures are said, the paper feeding out a row at a time, and the total at the
 * foot ("Left") rolls down to its new value. Beside it, big, the same total: the one number a muted viewer follows.
 * A cost is red (money going); money in and the total are ink and green.
 */
type Row = {label: string; amount: string; value: number; kept: boolean};

const ease = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
const pounds = (v: number) => (v < 0 ? '−' : '') + '£' + Math.abs(Math.round(v)).toLocaleString('en-GB');
const PAPER = '#FFFDF6';

/** frame at which each new row starts printing: on its figure, never before the row above has finished */
export const receiptDelays = (rows: Row[], words: Scene['words'], start: number, fps: number, total: number): number[] => {
  const fresh = rows.filter((r) => !r.kept);
  const out: number[] = [];
  fresh.forEach((r, k) => {
    const said = figureTime(words, r.amount);
    const even = Math.round(((k + 1) / (fresh.length + 1)) * total * 0.7);
    let at = said !== null ? Math.max(0, Math.round((said - start) * fps) - 3) : even;
    if (k > 0) at = Math.max(at, out[k - 1] + writeFrames(fresh[k - 1].label + fresh[k - 1].amount, fps, 34) + 6);
    out.push(Math.max(4, at));
  });
  return out;
};

export const PaperReceipt: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, isVertical, width, height} = useLayout();
  const up = useUpright();
  const rows: Row[] = scene.props.rows ?? [];
  const title = String(scene.props.title ?? '');
  const leftLabel = String(scene.props.left ?? 'Left');
  const before = Number(scene.props.before ?? 0);
  const headline: string | undefined = scene.props.board ?? scene.props.headline;
  const total = Math.max(1, Math.round((scene.end - scene.start) * fps));
  const hand = brand.hand ?? 'cursive';
  const kept = rows.filter((r) => r.kept);
  const fresh = rows.filter((r) => !r.kept);
  const delays = receiptDelays(rows, scene.words, scene.start, fps, total);
  const wrote = fresh.map((r, k) => delays[k] + writeFrames(r.label + r.amount, fps, 34));

  // the strip: on the right of a landscape page. On a Short it is laid in the stage (components/upright.json): from
  // the stage's top, under the caption's band (at 20% of the height the caption sat on it), down to the stage's foot,
  // and no wider than the stage is beside YouTube's buttons, a little less so its turned lower corner stays inside.
  // The scene's headline is written across the top of the stage, over the strip (higher up is the hook sticker's
  // band), and the source line along the stage's foot (at the foot of the frame it was under the Shorts title).
  // With cards, or a drawing or loop placed bottom left (ArtLayer, LoopLayer), the stage ends above them and the rows
  // are set closer to fit; beside a drawing the source line goes to its right, where the page is free, and the rows
  // keep that room. The character is not allowed for: a strip of rows cannot end above his head.
  const source: string | undefined = scene.props.source;
  const under = {cards: ((scene.cues ?? []) as unknown as {do?: string}[]).some((c) => c.do === 'card'), drawing: !!brand.board && (!!pickArt(scene.props.art, undefined) || !!scene.props.anim)};
  const stage = up ? up.stage(under) : null;
  const beside = up && under.drawing ? up.drawing.x + up.drawing.w + width * 0.02 : null; // where the source line starts, right of the drawing
  const headSize = 72 * u;
  const headBlock = stage && headline ? displayLines(String(headline), headSize, stage.w, brand.display) * headSize * 1.1 + 24 * u : 0;
  const sourceBlock = stage && source && beside === null ? displayLines(`source: ${source}`, 34 * u, stage.w) * 34 * u * 1.15 + 30 * u : 0;
  const W = stage ? stage.w - 20 * u : Math.min(720 * u, width * 0.38);
  const x0 = stage ? stage.x : width - pad * 0.85 - W;
  const y0 = stage ? stage.y + headBlock : pad * 0.5;
  const room = stage ? stage.h - headBlock - sourceBlock - 16 * u : height - pad * 1.25 - y0 * 0.2;
  const headH = (title ? 104 : 34) * u;
  const footH = 132 * u;
  const rowH = Math.min((isVertical ? 76 : 66) * u, (room - headH - footH) / Math.max(1, rows.length));
  const font = Math.min((isVertical ? 50 : 44) * u, rowH * 0.72);
  const shown = kept.length + fresh.reduce((n, _, k) => n + ease(frame, delays[k] - 7, delays[k] + 1), 0);
  const paperH = headH + rowH * shown + footH;
  const left = before + fresh.reduce((n, r, k) => n + r.value * ease(frame, wrote[k], wrote[k] + Math.round(fps * 0.45)), 0);
  const teeth = Math.max(8, Math.round(W / (26 * u)));
  const zig = Array.from({length: teeth * 2 + 1}, (_, i) => `${(i / (teeth * 2)) * W},${i % 2 ? 14 * u : 0}`).join(' ');
  const art = !isVertical && scene.props.art && isTraced(String(scene.props.art)) ? String(scene.props.art) : undefined;
  const colW = x0 - pad * 1.5;
  const bigSize = Math.min(210 * u, (colW / Math.max(4, pounds(left).length)) * 1.75);
  const note: string | undefined = scene.props.note;

  return (
    <AbsoluteFill>
      {isVertical ? null : (
        <div style={{position: 'absolute', left: pad, top: pad * 0.75, width: colW}}>
          {headline ? (
            <div style={{fontFamily: brand.display, fontSize: 78 * u, lineHeight: 1.12, color: brand.ink}}>
              <Write text={String(headline)} frame={frame} fps={fps} start={scene.start <= 0.01 ? -fps : 2} cps={26} />
            </div>
          ) : null}
          <div style={{marginTop: (headline ? 46 : 150) * u, fontFamily: hand, fontSize: 56 * u, color: brand.muted}}>{leftLabel}</div>
          <div style={{fontFamily: brand.display, fontSize: bigSize, lineHeight: 1.05, color: left < 0 ? brand.accent2 : brand.accent, fontVariantNumeric: 'tabular-nums'}}>
            <Marker progress={1} color={brand.marker ?? '#FFE86B'} pad={10 * u}>
              {pounds(left)}
            </Marker>
          </div>
          {note ? (
            <div style={{marginTop: 22 * u, fontFamily: hand, fontSize: 48 * u, lineHeight: 1.15, color: brand.ink}}>
              <Write text={note} frame={frame} fps={fps} start={(wrote[wrote.length - 1] ?? 6) + Math.round(fps * 0.5)} cps={30} />
            </div>
          ) : null}
        </div>
      )}
      {stage && headline ? (
        <div style={{position: 'absolute', left: stage.x, width: stage.w, top: stage.y, textAlign: 'center', fontFamily: brand.display, fontSize: headSize, lineHeight: 1.1, color: brand.ink}}>
          <Write text={String(headline)} frame={frame} fps={fps} start={scene.start <= 0.01 ? -fps : 2} cps={26} />
        </div>
      ) : null}
      {art ? (
        <div style={{position: 'absolute', left: pad * 0.8, bottom: pad * 0.75, width: height * 0.3, height: height * 0.3}}>
          <Art name={art} size={height * 0.3} brand={brand} start={2} seed={scene.id} by={Math.round(total * 0.6)} />
        </div>
      ) : null}
      {source ? (
        <div style={{position: 'absolute', ...(stage && beside !== null ? {left: beside, top: stage.foot + 14 * u, width: stage.x + stage.w - beside} : stage ? {left: stage.x, bottom: height - stage.foot, width: stage.w} : {left: art ? pad * 0.8 + height * 0.32 : pad, bottom: pad * 0.55, width: colW - (art ? height * 0.32 : 0)}), fontFamily: hand, fontSize: 34 * u, lineHeight: 1.15, color: brand.muted}}>
          <Write text={`source: ${source}`} frame={frame} fps={fps} start={(wrote[wrote.length - 1] ?? 6) + Math.round(fps * 0.3)} cps={46} color={brand.muted} />
        </div>
      ) : null}
      <div style={{position: 'absolute', left: x0, top: y0, width: W, height: paperH, transform: 'rotate(-1.1deg)', transformOrigin: '50% 0'}}>
        <div style={{position: 'absolute', inset: 0, background: PAPER, borderLeft: `${3 * u}px solid ${brand.ink}`, borderRight: `${3 * u}px solid ${brand.ink}`, borderTop: `${3 * u}px solid ${brand.ink}`, boxShadow: `${9 * u}px ${11 * u}px 0 rgba(4,27,60,0.10)`}} />
        <svg width={W} height={16 * u} viewBox={`0 0 ${W} ${16 * u}`} style={{position: 'absolute', left: 0, top: paperH - 1, overflow: 'visible'}}>
          <polygon points={`0,0 ${zig} ${W},0`} fill={PAPER} />
          <polyline points={zig} fill="none" stroke={brand.ink} strokeWidth={3 * u} strokeLinejoin="round" />
        </svg>
        {title ? (
          <div style={{position: 'absolute', left: 0, right: 0, top: 22 * u, textAlign: 'center', fontFamily: hand, fontSize: 46 * u, color: brand.ink, letterSpacing: 0.5 * u}}>
            {title}
            <div style={{margin: `${8 * u}px ${34 * u}px 0`, borderBottom: `${3 * u}px dashed ${brand.muted}`}} />
          </div>
        ) : null}
        {kept.map((r, i) => (
          <RowLine key={`k${i}`} top={headH + i * rowH} h={rowH} font={font} u={u} hand={hand} brand={brand}>
            <span>{r.label}</span>
            <span style={{color: r.value < 0 ? brand.accent2 : brand.ink}}>{r.amount}</span>
          </RowLine>
        ))}
        {fresh.map((r, k) =>
          frame < delays[k] ? null : (
            <RowLine key={`n${k}`} top={headH + (kept.length + k) * rowH} h={rowH} font={font} u={u} hand={hand} brand={brand}>
              <Write text={r.label} frame={frame} fps={fps} start={delays[k]} cps={34} />
              <Write text={r.amount} frame={frame} fps={fps} start={delays[k] + writeFrames(r.label, fps, 34)} cps={34} color={r.value < 0 ? brand.accent2 : brand.ink} />
            </RowLine>
          ),
        )}
        <div style={{position: 'absolute', left: 34 * u, right: 34 * u, top: headH + rowH * shown + 10 * u, borderTop: `${3 * u}px dashed ${brand.muted}`, paddingTop: 12 * u, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline'}}>
          <span style={{fontFamily: hand, fontSize: 52 * u, color: brand.ink}}>{leftLabel}</span>
          <span style={{fontFamily: brand.display, fontSize: 66 * u, color: left < 0 ? brand.accent2 : brand.accent, fontVariantNumeric: 'tabular-nums'}}>{pounds(left)}</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const RowLine: React.FC<{top: number; h: number; font: number; u: number; hand: string; brand: Brand; children: React.ReactNode}> = ({top, h, font, u, hand, brand, children}) => (
  <div style={{position: 'absolute', left: 34 * u, right: 34 * u, top, height: h, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: hand, fontSize: font, color: brand.ink, whiteSpace: 'nowrap'}}>{children}</div>
);
