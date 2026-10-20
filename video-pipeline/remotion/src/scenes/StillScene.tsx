import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene} from '../types';
import {Reveal} from '../components/Reveal';
import {useLayout} from '../components/layout';
import {CreditTag} from '../components/CreditTag';
import {Frame} from '../components/Frame';

/** A movie still with a slow push-in. Toon: pinned inside a drawn frame beside the host. */
export const StillScene: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, width, isVertical} = useLayout();
  const total = Math.max(1, (scene.end - scene.start) * fps);
  const zoomOut = scene.props.zoom === 'out';
  const scale = interpolate(frame, [0, total], zoomOut ? [1.12, 1.0] : [1.0, 1.12], {extrapolateRight: 'clamp'});
  const src: string | undefined = scene.props.src;
  const caption: string | undefined = scene.props.caption;
  const img = src ? (
    <Img src={staticFile(src)} style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale})`}} />
  ) : (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', background: '#222', color: '#aaa', fontSize: 28 * u, textAlign: 'center', padding: 30 * u}}>
      still placeholder{scene.props.prompt ? `: ${scene.props.prompt}` : ''}
    </AbsoluteFill>
  );
  if (brand.toon) {
    const w = isVertical ? width - pad * 1.2 : width * 0.56;
    const h = (w * 9) / 16;
    return (
      <AbsoluteFill style={{justifyContent: isVertical ? 'flex-start' : 'center', alignItems: isVertical ? 'center' : 'flex-end', padding: pad, paddingTop: isVertical ? pad * 1.6 : pad}}>
        <Reveal delay={0} from="right" distance={60}>
          <Frame brand={brand} width={w} height={h} tilt={isVertical ? -1 : 1.5} credit={scene.props.credit} label={caption}>
            <div style={{width: '100%', height: '100%', overflow: 'hidden'}}>{img}</div>
          </Frame>
        </Reveal>
      </AbsoluteFill>
    );
  }
  if (!brand.toon && !isVertical) {
    // Motion-graphics look: the picture sits in a framed card in the middle of the frame, with the caption as a pill on it.
    const w = width * 0.72;
    const h = (w * 9) / 16;
    return (
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', padding: pad}}>
        <Reveal delay={0} from="up" distance={50}>
          <div style={{width: w, height: h, borderRadius: 32 * u, overflow: 'hidden', position: 'relative', background: '#111', border: `1px solid ${brand.text}22`, boxShadow: `0 ${30 * u}px ${90 * u}px rgba(0,0,0,0.55)`}}>
            {img}
            {caption ? (
              <div style={{position: 'absolute', left: 32 * u, bottom: 32 * u, background: brand.accent, color: brand.bg, fontFamily: brand.display, fontWeight: 700, fontSize: 40 * u, padding: `${10 * u}px ${26 * u}px`, borderRadius: 14 * u}}>{caption}</div>
            ) : null}
            {scene.props.credit ? <div style={{position: 'absolute', right: 24 * u, bottom: 20 * u, fontSize: 22 * u, color: '#fff', opacity: 0.8, textShadow: '0 1px 6px rgba(0,0,0,0.8)'}}>{scene.props.credit}</div> : null}
          </div>
        </Reveal>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{overflow: 'hidden'}}>{img}</AbsoluteFill>
      <AbsoluteFill style={{background: `linear-gradient(180deg, rgba(0,0,0,0.2) 0%, transparent 30%, transparent 65%, ${brand.bg}dd 100%)`}} />
      <CreditTag brand={brand} credit={scene.props.credit} />
      {caption ? (
        <AbsoluteFill style={{justifyContent: 'flex-end', padding: pad, paddingBottom: pad * 1.2}}>
          <Reveal delay={8}>
            <div style={{fontSize: 56 * u, fontWeight: 800, maxWidth: '62%', lineHeight: 1.1, textShadow: '0 4px 24px rgba(0,0,0,0.7)'}}>{caption}</div>
          </Reveal>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
