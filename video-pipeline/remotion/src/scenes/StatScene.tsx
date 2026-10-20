import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene} from '../types';
import {Reveal} from '../components/Reveal';
import {SourceTag} from '../components/SourceTag';
import {formatNum, parseValue, useLayout} from '../components/layout';
import {fadeIn, pop} from '../components/motion';

export const StatScene: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, isVertical} = useLayout();
  const raw = String(scene.props.value ?? '');
  const parsed = parseValue(raw);
  const from = scene.props.from !== undefined ? parseValue(String(scene.props.from))?.num ?? 0 : 0;
  const countSec = Number(scene.props.countSeconds ?? 1.4);
  const p = interpolate(frame, [6, 6 + fps * countSec], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const display = parsed
    ? `${parsed.prefix}${formatNum(from + (parsed.num - from) * p, parsed.decimals, parsed.grouped || parsed.num >= 1000)}${parsed.suffix}`
    : raw;
  const label: string | undefined = scene.props.label;
  const sub: string | undefined = scene.props.sub;
  const trend: string | undefined = scene.props.trend; // "up" | "down"
  const color = trend === 'down' ? '#ef4444' : trend === 'up' ? brand.accent : brand.text;
  if (brand.toon) {
    return (
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'flex-start', padding: pad}}>
        {label ? (
          <Reveal delay={0}>
            <div style={{fontFamily: brand.display, fontSize: 40 * u, color: brand.muted, marginBottom: 16 * u}}>{label}</div>
          </Reveal>
        ) : null}
        <Reveal delay={4} distance={50}>
          <div style={{fontFamily: brand.display, fontSize: (isVertical ? 150 : 200) * u, lineHeight: 1, color: color === brand.text ? brand.accent : color, WebkitTextStroke: `${3 * u}px ${brand.ink}`, textShadow: `${8 * u}px ${8 * u}px 0 ${brand.ink}`, fontVariantNumeric: 'tabular-nums'}}>{display}</div>
        </Reveal>
        {sub ? (
          <Reveal delay={18}>
            <div style={{fontSize: 40 * u, color: brand.text, marginTop: 24 * u, maxWidth: isVertical ? '100%' : '56%', lineHeight: 1.3}}>{sub}</div>
          </Reveal>
        ) : null}
        <Reveal delay={26} from="none" style={{marginTop: 36 * u}}>
          <SourceTag brand={brand} source={scene.props.source} />
        </Reveal>
      </AbsoluteFill>
    );
  }
  // Motion-graphics look: the number owns the frame. It springs in large and centred, counts up, and a bar fills beneath it.
  const s = pop(frame, fps, 4, 11);
  const bar = interpolate(frame, [8, 8 + fps * countSec], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  const glow = `0 0 ${40 * u}px ${color === brand.text ? brand.accent : color}55`;
  const digits = display.length;
  const size = (isVertical ? 170 : 250) * u * (digits > 9 ? 0.72 : digits > 7 ? 0.86 : 1);
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', padding: pad, textAlign: 'center'}}>
      {label ? (
        <div style={{opacity: fadeIn(frame, 0, 8), transform: `translateY(${(1 - fadeIn(frame, 0, 10)) * 20 * u}px)`, display: 'inline-flex', padding: `${10 * u}px ${28 * u}px`, borderRadius: 999, border: `${2 * u}px solid ${brand.accent}66`, background: `${brand.accent}14`, fontSize: 34 * u, fontWeight: 600, letterSpacing: 1, color: brand.accent, marginBottom: 34 * u}}>
          {label}
        </div>
      ) : null}
      <div style={{fontFamily: brand.display, fontSize: size, fontWeight: 700, lineHeight: 1, letterSpacing: -6 * u, color, textShadow: glow, fontVariantNumeric: 'tabular-nums', transform: `scale(${0.6 + 0.4 * s})`, opacity: Math.min(1, s * 1.5)}}>
        {display}
        {trend ? <span style={{fontSize: size * 0.4, marginLeft: 20 * u, verticalAlign: 'middle'}}>{trend === 'down' ? '▼' : '▲'}</span> : null}
      </div>
      <div style={{width: Math.min(560 * u, size * 2.6), height: 10 * u, borderRadius: 999, background: `${brand.text}1a`, marginTop: 36 * u, overflow: 'hidden'}}>
        <div style={{width: `${bar * 100}%`, height: '100%', background: `linear-gradient(90deg, ${brand.accent}, ${brand.accent2})`, borderRadius: 999}} />
      </div>
      {sub ? (
        <Reveal delay={18}>
          <div style={{fontSize: (isVertical ? 40 : 44) * u, color: brand.text, marginTop: 34 * u, maxWidth: isVertical ? '100%' : '70%', lineHeight: 1.3, fontWeight: 500}}>{sub}</div>
        </Reveal>
      ) : null}
      <Reveal delay={26} from="none" style={{marginTop: 30 * u}}>
        <SourceTag brand={brand} source={scene.props.source} />
      </Reveal>
    </AbsoluteFill>
  );
};
