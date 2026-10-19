import React from 'react';
import {AbsoluteFill, Loop, OffthreadVideo, staticFile, useVideoConfig} from 'remotion';
import type {Brand, Scene} from '../types';
import {Reveal} from '../components/Reveal';
import {useLayout} from '../components/layout';
import {CreditTag} from '../components/CreditTag';
import {Frame} from '../components/Frame';

/** Footage cutaway. Toon: inside a drawn screen with the host beside it. Glossy: full-bleed with a corner bust. */
export const ClipScene: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  const {fps} = useVideoConfig();
  const {u, pad, width, height, isVertical} = useLayout();
  const src: string | undefined = scene.props.src;
  const from = Number(scene.props.from ?? 0);
  const vol = Number(scene.props.vol ?? 0);
  const caption: string | undefined = scene.props.caption;
  // clipDur (seconds, from the build's ffprobe) keeps the player inside the file: a frame requested past the end never returns
  const clipDur = scene.props.clipDur ? Number(scene.props.clipDur) : undefined;
  const startFrom = Math.round(from * fps);
  const endAt = clipDur ? Math.max(startFrom + 1, Math.floor(clipDur * fps) - 2) : undefined;
  const player = <OffthreadVideo src={staticFile(src ?? '')} startFrom={startFrom} endAt={endAt} volume={vol} muted={vol <= 0} style={{width: '100%', height: '100%', objectFit: 'cover'}} />;
  const video = src ? (
    scene.props.loop && endAt ? <Loop durationInFrames={Math.max(1, endAt - startFrom)}>{player}</Loop> : player
  ) : (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', background: '#222', color: '#aaa', fontSize: 28 * u, textAlign: 'center', padding: 30 * u}}>
      footage placeholder: put the file in media/ and set src=
    </AbsoluteFill>
  );
  if (brand.toon) {
    const w = isVertical ? width - pad * 1.2 : width * 0.56;
    const h = (w * 9) / 16;
    return (
      <AbsoluteFill style={{justifyContent: isVertical ? 'flex-start' : 'center', alignItems: isVertical ? 'center' : 'flex-end', padding: pad, paddingTop: isVertical ? pad * 1.6 : pad}}>
        <Reveal delay={0} from="right" distance={60}>
          <Frame brand={brand} width={w} height={h} tilt={isVertical ? 1 : -1.5} credit={scene.props.credit} label={caption}>
            {video}
          </Frame>
        </Reveal>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill>
      {video}
      <AbsoluteFill style={{background: `linear-gradient(180deg, rgba(0,0,0,0.25) 0%, transparent 25%, transparent 70%, ${brand.bg}cc 100%)`}} />
      <CreditTag brand={brand} credit={scene.props.credit} />
      {caption ? (
        <AbsoluteFill style={{justifyContent: 'flex-end', padding: pad, paddingBottom: pad * 1.15}}>
          <Reveal delay={8}>
            <div style={{display: 'inline-block', alignSelf: 'flex-start', background: brand.accent, color: '#fff', fontWeight: 800, fontSize: 40 * u, padding: `${12 * u}px ${26 * u}px`, borderRadius: 12 * u, maxWidth: '60%'}}>{caption}</div>
          </Reveal>
        </AbsoluteFill>
      ) : null}
      <div style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>{void height}</div>
    </AbsoluteFill>
  );
};
