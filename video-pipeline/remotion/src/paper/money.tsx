import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene} from '../types';
import {formatNum, parseValue, useLayout} from '../components/layout';
import {Arrow, SketchEllipse, SketchPath, SketchRect, Underline} from './sketch';
import {Write, writeFrames} from './write';
import {Erase} from './erase';

/**
 * The pictures money ideas are always drawn with, as scenes of their own, with the numbers in them. Each one is
 * drawn on by the hand in the order a person at a board would draw it, and the figure is written where it belongs
 * on the picture, not beside it.
 *
 *   [bite value="£10,000" lose="£2,800" label="A 1% fee over 30 years" sub="that is the fee" source="illustrative"]
 *   [grow from="£100" years=30 rate=7% label="£100 a month at 7%" source="illustrative"]
 *   [pie value="33%" label="of your return goes to fees" sub="over 40 years"]
 *   [shrink value="£100" to="£74" years=10 label="inflation at 3% a year"]
 */
type P = {scene: Scene; brand: Brand};
const hand = (b: Brand) => b.hand ?? 'cursive';
const pct = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const money = (prefix: string, n: number, suffix: string) => `${prefix}${formatNum(n, n < 100 && !Number.isInteger(n) ? 1 : 0, true)}${suffix}`;

/** the handwritten line at the top of each picture */
const Label: React.FC<{brand: Brand; text?: string; frame: number; fps: number}> = ({brand, text, frame, fps}) => {
  const {u} = useLayout();
  if (!text) return null;
  return (
    <div style={{fontFamily: hand(brand), fontSize: 62 * u, color: brand.accent2, transform: 'rotate(-1.5deg)', transformOrigin: 'left', marginBottom: 18 * u}}>
      <Write text={text} frame={frame} fps={fps} start={2} cps={34} color={brand.accent2} />
    </div>
  );
};
const SourceLine: React.FC<{brand: Brand; source?: string; frame: number; fps: number; start: number}> = ({brand, source, frame, fps, start}) => {
  const {u} = useLayout();
  if (!source) return null;
  return (
    <div style={{fontFamily: hand(brand), fontSize: 38 * u, color: brand.muted, marginTop: 24 * u}}>
      <Write text={`source: ${source}`} frame={frame} fps={fps} start={start} cps={40} color={brand.muted} />
    </div>
  );
};
const labelDone = (text: string | undefined, fps: number) => (text ? 2 + writeFrames(text, fps, 34) + 4 : 2);

// ------------------------------------------------------------------ bite: a bar with a chunk taken out of it
export const PaperBite: React.FC<P> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, isVertical, width} = useLayout();
  const label: string | undefined = scene.props.label;
  const value = parseValue(String(scene.props.value ?? ''));
  const lose = scene.props.lose !== undefined ? parseValue(String(scene.props.lose)) : null;
  const share = Math.max(2, Math.min(95, pct(scene.props.pct) ?? (lose && value && value.num ? (lose.num / value.num) * 100 : 25)));
  const loseText = scene.props.lose !== undefined ? String(scene.props.lose) : value ? money(value.prefix, (value.num * share) / 100, value.suffix) : `${Math.round(share)}%`;
  const barW = Math.min(width - pad * 2.4, (isVertical ? 0.86 : 0.72) * width);
  const barH = (isVertical ? 170 : 190) * u;
  const t0 = labelDone(label, fps);
  const barWin: [number, number] = [t0, t0 + Math.round(fps * 0.9)];
  const valueAt = barWin[1] + 2;
  const sliceAt = valueAt + writeFrames(String(scene.props.value ?? ''), fps, 12) + Math.round(fps * 0.4);
  const sliceWin: [number, number] = [sliceAt, sliceAt + Math.round(fps * 0.8)];
  const loseAt = sliceWin[1] + 4;
  const subAt = loseAt + writeFrames(loseText, fps, 12) + Math.round(fps * 0.3);
  const sub: string | undefined = scene.props.sub;
  const sliceW = (barW * share) / 100;
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad, paddingLeft: pad * 1.2}}>
      <Label brand={brand} text={label} frame={frame} fps={fps} />
      <div style={{fontFamily: brand.display, fontSize: (isVertical ? 72 : 84) * u, color: brand.ink, marginBottom: 10 * u, visibility: frame >= valueAt ? undefined : 'hidden'}}>
        <Write text={String(scene.props.value ?? '')} frame={frame} fps={fps} start={valueAt} cps={12} wordGap="0.2em" />
      </div>
      <div style={{position: 'relative', width: barW, height: barH}}>
        <svg width={barW} height={barH} viewBox={`0 0 ${barW} ${barH}`} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
          <SketchRect x={4} y={4} w={barW - 8} h={barH - 8} win={barWin} options={{stroke: brand.ink, strokeWidth: 5 * u, seed: 11 + scene.id, roughness: 1.3}} />
          <SketchRect x={barW - sliceW} y={8} w={sliceW - 8} h={barH - 16} win={sliceWin} options={{stroke: brand.accent2, strokeWidth: 4 * u, seed: 31 + scene.id, fill: brand.accent2, fillStyle: 'hachure', hachureGap: 16 * u, fillWeight: 3 * u, hachureAngle: -45, roughness: 1.2}} />
        </svg>
      </div>
      <div style={{display: 'flex', alignItems: 'center', gap: 18 * u, marginTop: 18 * u, marginLeft: Math.max(0, barW - sliceW - 60 * u), visibility: frame >= loseAt ? undefined : 'hidden'}}>
        <Arrow length={100 * u} stroke={brand.accent2} win={[loseAt, loseAt + 8]} angle={-60} seed={9} thickness={4 * u} />
        <div style={{fontFamily: brand.display, fontSize: (isVertical ? 64 : 76) * u, color: brand.accent2}}>
          <Write text={loseText} frame={frame} fps={fps} start={loseAt + 6} cps={12} wordGap="0.2em" />
        </div>
      </div>
      {sub ? (
        <div style={{fontFamily: hand(brand), fontSize: 54 * u, color: brand.accent2, marginTop: 20 * u, transform: 'rotate(-1deg)', transformOrigin: 'left'}}>
          <Write text={sub} frame={frame} fps={fps} start={subAt} cps={30} color={brand.accent2} />
        </div>
      ) : null}
      <SourceLine brand={brand} source={scene.props.source} frame={frame} fps={fps} start={subAt + (sub ? writeFrames(sub, fps, 30) + 6 : 0)} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ grow: bars rising year by year
export const PaperGrow: React.FC<P> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, isVertical, width, height} = useLayout();
  const label: string | undefined = scene.props.label;
  const from = parseValue(String(scene.props.from ?? '£100')) ?? {prefix: '£', num: 100, suffix: '', decimals: 0, grouped: true};
  const years = Math.max(1, Math.round(pct(scene.props.years) ?? 30));
  const to = scene.props.to !== undefined ? parseValue(String(scene.props.to)) : null;
  const rateGiven = pct(scene.props.rate);
  const rate = rateGiven !== null ? rateGiven / 100 : to && to.num > 0 && from.num > 0 ? Math.pow(to.num / from.num, 1 / years) - 1 : 0.07;
  const monthly = String(scene.props.per ?? '').toLowerCase().startsWith('month');
  // monthly: paid in and compounded each month at a twelfth of the yearly rate, the way UK savings calculators work it out (£200 a month, 7%, 30 years: £243,994)
  const valueAt = (y: number) => (monthly ? (rate > 0 ? from.num * (Math.pow(1 + rate / 12, y * 12) - 1) / (rate / 12) : from.num * 12 * y) : from.num * Math.pow(1 + rate, y));
  const nBars = Math.min(years + 1, isVertical ? 6 : 8);
  const yrs = Array.from({length: nBars}, (_, i) => Math.round((i * years) / Math.max(1, nBars - 1)));
  const vals = yrs.map(valueAt);
  const top = Math.max(...vals, 1);
  const t0 = labelDone(label, fps);
  const step = Math.round(fps * 0.55);
  const areaW = Math.min(width - pad * 2.4, (isVertical ? 0.9 : 0.78) * width);
  const areaH = (isVertical ? 0.36 : 0.46) * height;
  const gap = areaW / nBars;
  const bw = gap * 0.62;
  const lastAt = t0 + (nBars - 1) * step + Math.round(step * 0.8);
  const finalText = money(from.prefix, vals[vals.length - 1], from.suffix);
  const finalDone = lastAt + 6 + writeFrames(finalText, fps, 12);
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad, paddingLeft: pad * 1.2}}>
      <Label brand={brand} text={label} frame={frame} fps={fps} />
      <div style={{position: 'relative', width: areaW, height: areaH + 70 * u}}>
        <svg width={areaW} height={areaH} viewBox={`0 0 ${areaW} ${areaH}`} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}>
          {yrs.map((y, i) => {
            const h = Math.max(6 * u, (vals[i] / top) * (areaH - 10 * u));
            const at = t0 + i * step;
            return <SketchRect key={i} x={i * gap + (gap - bw) / 2} y={areaH - h} w={bw} h={h} win={[at, at + Math.round(step * 0.8)]} options={{stroke: brand.ink, strokeWidth: 4 * u, seed: 50 + i + scene.id, fill: i === nBars - 1 ? brand.accent2 : undefined, fillStyle: 'hachure', hachureGap: 14 * u, fillWeight: 2.5 * u, hachureAngle: -41, roughness: 1.1}} />;
          })}
          <SketchPath d={`M0,${areaH} L${areaW},${areaH}`} win={[t0 - 6, t0]} options={{stroke: brand.ink, strokeWidth: 3 * u, seed: 3, roughness: 1}} />
        </svg>
        {yrs.map((y, i) => (
          <div key={i} style={{position: 'absolute', left: i * gap, top: areaH + 8 * u, width: gap, textAlign: 'center', fontFamily: hand(brand), fontSize: 36 * u, color: brand.muted}}>
            <Write text={i === 0 ? 'now' : `yr ${y}`} frame={frame} fps={fps} start={t0 + i * step + Math.round(step * 0.5)} cps={30} color={brand.muted} />
          </div>
        ))}
        <div style={{position: 'absolute', right: 0, top: -(isVertical ? 90 : 110) * u, fontFamily: brand.display, fontSize: (isVertical ? 72 : 92) * u, color: brand.ink, whiteSpace: 'nowrap', visibility: frame >= lastAt ? undefined : 'hidden'}}>
          <Write text={finalText} frame={frame} fps={fps} start={lastAt + 4} cps={12} wordGap="0.2em" />
          <Underline width={Math.min(areaW * 0.5, 520 * u)} stroke={brand.accent} thickness={7 * u} win={[finalDone, finalDone + Math.round(fps * 0.5)]} easeOut seed={13} style={{marginLeft: 'auto'}} />
        </div>
      </div>
      <div style={{fontFamily: hand(brand), fontSize: 50 * u, color: brand.accent2, marginTop: 36 * u, transform: 'rotate(-1deg)', transformOrigin: 'left'}}>
        <Write text={`${money(from.prefix, from.num, from.suffix)}${monthly ? ' a month' : ' once'} · ${(rate * 100).toFixed(rate * 100 >= 10 ? 0 : 1)}% a year · ${years} years`} frame={frame} fps={fps} start={finalDone + Math.round(fps * 0.5)} cps={34} color={brand.accent2} />
      </div>
      <SourceLine brand={brand} source={scene.props.source} frame={frame} fps={fps} start={finalDone + fps} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ pie: a circle with a slice shaded
export const PaperPie: React.FC<P> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, isVertical, width, height} = useLayout();
  const label: string | undefined = scene.props.label;
  const share = Math.max(1, Math.min(99, pct(scene.props.value) ?? 25));
  const sub: string | undefined = scene.props.sub;
  const r = (isVertical ? 0.22 : 0.3) * height;
  const cx = r + 20 * u;
  const cy = r + 20 * u;
  const t0 = labelDone(label, fps);
  const circleWin: [number, number] = [t0, t0 + Math.round(fps * 0.9)];
  const sliceWin: [number, number] = [circleWin[1] + 4, circleWin[1] + 4 + Math.round(fps * 0.8)];
  const numAt = sliceWin[1] + 4;
  const a0 = -Math.PI / 2;
  const a1 = a0 + (share / 100) * Math.PI * 2;
  const large = share > 50 ? 1 : 0;
  const wedge = `M${cx},${cy} L${cx + r * Math.cos(a0)},${cy + r * Math.sin(a0)} A${r},${r} 0 ${large} 1 ${cx + r * Math.cos(a1)},${cy + r * Math.sin(a1)} Z`;
  const mid = (a0 + a1) / 2;
  const numText = `${Math.round(share)}%`;
  const numDone = numAt + writeFrames(numText, fps, 12);
  const box = r * 2 + 40 * u;
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad, paddingLeft: pad * 1.2}}>
      <Label brand={brand} text={label} frame={frame} fps={fps} />
      <div style={{display: 'flex', alignItems: 'center', gap: 60 * u, flexWrap: isVertical ? 'wrap' : 'nowrap'}}>
        <div style={{position: 'relative', width: box, height: box}}>
          <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
            <SketchEllipse cx={cx} cy={cy} w={r * 2} h={r * 2} win={circleWin} options={{stroke: brand.ink, strokeWidth: 5 * u, seed: 21 + scene.id, roughness: 0.7, curveStepCount: 24}} />
            {/* the wedge keeps the circle's centre and radius: barely rough, no bowing, so it sits inside the outline */}
            <SketchPath d={wedge} win={sliceWin} options={{stroke: brand.accent2, strokeWidth: 4 * u, seed: 41 + scene.id, fill: brand.accent2, fillStyle: 'hachure', hachureGap: 16 * u, fillWeight: 3 * u, hachureAngle: -45, roughness: 0.4, bowing: 0, preserveVertices: true, disableMultiStroke: true}} />
          </svg>
          <div style={{position: 'absolute', left: cx + Math.cos(mid) * r * (share > 18 ? 0.55 : 1.25) - 70 * u, top: cy + Math.sin(mid) * r * (share > 18 ? 0.55 : 1.25) - 50 * u, fontFamily: brand.display, fontSize: (isVertical ? 64 : 84) * u, color: share > 18 ? brand.ink : brand.accent2, visibility: frame >= numAt ? undefined : 'hidden'}}>
            <Write text={numText} frame={frame} fps={fps} start={numAt} cps={12} />
          </div>
        </div>
        {sub ? (
          <div style={{fontFamily: hand(brand), fontSize: 56 * u, lineHeight: 1.15, color: brand.accent2, transform: 'rotate(-2deg)', maxWidth: isVertical ? '100%' : width * 0.34}}>
            <Write text={sub} frame={frame} fps={fps} start={numDone + 6} cps={30} color={brand.accent2} />
          </div>
        ) : null}
      </div>
      <SourceLine brand={brand} source={scene.props.source} frame={frame} fps={fps} start={numDone + (sub ? writeFrames(sub, fps, 30) + 12 : 8)} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ shrink: the same note, with part of it rubbed out
export const PaperShrink: React.FC<P> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, isVertical, width, height} = useLayout();
  const label: string | undefined = scene.props.label;
  const value = parseValue(String(scene.props.value ?? '£100')) ?? {prefix: '£', num: 100, suffix: '', decimals: 0, grouped: true};
  const toGiven = scene.props.to !== undefined ? parseValue(String(scene.props.to)) : null;
  const years = Math.max(1, Math.round(pct(scene.props.years) ?? 10));
  const rate = pct(scene.props.rate);
  const toNum = toGiven ? toGiven.num : rate !== null ? value.num / Math.pow(1 + rate / 100, years) : value.num * 0.74;
  const keep = Math.max(0.05, Math.min(0.98, toNum / Math.max(1e-6, value.num)));
  const noteW = Math.min(width - pad * 2.4, (isVertical ? 0.86 : 0.6) * width);
  const noteH = (isVertical ? 0.2 : 0.28) * height;
  const t0 = labelDone(label, fps);
  const noteWin: [number, number] = [t0, t0 + Math.round(fps * 1.0)];
  const valueAt = noteWin[1] + 2;
  const eraseAt = valueAt + writeFrames(String(scene.props.value ?? ''), fps, 12) + Math.round(fps * 1.0);
  const eraseWin: [number, number] = [eraseAt, eraseAt + Math.round(fps * 0.9)];
  const toAt = eraseWin[1] + 4;
  const toText = toGiven ? String(scene.props.to) : money(value.prefix, toNum, value.suffix);
  const toDone = toAt + writeFrames(toText, fps, 12);
  const x0 = noteW * keep;
  const sq = Math.max(0, Math.min(1, (frame - eraseWin[0]) / Math.max(1, eraseWin[1] - eraseWin[0])));
  const shrinkQ = sq * sq * (3 - 2 * sq);
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad, paddingLeft: pad * 1.2}}>
      <Label brand={brand} text={label} frame={frame} fps={fps} />
      <div style={{position: 'relative', width: noteW, height: noteH}}>
        <Erase win={eraseWin} brand={brand} width={noteW} height={noteH} x0={x0}>
          <svg width={noteW} height={noteH} viewBox={`0 0 ${noteW} ${noteH}`} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
            <SketchRect x={4} y={4} w={noteW - 8} h={noteH - 8} win={noteWin} options={{stroke: brand.ink, strokeWidth: 5 * u, seed: 61 + scene.id, roughness: 1.2}} />
          </svg>
        </Erase>
        {/* the new right-hand edge, drawn as the old end clears, so the smaller note is a closed box */}
        <svg width={noteW} height={noteH} viewBox={`0 0 ${noteW} ${noteH}`} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
          <SketchPath d={`M${x0},6 L${x0},${noteH - 6}`} win={[eraseWin[0] + Math.round(fps * 0.3), eraseWin[1]]} options={{stroke: brand.ink, strokeWidth: 5 * u, seed: 63 + scene.id, roughness: 1}} />
        </svg>
        {/* the coin and its value slide into the middle of what is left and shrink with it */}
        <div style={{position: 'absolute', left: 0, top: 0, width: noteW, height: noteH, transform: `translateX(${-(noteW - x0) / 2 * shrinkQ}px) scale(${1 - (1 - keep) * shrinkQ})`, transformOrigin: 'center'}}>
          <svg width={noteW} height={noteH} viewBox={`0 0 ${noteW} ${noteH}`} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
            <SketchEllipse cx={noteW / 2} cy={noteH / 2} w={noteH * 0.9} h={noteH * 0.9} win={[noteWin[0] + Math.round(fps * 0.5), noteWin[1]]} options={{stroke: brand.muted, strokeWidth: 3 * u, seed: 62 + scene.id, roughness: 1.4}} />
          </svg>
          <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: brand.display, fontSize: (isVertical ? 80 : 110) * u, color: brand.ink, visibility: frame >= valueAt ? undefined : 'hidden'}}>
            <Write text={String(scene.props.value ?? '')} frame={frame} fps={fps} start={valueAt} cps={12} wordGap="0.2em" />
          </div>
        </div>
        <div style={{position: 'absolute', left: x0 + 30 * u, top: noteH * 0.5 - 60 * u, fontFamily: brand.display, fontSize: (isVertical ? 72 : 100) * u, color: brand.accent2, whiteSpace: 'nowrap', visibility: frame >= toAt ? undefined : 'hidden'}}>
          <Write text={toText} frame={frame} fps={fps} start={toAt} cps={12} wordGap="0.2em" />
        </div>
      </div>
      <div style={{fontFamily: hand(brand), fontSize: 54 * u, color: brand.accent2, marginTop: 30 * u, transform: 'rotate(-1deg)', transformOrigin: 'left'}}>
        <Write text={scene.props.note ? String(scene.props.note) : `what ${String(scene.props.value ?? '')} buys after ${years} years`} frame={frame} fps={fps} start={toDone + 6} cps={30} color={brand.accent2} />
      </div>
      <SourceLine brand={brand} source={scene.props.source} frame={frame} fps={fps} start={toDone + fps} />
    </AbsoluteFill>
  );
};
