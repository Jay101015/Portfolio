import React from 'react';
import {AbsoluteFill, Audio, Freeze, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
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
import {Arrow, SketchPath} from './paper/sketch';
import {FACES, POSES, defaultAvatar, defaultFaceFor, type AvatarConfig, type Face, type Pose} from './avatar/Avatar';

const SceneSwitch: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  if (['bite', 'grow', 'pie', 'shrink', 'takeaway', 'recap'].includes(scene.type)) return <PaperSwitch scene={scene} brand={brand} />; // the money pictures and the takeaway cards are drawn the same in every look
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
import {Erase} from './paper/erase';
import {isTraced, pickArtAmong} from './paper/art';

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
  if (keepMode(scene)) return 'cut'; // building on the last board: nothing wipes
  if (asked === 'cut' || asked === 'whip' || asked === 'fade' || asked === 'push') return asked;
  if (asked === 'wipe' || asked === 'slide') return toon ? 'cut' : asked;
  if (!toon) return scene.start === 0 ? 'fade' : 'push';
  if (scene.start === 0) return 'cut';
  return ['clip', 'still', 'image', 'poster', 'score', 'compare', 'chart', 'quote', 'stat'].includes(scene.type) ? 'whip' : 'cut';
};

/** A Short's hook: the one line pinned at the top of the frame, big, on a marker highlight, there from the first
 * frame so the viewer who scrolls in knows what this is before anyone speaks. */
const HookBanner: React.FC<{text: string; brand: Brand}> = ({text, brand}) => {
  const {width, height} = useVideoConfig();
  const u = width / 1080;
  const vertical = height > width;
  const size = (vertical ? 64 : 48) * u;
  return (
    <div style={{position: 'absolute', left: 0, right: 0, top: vertical ? height * 0.085 : height * 0.04, display: 'flex', justifyContent: 'center', padding: `0 ${40 * u}px`, pointerEvents: 'none'}}>
      <div style={{fontFamily: brand.display, fontWeight: 800, fontSize: size, lineHeight: 1.15, color: brand.ink, textAlign: 'center', background: brand.marker ?? '#fff176', padding: `${10 * u}px ${22 * u}px`, borderRadius: 8 * u, boxShadow: `0 ${4 * u}px ${12 * u}px rgba(0,0,0,0.12)`, transform: 'rotate(-1deg)', maxWidth: '92%', boxDecorationBreak: 'clone'}}>
        {text}
      </div>
    </div>
  );
};

/** The board's own transitions. `wipe`: the last board clears (its writing and drawing fade off in the last half
 * second) and the new scene starts on a clean board. `slide`: the board slides along, the last drawing leaving on the
 * left as the new one comes in from the right, like a camera moving down a long whiteboard. In the illustrated style
 * they are the default: the board clears after a scene with a person on it, slides after plain words; `transition=`
 * on a scene picks. */
const WIPE_FRAMES = (fps: number) => Math.round(fps * 0.5);
const SLIDE_FRAMES = (fps: number) => Math.round(fps * 0.55);
const sceneArt = (scene: Scene, brand: Brand): string | undefined => {
  const p = scene.props;
  if (scene.type === 'art') return p.name;
  if (p.sticker || p.icon || p.art === 'off') return undefined;
  if (p.art) return p.art;
  return brand.illustrated ? pickArtAmong(isTraced, p.title, p.headline, p.subtitle, p.label, p.sub, scene.narration) : undefined;
};
const boardTransition = (scene: Scene, prev: Scene | null, brand: Brand): Transition => {
  const asked = scene.props.transition;
  if (asked === 'wipe' || asked === 'slide') return brand.board && prev ? asked : 'cut';
  if (!brand.board || !brand.illustrated || !prev || asked || keepMode(scene)) return transitionFor(scene, brand.toon);
  if (scene.type === 'outro') return 'cut';
  if (['takeaway', 'recap'].includes(scene.type) || prev.type === 'takeaway') return 'wipe'; // a card gets a clean board and leaves one; the recap starts clean
  const had = sceneArt(prev, brand);
  return had && isTraced(had) ? 'wipe' : 'slide';
};

/** The last board, finished, sliding off to the left as the new one comes in (outside the pen's scene wrapper). */
const SlideOut: React.FC<{prev: Scene; brand: Brand}> = ({prev, brand}) => {
  const frame = useCurrentFrame();
  const {fps, width} = useVideoConfig();
  const n = SLIDE_FRAMES(fps);
  if (frame >= n) return null;
  const p = easeInOut(frame / n);
  const last = Math.max(0, Math.round((prev.end - prev.start) * fps) - 1);
  return (
    <AbsoluteFill style={{transform: `translateX(${-p * width}px)`, pointerEvents: 'none'}}>
      <Freeze frame={last}>
        <SceneSwitch scene={prev} brand={brand} />
        <Sticker scene={prev} brand={brand} />
        <ArtLayer scene={prev} brand={brand} />
      </Freeze>
    </AbsoluteFill>
  );
};
const SlideIn: React.FC<{children: React.ReactNode}> = ({children}) => {
  const frame = useCurrentFrame();
  const {fps, width} = useVideoConfig();
  const n = SLIDE_FRAMES(fps);
  const p = frame >= n ? 1 : easeInOut(frame / n);
  return <AbsoluteFill style={{transform: `translateX(${(1 - p) * width}px)`}}>{children}</AbsoluteFill>;
};
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

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

/** `keep=yes|arrow|strike` on a scene: the board before it stays, small, top left, and this scene is drawn beside it */
const keepMode = (scene: Scene): '' | 'yes' | 'arrow' | 'strike' => {
  const k = String(scene.props.keep ?? '').toLowerCase();
  if (k === 'arrow' || k === 'strike') return k;
  return ['yes', 'true', '1', 'on', 'build'].includes(k) ? 'yes' : '';
};
const KEPT = {x: 0.03, y: 0.05, scale: 0.45}; // where the last board sits
const NEW = {x: 0.44, y: 0.3, scale: 0.58}; // where this scene draws

/** The last board, finished, kept small in the corner while the next thing is drawn beside it; struck through or
 * pointed at when asked. Outside the pen's scene wrapper, so the hand does not retrace it. */
const KeptBoard: React.FC<{prev: Scene; brand: Brand; mode: 'yes' | 'arrow' | 'strike'}> = ({prev, brand, mode}) => {
  const {fps, width, height} = useVideoConfig();
  const u = width / 1920;
  const last = Math.max(0, Math.round((prev.end - prev.start) * fps) - 1);
  const bx = KEPT.x * width;
  const by = KEPT.y * height;
  const bw = KEPT.scale * width;
  const bh = KEPT.scale * height;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <AbsoluteFill style={{left: bx, top: by, width, height, transform: `scale(${KEPT.scale})`, transformOrigin: '0 0'}}>
        <Freeze frame={last}>
          <SceneSwitch scene={prev} brand={brand} />
          <Sticker scene={prev} brand={brand} />
          <ArtLayer scene={prev} brand={brand} />
        </Freeze>
      </AbsoluteFill>
      {mode === 'strike' ? (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
          <SketchPath d={`M${bx + bw * 0.08},${by + bh * 0.3} L${bx + bw * 0.92},${by + bh * 0.72}`} win={[6, 6 + Math.round(fps * 0.5)]} options={{stroke: brand.accent2, strokeWidth: 14 * u, seed: 5 + prev.id, roughness: 1.6}} />
          <SketchPath d={`M${bx + bw * 0.1},${by + bh * 0.7} L${bx + bw * 0.9},${by + bh * 0.32}`} win={[6 + Math.round(fps * 0.5), 6 + fps]} options={{stroke: brand.accent2, strokeWidth: 14 * u, seed: 9 + prev.id, roughness: 1.6}} />
        </svg>
      ) : null}
      {mode === 'arrow' ? (
        <div style={{position: 'absolute', left: bx + bw * 0.98, top: by + bh * 0.9}}>
          <Arrow length={0.1 * width} stroke={brand.accent2} win={[6, 6 + Math.round(fps * 0.6)]} angle={22} seed={3 + prev.id} thickness={7 * u} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

export const Video: React.FC<Storyboard> = (sb) => {
  const {fps, width, height} = useVideoConfig();
  const flags = (sb.brand ?? {}) as Record<string, unknown>;
  const brand: Brand = {
    ...(presets[sb.theme ?? 'toon'] ?? presets.toon),
    ...(sb.brand ?? {}),
    autoArt: String(flags.doodles ?? 'off').toLowerCase() === 'on',
    corner: ['on', 'yes', 'true', '1'].includes(String(flags.corner ?? 'off').toLowerCase()), // the channel name in the corner only when asked for
    fullText: String(flags.text ?? 'key').toLowerCase() === 'full',
    illustrated: String(flags.style ?? 'icons').toLowerCase() === 'illustrated',
  };
  const avatar: AvatarConfig = {...defaultAvatar, ...(sb.avatar ?? {})};
  return (
    <AbsoluteFill style={{backgroundColor: brand.bg, fontFamily: brand.font, color: brand.text}}>
      <Background brand={brand} />
      <SketchFilterDefs />
      {sb.audio ? <Audio src={staticFile(sb.audio)} /> : null}
      {sb.scenes.map((scene, idx) => {
        const from = Math.round(scene.start * fps);
        const dur = Math.max(1, Math.round((scene.end - scene.start) * fps));
        const prev = idx > 0 ? sb.scenes[idx - 1] : null;
        const next = idx + 1 < sb.scenes.length ? sb.scenes[idx + 1] : null;
        const keep = prev ? keepMode(scene) : '';
        const tr = boardTransition(scene, prev, brand);
        const wipeOut = next ? boardTransition(next, scene, brand) === 'wipe' : false; // this board clears at the end
        const wipeFrames = Math.min(WIPE_FRAMES(fps), Math.floor(dur / 2));
        let board = (
          <AbsoluteFill data-pen-scene={scene.id} data-pen-from={from} style={keep ? {left: NEW.x * width, top: NEW.y * height, transform: `scale(${NEW.scale})`, transformOrigin: '0 0'} : undefined}>
            {wipeOut ? (
              <Erase win={[dur - wipeFrames, dur]} brand={brand} width={width} height={height}>
                <SceneSwitch scene={scene} brand={brand} />
                <Sticker scene={scene} brand={brand} />
                <ArtLayer scene={scene} brand={brand} />
              </Erase>
            ) : (
              <>
                <SceneSwitch scene={scene} brand={brand} />
                <Sticker scene={scene} brand={brand} />
                <ArtLayer scene={scene} brand={brand} />
              </>
            )}
          </AbsoluteFill>
        );
        if (tr === 'slide' && prev) board = <SlideIn>{board}</SlideIn>;
        return (
          <Sequence key={scene.id} from={from} durationInFrames={dur} name={`${scene.id} ${scene.type}`}>
            <SceneFade durationInFrames={dur} toon={brand.toon} transition={tr} dir={scene.id % 2 ? 1 : -1}>
              <Camera scene={scene} toon={brand.toon}>
                {keep && prev ? <KeptBoard prev={prev} brand={brand} mode={keep} /> : null}
                {tr === 'slide' && prev ? <SlideOut prev={prev} brand={brand} /> : null}
                {board}
                {sb.host === 'none' ? null : <HostLayer sb={sb} scene={scene} avatar={avatar} toon={brand.toon} />}
              </Camera>
            </SceneFade>
          </Sequence>
        );
      })}
      {sb.hook ? <HookBanner text={sb.hook} brand={brand} /> : null}
      <Chrome brand={brand} durationSec={sb.durationSec} />
      {sb.captions ? <Captions scenes={sb.scenes} brand={brand} host={sb.host} always={!!sb.short} /> : null}
      {brand.board && sb.hand ? <PenHand brand={brand} /> : null}
    </AbsoluteFill>
  );
};
