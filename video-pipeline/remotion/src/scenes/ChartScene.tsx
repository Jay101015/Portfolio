import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene} from '../types';
import {Reveal} from '../components/Reveal';
import {SourceTag} from '../components/SourceTag';
import {compactNum, useLayout} from '../components/layout';
import {card} from '../theme';

/** Round an axis maximum up to a 1/2/2.5/5 x 10^k step so gridline labels are round numbers. */
const niceMax = (v: number, ticks = 4) => {
  if (v <= 0) return 1;
  const raw = v / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st >= raw) ?? 10 * mag;
  return Math.ceil(v / step) * step;
};

type Series = {name?: string; points: [number, number][]; color?: string};
type Bar = {label: string; value: number; color?: string};

export const ChartScene: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, isVertical, width, height} = useLayout();
  const chartType: 'line' | 'bar' = scene.props.chartType ?? (scene.props.bars ? 'bar' : 'line');
  const title: string | undefined = scene.props.title;
  const yFormat: string | undefined = scene.props.yFormat;
  const xLabel: string | undefined = scene.props.xLabel;

  const W = width - pad * 2;
  const H = Math.min(height * (isVertical ? 0.42 : 0.52), 620 * u);
  const left = 150 * u;
  const bottom = 60 * u;
  const top = 70 * u; // headroom for the end-value label and the legend
  const plotW = W - left - 40 * u;
  const plotH = H - bottom - top;
  const colors = [brand.accent, brand.accent2, '#60a5fa', '#f472b6'];

  const reveal = interpolate(frame, [10, 10 + fps * 1.8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  let body: React.ReactNode = null;
  let yMax = 0;
  let yMin = 0;

  if (chartType === 'line') {
    const series: Series[] = scene.props.series ?? [];
    const allY = series.flatMap((s) => s.points.map((p) => p[1]));
    const allX = series.flatMap((s) => s.points.map((p) => p[0]));
    yMax = niceMax(Math.max(...allY, 0));
    yMin = Math.min(...allY, 0);
    const xMin = Math.min(...allX);
    const xMax = Math.max(...allX);
    const sx = (x: number) => left + ((x - xMin) / Math.max(1e-9, xMax - xMin)) * plotW;
    const sy = (y: number) => top + plotH - ((y - yMin) / Math.max(1e-9, yMax - yMin)) * plotH;
    body = (
      <>
        <defs>
          <clipPath id="reveal">
            <rect x={0} y={0} width={left + plotW * reveal} height={H} />
          </clipPath>
          {series.map((s, i) => (
            <linearGradient key={i} id={`fill${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color ?? colors[i % colors.length]} stopOpacity={0.35} />
              <stop offset="100%" stopColor={s.color ?? colors[i % colors.length]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        {series.map((s, i) => {
          const pts = s.points.map(([x, y]) => `${sx(x)},${sy(y)}`);
          const d = `M${pts.join(' L')}`;
          const area = `${d} L${sx(s.points[s.points.length - 1][0])},${sy(yMin)} L${sx(s.points[0][0])},${sy(yMin)} Z`;
          const last = s.points[s.points.length - 1];
          const c = s.color ?? colors[i % colors.length];
          return (
            <g key={i} clipPath="url(#reveal)">
              <path d={area} fill={`url(#fill${i})`} />
              <path d={d} stroke={c} strokeWidth={8 * u} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={sx(last[0])} cy={sy(last[1])} r={14 * u} fill={c} />
              <text x={sx(last[0]) - 20 * u} y={sy(last[1]) - 28 * u} fill={c} fontSize={36 * u} fontWeight={800} textAnchor="end">
                {compactNum(last[1], yFormat)}
              </text>
              {s.name ? (
                <text x={left + 16 * u + i * 320 * u} y={36 * u} fill={c} fontSize={30 * u} fontWeight={700}>
                  ● {s.name}
                </text>
              ) : null}
            </g>
          );
        })}
        {[xMin, xMax].map((x, i) => (
          <text key={i} x={sx(x)} y={H - 14 * u} fill={brand.muted} fontSize={28 * u} textAnchor={i === 0 ? 'start' : 'end'}>
            {xLabel ? `${xLabel} ${x}` : x}
          </text>
        ))}
      </>
    );
  } else {
    const bars: Bar[] = scene.props.bars ?? [];
    yMax = niceMax(Math.max(...bars.map((b) => b.value), 0));
    const gap = 28 * u;
    const bw = (plotW - gap * (bars.length + 1)) / Math.max(1, bars.length);
    body = (
      <>
        {bars.map((b, i) => {
          const grow = interpolate(frame, [8 + i * 6, 8 + i * 6 + fps * 1.0], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: Easing.out(Easing.cubic),
          });
          const h = (b.value / Math.max(1e-9, yMax)) * plotH * grow;
          const x = left + gap + i * (bw + gap);
          const y = top + plotH - h;
          const c = b.color ?? colors[i % colors.length];
          return (
            <g key={i}>
              <rect x={x} y={y} width={bw} height={h} rx={12 * u} fill={c} />
              <text x={x + bw / 2} y={y - 16 * u} fill={brand.text} fontSize={34 * u} fontWeight={800} textAnchor="middle" opacity={grow}>
                {compactNum(b.value * grow, yFormat)}
              </text>
              <text x={x + bw / 2} y={H - 14 * u} fill={brand.muted} fontSize={28 * u} textAnchor="middle">
                {b.label}
              </text>
            </g>
          );
        })}
      </>
    );
  }

  const ticks = 4;
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad}}>
      {title ? (
        <Reveal delay={0}>
          <div style={{fontFamily: brand.display, fontSize: (isVertical ? 54 : 66) * u, fontWeight: brand.toon ? 400 : 800, marginBottom: 24 * u}}>{title}</div>
        </Reveal>
      ) : null}
      <Reveal delay={4} from="none">
        <div style={{...card(brand, u, brand.toon ? -0.6 : 0), padding: 24 * u}}>
          <svg width={W - 48 * u} height={H} viewBox={`0 0 ${W} ${H}`} style={{overflow: 'visible'}}>
            {Array.from({length: ticks + 1}).map((_, i) => {
              const v = yMin + ((yMax - yMin) * i) / ticks;
              const y = top + plotH - (i / ticks) * plotH;
              return (
                <g key={i}>
                  <line x1={left} x2={left + plotW} y1={y} y2={y} stroke={`${brand.text}1a`} strokeWidth={2} />
                  <text x={left - 16 * u} y={y + 10 * u} fill={brand.muted} fontSize={26 * u} textAnchor="end">
                    {compactNum(v, yFormat)}
                  </text>
                </g>
              );
            })}
            {body}
          </svg>
        </div>
      </Reveal>
      <Reveal delay={20} from="none" style={{marginTop: 20 * u}}>
        <SourceTag brand={brand} source={scene.props.source} />
      </Reveal>
    </AbsoluteFill>
  );
};
