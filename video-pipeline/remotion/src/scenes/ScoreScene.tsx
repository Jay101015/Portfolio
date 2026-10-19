import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene} from '../types';
import {Reveal} from '../components/Reveal';
import {useLayout} from '../components/layout';

const Star: React.FC<{fill: number; size: number; color: string; dim: string}> = ({fill, size, color, dim}) => {
  const id = React.useId();
  const d = 'M12 2.5l2.9 6.2 6.8.8-5 4.7 1.3 6.8L12 17.6 6 21l1.3-6.8-5-4.7 6.8-.8z';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <defs>
        <linearGradient id={id} x1="0" x2="1">
          <stop offset={`${fill * 100}%`} stopColor={color} />
          <stop offset={`${fill * 100}%`} stopColor={dim} />
        </linearGradient>
      </defs>
      <path d={d} fill={`url(#${id})`} />
    </svg>
  );
};

/** The verdict card: a score counting up, stars filling, and the one-line take. */
export const ScoreScene: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, isVertical} = useLayout();
  const value = parseFloat(String(scene.props.value ?? '7'));
  const max = parseFloat(String(scene.props.max ?? '10'));
  const p = interpolate(frame, [8, 8 + fps * 1.6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  const shown = value * p;
  const stars = (shown / max) * 5;
  const label: string = scene.props.label ?? 'Verdict';
  const verdict: string | undefined = scene.props.verdict;
  const decimals = String(scene.props.value ?? '').includes('.') ? 1 : 0;
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'flex-start', padding: pad}}>
      <div style={{width: isVertical ? '100%' : '58%'}}>
        <Reveal delay={0}>
          <div style={{fontSize: 30 * u, fontWeight: 700, letterSpacing: 4, color: brand.accent, marginBottom: 16 * u}}>{label.toUpperCase()}</div>
        </Reveal>
        <Reveal delay={4} distance={50}>
          <div style={{display: 'flex', alignItems: 'baseline', gap: 16 * u}}>
            <div style={{fontSize: (isVertical ? 170 : 220) * u, fontWeight: 800, lineHeight: 1, letterSpacing: -8 * u, fontVariantNumeric: 'tabular-nums'}}>{shown.toFixed(decimals)}</div>
            <div style={{fontSize: 64 * u, fontWeight: 700, color: brand.muted}}>/ {max}</div>
          </div>
        </Reveal>
        <Reveal delay={10} from="none">
          <div style={{display: 'flex', gap: 8 * u, marginTop: 24 * u}}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Star key={i} fill={Math.max(0, Math.min(1, stars - i))} size={72 * u} color={brand.accent2} dim={`${brand.text}22`} />
            ))}
          </div>
        </Reveal>
        {verdict ? (
          <Reveal delay={22}>
            <div style={{fontSize: 44 * u, fontWeight: 600, marginTop: 36 * u, lineHeight: 1.25}}>{verdict}</div>
          </Reveal>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
