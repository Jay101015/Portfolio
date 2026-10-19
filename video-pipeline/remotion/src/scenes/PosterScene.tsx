import React from 'react';
import {AbsoluteFill, Img, staticFile} from 'remotion';
import type {Brand, Scene} from '../types';
import {Reveal} from '../components/Reveal';
import {useLayout} from '../components/layout';

/** Film card: poster on the left, title and credits on the right. */
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
  const posterH = (isVertical ? 0.38 : 0.62) * height;
  const posterW = posterH * 0.675;
  return (
    <AbsoluteFill style={{justifyContent: 'center', padding: pad}}>
      <div style={{display: 'flex', flexDirection: isVertical ? 'column' : 'row', gap: 56 * u, alignItems: 'center'}}>
        <Reveal delay={0} from="left" distance={80}>
          <div style={{width: posterW, height: posterH, borderRadius: 18 * u, overflow: 'hidden', background: brand.panel, boxShadow: '0 30px 60px rgba(0,0,0,0.5)', border: `1px solid ${brand.text}22`, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
            {p.src ? (
              <Img src={staticFile(p.src)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
            ) : (
              <div style={{color: brand.muted, fontSize: 28 * u, textAlign: 'center', padding: 24 * u}}>Poster{p.title ? <div style={{marginTop: 10 * u, color: brand.text, fontWeight: 800, fontSize: 36 * u}}>{p.title}</div> : null}</div>
            )}
          </div>
        </Reveal>
        <div style={{flex: 1}}>
          <Reveal delay={6} distance={50}>
            <div style={{fontSize: (isVertical ? 64 : 84) * u, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2 * u}}>{p.title ?? scene.narration}</div>
          </Reveal>
          {p.tagline ? (
            <Reveal delay={12}>
              <div style={{fontSize: 34 * u, color: brand.accent2, marginTop: 18 * u, fontStyle: 'italic'}}>{p.tagline}</div>
            </Reveal>
          ) : null}
          <div style={{marginTop: 36 * u, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 32 * u, rowGap: 14 * u}}>
            {rows
              .filter(([, v]) => v)
              .map(([k, v], i) => (
                <React.Fragment key={k}>
                  <Reveal delay={16 + i * 4} from="none">
                    <div style={{fontSize: 26 * u, color: brand.muted, letterSpacing: 2, textTransform: 'uppercase', paddingTop: 6 * u}}>{k}</div>
                  </Reveal>
                  <Reveal delay={16 + i * 4} from="none">
                    <div style={{fontSize: 34 * u, fontWeight: 600}}>{v}</div>
                  </Reveal>
                </React.Fragment>
              ))}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
