import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene} from '../types';
import {Reveal} from '../components/Reveal';
import {SourceTag} from '../components/SourceTag';
import {compactNum, useLayout} from '../components/layout';
import {card} from '../theme';
import {pop} from '../components/motion';

/** A gridline step of 1/2/2.5/5 x 10^k and the axis maximum as a whole number of those steps, so every label is round. */
const niceAxis = (v: number, want = 4): {max: number; step: number; ticks: number} => {
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
  const glossy = !brand.toon;

  const W = width - pad * 2;
  const H = Math.min(height * (isVertical ? 0.42 : glossy ? 0.54 : 0.52), (glossy ? 640 : 620) * u);
  const left = 150 * u;
  const bottom = 60 * u;
  const top = 70 * u; // headroom for the end-value label and the legend
  const plotW = W - left - (glossy ? 190 : 40) * u; // glossy: room for the value pill at the line's end
  const plotH = H - bottom - top;
  const colors = [brand.accent, brand.accent2, '#60a5fa', '#f472b6'];

  const reveal = interpolate(frame, [10, 10 + fps * (glossy ? 2.2 : 1.8)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  let body: React.ReactNode = null;
  let yMax = 0;
  let yMin = 0;
  let ticks = 4;

  if (chartType === 'line') {
    const series: Series[] = scene.props.series ?? [];
    const allY = series.flatMap((s) => s.points.map((p) => p[1]));
    const allX = series.flatMap((s) => s.points.map((p) => p[0]));
    const axis = niceAxis(Math.max(...allY, 0));
    yMax = axis.max;
    ticks = axis.ticks;
    yMin = Math.min(...allY, 0);
    const xMin = Math.min(...allX);
    const xMax = Math.max(...allX);
    const sx = (x: number) => left + ((x - xMin) / Math.max(1e-9, xMax - xMin)) * plotW;
    const sy = (y: number) => top + plotH - ((y - yMin) / Math.max(1e-9, yMax - yMin)) * plotH;
    // the value at the revealed x, interpolated along the series, so the end pill reads the live number
    const valueAt = (s: Series, x: number) => {
      const pts = s.points;
      if (x <= pts[0][0]) return pts[0][1];
      for (let i = 1; i < pts.length; i++) {
        if (x <= pts[i][0]) {
          const f = (x - pts[i - 1][0]) / Math.max(1e-9, pts[i][0] - pts[i - 1][0]);
          return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f;
        }
      }
      return pts[pts.length - 1][1];
    };
    const xNow = xMin + (xMax - xMin) * reveal;
    const ticksX = [xMin, (xMin + xMax) / 2, xMax];
    body = (
      <>
        <defs>
          <clipPath id="reveal">
            <rect x={0} y={0} width={left + plotW * reveal + 2} height={H} />
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
          const vNow = valueAt(s, xNow);
          const cx = sx(Math.min(xNow, last[0]));
          const cy = sy(vNow);
          const pulse = 1 + 0.25 * Math.abs(Math.sin(frame / 9));
          return (
            <g key={i}>
              <g clipPath="url(#reveal)">
                <path d={area} fill={`url(#fill${i})`} />
                <path d={d} stroke={c} strokeWidth={8 * u} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              </g>
              {glossy ? (
                <g>
                  <circle cx={cx} cy={cy} r={22 * u * pulse} fill={c} opacity={0.25} />
                  <circle cx={cx} cy={cy} r={12 * u} fill={c} stroke={brand.bg} strokeWidth={4 * u} />
                  <g transform={`translate(${cx + 24 * u} ${cy - 26 * u})`}>
                    <rect x={0} y={0} rx={14 * u} width={(compactNum(vNow, yFormat).length * 20 + 28) * u} height={52 * u} fill={c} />
                    <text x={14 * u} y={37 * u} fill={brand.bg} fontSize={32 * u} fontWeight={800}>
                      {compactNum(vNow, yFormat)}
                    </text>
                  </g>
                </g>
              ) : (
                <g clipPath="url(#reveal)">
                  <circle cx={sx(last[0])} cy={sy(last[1])} r={14 * u} fill={c} />
                  <text x={sx(last[0]) - 20 * u} y={sy(last[1]) - 28 * u} fill={c} fontSize={36 * u} fontWeight={800} textAnchor="end">
                    {compactNum(last[1], yFormat)}
                  </text>
                </g>
              )}
              {s.name ? (
                <text x={left + 16 * u + i * 320 * u} y={36 * u} fill={c} fontSize={30 * u} fontWeight={700}>
                  ● {s.name}
                </text>
              ) : null}
            </g>
          );
        })}
        {(glossy ? ticksX : [xMin, xMax]).map((x, i, arr) => (
          <text key={i} x={sx(x)} y={H - 14 * u} fill={brand.muted} fontSize={28 * u} textAnchor={i === 0 ? 'start' : i === arr.length - 1 ? 'end' : 'middle'}>
            {xLabel ? `${xLabel} ${Math.round(x)}` : Math.round(x)}
          </text>
        ))}
      </>
    );
  } else {
    const bars: Bar[] = scene.props.bars ?? [];
    const axis = niceAxis(Math.max(...bars.map((b) => b.value), 0));
    yMax = axis.max;
    ticks = axis.ticks;
    const gap = 28 * u;
    const bw = (plotW - gap * (bars.length + 1)) / Math.max(1, bars.length);
    body = (
      <>
        {bars.map((b, i) => {
          const grow = glossy
            ? pop(frame, fps, 8 + i * 7, 14)
            : interpolate(frame, [8 + i * 6, 8 + i * 6 + fps * 1.0], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
          const h = Math.max(0, (b.value / Math.max(1e-9, yMax)) * plotH * grow);
          const x = left + gap + i * (bw + gap);
          const y = top + plotH - h;
          const c = b.color ?? colors[i % colors.length];
          return (
            <g key={i}>
              {glossy ? <rect x={x} y={y} width={bw} height={h} rx={14 * u} fill={c} opacity={0.35} transform={`translate(0 ${6 * u})`} /> : null}
              <rect x={x} y={y} width={bw} height={h} rx={12 * u} fill={c} />
              <text x={x + bw / 2} y={y - 16 * u} fill={brand.text} fontSize={(glossy ? 40 : 34) * u} fontWeight={800} textAnchor="middle" opacity={Math.min(1, grow)}>
                {compactNum(b.value * Math.min(1, grow), yFormat)}
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

  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: glossy ? 'center' : 'stretch', padding: pad}}>
      {title ? (
        <Reveal delay={0}>
          <div style={{fontFamily: brand.display, fontSize: (isVertical ? 54 : glossy ? 60 : 66) * u, fontWeight: brand.toon ? 400 : 700, marginBottom: 24 * u, textAlign: glossy ? 'center' : 'left', letterSpacing: glossy ? -1 * u : 0}}>{title}</div>
        </Reveal>
      ) : null}
      <Reveal delay={4} from="none" style={{width: '100%'}}>
        <div style={{...card(brand, u, brand.toon ? -0.6 : 0), padding: 24 * u, ...(glossy ? {boxShadow: `0 ${30 * u}px ${80 * u}px rgba(0,0,0,0.45)`} : {})}}>
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
          {glossy ? <SourceTag brand={brand} source={scene.props.source} style={{textAlign: 'right', marginTop: 6 * u}} /> : null}
        </div>
      </Reveal>
      {glossy ? null : (
        <Reveal delay={20} from="none" style={{marginTop: 20 * u}}>
          <SourceTag brand={brand} source={scene.props.source} />
        </Reveal>
      )}
    </AbsoluteFill>
  );
};
