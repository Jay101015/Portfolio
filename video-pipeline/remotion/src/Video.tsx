import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene, Storyboard} from './types';
import {presets} from './theme';
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
import {defaultAvatar, type AvatarConfig, type Pose} from './avatar/Avatar';

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

/** Where the character stands if the script does not say. */
const defaultPos = (type: Scene['type']): AvatarPos => {
  switch (type) {
    case 'avatar':
      return 'side-left';
    case 'clip':
    case 'still':
    case 'image':
    case 'poster':
    case 'score':
    case 'compare':
    case 'quote':
      return 'corner-right';
    case 'title':
    case 'outro':
      return 'side-right';
    default:
      return 'none';
  }
};

const MouthDriven: React.FC<{sb: Storyboard; scene: Scene; avatar: AvatarConfig}> = ({sb, scene, avatar}) => {
  // AvatarLayer sits inside the Sequence (local frame for its pop-in) but blinks/talks on the global clock.
  const local = useCurrentFrame();
  const {fps} = useVideoConfig();
  const globalFrame = Math.round(scene.start * fps) + local;
  const mouth = sb.mouth?.[globalFrame] ?? 0;
  const pos: AvatarPos = scene.props.pos ?? defaultPos(scene.type);
  const pose: Pose = scene.props.pose ?? (scene.type === 'score' ? 'thumbsup' : scene.type === 'title' ? 'wave' : 'idle');
  return <AvatarLayer config={avatar} pose={pose} pos={pos} mouth={mouth} globalFrame={globalFrame} scale={scene.props.scale ? Number(scene.props.scale) : 1} />;
};

export const Video: React.FC<Storyboard> = (sb) => {
  const {fps} = useVideoConfig();
  const brand: Brand = {...(presets[sb.theme ?? 'movie'] ?? presets.movie), ...(sb.brand ?? {})};
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
            <SceneFade durationInFrames={dur}>
              <SceneSwitch scene={scene} brand={brand} />
              <MouthDriven sb={sb} scene={scene} avatar={avatar} />
            </SceneFade>
          </Sequence>
        );
      })}
      <Chrome brand={brand} durationSec={sb.durationSec} />
      {sb.captions ? <Captions scenes={sb.scenes} brand={brand} /> : null}
    </AbsoluteFill>
  );
};
