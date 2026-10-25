import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';

export type Transition = 'cut' | 'whip' | 'fade' | 'push' | 'wipe' | 'slide'; // wipe and slide are the board's own, done in Video.tsx: the scene itself just shows

const easeOutBack = (p: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

/**
 * Scene entrance/exit.
 * Toon 'cut': a hard cut with a 4-frame settle (no cross-fade, which reads as "slideshow").
 * Toon 'whip': the outgoing drawing is yanked off one side in its last frames and the new one is yanked in from the other side with a stretch.
 * Glossy 'push': the new scene rises in and settles while the old one lifts away and fades; 'fade' is a plain fade.
 */
export const SceneFade: React.FC<{durationInFrames: number; toon?: boolean; transition?: Transition; dir?: 1 | -1; children: React.ReactNode}> = ({durationInFrames, toon, transition, dir = 1, children}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const mode: Transition = transition ?? (toon ? 'cut' : 'fade');
  if (mode === 'whip' && durationInFrames > 20) {
    const inLen = 7;
    const outLen = 4;
    const f2 = Math.floor(frame / 2) * 2;
    if (f2 < inLen) {
      const p = easeOutBack(f2 / inLen);
      const x = (1 - p) * width * 0.7 * dir;
      const stretch = 1 + (1 - Math.min(1, f2 / inLen)) * 0.5;
      return <AbsoluteFill style={{transform: `translateX(${x}px) scaleX(${stretch})`, transformOrigin: '50% 50%'}}>{children}</AbsoluteFill>;
    }
    const left = durationInFrames - frame;
    if (left <= outLen) {
      const p = 1 - left / outLen;
      const x = -p * p * width * 0.6 * dir;
      const stretch = 1 + p * 0.5;
      return <AbsoluteFill style={{transform: `translateX(${x}px) scaleX(${stretch})`, transformOrigin: '50% 50%'}}>{children}</AbsoluteFill>;
    }
    return <AbsoluteFill>{children}</AbsoluteFill>;
  }
  if (mode === 'wipe' || mode === 'slide') return <AbsoluteFill>{children}</AbsoluteFill>;
  if (mode === 'cut') {
    const s = interpolate(frame, [0, 2, 5], [1.04, 0.985, 1], {extrapolateRight: 'clamp'});
    return <AbsoluteFill style={{transform: `scale(${s})`, transformOrigin: '50% 60%'}}>{children}</AbsoluteFill>;
  }
  if (mode === 'push' && durationInFrames > 24) {
    const inLen = 12;
    const outLen = 9;
    const left = durationInFrames - frame;
    if (frame < inLen) {
      const p = easeOut(frame / inLen);
      const y = (1 - p) * height * 0.05 * dir;
      return <AbsoluteFill style={{opacity: Math.min(1, frame / 7), transform: `translateY(${y}px) scale(${0.975 + p * 0.025})`, transformOrigin: '50% 50%'}}>{children}</AbsoluteFill>;
    }
    if (left <= outLen) {
      const p = 1 - left / outLen;
      return <AbsoluteFill style={{opacity: 1 - easeOut(p), transform: `translateY(${-p * height * 0.03 * dir}px) scale(${1 + p * 0.02})`, transformOrigin: '50% 50%'}}>{children}</AbsoluteFill>;
    }
    return <AbsoluteFill>{children}</AbsoluteFill>;
  }
  const fadeLen = Math.min(10, Math.floor(durationInFrames / 3));
  const opacity = interpolate(frame, [0, fadeLen, Math.max(fadeLen + 1, durationInFrames - fadeLen), durationInFrames], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return <AbsoluteFill style={{opacity}}>{children}</AbsoluteFill>;
};
