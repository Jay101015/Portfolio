// The character on a Short: held poses from the pose library (library/poses/manifest.json) that change on the words,
// in the house motion style (docs/pose-library.md "How he moves"): everything on twos, a new key pose lands with
// squash and stretch, happy poses land with a hop, in-between drawings play just before their pose, a jump is a
// crouch, a leap on an arc and a landing, and he jiggles slightly while he holds, like clay touched between frames.
// He stands at the foot of the frame under the captions, with a soft shadow, and steps out while footage plays.
import React from 'react';
import {Img, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {PoseCue, Scene} from '../types';
import manifest from '../../../library/poses/manifest.json';

type Entry = {name: string; w: number; h: number; foot_x: number; floor_y: number};
const BY_NAME: Record<string, Entry> = Object.fromEntries((manifest as Entry[]).map((e) => [e.name, e]));
const STAND_H = 800; // a standing figure in the saved poses, head to toe
const FOOTAGE = new Set(['broll', 'clip', 'still', 'image']);

// squash and stretch after a landing, two frames each: squash, stretch, a smaller squash, settled
const SQUASH: [number, number][] = [[1.08, 0.92], [0.95, 1.06], [1.02, 0.98]];
const squashAt = (age: number): [number, number] => SQUASH[Math.floor(age / 2)] ?? [1, 1];

// a small, steady random number for frame pair k (the jiggle), so a render and its preview agree
const rand = (k: number, salt: number) => {
  const x = Math.sin(k * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export const PoseLayer: React.FC<{poses: PoseCue[]; scenes: Scene[]}> = ({poses, scenes}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const q = frame - (frame % 2); // everything on twos
  const t = q / fps;
  const at = poses.filter((c) => c.t <= t + 1e-6);
  if (!at.length) return null;
  const cue = at[at.length - 1];
  const e = BY_NAME[cue.pose];
  if (!e) return null;
  // off while footage plays; back with a landing when the board returns
  const scene = scenes.find((s) => t >= s.start && t < s.end);
  if (scene && FOOTAGE.has(scene.type)) return null;
  const back = scene ? Math.max(cue.t, scene.start) : cue.t;
  const age = Math.round((t - back) * fps);

  const vertical = height > width;
  const figH = (vertical ? 0.28 : 0.42) * height;
  const s = figH / STAND_H;
  const footX = (vertical ? 0.76 : 0.82) * width;
  const floorY = (vertical ? 0.975 : 0.96) * height;

  let [sx, sy] = cue.ib ? [1, 1] : squashAt(age);
  let lift = 0;
  if (cue.hop && age < 8) lift = 0.06 * figH * Math.sin((Math.PI * age) / 8);
  if (cue.arc) {
    const p = Math.min(1, (t - cue.t + 1 / fps) / cue.arc);
    lift = 0.3 * figH * Math.sin(Math.PI * p);
    [sx, sy] = [1, 1];
  }
  // the dip before the next key pose (anticipation), unless an in-between is about to do that job
  const next = poses.find((c) => c.t > t + 1e-6);
  if (next && !next.ib && !cue.ib && (next.t - t) * fps <= 2) [sx, sy] = [1.03, 0.96];
  const k = Math.floor(frame / 2);
  const jx = (rand(k, 1) - 0.5) * 2.4, jy = (rand(k, 2) - 0.5) * 1.6, jr = (rand(k, 3) - 0.5) * 1.0;

  const w = e.w * s, h = e.h * s;
  const left = footX - e.foot_x * s;
  const top = floorY - e.floor_y * s;
  const shadowW = figH * 0.38 * Math.max(0.45, 1 - lift / (0.5 * figH));
  return (
    <div style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
      <div style={{position: 'absolute', left: footX - shadowW / 2, top: floorY - shadowW * 0.07, width: shadowW, height: shadowW * 0.14, borderRadius: '50%', background: 'rgba(29,29,31,0.22)', filter: `blur(${4 * (width / 1080)}px)`}} />
      <Img
        src={staticFile(`poses/solid/${cue.pose}.png`)}
        style={{
          position: 'absolute', left: left + jx, top: top - lift + jy, width: w, height: h,
          transformOrigin: `${e.foot_x * s}px ${e.floor_y * s}px`,
          transform: `rotate(${jr}deg) scale(${sx}, ${sy})`,
        }}
      />
    </div>
  );
};
