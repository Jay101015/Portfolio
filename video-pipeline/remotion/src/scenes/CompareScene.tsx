import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene} from '../types';
import {Reveal} from '../components/Reveal';
import {SourceTag} from '../components/SourceTag';
import {parseValue, useLayout} from '../components/layout';
import {card} from '../theme';
import {pop} from '../components/motion';

type Side = {title: string; value?: string; items?: string[]; color?: string};

const Card: React.FC<{side: Side; brand: Brand; color: string; from: 'left' | 'right'; delay: number; share?: number}> = ({side, brand, color, from, delay, share}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u} = useLayout();
  if (brand.toon) {
    return (
      <Reveal delay={delay} from={from} distance={80} style={{flex: 1}}>
        <div style={{...card(brand, u, from === 'left' ? -1.5 : 1.5), padding: 40 * u, minHeight: 380 * u, display: 'flex', flexDirection: 'column', gap: 18 * u}}>
          <div style={{fontFamily: brand.display, fontSize: 44 * u, color}}>{side.title}</div>
          {side.value ? <div style={{fontSize: 108 * u, fontWeight: 800, lineHeight: 1, letterSpacing: -3 * u, fontVariantNumeric: 'tabular-nums'}}>{side.value}</div> : null}
          {(side.items ?? []).map((it, i) => (
            <div key={i} style={{fontSize: 34 * u, color: brand.text, display: 'flex', gap: 14 * u}}>
              <span style={{color}}>•</span>
              <span>{it}</span>
            </div>
          ))}
        </div>
      </Reveal>
    );
  }
  // Motion-graphics look: the card swings in, the value pops, and a bar shows its share against the other side.
  const s = pop(frame, fps, delay, 14);
  const sv = pop(frame, fps, delay + 8, 11);
  const bar = pop(frame, fps, delay + 14, 16);
  const dir = from === 'left' ? -1 : 1;
  return (
    <div style={{flex: 1, perspective: `${1600 * u}px`}}>
      <div style={{background: `${brand.panel}ee`, border: `${3 * u}px solid ${color}`, borderRadius: 32 * u, padding: 44 * u, minHeight: 420 * u, display: 'flex', flexDirection: 'column', gap: 18 * u, boxShadow: `0 ${24 * u}px ${60 * u}px rgba(0,0,0,0.4), inset 0 0 0 1px ${color}22`, opacity: Math.min(1, s * 1.4), transform: `rotateY(${(1 - s) * 28 * dir}deg) translateX(${(1 - s) * 60 * u * dir}px)`}}>
        <div style={{fontFamily: brand.display, fontSize: 44 * u, fontWeight: 700, color}}>{side.title}</div>
        {side.value ? (
          <div style={{fontFamily: brand.display, fontSize: 124 * u, fontWeight: 700, lineHeight: 1, letterSpacing: -4 * u, fontVariantNumeric: 'tabular-nums', transform: `scale(${0.7 + 0.3 * sv})`, transformOrigin: 'left center', opacity: Math.min(1, sv * 1.5)}}>{side.value}</div>
        ) : null}
        {share !== undefined ? (
          <div style={{height: 14 * u, borderRadius: 999, background: `${brand.text}14`, overflow: 'hidden'}}>
            <div style={{width: `${Math.max(4, share * 100) * Math.min(1, bar)}%`, height: '100%', background: color, borderRadius: 999}} />
          </div>
        ) : null}
        {(side.items ?? []).map((it, i) => (
          <div key={i} style={{fontSize: 36 * u, color: brand.text, display: 'flex', gap: 16 * u, opacity: Math.min(1, pop(frame, fps, delay + 16 + i * 5, 16) * 1.5)}}>
            <span style={{color, fontWeight: 800}}>•</span>
            <span>{it}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const CompareScene: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, isVertical} = useLayout();
  const left: Side = scene.props.left ?? {title: 'A'};
  const right: Side = scene.props.right ?? {title: 'B'};
  const title: string | undefined = scene.props.title;
  const lv = left.value ? parseValue(left.value)?.num : undefined;
  const rv = right.value ? parseValue(right.value)?.num : undefined;
  const maxV = lv !== undefined && rv !== undefined ? Math.max(Math.abs(lv), Math.abs(rv), 1e-9) : undefined;
  const vs = pop(frame, fps, 16, 10);
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad, paddingRight: brand.toon && !isVertical ? pad * 4.2 : pad}}>
      {title ? (
        <Reveal delay={0}>
          <div style={{fontFamily: brand.display, fontSize: (isVertical ? 54 : 64) * u, fontWeight: brand.toon ? 400 : 700, marginBottom: 32 * u, textAlign: brand.toon ? 'left' : 'center', letterSpacing: brand.toon ? 0 : -1 * u}}>{title}</div>
        </Reveal>
      ) : null}
      <div style={{display: 'flex', flexDirection: isVertical ? 'column' : 'row', gap: 40 * u, alignItems: 'stretch', position: 'relative'}}>
        <Card side={left} brand={brand} color={left.color ?? (brand.toon ? brand.accent : '#ef4444')} from="left" delay={4} share={maxV !== undefined && lv !== undefined ? Math.abs(lv) / maxV : undefined} />
        {brand.toon ? (
          <Reveal delay={16} from="none" style={{position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 2}}>
            <div style={{width: 96 * u, height: 96 * u, borderRadius: 999, background: brand.accent2, border: `${5 * u}px solid ${brand.ink}`, fontFamily: brand.display, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34 * u, color: brand.ink}}>VS</div>
          </Reveal>
        ) : (
          <div style={{position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%,-50%) scale(${vs})`, zIndex: 2}}>
            <div style={{width: 110 * u, height: 110 * u, borderRadius: 999, background: brand.bg, border: `${3 * u}px solid ${brand.text}33`, fontFamily: brand.display, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 * u, fontWeight: 700, color: brand.text, boxShadow: `0 ${10 * u}px ${30 * u}px rgba(0,0,0,0.5)`}}>VS</div>
          </div>
        )}
        <Card side={right} brand={brand} color={right.color ?? (brand.toon ? '#2a9d5c' : brand.accent)} from="right" delay={8} share={maxV !== undefined && rv !== undefined ? Math.abs(rv) / maxV : undefined} />
      </div>
      <Reveal delay={24} from="none" style={{marginTop: 24 * u, textAlign: brand.toon ? 'left' : 'center'}}>
        <SourceTag brand={brand} source={scene.props.source} />
      </Reveal>
    </AbsoluteFill>
  );
};
