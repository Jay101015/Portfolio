import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene} from '../types';
import {useLayout} from '../components/layout';
import {pop, rnd} from '../components/motion';
import {SketchEllipse, SketchLine, SketchPath} from './sketch';
import {Doodle, Write, writeFrames} from './write';
import {DOODLES} from './doodles';

/**
 * The art library: little animated drawings in the marker look, one per situation a money video runs into. A piggy
 * bank that coins drop into, a snowball rolling down a slope and growing, a plant growing out of a pot, a rocket
 * taking off, an hourglass that flips, a card being cut up... Each is a handful of doodles and sketched strokes
 * drawn on stroke by stroke (the hand follows), then set in motion: a bob, a shake, a drop, a roll.
 *
 * They go on any scene (`art=snowball`, placed like a sticker), fill a scene of their own (`[art name=rocket]`), and
 * stand in for the corner doodle when a scene's words call one up, so two videos never use the same handful. The
 * same catalogue renders to GIFs for the studio's library.
 */

// ------------------------------------------------------------------ motion: what a drawing does once it is drawn

type Motion =
  | {kind: 'bob'; amp?: number; period?: number}
  | {kind: 'sway'; deg?: number; period?: number}
  | {kind: 'spin'; period?: number}
  | {kind: 'shake'; deg?: number; period?: number; at?: number; for?: number}
  | {kind: 'pulse'; amp?: number; period?: number}
  | {kind: 'drop'; from: number; at: number; every?: number; dur?: number; count?: number; stay?: boolean}
  | {kind: 'rise'; dy: number; at: number; dur: number; dx?: number}
  | {kind: 'roll'; dx: number; dy: number; at: number; dur: number; grow?: number; every?: number}
  | {kind: 'tip'; deg: number; period: number}
  | {kind: 'flip'; period: number; at?: number}
  | {kind: 'fly'; from: [number, number]; at: number; dur: number}
  | {kind: 'grow'; at: number; dur: number; from?: number}
  | {kind: 'pop'; at: number}
  | {kind: 'slide'; dx: number; at: number; dur: number; dy?: number; every?: number};

type Pose = {x: number; y: number; rot: number; scale: number; opacity: number};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (p: number) => 1 - Math.pow(1 - clamp01(p), 3);
const easeIn = (p: number) => Math.pow(clamp01(p), 2);
const easeInOut = (p: number) => Easing.inOut(Easing.cubic)(clamp01(p));

/** Where a layer is at second `t`, given its motions; `drawn` is when its own strokes finished. */
const poseAt = (motions: Motion[] | undefined, t: number, drawn: number, seed: number): Pose => {
  const p: Pose = {x: 0, y: 0, rot: 0, scale: 1, opacity: 1};
  if (!motions) return p;
  const after = Math.max(0, t - drawn); // motion starts once the drawing is on the board
  for (const m of motions) {
    switch (m.kind) {
      case 'bob': {
        const amp = m.amp ?? 3;
        p.y += Math.sin((after / (m.period ?? 1.6)) * Math.PI * 2 + seed) * amp;
        break;
      }
      case 'sway': {
        p.rot += Math.sin((after / (m.period ?? 2.2)) * Math.PI * 2 + seed) * (m.deg ?? 5);
        break;
      }
      case 'spin': {
        p.rot += (after / (m.period ?? 4)) * 360;
        break;
      }
      case 'shake': {
        const start = m.at ?? 0;
        const len = m.for ?? 1e9;
        const u = after - start;
        if (u > 0 && u < len) p.rot += Math.sin((u / (m.period ?? 0.3)) * Math.PI * 2) * (m.deg ?? 7) * (len < 1e8 ? 1 - u / len : 1);
        break;
      }
      case 'pulse': {
        p.scale *= 1 + Math.sin((after / (m.period ?? 1.4)) * Math.PI * 2) * (m.amp ?? 0.05);
        break;
      }
      case 'drop': {
        // falls in from above, lands, and (unless it stays) sinks out of sight; repeats every `every` seconds
        const every = m.every ?? 0;
        const u0 = t - m.at;
        if (u0 < 0) {
          p.opacity = 0;
          break;
        }
        const n = every > 0 ? Math.floor(u0 / every) : 0;
        if (m.count !== undefined && n >= m.count) {
          if (!m.stay) p.opacity = 0;
          break;
        }
        const u = every > 0 ? u0 - n * every : u0;
        const dur = m.dur ?? 0.55;
        if (u < dur) p.y += m.from * (1 - easeIn(u / dur));
        else if (!m.stay) {
          const fade = clamp01((u - dur) / 0.35);
          p.opacity *= 1 - fade;
          p.y += fade * 6;
        }
        break;
      }
      case 'rise': {
        const u = clamp01((t - m.at) / m.dur);
        p.y += m.dy * easeInOut(u);
        p.x += (m.dx ?? 0) * easeInOut(u);
        break;
      }
      case 'roll': {
        const every = m.every ?? 0;
        let u0 = t - m.at;
        if (every > 0 && u0 > 0) u0 %= every;
        const u = clamp01(u0 / m.dur);
        p.x += m.dx * u;
        p.y += m.dy * u;
        p.rot += u * 540;
        p.scale *= 1 + ((m.grow ?? 1) - 1) * u;
        if (every > 0 && u0 > m.dur) p.opacity = 0;
        break;
      }
      case 'tip': {
        p.rot += Math.sin((after / m.period) * Math.PI * 2) * m.deg;
        break;
      }
      case 'flip': {
        const u0 = Math.max(0, t - (m.at ?? drawn));
        const n = Math.floor(u0 / m.period);
        const u = u0 - n * m.period;
        p.rot += n * 180 + 180 * easeInOut(u / 0.6);
        break;
      }
      case 'fly': {
        const u = t - m.at;
        if (u < 0) {
          p.opacity = 0;
          break;
        }
        const k = easeOut(u / m.dur);
        p.x += m.from[0] * (1 - k);
        p.y += m.from[1] * (1 - k);
        break;
      }
      case 'grow': {
        const u = clamp01((t - m.at) / m.dur);
        p.scale *= (m.from ?? 0.3) + (1 - (m.from ?? 0.3)) * easeOut(u);
        break;
      }
      case 'pop': {
        if (t < m.at) p.opacity = 0;
        else p.scale *= 1 + 0.35 * Math.sin(Math.min(Math.PI, ((t - m.at) / 0.45) * Math.PI)) * Math.max(0, 1 - (t - m.at) / 0.9);
        break;
      }
      case 'slide': {
        const every = m.every ?? 0;
        let u0 = t - m.at;
        if (every > 0 && u0 > 0) u0 %= every;
        const k = easeInOut(u0 / m.dur);
        if (u0 < 0) {
          p.x += m.dx;
          p.y += m.dy ?? 0;
        } else {
          p.x += m.dx * (1 - k);
          p.y += (m.dy ?? 0) * (1 - k);
        }
        break;
      }
      default:
        break;
    }
  }
  return p;
};

// ------------------------------------------------------------------ the catalogue

type Color = 'ink' | 'accent' | 'accent2' | 'blue' | 'muted';
type Layer = {
  doodle?: string; // a Lucide outline from doodles.ts
  line?: [number, number, number, number]; // a sketched line, in the 100 x 100 box
  path?: string; // a sketched path, in the 100 x 100 box
  ellipse?: [number, number, number, number]; // cx, cy, w, h
  x: number; // top-left of the layer's box, 0..100
  y: number;
  size: number; // the box's width, 0..100
  draw: [number, number]; // seconds: when its strokes go on
  color?: Color;
  width?: number;
  fill?: boolean; // tint the doodle with the marker colour once drawn
  motion?: Motion[];
  seed?: number;
  origin?: string; // transform-origin for sway/tip/spin
};
export type ArtDef = {tags: string[]; layers: Layer[]; loop?: number; about: string};

const rays = (cx: number, cy: number, r1: number, r2: number, n: number, at: number, color: Color = 'accent2'): Layer[] =>
  Array.from({length: n}, (_, i) => {
    const a = -Math.PI / 2 + ((i - (n - 1) / 2) / n) * Math.PI * 1.3;
    return {line: [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, cx + Math.cos(a) * r2, cy + Math.sin(a) * r2], x: 0, y: 0, size: 100, draw: [at + i * 0.08, at + i * 0.08 + 0.2], color, width: 2.2, motion: [{kind: 'pulse', amp: 0.04, period: 1.1}]};
  });

export const ART: Record<string, ArtDef> = {
  piggy: {
    about: 'a piggy bank that coins keep dropping into',
    tags: ['save', 'saved', 'saving', 'savings', 'savings pot', 'put away', 'piggy', 'piggy bank', 'set aside'],
    layers: [
      {doodle: 'piggy-bank', x: 8, y: 26, size: 84, draw: [0, 1.5], width: 1.5},
      {doodle: 'coins', x: 40, y: 4, size: 22, draw: [1.5, 1.9], color: 'accent2', motion: [{kind: 'drop', from: -30, at: 2.0, every: 1.3, dur: 0.5}]},
    ],
    loop: 2.6,
  },
  snowball: {
    about: 'a snowball rolling down a slope and growing: compounding',
    tags: ['compound', 'compounding', 'snowball', 'interest on interest', 'grows on itself'],
    layers: [
      {line: [4, 34, 96, 86], x: 0, y: 0, size: 100, draw: [0, 0.8], width: 2.4},
      {ellipse: [50, 50, 90, 90], x: 6, y: 16, size: 12, draw: [0.9, 1.3], color: 'blue', width: 2.6, motion: [{kind: 'roll', dx: 66, dy: 40, at: 1.5, dur: 3.2, grow: 3.4, every: 4.2}]},
    ],
    loop: 4.2,
  },
  plant: {
    about: 'a sprout growing out of a pot',
    tags: ['grow', 'growth', 'growing', 'seed', 'plant', 'start small', 'from the ground up', 'early on'],
    layers: [
      {path: 'M30 70 L35 94 L65 94 L70 70 Z', x: 0, y: 0, size: 100, draw: [0, 0.7], width: 2.2},
      {doodle: 'sprout', x: 22, y: 18, size: 56, draw: [0.8, 1.9], color: 'accent', width: 1.6, origin: '50% 100%', motion: [{kind: 'grow', at: 1.9, dur: 1.6, from: 0.55}, {kind: 'sway', deg: 4, period: 2.4}]},
    ],
    loop: 3,
  },
  rocket: {
    about: 'a rocket drawn, then lifting off',
    tags: ['rocket', 'launch', 'take off', 'boost', 'skyrocket', 'moon', 'blast'],
    layers: [
      {doodle: 'rocket', x: 22, y: 20, size: 60, draw: [0, 1.3], width: 1.5, motion: [{kind: 'rise', dy: -34, dx: 18, at: 1.6, dur: 1.8}, {kind: 'shake', deg: 3, period: 0.18}]},
      {ellipse: [50, 50, 80, 60], x: 20, y: 74, size: 22, draw: [1.6, 1.9], color: 'muted', width: 2, motion: [{kind: 'pulse', amp: 0.18, period: 0.7}, {kind: 'drop', from: 0, at: 1.6, every: 0.9, dur: 0.1}]},
      {ellipse: [50, 50, 80, 60], x: 36, y: 80, size: 16, draw: [1.8, 2.1], color: 'muted', width: 2, motion: [{kind: 'pulse', amp: 0.18, period: 0.6}, {kind: 'drop', from: 0, at: 1.8, every: 0.9, dur: 0.1}]},
    ],
    loop: 3.6,
  },
  'chart-up': {
    about: 'a line heading up and to the right, with a spark at the end',
    tags: ['goes up', 'going up', 'went up', 'rise', 'rising', 'returns', 'return on', 'gain', 'gains', 'profit', 'growth rate', 'bull', 'record high', 'all time high'],
    layers: [
      {doodle: 'trending-up', x: 8, y: 14, size: 84, draw: [0, 1.4], color: 'accent', width: 1.7},
      {doodle: 'sparkles', x: 66, y: 2, size: 26, draw: [1.5, 1.9], color: 'accent2', motion: [{kind: 'pulse', amp: 0.1, period: 1}]},
    ],
  },
  'chart-down': {
    about: 'a line falling away, and a frown',
    tags: ['goes down', 'went down', 'crash', 'crashed', 'loss', 'losses', 'lose money', 'lost money', 'lost most', 'fall', 'fell', 'bear market', 'dip', 'tanked'],
    layers: [
      {doodle: 'trending-down', x: 8, y: 14, size: 84, draw: [0, 1.4], color: 'accent2', width: 1.7},
      {doodle: 'frown', x: 64, y: 58, size: 30, draw: [1.5, 2.1], motion: [{kind: 'bob', amp: 2, period: 1.8}]},
    ],
  },
  clock: {
    about: 'a clock whose hand goes round',
    tags: ['clock', 'hour', 'hours', 'deadline', 'every day', 'daily', 'schedule', 'o clock'],
    layers: [
      {doodle: 'clock', x: 10, y: 10, size: 80, draw: [0, 1.2], width: 1.5},
      {line: [50, 50, 50, 25], x: 0, y: 0, size: 100, draw: [1.2, 1.4], color: 'accent2', width: 2.6, origin: '50% 50%', motion: [{kind: 'spin', period: 4}]},
    ],
    loop: 4,
  },
  hourglass: {
    about: 'an hourglass that flips over',
    tags: ['takes time', 'over time', 'wait', 'waiting', 'patience', 'patient', 'years', 'decades', 'long term', 'long run', 'thirty years', 'ten years'],
    layers: [{doodle: 'hourglass', x: 14, y: 8, size: 72, draw: [0, 1.2], width: 1.5, origin: '50% 50%', motion: [{kind: 'flip', period: 3.2}]}],
    loop: 3.2,
  },
  scale: {
    about: 'a balance tipping one way, then the other',
    tags: ['balance', 'risk', 'reward', 'weigh', 'trade off', 'versus', 'either', 'choice', 'decide'],
    layers: [{doodle: 'scale', x: 10, y: 8, size: 80, draw: [0, 1.5], width: 1.5, origin: '50% 100%', motion: [{kind: 'tip', deg: 6, period: 3.4}]}],
    loop: 3.4,
  },
  bulb: {
    about: 'a lightbulb that lights up',
    tags: ['idea', 'realise', 'realize', 'lesson', 'learn', 'learned', 'learnt', 'insight', 'trick', 'tip'],
    layers: [{doodle: 'lightbulb', x: 20, y: 18, size: 60, draw: [0, 1.1], width: 1.5, fill: true, motion: [{kind: 'pulse', amp: 0.04, period: 1.6}]}, ...rays(50, 42, 34, 46, 5, 1.2)],
  },
  alarm: {
    about: 'an alarm clock ringing',
    tags: ['alarm', 'wake up', 'urgent', 'now', 'hurry', 'warning sign', 'act fast'],
    layers: [{doodle: 'alarm-clock', x: 14, y: 12, size: 72, draw: [0, 1.2], width: 1.5, origin: '50% 70%', motion: [{kind: 'shake', deg: 8, period: 0.22, at: 0.2, for: 1.4}, {kind: 'shake', deg: 8, period: 0.22, at: 2.6, for: 1.4}]}],
    loop: 4,
  },
  warning: {
    about: 'a warning triangle, pulsing',
    tags: ['careful', 'danger', 'scam', 'beware', 'red flag', 'mistake', 'trap', 'avoid'],
    layers: [{doodle: 'triangle-alert', x: 12, y: 10, size: 76, draw: [0, 1.1], color: 'accent2', width: 1.7, motion: [{kind: 'pulse', amp: 0.06, period: 1}]}],
  },
  'card-cut': {
    about: 'a credit card and a pair of scissors going through it',
    tags: ['credit card', 'debt', 'overdraft', 'cut up', 'card', 'borrow', 'loan', 'apr'],
    layers: [
      {doodle: 'credit-card', x: 8, y: 22, size: 84, draw: [0, 1.2], width: 1.5},
      {line: [50, 18, 50, 84], x: 0, y: 0, size: 100, draw: [1.9, 2.7], color: 'accent2', width: 2.2},
      {doodle: 'scissors', x: 38, y: 0, size: 26, draw: [1.3, 1.8], color: 'accent2', motion: [{kind: 'rise', dy: 52, at: 1.9, dur: 0.9}]},
    ],
  },
  cart: {
    about: 'a shopping trolley rolling in',
    tags: ['shop', 'shopping', 'spend', 'spending', 'buy', 'bought', 'purchase', 'impulse', 'checkout'],
    layers: [{doodle: 'shopping-cart', x: 12, y: 14, size: 76, draw: [0, 1.3], width: 1.5, motion: [{kind: 'slide', dx: -26, at: 1.4, dur: 1.2}, {kind: 'bob', amp: 1.5, period: 0.5}]}],
  },
  house: {
    about: 'a house, and the key dropping into your hand',
    tags: ['house', 'home', 'mortgage', 'rent', 'deposit', 'property', 'flat', 'landlord', 'buy a place'],
    layers: [
      {doodle: 'house', x: 8, y: 16, size: 72, draw: [0, 1.4], width: 1.5},
      {doodle: 'key', x: 64, y: 56, size: 30, draw: [1.5, 1.9], color: 'accent2', motion: [{kind: 'drop', from: -40, at: 2.0, dur: 0.6, count: 1, stay: true}, {kind: 'sway', deg: 6, period: 1.8}]},
    ],
  },
  car: {
    about: 'a car driving along',
    tags: ['car', 'drive', 'driving', 'petrol', 'fuel', 'commute', 'lease', 'finance a car'],
    layers: [
      {line: [2, 86, 98, 86], x: 0, y: 0, size: 100, draw: [0, 0.6], color: 'muted', width: 2},
      {doodle: 'car', x: 12, y: 20, size: 76, draw: [0.6, 1.8], width: 1.5, motion: [{kind: 'bob', amp: 1.2, period: 0.35}]},
      {line: [2, 50, 22, 50], x: 0, y: 0, size: 100, draw: [1.9, 2.1], color: 'muted', width: 2, motion: [{kind: 'slide', dx: 30, at: 2, dur: 0.9, every: 0.9}]},
      {line: [6, 62, 20, 62], x: 0, y: 0, size: 100, draw: [2.0, 2.2], color: 'muted', width: 2, motion: [{kind: 'slide', dx: 30, at: 2.3, dur: 0.9, every: 0.9}]},
    ],
    loop: 1.8,
  },
  wallet: {
    about: 'a wallet with a note coming out',
    tags: ['wallet', 'cash', 'pocket', 'take home', 'left over', 'disposable', 'spare'],
    layers: [
      {doodle: 'banknote', x: 30, y: 30, size: 40, draw: [1.3, 1.7], color: 'accent', motion: [{kind: 'rise', dy: -26, at: 1.8, dur: 1.1}, {kind: 'bob', amp: 1.5, period: 1.4}]},
      {doodle: 'wallet', x: 10, y: 22, size: 80, draw: [0, 1.2], width: 1.5},
    ],
  },
  bank: {
    about: 'a bank, and money going in',
    tags: ['bank', 'account', 'isa', 'deposit account', 'high interest', 'easy access'],
    layers: [
      {doodle: 'landmark', x: 10, y: 20, size: 80, draw: [0, 1.5], width: 1.5},
      {doodle: 'coins', x: 40, y: 0, size: 22, draw: [1.5, 1.9], color: 'accent2', motion: [{kind: 'drop', from: -24, at: 2.0, every: 1.4, dur: 0.5}]},
    ],
    loop: 2.8,
  },
  trophy: {
    about: 'a trophy with stars popping around it',
    tags: ['win', 'won', 'winner', 'trophy', 'achieve', 'achieved', 'milestone', 'hit the goal', 'made it', 'first 100k', 'million'],
    layers: [
      {doodle: 'trophy', x: 18, y: 14, size: 64, draw: [0, 1.3], width: 1.5, fill: true, motion: [{kind: 'pulse', amp: 0.04, period: 1.5}]},
      {doodle: 'star', x: 2, y: 6, size: 20, draw: [1.3, 1.6], color: 'accent2', motion: [{kind: 'pop', at: 1.3}, {kind: 'bob', amp: 2, period: 1.3}]},
      {doodle: 'star', x: 78, y: 2, size: 20, draw: [1.5, 1.8], color: 'accent2', motion: [{kind: 'pop', at: 1.5}, {kind: 'bob', amp: 2, period: 1.1}]},
      {doodle: 'star', x: 72, y: 40, size: 14, draw: [1.7, 2.0], color: 'accent2', motion: [{kind: 'pop', at: 1.7}, {kind: 'bob', amp: 2, period: 1.5}]},
    ],
  },
  target: {
    about: 'a target, and an arrow flying into the middle',
    tags: ['goal', 'goals', 'target', 'aim', 'the plan', 'on track', 'focus', 'hit the'],
    layers: [
      {doodle: 'target', x: 14, y: 10, size: 76, draw: [0, 1.4], width: 1.5},
      {doodle: 'arrow-right', x: 22, y: 36, size: 28, draw: [1.4, 1.5], color: 'accent2', width: 2.2, motion: [{kind: 'fly', from: [-70, -24], at: 1.6, dur: 0.45}, {kind: 'shake', deg: 5, period: 0.12, at: 2.05, for: 0.5}]},
    ],
  },
  handshake: {
    about: 'a handshake: a deal, an agreement',
    tags: ['deal', 'agree', 'agreement', 'handshake', 'partner', 'employer', 'match', 'negotiate', 'contract'],
    layers: [{doodle: 'handshake', x: 8, y: 16, size: 84, draw: [0, 1.5], width: 1.5, motion: [{kind: 'bob', amp: 2, period: 0.9}]}],
  },
  stack: {
    about: 'coins stacking up, one pile after another',
    tags: ['stack', 'pile', 'coins', 'add up', 'adds up', 'builds up', 'accumulate', 'little by little', 'every month'],
    layers: [
      {doodle: 'coins', x: 4, y: 50, size: 30, draw: [0, 0.7], color: 'accent2', motion: [{kind: 'drop', from: -40, at: 0.7, dur: 0.5, count: 1, stay: true}]},
      {doodle: 'coins', x: 35, y: 36, size: 30, draw: [0.9, 1.6], color: 'accent2', motion: [{kind: 'drop', from: -40, at: 1.6, dur: 0.5, count: 1, stay: true}]},
      {doodle: 'coins', x: 66, y: 22, size: 30, draw: [1.8, 2.5], color: 'accent2', motion: [{kind: 'drop', from: -40, at: 2.5, dur: 0.5, count: 1, stay: true}]},
      {line: [2, 84, 98, 84], x: 0, y: 0, size: 100, draw: [0, 0.4], color: 'muted', width: 2},
    ],
  },
  umbrella: {
    about: 'an umbrella in the rain: the emergency fund',
    tags: ['rainy day', 'emergency', 'emergencies', 'cover', 'protect', 'insurance', 'safety net', 'buffer', 'cushion'],
    layers: [
      {doodle: 'umbrella', x: 12, y: 18, size: 76, draw: [0, 1.4], width: 1.5, motion: [{kind: 'sway', deg: 3, period: 2}]},
      {line: [20, 2, 16, 12], x: 0, y: 0, size: 100, draw: [1.4, 1.6], color: 'blue', width: 2, motion: [{kind: 'drop', from: -14, at: 1.6, every: 0.8, dur: 0.6}]},
      {line: [50, 0, 46, 10], x: 0, y: 0, size: 100, draw: [1.5, 1.7], color: 'blue', width: 2, motion: [{kind: 'drop', from: -14, at: 1.9, every: 0.8, dur: 0.6}]},
      {line: [80, 2, 76, 12], x: 0, y: 0, size: 100, draw: [1.6, 1.8], color: 'blue', width: 2, motion: [{kind: 'drop', from: -14, at: 2.2, every: 0.8, dur: 0.6}]},
    ],
    loop: 2.4,
  },
  fire: {
    about: 'a flame, flickering',
    tags: ['fire', 'burn', 'burning', 'hot', 'on fire', 'retire early', 'financial independence'],
    layers: [{doodle: 'flame', x: 18, y: 10, size: 64, draw: [0, 1.1], color: 'accent2', width: 1.6, fill: true, origin: '50% 100%', motion: [{kind: 'sway', deg: 5, period: 0.5}, {kind: 'pulse', amp: 0.06, period: 0.4}]}],
  },
  calendar: {
    about: 'a calendar: month after month',
    tags: ['month', 'monthly', 'calendar', 'payday', 'each month', 'per month', 'a month', 'weekly', 'every week'],
    layers: [{doodle: 'calendar', x: 12, y: 10, size: 76, draw: [0, 1.4], width: 1.5, motion: [{kind: 'shake', deg: 3, period: 0.25, at: 0.6, for: 0.7}, {kind: 'shake', deg: 3, period: 0.25, at: 2.6, for: 0.7}]}],
    loop: 4,
  },
  question: {
    about: 'a question mark, bobbing',
    tags: ['question', 'why', 'how', 'what if', 'wonder', 'confused', 'ask'],
    layers: [{doodle: 'circle-help', x: 16, y: 12, size: 68, draw: [0, 1.1], color: 'blue', width: 1.6, motion: [{kind: 'bob', amp: 4, period: 1.4}]}],
  },
  check: {
    about: 'a big tick',
    tags: ['done', 'tick', 'yes', 'sorted', 'complete', 'check', 'that is it', 'simple as that'],
    layers: [{doodle: 'circle-check', x: 14, y: 10, size: 72, draw: [0, 1.0], color: 'accent', width: 1.8, motion: [{kind: 'pop', at: 1.0}]}],
  },
  thumbs: {
    about: 'a thumbs up, with sparkles',
    tags: ['good', 'great', 'like', 'nice', 'well done', 'love this', 'recommend', 'thumbs'],
    layers: [
      {doodle: 'thumbs-up', x: 16, y: 16, size: 64, draw: [0, 1.1], width: 1.5, motion: [{kind: 'pop', at: 1.1}, {kind: 'sway', deg: 4, period: 1.6}]},
      {doodle: 'sparkles', x: 66, y: 4, size: 26, draw: [1.2, 1.6], color: 'accent2', motion: [{kind: 'pulse', amp: 0.12, period: 0.9}]},
    ],
  },
  subscribe: {
    about: 'the play button and a bell that rings',
    tags: ['subscribe', 'subscribed', 'channel', 'notification', 'bell', 'next video', 'like and'],
    layers: [
      {doodle: 'youtube', x: 4, y: 20, size: 60, draw: [0, 1.2], color: 'accent2', width: 1.5},
      {doodle: 'bell', x: 64, y: 30, size: 32, draw: [1.2, 1.7], width: 1.5, origin: '50% 15%', motion: [{kind: 'shake', deg: 14, period: 0.25, at: 0.1, for: 1.2}, {kind: 'shake', deg: 14, period: 0.25, at: 2.4, for: 1.2}]},
    ],
    loop: 3.6,
  },
  party: {
    about: 'a party popper going off',
    tags: ['celebrate', 'party', 'congratulations', 'congrats', 'cheers', 'hooray', 'amazing'],
    layers: [
      {doodle: 'party-popper', x: 12, y: 18, size: 64, draw: [0, 1.2], color: 'accent2', width: 1.5, motion: [{kind: 'pop', at: 1.2}]},
      {doodle: 'sparkles', x: 60, y: 2, size: 30, draw: [1.3, 1.7], color: 'accent', motion: [{kind: 'pulse', amp: 0.12, period: 0.9}, {kind: 'bob', amp: 2, period: 1.2}]},
      {doodle: 'star', x: 76, y: 42, size: 16, draw: [1.5, 1.8], color: 'blue', motion: [{kind: 'pop', at: 1.5}, {kind: 'bob', amp: 3, period: 1.5}]},
    ],
  },
  summit: {
    about: 'a mountain, and the flag planted at the top',
    tags: ['mountain', 'climb', 'journey', 'road to', 'the top', 'summit', 'peak', 'long way'],
    layers: [
      {doodle: 'mountain', x: 4, y: 20, size: 92, draw: [0, 1.4], width: 1.5},
      {doodle: 'flag', x: 40, y: 4, size: 22, draw: [1.5, 1.9], color: 'accent2', motion: [{kind: 'pop', at: 1.9}, {kind: 'sway', deg: 4, period: 1.4}]},
    ],
  },
  egg: {
    about: 'a nest egg',
    tags: ['nest egg', 'retirement', 'pension', 'retire', 'later life', 'old age'],
    layers: [
      {doodle: 'egg', x: 22, y: 12, size: 56, draw: [0, 1.0], width: 1.5, fill: true, motion: [{kind: 'sway', deg: 5, period: 1.8}]},
      {path: 'M14 78 Q50 96 86 78', x: 0, y: 0, size: 100, draw: [1.0, 1.5], color: 'accent2', width: 2.4},
      {path: 'M18 84 Q50 100 82 84', x: 0, y: 0, size: 100, draw: [1.3, 1.7], color: 'accent2', width: 2},
    ],
  },
  snail: {
    about: 'a snail, taking its time',
    tags: ['slow', 'slowly', 'steady', 'takes time', 'no rush', 'boring', 'gradual'],
    layers: [{doodle: 'snail', x: 10, y: 18, size: 80, draw: [0, 1.4], width: 1.5, motion: [{kind: 'slide', dx: -20, at: 1.5, dur: 6, every: 6}]}],
    loop: 6,
  },
  rabbit: {
    about: 'a rabbit, in a hurry',
    tags: ['fast', 'quick', 'quickly', 'rush', 'overnight', 'get rich quick', 'hurry'],
    layers: [{doodle: 'rabbit', x: 12, y: 10, size: 76, draw: [0, 1.4], width: 1.5, motion: [{kind: 'bob', amp: 5, period: 0.45}]}],
  },
  brain: {
    about: 'a brain, thinking',
    tags: ['think', 'thinking', 'mindset', 'psychology', 'habit', 'habits', 'brain', 'emotional', 'discipline'],
    layers: [{doodle: 'brain', x: 14, y: 12, size: 72, draw: [0, 1.5], color: 'blue', width: 1.5, motion: [{kind: 'pulse', amp: 0.05, period: 1.3}]}],
  },
  zap: {
    about: 'a lightning bolt',
    tags: ['power', 'powerful', 'energy', 'instant', 'shock', 'boom', 'massive'],
    layers: [{doodle: 'zap', x: 22, y: 8, size: 56, draw: [0, 0.8], color: 'accent2', width: 1.8, fill: true, motion: [{kind: 'shake', deg: 4, period: 0.15, at: 0, for: 0.8}, {kind: 'pulse', amp: 0.05, period: 0.8}]}],
  },
  magnet: {
    about: 'a magnet pulling coins in',
    tags: ['attract', 'magnet', 'pull', 'pulls in', 'draws in', 'passive', 'comes to you'],
    layers: [
      {doodle: 'magnet', x: 30, y: 8, size: 44, draw: [0, 1.2], color: 'accent2', width: 1.6},
      {doodle: 'coins', x: 4, y: 64, size: 24, draw: [1.3, 1.6], motion: [{kind: 'slide', dx: 0, dy: 0, at: 0, dur: 0.1}, {kind: 'rise', dy: -22, dx: 22, at: 1.8, dur: 1.2}]},
      {doodle: 'coins', x: 72, y: 64, size: 24, draw: [1.4, 1.7], motion: [{kind: 'rise', dy: -22, dx: -22, at: 2.0, dur: 1.2}]},
    ],
  },
  crown: {
    about: 'a crown',
    tags: ['king', 'queen', 'best', 'top', 'number one', 'royal', 'crown', 'winner takes'],
    layers: [{doodle: 'crown', x: 14, y: 16, size: 72, draw: [0, 1.1], color: 'accent2', width: 1.6, fill: true, motion: [{kind: 'pop', at: 1.1}, {kind: 'bob', amp: 2, period: 1.8}]}],
  },
  gem: {
    about: 'a gem, glinting',
    tags: ['valuable', 'value', 'worth', 'precious', 'rare', 'gem', 'quality', 'asset'],
    layers: [{doodle: 'gem', x: 16, y: 14, size: 68, draw: [0, 1.2], color: 'blue', width: 1.6, motion: [{kind: 'pulse', amp: 0.05, period: 1.2}]}, ...rays(50, 44, 36, 46, 4, 1.3, 'blue')],
  },
  phone: {
    about: 'a phone, buzzing',
    tags: ['phone', 'app', 'notification', 'tap', 'swipe', 'screen', 'doom scroll'],
    layers: [{doodle: 'smartphone', x: 26, y: 8, size: 48, draw: [0, 1.0], width: 1.5, motion: [{kind: 'shake', deg: 4, period: 0.12, at: 0.2, for: 0.8}, {kind: 'shake', deg: 4, period: 0.12, at: 2.4, for: 0.8}]}],
    loop: 4,
  },
  shield: {
    about: 'a shield with a tick',
    tags: ['safe', 'safety', 'secure', 'guaranteed', 'protected', 'fscs', 'insured', 'shield'],
    layers: [
      {doodle: 'shield', x: 16, y: 10, size: 68, draw: [0, 1.2], color: 'accent', width: 1.6},
      {doodle: 'check', x: 33, y: 30, size: 34, draw: [1.3, 1.7], color: 'accent', width: 2.2, motion: [{kind: 'pop', at: 1.7}]},
    ],
  },
  megaphone: {
    about: 'a megaphone: hype',
    tags: ['hype', 'everyone says', 'influencer', 'promote', 'shout', 'noise', 'announce'],
    layers: [{doodle: 'megaphone', x: 14, y: 16, size: 72, draw: [0, 1.3], width: 1.5, origin: '20% 60%', motion: [{kind: 'shake', deg: 5, period: 0.3, at: 0.2, for: 1}, {kind: 'shake', deg: 5, period: 0.3, at: 2.2, for: 1}]}, ...rays(78, 40, 12, 26, 3, 1.4)],
    loop: 4,
  },
  graduation: {
    about: 'a graduation cap, tossed',
    tags: ['university', 'uni', 'degree', 'student', 'graduate', 'course', 'bootcamp', 'study'],
    layers: [{doodle: 'graduation-cap', x: 12, y: 16, size: 76, draw: [0, 1.3], width: 1.5, motion: [{kind: 'rise', dy: -18, at: 1.5, dur: 0.6}, {kind: 'rise', dy: 18, at: 2.1, dur: 0.6}, {kind: 'sway', deg: 8, period: 1.2}]}],
    loop: 3.2,
  },
  briefcase: {
    about: 'a briefcase, with a bob: the job',
    tags: ['job', 'salary', 'work', 'career', 'pay rise', 'promotion', 'employer', 'wage', 'income'],
    layers: [{doodle: 'briefcase', x: 12, y: 16, size: 76, draw: [0, 1.3], width: 1.5, motion: [{kind: 'bob', amp: 3, period: 1.2}]}],
  },
  receipt: {
    about: 'a receipt and a calculator: the bills',
    tags: ['bill', 'bills', 'tax', 'receipt', 'statement', 'expenses', 'outgoings', 'budget'],
    layers: [
      {doodle: 'receipt', x: 6, y: 10, size: 56, draw: [0, 1.3], width: 1.5},
      {doodle: 'calculator', x: 56, y: 40, size: 40, draw: [1.3, 2.0], color: 'blue', width: 1.5, motion: [{kind: 'pop', at: 2.0}]},
    ],
  },
};

const PICK: [RegExp, string][] = Object.entries(ART).map(([name, def]) => [new RegExp('\\b(' + def.tags.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'i'), name]);

/** The drawing for a scene: the one it names, else the one whose words come up most in the texts (a longer, more
 * specific phrase counts for more than a short word, so "piggy bank" beats "save"). */
export const pickArt = (explicit: string | undefined, ...texts: (string | undefined)[]): string | undefined => {
  if (explicit) return ART[explicit] ? explicit : undefined;
  const hay = texts.filter(Boolean).join(' ');
  let best: string | undefined;
  let bestScore = 0;
  for (const [re, name] of PICK) {
    const hits = hay.match(new RegExp(re.source, 'gi')) ?? [];
    const score = hits.reduce((n, h) => n + 2 + h.length, 0);
    if (score > bestScore) {
      best = name;
      bestScore = score;
    }
  }
  return best;
};

/** Every drawing's name, with what it shows and the words that call it up (for the studio's library). */
export const artCatalogue = () => Object.entries(ART).map(([name, def]) => ({name, about: def.about, tags: def.tags}));

// ------------------------------------------------------------------ drawing one

const colorOf = (brand: Brand, c?: Color) => (c === 'accent' ? brand.accent : c === 'accent2' ? brand.accent2 : c === 'blue' ? brand.blue ?? brand.accent : c === 'muted' ? brand.muted : brand.ink);

type ArtProps = {name: string; size: number; brand: Brand; start?: number; seed?: number; style?: React.CSSProperties};

/** One drawing from the catalogue, `size` px square, its strokes going on from frame `start`, then moving. */
export const Art: React.FC<ArtProps> = ({name, size, brand, start = 0, seed = 1, style}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const def = ART[name];
  if (!def) return null;
  const t = (frame - start) / fps;
  const px = size / 100;
  const drawnAll = Math.max(...def.layers.map((l) => l.draw[1]));
  const tilt = (rnd(seed) - 0.5) * 4;
  return (
    <div style={{position: 'relative', width: size, height: size, transform: `rotate(${tilt}deg)`, ...style}}>
      {def.layers.map((l, i) => {
        const win: [number, number] = [start + l.draw[0] * fps, start + l.draw[1] * fps];
        const drawn = def.loop ? l.draw[1] : l.draw[1];
        const p = poseAt(l.motion, t, drawn, seed + i);
        if (frame < win[0] && !(l.motion ?? []).some((m) => m.kind === 'fly' || m.kind === 'drop')) return null;
        const stroke = colorOf(brand, l.color);
        const boxPx = l.size * px;
        const common = {stroke, strokeWidth: (l.width ?? 2) * (size / 260), roughness: 1.1, bowing: 0.8, seed: (seed + i) * 7};
        return (
          <div key={i} style={{position: 'absolute', left: l.x * px, top: l.y * px, width: boxPx, height: boxPx, transform: `translate(${p.x * px}px, ${p.y * px}px) rotate(${p.rot}deg) scale(${p.scale})`, transformOrigin: l.origin ?? '50% 50%', opacity: p.opacity}}>
            {l.doodle ? (
              <Doodle name={l.doodle} size={boxPx} win={win} stroke={stroke} width={l.width ?? 1.6} seed={seed + i} fill={l.fill ? brand.marker : undefined} />
            ) : (
              <svg width={boxPx} height={boxPx} viewBox="0 0 100 100" style={{overflow: 'visible', display: 'block'}}>
                {l.line ? <SketchLine x1={l.line[0]} y1={l.line[1]} x2={l.line[2]} y2={l.line[3]} win={win} options={common} /> : null}
                {l.path ? <SketchPath d={l.path} win={win} options={common} /> : null}
                {l.ellipse ? <SketchEllipse cx={l.ellipse[0]} cy={l.ellipse[1]} w={l.ellipse[2]} h={l.ellipse[3]} win={win} options={common} /> : null}
              </svg>
            )}
          </div>
        );
      })}
      {void drawnAll}
    </div>
  );
};

// ------------------------------------------------------------------ on a scene, and as a scene

const PLACE: Record<string, React.CSSProperties> = {
  tr: {top: '8%', right: '5%'},
  tl: {top: '8%', left: '5%'},
  br: {bottom: '15%', right: '5%'},
  bl: {bottom: '15%', left: '5%'},
  r: {top: '50%', right: '5%', transform: 'translateY(-50%)'},
  l: {top: '50%', left: '5%', transform: 'translateY(-50%)'},
  c: {top: '50%', left: '50%', transform: 'translate(-50%, -50%)'},
};

/** A drawing placed on any scene: `art=snowball`, `art_at=br`, `art_size=0.3` (of the height), `art_start=1.5` (s). */
export const ArtLayer: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  const {fps} = useVideoConfig();
  const {height, isVertical} = useLayout();
  const name = pickArt(scene.props.art, undefined);
  if (!name || !brand.board) return null;
  const at = String(scene.props.art_at ?? (isVertical ? 'br' : 'tr'));
  const size = height * Math.max(0.12, Math.min(0.8, Number(scene.props.art_size ?? (isVertical ? 0.22 : 0.3))));
  const start = Math.round(Number(scene.props.art_start ?? 0.8) * fps);
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div style={{position: 'absolute', ...PLACE[at] ?? PLACE.tr, width: size, height: size}}>
        <Art name={name} size={size} brand={brand} start={start} seed={scene.id * 3 + 1} />
      </div>
    </AbsoluteFill>
  );
};

/** A scene that is one big drawing, with a handwritten line above and a note under it: `[art name=rocket headline="..." caption="..."]`. */
export const PaperArt: React.FC<{scene: Scene; brand: Brand}> = ({scene, brand}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const {u, pad, isVertical, width, height} = useLayout();
  const name = pickArt(scene.props.name ?? scene.props.art, scene.props.headline, scene.props.caption, scene.narration) ?? 'bulb';
  const headline: string | undefined = scene.props.headline ?? scene.props.title;
  const caption: string | undefined = scene.props.caption ?? scene.props.sub;
  const headDone = headline ? writeFrames(headline, fps, 30) + 4 : 0;
  const size = Math.min(isVertical ? width * 0.7 : height * 0.56, width * 0.6);
  const hand = brand.hand ?? 'cursive';
  return (
    <AbsoluteFill style={{padding: pad, justifyContent: 'center', alignItems: 'center'}}>
      {headline ? (
        <div style={{position: 'absolute', top: pad * 0.9, left: pad * 1.2, right: pad, fontFamily: hand, fontSize: (isVertical ? 52 : 58) * u, color: brand.accent2, transform: 'rotate(-1.5deg)', transformOrigin: 'left'}}>
          <Write text={headline} frame={frame} fps={fps} start={2} cps={30} color={brand.accent2} />
        </div>
      ) : null}
      <Art name={name} size={size} brand={brand} start={headDone + 4} seed={scene.id * 5 + 2} style={{marginTop: headline ? size * 0.12 : 0}} />
      {caption ? (
        <div style={{position: 'absolute', bottom: pad * 1.1, left: pad * 1.2, right: pad, fontFamily: hand, fontSize: (isVertical ? 44 : 48) * u, color: brand.ink, transform: 'rotate(1deg)', transformOrigin: 'left'}}>
          <Write text={caption} frame={frame} fps={fps} start={headDone + Math.round(fps * 1.8)} cps={30} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/** The composition the library GIFs are rendered from: one drawing on the board, drawn once and left to move. */
export const ArtPreview: React.FC<{name: string; brand?: Brand; theme?: string}> = ({name, brand}) => {
  const {width, height} = useVideoConfig();
  const b = brand ?? ({bg: '#fbfbf9', ink: '#1d1d1f', muted: '#767a82', accent: '#1b8a4c', accent2: '#d93025', blue: '#1a56db', marker: '#fff176', board: true} as Brand);
  const size = Math.min(width, height) * 0.84;
  return (
    <AbsoluteFill style={{background: b.bg, justifyContent: 'center', alignItems: 'center'}}>
      <Art name={name} size={size} brand={b} start={2} seed={3} />
    </AbsoluteFill>
  );
};

/** How long a drawing takes to draw and run through one loop, in seconds (for the GIF renders). */
export const artSeconds = (name: string) => {
  const def = ART[name];
  if (!def) return 3;
  const drawn = Math.max(...def.layers.map((l) => l.draw[1]));
  return Math.ceil(drawn + (def.loop ?? 2.4) + 0.4);
};

void DOODLES;
void interpolate;
