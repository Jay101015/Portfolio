import React from 'react';
import {AbsoluteFill, Img, staticFile} from 'remotion';
import type {Brand, Scene} from '../types';
import {Reveal} from '../components/Reveal';
import {useLayout} from '../components/layout';
import {card} from '../theme';

/** Film card: poster on the left (toon: a taped-up polaroid), title and credits on the right. */
export const PosterScene: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  const {u, pad, isVertical, height} = useLayout();
  const p = scene.props;
  const rows: [string, string | undefined][] = [
    ['Year', p.year],
    ['Director', p.director],
    ['Runtime', p.runtime],
    ['Genre', p.genre],
    ['Starring', p.starring],
  ];
  const posterH = (isVertical ? 0.34 : 0.58) * height;
  const posterW = posterH * 0.675;
  const tape = (rot: number, left: string) => (
    <div style={{position: 'absolute', top: -14 * u, left, width: 110 * u, height: 32 * u, background: `${brand.accent2}cc`, transform: `rotate(${rot}deg)`, border: `3px solid ${brand.ink}33`}} />
  );
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad, paddingRight: brand.toon && !isVertical ? pad + 0.42 * 1920 * u : pad}}>
      <div style={{display: 'flex', flexDirection: isVertical ? 'column' : 'row', gap: 60 * u, alignItems: 'center'}}>
        <Reveal delay={0} from="left" distance={80}>
          <div style={{position: 'relative', width: posterW, height: posterH, ...(brand.toon ? {background: '#fff', padding: 14 * u, paddingBottom: 48 * u, border: `${5 * u}px solid ${brand.ink}`, boxShadow: `${10 * u}px ${10 * u}px 0 ${brand.ink}`, transform: 'rotate(-3deg)', boxSizing: 'border-box'} : {borderRadius: 18 * u, overflow: 'hidden', background: brand.panel, boxShadow: '0 30px 60px rgba(0,0,0,0.5)'})}}>
            {brand.toon ? tape(-8, '12%') : null}
            {brand.toon ? tape(6, '62%') : null}
            <div style={{width: '100%', height: '100%', overflow: 'hidden', background: brand.toon ? '#e9e2d6' : brand.panel, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
              {p.src ? (
                <Img src={staticFile(p.src)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
              ) : (
                <div style={{color: brand.muted, fontSize: 28 * u, textAlign: 'center', padding: 24 * u, fontFamily: brand.display}}>poster{p.title ? <div style={{marginTop: 10 * u, color: brand.text, fontSize: 36 * u}}>{p.title}</div> : null}</div>
              )}
            </div>
          </div>
        </Reveal>
        <div style={{flex: 1}}>
          <Reveal delay={6} distance={50}>
            <div style={{fontFamily: brand.display, fontSize: (isVertical ? 70 : 92) * u, lineHeight: 1.0, letterSpacing: brand.toon ? 0 : -2 * u, fontWeight: brand.toon ? 400 : 800}}>{p.title ?? scene.narration}</div>
          </Reveal>
          {p.tagline ? (
            <Reveal delay={12}>
              <div style={{fontSize: 36 * u, color: brand.accent, marginTop: 18 * u, fontStyle: 'italic'}}>{p.tagline}</div>
            </Reveal>
          ) : null}
          <div style={{marginTop: 32 * u, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 28 * u, rowGap: 10 * u}}>
            {rows
              .filter(([, v]) => v)
              .map(([k, v], i) => (
                <React.Fragment key={k}>
                  <Reveal delay={16 + i * 4} from="none">
                    <div style={{fontSize: 28 * u, color: brand.muted, textTransform: 'uppercase', letterSpacing: 1, paddingTop: 6 * u}}>{k}</div>
                  </Reveal>
                  <Reveal delay={16 + i * 4} from="none">
                    <div style={{fontSize: 36 * u, fontWeight: brand.toon ? 400 : 600}}>{v}</div>
                  </Reveal>
                </React.Fragment>
              ))}
          </div>
        </div>
      </div>
      <div style={{display: 'none'}}>{JSON.stringify(card(brand, u)).length}</div>
    </AbsoluteFill>
  );
};
