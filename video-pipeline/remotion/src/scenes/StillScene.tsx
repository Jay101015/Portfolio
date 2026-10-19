import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene} from '../types';
import {Reveal} from '../components/Reveal';
import {useLayout} from '../components/layout';
import {CreditTag} from '../components/CreditTag';

/** A movie still (or any image) with a slow push-in; the character reacts from the corner. */
export const StillScene: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad} = useLayout();
  const total = Math.max(1, (scene.end - scene.start) * fps);
  const zoomOut = scene.props.zoom === 'out';
  const scale = interpolate(frame, [0, total], zoomOut ? [1.12, 1.0] : [1.0, 1.12], {extrapolateRight: 'clamp'});
  const src: string | undefined = scene.props.src;
  const caption: string | undefined = scene.props.caption;
  return (
    <AbsoluteFill>
      {src ? (
        <AbsoluteFill style={{overflow: 'hidden'}}>
          <Img src={staticFile(src)} style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale})`}} />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', padding: pad}}>
          <div style={{border: `2px dashed ${brand.muted}`, borderRadius: 24 * u, padding: 40 * u, color: brand.muted, fontSize: 30 * u, textAlign: 'center'}}>
            Still placeholder{scene.props.prompt ? <div style={{fontSize: 24 * u, marginTop: 12 * u}}>prompt: {scene.props.prompt}</div> : null}
          </div>
        </AbsoluteFill>
      )}
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
