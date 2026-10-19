import React from 'react';
import {AbsoluteFill, OffthreadVideo, staticFile, useVideoConfig} from 'remotion';
import type {Brand, Scene} from '../types';
import {Reveal} from '../components/Reveal';
import {useLayout} from '../components/layout';
import {CreditTag} from '../components/CreditTag';

/** Footage cutaway. Narration keeps playing; the clip's own audio is ducked (vol) or muted. */
export const ClipScene: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  const {fps} = useVideoConfig();
  const {u, pad} = useLayout();
  const src: string | undefined = scene.props.src;
  const from = Number(scene.props.from ?? 0);
  const vol = Number(scene.props.vol ?? 0);
  const caption: string | undefined = scene.props.caption;
  return (
    <AbsoluteFill>
      {src ? (
        <OffthreadVideo
          src={staticFile(src)}
          startFrom={Math.round(from * fps)}
          volume={vol}
          muted={vol <= 0}
          style={{width: '100%', height: '100%', objectFit: 'cover'}}
        />
      ) : (
        <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
          <div style={{border: `2px dashed ${brand.muted}`, borderRadius: 24 * u, padding: 40 * u, color: brand.muted, fontSize: 30 * u}}>
            Footage placeholder: drop the file in media/ and set src=
          </div>
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{background: `linear-gradient(180deg, rgba(0,0,0,0.25) 0%, transparent 25%, transparent 70%, ${brand.bg}cc 100%)`}} />
      <CreditTag brand={brand} credit={scene.props.credit} />
      {caption ? (
        <AbsoluteFill style={{justifyContent: 'flex-end', padding: pad, paddingBottom: pad * 1.15}}>
          <Reveal delay={8}>
            <div style={{display: 'inline-block', alignSelf: 'flex-start', background: brand.accent, color: '#fff', fontWeight: 800, fontSize: 40 * u, padding: `${12 * u}px ${26 * u}px`, borderRadius: 12 * u, maxWidth: '60%'}}>
              {caption}
            </div>
          </Reveal>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
