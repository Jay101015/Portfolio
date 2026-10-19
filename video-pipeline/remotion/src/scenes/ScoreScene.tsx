import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene} from '../types';
import {Reveal} from '../components/Reveal';
import {useLayout} from '../components/layout';

const Star: React.FC<{fill: number; size: number; color: string; dim: string; ink: string; toon: boolean; wobble: number}> = ({fill, size, color, dim, ink, toon, wobble}) => {
  const id = React.useId();
  const d = 'M12 2.5l2.9 6.2 6.8.8-5 4.7 1.3 6.8L12 17.6 6 21l1.3-6.8-5-4.7 6.8-.8z';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{transform: `rotate(${wobble}deg)`}}>
      <defs>
        <linearGradient id={id} x1="0" x2="1">
          <stop offset={`${fill * 100}%`} stopColor={color} />
          <stop offset={`${fill * 100}%`} stopColor={dim} />
        </linearGradient>
      </defs>
      <path d={d} fill={`url(#${id})`} stroke={toon ? ink : 'none'} strokeWidth={toon ? 1.4 : 0} strokeLinejoin="round" />
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
      <div style={{width: isVertical ? '100%' : '56%'}}>
        <Reveal delay={0}>
          <div style={{fontFamily: brand.display, fontSize: 40 * u, color: brand.accent, marginBottom: 10 * u, transform: brand.toon ? 'rotate(-2deg)' : undefined, display: 'inline-block'}}>{brand.toon ? label : label.toUpperCase()}</div>
        </Reveal>
        <Reveal delay={4} distance={50}>
          <div style={{display: 'flex', alignItems: 'baseline', gap: 16 * u}}>
            <div style={{fontFamily: brand.display, fontSize: (isVertical ? 190 : 250) * u, lineHeight: 1, fontWeight: brand.toon ? 400 : 800, letterSpacing: brand.toon ? 0 : -8 * u, fontVariantNumeric: 'tabular-nums', color: brand.toon ? brand.accent : brand.text, WebkitTextStroke: brand.toon ? `${3 * u}px ${brand.ink}` : undefined, textShadow: brand.toon ? `${8 * u}px ${8 * u}px 0 ${brand.ink}` : undefined}}>{shown.toFixed(decimals)}</div>
            <div style={{fontFamily: brand.display, fontSize: 70 * u, color: brand.muted}}>/ {max}</div>
          </div>
        </Reveal>
        <Reveal delay={10} from="none">
          <div style={{display: 'flex', gap: 10 * u, marginTop: 22 * u}}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Star key={i} fill={Math.max(0, Math.min(1, stars - i))} size={84 * u} color={brand.accent2} dim={brand.toon ? '#fff' : `${brand.text}22`} ink={brand.ink} toon={brand.toon} wobble={brand.toon ? ((i * 11) % 7) - 3 : 0} />
            ))}
          </div>
        </Reveal>
        {verdict ? (
          <Reveal delay={22}>
            <div style={{fontSize: 48 * u, marginTop: 34 * u, lineHeight: 1.25, fontFamily: brand.toon ? brand.display : brand.font}}>{verdict}</div>
          </Reveal>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
