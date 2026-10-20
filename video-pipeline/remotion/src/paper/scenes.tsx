import React, {useMemo} from 'react';
import {AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Check, X} from 'lucide-react';
import type {Brand, Scene, Word} from '../types';
import {compactNum, findPhraseTime, formatNum, parseValue, useLayout} from '../components/layout';
import {fadeIn, pop, rnd} from '../components/motion';
import {Arrow, Marker, SketchEllipse, SketchLine, SketchPath, SketchRect, Underline, roughGen} from './sketch';

/**
 * The paper look: every scene is laid out like a page someone wrote on. Big words in a serif, notes in
 * handwriting, charts sketched with a pen, the word being said swiped with a highlighter. Layouts sit
 * left with room on the right for a margin note, not centred like a slide.
 */

type P = {scene: Scene; brand: Brand};
const hand = (b: Brand) => b.hand ?? 'cursive';
const marker = (b: Brand) => b.marker ?? '#ffe66d';
const ease = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});

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

const Source: React.FC<{brand: Brand; source?: string; delay?: number}> = ({brand, source, delay = 24}) => {
  const frame = useCurrentFrame();
  const {u} = useLayout();
  if (!source) return null;
  return <div style={{fontFamily: hand(brand), fontSize: 30 * u, color: brand.muted, opacity: fadeIn(frame, delay, 8)}}>source: {source}</div>;
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
  const ul = ease(frame, 10 + words.length * 3, 10 + words.length * 3 + fps * 0.6);
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad, paddingLeft: pad * 1.2}}>
      {kicker ? (
        <div style={{fontFamily: hand(brand), fontSize: 46 * u, color: brand.accent2, marginBottom: 10 * u, transform: 'rotate(-2deg)', transformOrigin: 'left', opacity: fadeIn(frame, 0, 8)}}>{kicker}</div>
      ) : null}
      <div style={{fontFamily: brand.display, fontWeight: 900, fontSize: (isVertical ? 96 : 124) * u, lineHeight: 1.02, letterSpacing: -2 * u, color: brand.ink, maxWidth: isVertical ? '100%' : '82%'}}>
        <Words text={title} frame={frame} fps={fps} seed={3} />
      </div>
      <Underline width={Math.min(width * 0.42, 640 * u)} stroke={brand.accent2} thickness={7 * u} draw={ul} seed={5} style={{marginTop: 18 * u}} />
      {subtitle ? (
        <div style={{fontSize: (isVertical ? 40 : 44) * u, color: brand.muted, marginTop: 26 * u, maxWidth: isVertical ? '100%' : '62%', lineHeight: 1.35, opacity: fadeIn(frame, 18, 10)}}>{subtitle}</div>
      ) : null}
      <div style={{fontFamily: hand(brand), fontSize: 28 * u, color: brand.muted, marginTop: 60 * u, opacity: fadeIn(frame, 30, 10)}}>for education, not advice</div>
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
  const p = ease(frame, 6, 6 + fps * countSec);
  const display = parsed ? `${parsed.prefix}${formatNum(from + (parsed.num - from) * p, parsed.decimals, parsed.grouped || parsed.num >= 1000)}${parsed.suffix}` : raw;
  const label: string | undefined = scene.props.label;
  const sub: string | undefined = scene.props.sub;
  const s = pop(frame, fps, 3, 13);
  const digits = display.length;
  const size = (isVertical ? 190 : 300) * u * (digits > 9 ? 0.7 : digits > 7 ? 0.85 : 1);
  const ul = ease(frame, 8 + fps * countSec * 0.6, 8 + fps * countSec * 0.6 + fps * 0.5);
  const note = fadeIn(frame, 20, 10);
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad, paddingLeft: pad * 1.2}}>
      {label ? <div style={{fontFamily: hand(brand), fontSize: 50 * u, color: brand.accent2, transform: 'rotate(-1.5deg)', transformOrigin: 'left', opacity: fadeIn(frame, 0, 8), marginBottom: 4 * u}}>{label}</div> : null}
      <div style={{display: 'flex', alignItems: 'flex-end', gap: 50 * u, flexWrap: isVertical ? 'wrap' : 'nowrap'}}>
        <div>
          <div style={{fontFamily: brand.display, fontWeight: 900, fontSize: size, lineHeight: 1, letterSpacing: -5 * u, color: brand.ink, fontVariantNumeric: 'tabular-nums', transform: `scale(${0.85 + 0.15 * s})`, transformOrigin: 'left bottom', opacity: Math.min(1, s * 1.5)}}>{display}</div>
          <Underline width={Math.min(size * 2.4, width * 0.5)} stroke={brand.accent} thickness={8 * u} draw={ul} seed={7} style={{marginTop: 8 * u}} />
        </div>
        {sub ? (
          <div style={{display: 'flex', alignItems: 'center', gap: 16 * u, marginBottom: 40 * u, opacity: note, maxWidth: isVertical ? '100%' : width * 0.34}}>
            {!isVertical ? <Arrow length={120 * u} stroke={brand.accent2} draw={note} angle={-8} seed={9} thickness={4 * u} /> : null}
            <div style={{fontFamily: hand(brand), fontSize: 44 * u, lineHeight: 1.15, color: brand.accent2, transform: 'rotate(-2deg)'}}>{sub}</div>
          </div>
        ) : null}
      </div>
      <div style={{marginTop: 30 * u}}>
        <Source brand={brand} source={scene.props.source} />
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ text (kinetic narration)
export const PaperText: React.FC<P> = ({scene, brand}) => {
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
  const idx = Math.max(0, sentences.findIndex((g) => t <= g[g.length - 1].e + 0.3));
  const group = sentences[idx === -1 ? sentences.length - 1 : idx] ?? [];
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad, paddingLeft: pad * 1.2}}>
      {headline ? <div style={{fontFamily: hand(brand), fontSize: 44 * u, color: brand.accent2, marginBottom: 24 * u, transform: 'rotate(-1.5deg)', transformOrigin: 'left', opacity: fadeIn(frame, 0, 8)}}>{headline}</div> : null}
      <div key={idx} style={{fontFamily: brand.display, fontWeight: 700, fontSize: (isVertical ? 64 : 88) * u, lineHeight: 1.2, letterSpacing: -1 * u, color: brand.ink, maxWidth: isVertical ? '100%' : '86%'}}>
        {group.map((w, i) => {
          const since = t - w.s;
          const lit = since >= -0.03;
          const swipe = Math.max(0, Math.min(1, (since + 0.03) / 0.18));
          return (
            <span key={i} style={{display: 'inline-block', marginRight: '0.28em', opacity: lit ? 1 : 0.28}}>
              <Marker progress={swipe} color={marker(brand)}>{w.w}</Marker>
            </span>
          );
        })}
      </div>
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
  const delays = items.map((item, i) => {
    const spoken = findPhraseTime(scene.words, item);
    const delaySec = spoken !== null ? Math.max(0, spoken - scene.start) : Math.min(i * 0.9, sceneLen * 0.6 * (i / Math.max(1, items.length)));
    return Math.round(delaySec * fps) + 6;
  });
  const ul = ease(frame, 6, 6 + fps * 0.5);
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad, paddingLeft: pad * 1.2}}>
      {title ? (
        <div style={{marginBottom: 34 * u, display: 'inline-block'}}>
          <div style={{fontFamily: brand.display, fontWeight: 700, fontSize: (isVertical ? 60 : 70) * u, color: brand.ink, letterSpacing: -1 * u}}>
            <Words text={title} frame={frame} fps={fps} seed={11} per={2} />
          </div>
          <Underline width={Math.min(560 * u, title.length * 28 * u)} stroke={brand.accent2} thickness={6 * u} draw={ul} seed={12} />
        </div>
      ) : null}
      {items.map((item, i) => {
        const s = pop(frame, fps, delays[i], 14);
        const lit = frame >= delays[i];
        const tick = ease(frame, delays[i] + 4, delays[i] + 14);
        return (
          <div key={i} style={{display: 'flex', alignItems: 'center', gap: 30 * u, marginBottom: 26 * u, opacity: 0.3 + 0.7 * Math.min(1, s * 1.5), transform: `translateX(${(1 - s) * -30 * u}px)`}}>
            <svg width={76 * u} height={76 * u} viewBox="0 0 76 76" style={{flexShrink: 0, overflow: 'visible'}}>
              <SketchEllipse cx={38} cy={38} w={64} h={64} draw={Math.min(1, s * 1.2)} options={{stroke: brand.ink, strokeWidth: 3, seed: 20 + i, fill: lit ? marker(brand) : undefined, fillStyle: 'solid'}} />
              {numbered ? (
                <text x={38} y={50} textAnchor="middle" fontFamily={hand(brand)} fontSize={40} fontWeight={700} fill={brand.ink}>{i + 1}</text>
              ) : (
                <SketchPath d="M20,40 L33,53 L58,24" draw={tick} options={{stroke: brand.accent, strokeWidth: 5, seed: 30 + i, roughness: 1}} />
              )}
            </svg>
            <div style={{fontSize: (isVertical ? 42 : 48) * u, lineHeight: 1.25, fontWeight: 600, color: lit ? brand.ink : brand.muted}}>{item}</div>
          </div>
        );
      })}
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
  const Card: React.FC<{side: Side; bad: boolean; delay: number; tilt: number; seed: number}> = ({side, bad, delay, tilt, seed}) => {
    const s = pop(frame, fps, delay, 14);
    const color = bad ? brand.accent2 : brand.accent;
    const Icon = bad ? X : Check;
    return (
      <div style={{position: 'relative', width: cardW, height: cardH, transform: `rotate(${tilt}deg) translateY(${(1 - s) * 30 * u}px)`, opacity: Math.min(1, s * 1.4)}}>
        <svg width={cardW} height={cardH} viewBox={`0 0 ${cardW} ${cardH}`} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
          <SketchRect x={6} y={6} w={cardW - 12} h={cardH - 12} draw={Math.min(1, s * 1.3)} options={{stroke: brand.ink, strokeWidth: 3.5 * u, seed, fill: brand.panel, fillStyle: 'solid', roughness: 1.2}} />
        </svg>
        <div style={{position: 'relative', padding: 40 * u, display: 'flex', flexDirection: 'column', gap: 14 * u, height: '100%'}}>
          <div style={{fontFamily: hand(brand), fontSize: 46 * u, color, lineHeight: 1}}>{side.title}</div>
          {side.value ? <div style={{fontFamily: brand.display, fontWeight: 900, fontSize: 120 * u, lineHeight: 1, letterSpacing: -4 * u, color: brand.ink, fontVariantNumeric: 'tabular-nums'}}>{side.value}</div> : null}
          {(side.items ?? []).map((it, i) => (
            <div key={i} style={{fontSize: 34 * u, color: brand.ink, display: 'flex', gap: 14 * u, alignItems: 'flex-start', opacity: fadeIn(frame, delay + 12 + i * 5, 8)}}>
              <Icon size={34 * u} color={color} strokeWidth={3} style={{flexShrink: 0, marginTop: 4 * u}} />
              <span>{it}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };
  const vs = pop(frame, fps, 14, 10);
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad}}>
      {title ? (
        <div style={{fontFamily: brand.display, fontWeight: 700, fontSize: (isVertical ? 56 : 68) * u, color: brand.ink, marginBottom: 36 * u, letterSpacing: -1 * u}}>
          <Words text={title} frame={frame} fps={fps} seed={21} per={2} />
        </div>
      ) : null}
      <div style={{display: 'flex', flexDirection: isVertical ? 'column' : 'row', gap: 90 * u, alignItems: 'center', position: 'relative'}}>
        <Card side={left} bad delay={4} tilt={-1.2} seed={41} />
        <div style={{position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%,-50%) scale(${vs}) rotate(-6deg)`, fontFamily: hand(brand), fontSize: 64 * u, fontWeight: 700, color: brand.ink, zIndex: 2}}>vs</div>
        <Card side={right} bad={false} delay={9} tilt={1} seed={42} />
      </div>
      <div style={{marginTop: 26 * u}}>
        <Source brand={brand} source={scene.props.source} />
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
  const colors = [brand.accent, brand.accent2, '#3b5bdb', '#b83280'];
  const reveal = ease(frame, 10, 10 + fps * 2.2);
  const axes = ease(frame, 2, 14);
  let yMax = 1;
  let ticks = 4;
  let body: React.ReactNode = null;
  const yLab = (v: number) => compactNum(v, yFormat);
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
            <g key={i}>
              <SketchPath d={d} draw={reveal} options={{stroke: c, strokeWidth: 6 * u, roughness: 1.1, bowing: 0.6, seed: 60 + i}} />
              <circle cx={cx} cy={cy} r={9 * u} fill={c} />
              <text x={cx + 18 * u} y={cy + 12 * u} fontFamily={hand(brand)} fontSize={38 * u} fontWeight={700} fill={c}>{yLab(vNow)}</text>
              {s.name ? <text x={left + 10 * u + i * 300 * u} y={28 * u} fontFamily={hand(brand)} fontSize={34 * u} fill={c}>— {s.name}</text> : null}
            </g>
          );
        })}
        {[xMin, (xMin + xMax) / 2, xMax].map((x, i) => (
          <text key={i} x={sx(x)} y={H - 18 * u} fontFamily={hand(brand)} fontSize={30 * u} fill={brand.muted} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>{xLabel ? `${xLabel} ${Math.round(x)}` : Math.round(x)}</text>
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
          const grow = ease(frame, 8 + i * 8, 8 + i * 8 + fps * 0.9);
          const h = Math.max(0, (b.value / yMax) * plotH * grow);
          const hq = Math.round(h / 3) * 3; // the sketch only redraws when the bar has visibly grown, so it does not boil
          const x = left + gap + i * (bw + gap);
          const y = top + plotH - hq;
          const c = b.color ?? colors[i % colors.length];
          return (
            <g key={i}>
              {hq > 2 ? <SketchRect x={x} y={y} w={bw} h={hq} options={{stroke: c, strokeWidth: 3.5 * u, seed: 70 + i, fill: c, fillStyle: 'hachure', hachureGap: 12 * u, fillWeight: 2.5 * u, hachureAngle: -41, roughness: 1}} /> : null}
              <text x={x + bw / 2} y={y - 16 * u} textAnchor="middle" fontFamily={hand(brand)} fontSize={40 * u} fontWeight={700} fill={brand.ink} opacity={grow}>{yLab(b.value * grow)}</text>
              <text x={x + bw / 2} y={H - 18 * u} textAnchor="middle" fontFamily={hand(brand)} fontSize={30 * u} fill={brand.muted}>{b.label}</text>
            </g>
          );
        })}
      </>
    );
  }
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad}}>
      {title ? (
        <div style={{fontFamily: brand.display, fontWeight: 700, fontSize: (isVertical ? 54 : 64) * u, color: brand.ink, marginBottom: 14 * u, letterSpacing: -1 * u}}>
          <Words text={title} frame={frame} fps={fps} seed={31} per={2} />
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
        <SketchLine x1={left} y1={top + plotH} x2={left + plotW} y2={top + plotH} draw={axes} options={{stroke: brand.ink, strokeWidth: 3.5 * u, seed: 50}} />
        <SketchLine x1={left} y1={top + plotH} x2={left} y2={top} draw={axes} options={{stroke: brand.ink, strokeWidth: 3.5 * u, seed: 51}} />
        {body}
      </svg>
      <div style={{marginTop: 10 * u}}>
        <Source brand={brand} source={scene.props.source} />
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
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad, paddingLeft: pad * 1.4}}>
      <div style={{fontFamily: brand.display, fontSize: 200 * u, lineHeight: 0.5, color: brand.accent2, marginBottom: 20 * u, opacity: fadeIn(frame, 0, 8)}}>“</div>
      <div style={{fontFamily: brand.display, fontStyle: 'italic', fontWeight: 400, fontSize: (isVertical ? 64 : 84) * u, lineHeight: 1.25, color: brand.ink, maxWidth: isVertical ? '100%' : '80%'}}>
        <Words text={quote} frame={frame} fps={fps} start={start} per={per} seed={51} />
      </div>
      {attribution ? <div style={{fontFamily: hand(brand), fontSize: 44 * u, color: brand.muted, marginTop: 40 * u, opacity: fadeIn(frame, start + words.length * per + 6, 10)}}>— {attribution}</div> : null}
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
  const s = pop(frame, fps, 10, 12);
  const btnW = Math.min(1000 * u, cta.length * 26 * u + 120 * u);
  const btnH = 110 * u;
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad, paddingLeft: pad * 1.2}}>
      <div style={{fontFamily: brand.display, fontWeight: 900, fontSize: (isVertical ? 84 : 110) * u, lineHeight: 1.04, letterSpacing: -2 * u, color: brand.ink, maxWidth: isVertical ? '100%' : '70%'}}>
        <Words text={title} frame={frame} fps={fps} seed={61} />
      </div>
      <div style={{position: 'relative', width: btnW, height: btnH, marginTop: 44 * u, transform: `rotate(-1deg) scale(${0.9 + 0.1 * s})`, transformOrigin: 'left center', opacity: Math.min(1, s * 1.5)}}>
        <svg width={btnW} height={btnH} viewBox={`0 0 ${btnW} ${btnH}`} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
          <SketchRect x={4} y={4} w={btnW - 8} h={btnH - 8} draw={Math.min(1, s * 1.2)} options={{stroke: brand.ink, strokeWidth: 4 * u, seed: 71, fill: marker(brand), fillStyle: 'solid', roughness: 1.3}} />
        </svg>
        <div style={{position: 'relative', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: hand(brand), fontWeight: 700, fontSize: 48 * u, color: brand.ink}}>{cta}</div>
      </div>
      {!isVertical ? (
        <div style={{display: 'flex', gap: 40 * u, marginTop: 70 * u}}>
          {['Next video', 'Playlist'].map((label, i) => (
            <div key={label} style={{position: 'relative', width: 480 * u, height: 270 * u, opacity: fadeIn(frame, 20 + i * 6, 10)}}>
              <svg width={480 * u} height={270 * u} viewBox={`0 0 ${480 * u} ${270 * u}`} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
                <SketchRect x={4} y={4} w={472 * u} h={262 * u} options={{stroke: brand.muted, strokeWidth: 2.5 * u, seed: 80 + i, roughness: 1.4}} />
              </svg>
              <div style={{position: 'relative', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: hand(brand), color: brand.muted, fontSize: 34 * u}}>{label} goes here</div>
            </div>
          ))}
        </div>
      ) : null}
      <div style={{fontFamily: hand(brand), fontSize: 28 * u, color: brand.muted, marginTop: 50 * u, maxWidth: '80%', opacity: fadeIn(frame, 30, 10)}}>education and entertainment only, not financial, tax or legal advice. do your own research.</div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ still: a photo taped to the page
export const PaperStill: React.FC<P> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, width, isVertical} = useLayout();
  const total = Math.max(1, (scene.end - scene.start) * fps);
  const zoomOut = scene.props.zoom === 'out';
  const scale = interpolate(frame, [0, total], zoomOut ? [1.1, 1.0] : [1.0, 1.1], {extrapolateRight: 'clamp'});
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
          <div style={{width: '100%', height: '100%', overflow: 'hidden', background: '#e9e2d6'}}>
            {src ? (
              <Img src={staticFile(src)} style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale})`}} />
            ) : (
              <div style={{width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 * u, textAlign: 'center', fontFamily: hand(brand), fontSize: 40 * u, lineHeight: 1.2, color: brand.muted}}>
                {scene.props.want ?? scene.props.prompt ?? 'picture goes here'}
              </div>
            )}
          </div>
        </div>
        {/* a strip of tape over the top edge */}
        <div style={{position: 'absolute', left: '50%', top: -16 * u, width: 180 * u, height: 44 * u, background: marker(brand), opacity: 0.75, transform: 'translateX(-50%) rotate(-3deg)'}} />
        {caption ? <div style={{position: 'absolute', left: 30 * u, bottom: -70 * u, fontFamily: hand(brand), fontSize: 48 * u, color: brand.ink, transform: 'rotate(1deg)', opacity: fadeIn(frame, 10, 10)}}>{caption}</div> : null}
        {scene.props.credit ? <div style={{position: 'absolute', right: 10 * u, bottom: -46 * u, fontFamily: hand(brand), fontSize: 26 * u, color: brand.muted, opacity: fadeIn(frame, 14, 10)}}>{scene.props.credit}</div> : null}
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
    case 'still':
    case 'image':
      return <PaperStill scene={scene} brand={brand} />;
    default:
      return null;
  }
};
void roughGen;
