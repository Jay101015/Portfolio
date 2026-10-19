import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene} from '../types';
import {Reveal} from '../components/Reveal';
import {SourceTag} from '../components/SourceTag';
import {formatNum, parseValue, useLayout} from '../components/layout';

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
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'flex-start', padding: pad}}>
      {label ? (
        <Reveal delay={0}>
          <div style={{fontFamily: brand.display, fontSize: 40 * u, color: brand.muted, marginBottom: 16 * u}}>{label}</div>
        </Reveal>
      ) : null}
      <Reveal delay={4} distance={50}>
        <div
          style={{
            fontFamily: brand.display,
            fontSize: (isVertical ? 150 : 200) * u,
            fontWeight: brand.toon ? 400 : 800,
            lineHeight: 1,
            letterSpacing: brand.toon ? 0 : -6 * u,
            color: brand.toon && color === brand.text ? brand.accent : color,
            WebkitTextStroke: brand.toon ? `${3 * u}px ${brand.ink}` : undefined,
            textShadow: brand.toon ? `${8 * u}px ${8 * u}px 0 ${brand.ink}` : undefined,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {display}
        </div>
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
};
