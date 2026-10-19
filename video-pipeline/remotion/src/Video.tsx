import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene, Storyboard} from './types';
import {presets} from './theme';
import './fonts';
import {Background} from './components/Background';
import {Chrome} from './components/Chrome';
import {Captions} from './components/Captions';
import {SceneFade} from './components/SceneFade';
import {TitleScene} from './scenes/TitleScene';
import {TextScene} from './scenes/TextScene';
import {StatScene} from './scenes/StatScene';
import {ListScene} from './scenes/ListScene';
import {ChartScene} from './scenes/ChartScene';
import {CompareScene} from './scenes/CompareScene';
import {QuoteScene} from './scenes/QuoteScene';
import {StillScene} from './scenes/StillScene';
import {ClipScene} from './scenes/ClipScene';
import {PosterScene} from './scenes/PosterScene';
import {ScoreScene} from './scenes/ScoreScene';
import {AvatarScene} from './scenes/AvatarScene';
import {OutroScene} from './scenes/OutroScene';
import {AvatarLayer, type AvatarPos} from './avatar/AvatarLayer';
import {FACES, POSES, defaultAvatar, type AvatarConfig, type Face, type Pose} from './avatar/Avatar';

const SceneSwitch: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  switch (scene.type) {
    case 'title':
      return <TitleScene scene={scene} brand={brand} />;
    case 'stat':
      return <StatScene scene={scene} brand={brand} />;
    case 'list':
      return <ListScene scene={scene} brand={brand} />;
    case 'chart':
      return <ChartScene scene={scene} brand={brand} />;
    case 'compare':
      return <CompareScene scene={scene} brand={brand} />;
    case 'quote':
      return <QuoteScene scene={scene} brand={brand} />;
    case 'image':
    case 'still':
      return <StillScene scene={scene} brand={brand} />;
    case 'clip':
      return <ClipScene scene={scene} brand={brand} />;
    case 'poster':
      return <PosterScene scene={scene} brand={brand} />;
    case 'score':
      return <ScoreScene scene={scene} brand={brand} />;
    case 'avatar':
      return <AvatarScene scene={scene} brand={brand} />;
    case 'outro':
      return <OutroScene scene={scene} brand={brand} />;
    case 'text':
    default:
      return <TextScene scene={scene} brand={brand} />;
  }
};

import {hostPosFor} from './hostPos';

const isPose = (s: unknown): s is Pose => typeof s === 'string' && (POSES as string[]).includes(s);
const isFace = (s: unknown): s is Face => typeof s === 'string' && (FACES as string[]).includes(s);

/** Resolve pose/face at an absolute time: scene defaults, then every {cue} spoken so far. */
export const resolveAvatar = (scene: Scene, t: number): {pose: Pose; face?: Face; changedAt: number} => {
  let pose: Pose = isPose(scene.props.pose) ? scene.props.pose : scene.type === 'score' ? 'thumbsup' : scene.type === 'title' ? 'wave' : 'idle';
  let face: Face | undefined = isFace(scene.props.face) ? scene.props.face : undefined;
  let changedAt = scene.start;
  for (const cue of scene.cues ?? []) {
    if (cue.t > t) break;
    if (isPose(cue.pose)) {
      pose = cue.pose;
      face = undefined;
      changedAt = cue.t;
    }
    if (isFace(cue.face)) {
      face = cue.face;
      changedAt = cue.t;
    }
  }
  return {pose, face, changedAt};
};

const HostLayer: React.FC<{sb: Storyboard; scene: Scene; avatar: AvatarConfig; toon: boolean}> = ({sb, scene, avatar, toon}) => {
  const local = useCurrentFrame();
  const {fps} = useVideoConfig();
  const globalFrame = Math.round(scene.start * fps) + local;
  const t = globalFrame / fps;
  const mouth = sb.mouth?.[globalFrame] ?? 0;
  const pos: AvatarPos = hostPosFor(scene, toon);
  const {pose, face, changedAt} = resolveAvatar(scene, t);
  const sinceChange = Math.max(0, Math.round((t - changedAt) * fps));
  return <AvatarLayer config={avatar} pose={pose} face={face} pos={pos} mouth={mouth} globalFrame={globalFrame} sinceChange={sinceChange} scale={scene.props.scale ? Number(scene.props.scale) : 1} toon={toon} />;
};

export const Video: React.FC<Storyboard> = (sb) => {
  const {fps} = useVideoConfig();
  const brand: Brand = {...(presets[sb.theme ?? 'toon'] ?? presets.toon), ...(sb.brand ?? {})};
  const avatar: AvatarConfig = {...defaultAvatar, ...(sb.avatar ?? {})};
  return (
    <AbsoluteFill style={{backgroundColor: brand.bg, fontFamily: brand.font, color: brand.text}}>
      <Background brand={brand} />
      {sb.audio ? <Audio src={staticFile(sb.audio)} /> : null}
      {sb.scenes.map((scene) => {
        const from = Math.round(scene.start * fps);
        const dur = Math.max(1, Math.round((scene.end - scene.start) * fps));
        return (
          <Sequence key={scene.id} from={from} durationInFrames={dur} name={`${scene.id} ${scene.type}`}>
            <SceneFade durationInFrames={dur} toon={brand.toon}>
              <SceneSwitch scene={scene} brand={brand} />
              <HostLayer sb={sb} scene={scene} avatar={avatar} toon={brand.toon} />
            </SceneFade>
          </Sequence>
        );
      })}
      <Chrome brand={brand} durationSec={sb.durationSec} />
      {sb.captions ? <Captions scenes={sb.scenes} brand={brand} /> : null}
    </AbsoluteFill>
  );
};
