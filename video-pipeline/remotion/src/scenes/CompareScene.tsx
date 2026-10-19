import React from 'react';
import {AbsoluteFill} from 'remotion';
import type {Brand, Scene} from '../types';
import {Reveal} from '../components/Reveal';
import {SourceTag} from '../components/SourceTag';
import {useLayout} from '../components/layout';

type Side = {title: string; value?: string; items?: string[]; color?: string};

const Card: React.FC<{side: Side; brand: Brand; color: string; from: 'left' | 'right'; delay: number}> = ({side, brand, color, from, delay}) => {
  const {u} = useLayout();
  return (
    <Reveal delay={delay} from={from} distance={80} style={{flex: 1}}>
      <div
        style={{
          background: `${brand.panel}dd`,
          border: `3px solid ${color}`,
          borderRadius: 32 * u,
          padding: 44 * u,
          minHeight: 420 * u,
          display: 'flex',
          flexDirection: 'column',
          gap: 20 * u,
        }}
      >
        <div style={{fontSize: 40 * u, fontWeight: 700, color}}>{side.title}</div>
        {side.value ? (
          <div style={{fontSize: 108 * u, fontWeight: 800, lineHeight: 1, letterSpacing: -3 * u, fontVariantNumeric: 'tabular-nums'}}>{side.value}</div>
        ) : null}
        {(side.items ?? []).map((it, i) => (
          <div key={i} style={{fontSize: 34 * u, color: brand.text, display: 'flex', gap: 14 * u}}>
            <span style={{color}}>•</span>
            <span>{it}</span>
          </div>
        ))}
      </div>
    </Reveal>
  );
};

export const CompareScene: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  const {u, pad, isVertical} = useLayout();
  const left: Side = scene.props.left ?? {title: 'A'};
  const right: Side = scene.props.right ?? {title: 'B'};
  const title: string | undefined = scene.props.title;
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad}}>
      {title ? (
        <Reveal delay={0}>
          <div style={{fontSize: (isVertical ? 50 : 60) * u, fontWeight: 800, marginBottom: 36 * u, letterSpacing: -1}}>{title}</div>
        </Reveal>
      ) : null}
      <div style={{display: 'flex', flexDirection: isVertical ? 'column' : 'row', gap: 40 * u, alignItems: 'stretch', position: 'relative'}}>
        <Card side={left} brand={brand} color={left.color ?? brand.muted} from="left" delay={4} />
        <Reveal delay={16} from="none" style={{position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 2}}>
          <div
            style={{
              width: 96 * u,
              height: 96 * u,
              borderRadius: 999,
              background: brand.bg,
              border: `3px solid ${brand.text}33`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 34 * u,
              fontWeight: 800,
              color: brand.muted,
            }}
          >
            VS
          </div>
        </Reveal>
        <Card side={right} brand={brand} color={right.color ?? brand.accent} from="right" delay={8} />
      </div>
      <Reveal delay={24} from="none" style={{marginTop: 24 * u}}>
        <SourceTag brand={brand} source={scene.props.source} />
      </Reveal>
    </AbsoluteFill>
  );
};
