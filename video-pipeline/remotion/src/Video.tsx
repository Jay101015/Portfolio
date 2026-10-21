import React from 'react';
import {AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene, Storyboard} from './types';
import {presets} from './theme';
import './fonts';
import {Background} from './components/Background';
import {Chrome} from './components/Chrome';
import {Captions} from './components/Captions';
import {SceneFade, type Transition} from './components/SceneFade';
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
import {PaperSwitch, Sticker} from './paper/scenes';
import {SketchFilterDefs} from './paper/media';
import {PenHand} from './paper/write';
import {ArtLayer} from './paper/art';
import {FACES, POSES, defaultAvatar, defaultFaceFor, type AvatarConfig, type Face, type Pose} from './avatar/Avatar';

const SceneSwitch: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  if (brand.paper && ['title', 'stat', 'text', 'list', 'compare', 'chart', 'quote', 'outro', 'still', 'image', 'clip', 'art'].includes(scene.type)) return <PaperSwitch scene={scene} brand={brand} />;
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

type Resolved = {pose: Pose; face?: Face; prevPose: Pose; prevFace: Face; changedAt: number};

/** Resolve pose/face at an absolute time: scene defaults, then every {cue} spoken so far. Also what it was before the last change, for the tween. */
export const resolveAvatar = (scene: Scene, t: number): Resolved => {
  let pose: Pose = isPose(scene.props.pose) ? scene.props.pose : scene.type === 'score' ? 'thumbsup' : scene.type === 'title' ? 'wave' : 'idle';
  let face: Face | undefined = isFace(scene.props.face) ? scene.props.face : undefined;
  let prevPose = pose;
  let prevFace: Face = face ?? defaultFaceFor(pose);
  let changedAt = scene.start;
  for (const cue of scene.cues ?? []) {
    if (cue.t > t) break;
    const hadPose = pose;
    const hadFace = face ?? defaultFaceFor(pose);
    let changed = false;
    if (isPose(cue.pose)) {
      pose = cue.pose;
      face = undefined;
      changed = true;
    }
    if (isFace(cue.face)) {
      face = cue.face;
      changed = true;
    }
    if (changed) {
      prevPose = hadPose;
      prevFace = hadFace;
      changedAt = cue.t;
    }
  }
  return {pose, face, prevPose, prevFace, changedAt};
};

/** Which scenes get a whip-pan in (the "look at this" scenes); the rest hard cut. */
const transitionFor = (scene: Scene, toon: boolean): Transition => {
  const asked = scene.props.transition;
  if (asked === 'cut' || asked === 'whip' || asked === 'fade' || asked === 'push') return asked;
  if (!toon) return scene.start === 0 ? 'fade' : 'push';
  if (scene.start === 0) return 'cut';
  return ['clip', 'still', 'image', 'poster', 'score', 'compare', 'chart', 'quote', 'stat'].includes(scene.type) ? 'whip' : 'cut';
};

/** Camera moves on the big reactions: a punch-in on shock, a shake on anger, a bounce on a laugh. */
const Camera: React.FC<{scene: Scene; toon: boolean; children: React.ReactNode}> = ({scene, toon, children}) => {
  const local = useCurrentFrame();
  const {fps, width} = useVideoConfig();
  const t = scene.start + local / fps;
  const {pose, changedAt} = resolveAvatar(scene, t);
  const since = Math.max(0, Math.round((t - changedAt) * fps));
  const s2 = Math.floor(since / 2) * 2;
  let transform = '';
  if (toon && since < 30) {
    const pos = hostPosFor(scene, toon);
    const ox = pos === 'side-left' || pos === 'corner-left' ? '30%' : pos === 'full' ? '50%' : '70%';
    if (pose === 'shocked') {
      const z = interpolate(s2, [0, 3, 22, 28], [1, 1.09, 1.09, 1], {extrapolateRight: 'clamp'});
      transform = `scale(${z})`;
      return <AbsoluteFill style={{transform, transformOrigin: `${ox} 55%`}}>{children}</AbsoluteFill>;
    }
    if (pose === 'crossed' && since < 12) {
      const a = (1 - since / 12) * width * 0.006;
      transform = `translate(${Math.sin(since * 2.9) * a}px, ${Math.cos(since * 2.3) * a * 0.5}px)`;
      return <AbsoluteFill style={{transform}}>{children}</AbsoluteFill>;
    }
    if (pose === 'laugh') {
      const z = 1 + Math.abs(Math.sin(s2 / 4)) * 0.015;
      return <AbsoluteFill style={{transform: `scale(${z})`, transformOrigin: `${ox} 70%`}}>{children}</AbsoluteFill>;
    }
  }
  return <AbsoluteFill>{children}</AbsoluteFill>;
};

const HostLayer: React.FC<{sb: Storyboard; scene: Scene; avatar: AvatarConfig; toon: boolean}> = ({sb, scene, avatar, toon}) => {
  const local = useCurrentFrame();
  const {fps} = useVideoConfig();
  const globalFrame = Math.round(scene.start * fps) + local;
  const t = globalFrame / fps;
  const f2 = Math.floor(globalFrame / 2) * 2; // the mouth is drawn on twos
  const mouth = sb.mouth?.[f2] ?? 0;
  const viseme = sb.visemes?.[f2] ?? 0;
  // smoothed "is talking" over the last half second, so gestures start a beat after the voice does
  let talk = 0;
  if (sb.mouth) {
    const win = Math.round(fps * 0.5);
    let sum = 0;
    for (let i = globalFrame - win; i <= globalFrame; i++) sum += sb.mouth[i] ?? 0;
    talk = Math.min(1, (sum / (win + 1)) * 2.5);
  }
  const pos: AvatarPos = hostPosFor(scene, toon);
  const {pose, face, prevPose, prevFace, changedAt} = resolveAvatar(scene, t);
  const sinceChange = Math.max(0, Math.round((t - changedAt) * fps));
  const attention = ['clip', 'still', 'image', 'poster', 'chart', 'compare'].includes(scene.type) ? 0.7 : 0.3;
  return (
    <AvatarLayer
      config={avatar}
      pose={pose}
      face={face}
      prevPose={prevPose}
      prevFace={prevFace}
      pos={pos}
      mouth={mouth}
      viseme={viseme}
      talk={talk}
      attention={attention}
      globalFrame={globalFrame}
      sinceChange={sinceChange}
      scale={scene.props.scale ? Number(scene.props.scale) : 1}
      toon={toon}
      art={sb.host === 'drawn' ? 'drawn' : 'painted'}
    />
  );
};

export const Video: React.FC<Storyboard> = (sb) => {
  const {fps} = useVideoConfig();
  const brand: Brand = {...(presets[sb.theme ?? 'toon'] ?? presets.toon), ...(sb.brand ?? {})};
  const avatar: AvatarConfig = {...defaultAvatar, ...(sb.avatar ?? {})};
  return (
    <AbsoluteFill style={{backgroundColor: brand.bg, fontFamily: brand.font, color: brand.text}}>
      <Background brand={brand} />
      <SketchFilterDefs />
      {sb.audio ? <Audio src={staticFile(sb.audio)} /> : null}
      {sb.scenes.map((scene) => {
        const from = Math.round(scene.start * fps);
        const dur = Math.max(1, Math.round((scene.end - scene.start) * fps));
        return (
          <Sequence key={scene.id} from={from} durationInFrames={dur} name={`${scene.id} ${scene.type}`}>
            <SceneFade durationInFrames={dur} toon={brand.toon} transition={transitionFor(scene, brand.toon)} dir={scene.id % 2 ? 1 : -1}>
              <Camera scene={scene} toon={brand.toon}>
                <AbsoluteFill data-pen-scene={scene.id} data-pen-from={from}>
                  <SceneSwitch scene={scene} brand={brand} />
                  <Sticker scene={scene} brand={brand} />
                  <ArtLayer scene={scene} brand={brand} />
                </AbsoluteFill>
                {sb.host === 'none' ? null : <HostLayer sb={sb} scene={scene} avatar={avatar} toon={brand.toon} />}
              </Camera>
            </SceneFade>
          </Sequence>
        );
      })}
      <Chrome brand={brand} durationSec={sb.durationSec} />
      {sb.captions ? <Captions scenes={sb.scenes} brand={brand} host={sb.host} /> : null}
      {brand.board ? <PenHand brand={brand} /> : null}
    </AbsoluteFill>
  );
};
