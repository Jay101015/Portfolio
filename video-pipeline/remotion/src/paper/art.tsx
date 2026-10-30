import React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Brand, Scene} from '../types';
import {useLayout} from '../components/layout';
import {pop, rnd} from '../components/motion';
import {SketchEllipse, SketchLine, SketchPath} from './sketch';
import {ILLUS} from './illus';
import {FLIPS} from './flipbook';
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
export type ArtDef = {
  tags: string[]; // the phrases that call the drawing up on a scene by themselves (specific, so it is not everywhere)
  search?: string[]; // everyday words that find it in the studio's library search, the way a GIF keyboard works
  layers: Layer[];
  loop?: number;
  about: string;
  svg?: {w: number; h: number; width: number; paths: string[]}; // a traced illustration: pen strokes in draw order (scripts/illus-trace.py)
  flip?: {frames: string[]; step: number; loop?: boolean}; // a stop-motion drawing: key poses played in steps (flipbook.ts)
};

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

  // ---- reactions and everyday life: the GIF-keyboard half of the library
  laugh: {
    about: 'a laughing face, shaking with it',
    tags: ['hilarious', 'laughing', 'joke', 'funny'],
    search: ['lol', 'haha', 'lmao', 'laugh', 'laughs', 'funny', 'joke', 'ridiculous', 'comedy', 'crying laughing', 'dead'],
    layers: [{doodle: 'laugh', x: 18, y: 14, size: 64, draw: [0, 1.2], width: 1.5, motion: [{kind: 'shake', deg: 6, period: 0.22}, {kind: 'bob', amp: 3, period: 0.44}]}],
  },
  smile: {
    about: 'a happy face',
    tags: ['happy', 'delighted', 'feels good', 'good news'],
    search: ['smile', 'happy', 'glad', 'nice', 'good', 'pleased', 'cheer', 'cheerful', 'yay', 'joy', 'content', 'great'],
    layers: [{doodle: 'smile', x: 18, y: 14, size: 64, draw: [0, 1.2], color: 'accent2', width: 1.5, motion: [{kind: 'pulse', amp: 0.06, period: 1.2}, {kind: 'sway', deg: 4, period: 2}]}],
  },
  sad: {
    about: 'a sad face with a tear',
    tags: ['sad', 'heartbreaking', 'gutted', 'devastated'],
    search: ['sad', 'unhappy', 'cry', 'crying', 'tear', 'tears', 'upset', 'down', 'bad news', 'loss', 'lost', 'miserable', 'oh no', 'sorry'],
    layers: [
      {doodle: 'frown', x: 18, y: 12, size: 64, draw: [0, 1.2], width: 1.5},
      {path: 'M62 52 q6 10 0 14 q-6 -4 0 -14z', x: 0, y: 0, size: 100, draw: [1.2, 1.5], color: 'blue', width: 2, motion: [{kind: 'drop', from: 0, at: 1.5, every: 1.4, dur: 0.8}]},
    ],
    loop: 2.9,
  },
  angry: {
    about: 'an angry face, fuming',
    tags: ['furious', 'infuriating', 'rage', 'makes me angry'],
    search: ['angry', 'mad', 'annoyed', 'annoying', 'rage', 'furious', 'frustrated', 'frustrating', 'hate', 'grr', 'fuming', 'livid', 'cross'],
    layers: [
      {doodle: 'angry', x: 18, y: 14, size: 64, draw: [0, 1.2], color: 'accent', width: 1.6, motion: [{kind: 'shake', deg: 4, period: 0.14}]},
      ...rays(50, 12, 10, 20, 3, 1.3, 'accent'),
    ],
  },
  meh: {
    about: 'a face that is not impressed',
    tags: ['unimpressed', 'underwhelming', 'not impressed'],
    search: ['meh', 'whatever', 'boring', 'bored', 'average', 'so so', 'fine', 'ok', 'okay', 'shrug', 'dull', 'mediocre', 'nothing special'],
    layers: [{doodle: 'meh', x: 18, y: 14, size: 64, draw: [0, 1.2], width: 1.5, motion: [{kind: 'tip', deg: 6, period: 2.6}]}],
  },
  shock: {
    about: 'a wide eye with rays: shocked',
    tags: ['shocked', 'shocking', 'mind blown', 'jaw dropped', 'cannot believe'],
    search: ['shock', 'shocked', 'wow', 'omg', 'what', 'surprise', 'surprised', 'unbelievable', 'no way', 'really', 'seriously', 'whoa', 'eyes', 'stunned'],
    layers: [
      {doodle: 'eye', x: 22, y: 26, size: 56, draw: [0, 1.0], width: 1.5, motion: [{kind: 'pulse', amp: 0.12, period: 0.5}]},
      ...rays(50, 50, 32, 44, 7, 1.0),
    ],
  },
  love: {
    about: 'a heart beating, with little hearts floating up',
    tags: ['love it', 'love this', 'adore', 'favourite'],
    search: ['love', 'heart', 'hearts', 'like', 'adore', 'favourite', 'favorite', 'thanks', 'thank you', 'grateful', 'appreciate', 'xoxo', 'romance', 'valentine'],
    layers: [
      {doodle: 'heart', x: 20, y: 18, size: 60, draw: [0, 1.0], color: 'accent', width: 1.6, fill: true, motion: [{kind: 'pulse', amp: 0.1, period: 0.9}]},
      {doodle: 'heart', x: 68, y: 40, size: 16, draw: [1.0, 1.2], color: 'accent', width: 1.8, motion: [{kind: 'rise', dy: -36, dx: 6, at: 1.3, dur: 1.6}, {kind: 'sway', deg: 10, period: 0.8}]},
      {doodle: 'heart', x: 12, y: 46, size: 12, draw: [1.2, 1.4], color: 'accent', width: 1.8, motion: [{kind: 'rise', dy: -30, dx: -4, at: 1.9, dur: 1.6}, {kind: 'sway', deg: 10, period: 0.7}]},
    ],
    loop: 3.6,
  },
  nope: {
    about: 'a thumbs down',
    tags: ['thumbs down', 'avoid this', 'stay away', 'do not do this'],
    search: ['no', 'nope', 'nah', 'bad', 'dont', "don't", 'avoid', 'dislike', 'wrong', 'thumbs down', 'fail', 'boo', 'not this', 'never', 'reject', 'rejected'],
    layers: [{doodle: 'thumbs-down', x: 20, y: 16, size: 60, draw: [0, 1.1], color: 'accent', width: 1.5, origin: '50% 20%', motion: [{kind: 'tip', deg: 8, period: 1.4}, {kind: 'bob', amp: 4, period: 1.4}]}],
  },
  cross: {
    about: 'a big red cross',
    tags: ['scrap that', 'cross it off', 'rule that out'],
    search: ['x', 'cross', 'wrong', 'no', 'cancel', 'cancelled', 'stop', 'delete', 'remove', 'not allowed', 'banned', 'nope', 'incorrect', 'mistake', 'denied'],
    layers: [
      {line: [22, 22, 78, 78], x: 0, y: 0, size: 100, draw: [0, 0.4], color: 'accent', width: 3.2},
      {line: [78, 22, 22, 78], x: 0, y: 0, size: 100, draw: [0.45, 0.85], color: 'accent', width: 3.2, motion: [{kind: 'shake', deg: 2, period: 0.2, at: 0.85, for: 0.5}]},
    ],
  },
  wave: {
    about: 'a hand waving hello',
    tags: ['welcome back', 'welcome to the channel', 'hello everyone', 'hi everyone', 'see you next time'],
    search: ['hello', 'hi', 'hey', 'welcome', 'bye', 'goodbye', 'see you', 'wave', 'waving', 'greetings', 'later', 'cheers', 'yo', 'hey guys'],
    layers: [{doodle: 'hand', x: 22, y: 12, size: 56, draw: [0, 1.1], width: 1.5, origin: '50% 100%', motion: [{kind: 'sway', deg: 18, period: 0.9}]}],
  },
  clap: {
    about: 'two hands clapping with sparkles',
    tags: ['round of applause', 'well done', 'hats off', 'bravo'],
    search: ['clap', 'clapping', 'applause', 'well done', 'bravo', 'congrats', 'congratulations', 'respect', 'nice one', 'good job', 'proud', 'yes'],
    layers: [
      {doodle: 'hand', x: 8, y: 22, size: 46, draw: [0, 0.9], width: 1.5, origin: '100% 100%', motion: [{kind: 'sway', deg: -12, period: 0.5}]},
      {doodle: 'hand', x: 46, y: 22, size: 46, draw: [0.9, 1.8], width: 1.5, origin: '0% 100%', motion: [{kind: 'sway', deg: 12, period: 0.5}]},
      {doodle: 'sparkles', x: 34, y: 2, size: 32, draw: [1.8, 2.2], color: 'accent2', width: 1.6, motion: [{kind: 'pulse', amp: 0.14, period: 0.5}]},
    ],
  },
  oops: {
    about: 'a plaster: a mistake that hurt a bit',
    tags: ['my mistake', 'rookie error', 'lesson learned', 'learned the hard way'],
    search: ['oops', 'mistake', 'mistakes', 'error', 'messed up', 'slip', 'ouch', 'hurt', 'injury', 'plaster', 'bandage', 'whoops', 'my bad', 'regret'],
    layers: [{doodle: 'bandage', x: 16, y: 16, size: 68, draw: [0, 1.1], color: 'accent', width: 1.5, motion: [{kind: 'tip', deg: 5, period: 2}]}],
  },
  sleep: {
    about: 'a moon and some zzz',
    tags: ['while you sleep', 'in your sleep', 'set and forget', 'sit back'],
    search: ['sleep', 'asleep', 'tired', 'zzz', 'snooze', 'lazy', 'rest', 'nap', 'night', 'bedtime', 'passive', 'relax', 'chill'],
    layers: [
      {doodle: 'moon', x: 10, y: 24, size: 52, draw: [0, 0.9], color: 'blue', width: 1.5, motion: [{kind: 'sway', deg: 4, period: 3}]},
      {path: 'M60 50 h12 l-12 12 h12', x: 0, y: 0, size: 100, draw: [0.9, 1.2], width: 2.2, motion: [{kind: 'rise', dy: -10, at: 1.3, dur: 2.2}, {kind: 'pulse', amp: 0.1, period: 1.1}]},
      {path: 'M72 32 h9 l-9 9 h9', x: 0, y: 0, size: 100, draw: [1.3, 1.6], width: 2, motion: [{kind: 'rise', dy: -12, at: 1.7, dur: 2.2}, {kind: 'pulse', amp: 0.1, period: 1.1}]},
      {path: 'M84 18 h6 l-6 6 h6', x: 0, y: 0, size: 100, draw: [1.7, 1.9], width: 1.8, motion: [{kind: 'rise', dy: -12, at: 2.1, dur: 2.2}, {kind: 'pulse', amp: 0.1, period: 1.1}]},
    ],
    loop: 4.4,
  },
  eyes: {
    about: 'two eyes, watching',
    tags: ['keep an eye on', 'watch out for', 'keep watching', 'eyes on'],
    search: ['eyes', 'look', 'looking', 'watch', 'watching', 'see', 'notice', 'spot', 'spy', 'stare', 'observe', 'attention', 'alert'],
    layers: [
      {doodle: 'eye', x: 4, y: 30, size: 44, draw: [0, 0.8], width: 1.5, motion: [{kind: 'slide', dx: 6, at: 1.2, dur: 1.2, every: 2.6}]},
      {doodle: 'eye', x: 52, y: 30, size: 44, draw: [0.8, 1.6], width: 1.5, motion: [{kind: 'slide', dx: 6, at: 1.2, dur: 1.2, every: 2.6}]},
    ],
    loop: 3.9,
  },
  skull: {
    about: 'a skull: that would kill you',
    tags: ['kills your returns', 'kill your', 'financial death', 'wipes you out', 'wiped out'],
    search: ['dead', 'death', 'die', 'died', 'kill', 'killer', 'deadly', 'rip', 'danger', 'toxic', 'disaster', 'skull', 'poison', 'fatal', 'game over'],
    layers: [{doodle: 'skull', x: 20, y: 12, size: 60, draw: [0, 1.3], width: 1.5, motion: [{kind: 'shake', deg: 5, period: 0.3, at: 1.3, for: 0.7}, {kind: 'bob', amp: 2, period: 2}]}],
  },
  ghost: {
    about: 'a ghost drifting about',
    tags: ['ghosted', 'disappears', 'vanishes', 'vanish into thin air', 'gone for good'],
    search: ['ghost', 'ghosted', 'disappear', 'vanish', 'gone', 'scary', 'spooky', 'fear', 'afraid', 'scared', 'haunted', 'halloween', 'boo', 'invisible'],
    layers: [{doodle: 'ghost', x: 22, y: 12, size: 56, draw: [0, 1.1], width: 1.5, motion: [{kind: 'bob', amp: 5, period: 1.6}, {kind: 'sway', deg: 6, period: 2.2}]}],
  },
  bomb: {
    about: 'a bomb with a lit fuse',
    tags: ['blows up', 'blow up in your face', 'ticking time bomb', 'time bomb'],
    search: ['bomb', 'explode', 'explosion', 'blow up', 'boom', 'disaster', 'risky', 'crash', 'meltdown', 'dangerous', 'danger', 'bust', 'implode'],
    layers: [
      {doodle: 'bomb', x: 18, y: 16, size: 64, draw: [0, 1.2], width: 1.5, motion: [{kind: 'shake', deg: 2, period: 0.12}]},
      {doodle: 'sparkles', x: 64, y: 2, size: 24, draw: [1.2, 1.5], color: 'accent2', width: 1.6, motion: [{kind: 'pulse', amp: 0.3, period: 0.3}]},
    ],
  },
  dice: {
    about: 'a die tumbling: a gamble',
    tags: ['gamble', 'gambling', 'roll the dice', 'casino', 'lottery ticket'],
    search: ['dice', 'gamble', 'gambling', 'bet', 'betting', 'luck', 'lucky', 'chance', 'casino', 'risk', 'risky', 'roll', 'odds', 'lottery', 'jackpot'],
    layers: [{doodle: 'dice-5', x: 22, y: 20, size: 56, draw: [0, 1.1], width: 1.5, motion: [{kind: 'tip', deg: 16, period: 1.1}, {kind: 'bob', amp: 6, period: 1.1}]}],
  },
  lock: {
    about: 'a padlock clicking shut',
    tags: ['locked in', 'lock it in', 'fixed rate', 'locked away', 'under lock and key'],
    search: ['lock', 'locked', 'secure', 'security', 'safe', 'safety', 'protect', 'protected', 'private', 'password', 'fixed', 'tied up', 'padlock'],
    layers: [
      {doodle: 'lock', x: 22, y: 14, size: 56, draw: [0, 1.1], width: 1.5, motion: [{kind: 'shake', deg: 2, period: 0.15, at: 1.2, for: 0.4}, {kind: 'pulse', amp: 0.03, period: 2.4}]},
      {doodle: 'key', x: 64, y: 62, size: 26, draw: [1.1, 1.6], color: 'accent2', width: 1.6, motion: [{kind: 'sway', deg: 12, period: 1.3}]},
    ],
  },
  hammer: {
    about: 'a hammer, hard at work',
    tags: ['hard work', 'graft', 'grind', 'hustle', 'build it yourself', 'diy'],
    search: ['hammer', 'build', 'building', 'work', 'working', 'hard work', 'grind', 'hustle', 'diy', 'fix', 'repair', 'tools', 'effort', 'labour', 'labor'],
    layers: [{doodle: 'hammer', x: 18, y: 14, size: 64, draw: [0, 1.1], width: 1.5, origin: '20% 85%', motion: [{kind: 'sway', deg: -22, period: 0.7}]}],
  },
  book: {
    about: 'an open book',
    tags: ['read up', 'do your homework', 'do your research', 'read the book', 'learn the basics'],
    search: ['book', 'books', 'learn', 'learning', 'read', 'reading', 'study', 'studying', 'education', 'knowledge', 'research', 'guide', 'library', 'lesson', 'school'],
    layers: [{doodle: 'book-open', x: 12, y: 20, size: 76, draw: [0, 1.2], width: 1.5, motion: [{kind: 'bob', amp: 2, period: 2.4}, {kind: 'pulse', amp: 0.03, period: 2.4}]}],
  },
  mail: {
    about: 'an envelope arriving',
    tags: ['in the post', 'through the letterbox', 'letter from', 'newsletter'],
    search: ['mail', 'email', 'letter', 'message', 'inbox', 'newsletter', 'post', 'envelope', 'send', 'sent', 'notification', 'dm', 'contact'],
    layers: [{doodle: 'mail', x: 16, y: 20, size: 68, draw: [0, 1.0], width: 1.5, motion: [{kind: 'fly', from: [-60, -30], at: 1.1, dur: 0.9}, {kind: 'bob', amp: 3, period: 1.8}]}],
  },
  gift: {
    about: 'a wrapped present with sparkles',
    tags: ['free money', 'bonus', 'freebie', 'giveaway', 'sign up bonus', 'cashback'],
    search: ['gift', 'present', 'bonus', 'free', 'freebie', 'reward', 'giveaway', 'birthday', 'christmas', 'surprise', 'treat', 'prize', 'perk', 'perks'],
    layers: [
      {doodle: 'gift', x: 20, y: 20, size: 60, draw: [0, 1.1], color: 'accent', width: 1.5, motion: [{kind: 'bob', amp: 4, period: 1.4}]},
      {doodle: 'sparkles', x: 62, y: 4, size: 28, draw: [1.1, 1.4], color: 'accent2', width: 1.6, motion: [{kind: 'pulse', amp: 0.2, period: 0.7}]},
    ],
  },
  cake: {
    about: 'a cake with candles',
    tags: ['happy birthday', 'milestone', 'anniversary', 'celebrate'],
    search: ['cake', 'birthday', 'celebrate', 'celebration', 'party', 'treat', 'anniversary', 'milestone', 'dessert', 'sweet', 'baking', 'candles'],
    layers: [
      {doodle: 'cake', x: 18, y: 18, size: 64, draw: [0, 1.2], width: 1.5},
      {doodle: 'flame', x: 42, y: 4, size: 16, draw: [1.2, 1.4], color: 'accent2', width: 1.6, fill: true, motion: [{kind: 'sway', deg: 8, period: 0.5}, {kind: 'pulse', amp: 0.12, period: 0.5}]},
    ],
  },
  coffee: {
    about: 'a cup of coffee, steaming',
    tags: ['daily coffee', 'latte', 'a coffee a day', 'coffee a day', 'takeaway coffee'],
    search: ['coffee', 'latte', 'cafe', 'morning', 'daily', 'every day', 'routine', 'habit', 'cup', 'tea', 'break', 'small spend', 'caffeine'],
    layers: [
      {doodle: 'coffee', x: 20, y: 24, size: 60, draw: [0, 1.1], width: 1.5},
      {path: 'M38 16 q4 -6 0 -12', x: 0, y: 0, size: 100, draw: [1.1, 1.3], color: 'muted', width: 1.8, motion: [{kind: 'rise', dy: -8, at: 1.3, dur: 1.4}, {kind: 'sway', deg: 10, period: 1}]},
      {path: 'M50 14 q4 -6 0 -12', x: 0, y: 0, size: 100, draw: [1.3, 1.5], color: 'muted', width: 1.8, motion: [{kind: 'rise', dy: -8, at: 1.6, dur: 1.4}, {kind: 'sway', deg: 10, period: 1.1}]},
    ],
    loop: 3,
  },
  bed: {
    about: 'a bed: rest',
    tags: ['lie in', 'stay in bed', 'day off', 'put your feet up'],
    search: ['bed', 'rest', 'relax', 'chill', 'lazy', 'weekend', 'lie in', 'sleep', 'sofa', 'day off', 'comfort', 'cosy', 'home'],
    layers: [{doodle: 'bed', x: 10, y: 22, size: 80, draw: [0, 1.2], width: 1.5, motion: [{kind: 'bob', amp: 2, period: 2.8}]}],
  },
  sun: {
    about: 'the sun, shining',
    tags: ['sunny days', 'sunshine', 'good times', 'brighter days'],
    search: ['sun', 'sunny', 'sunshine', 'bright', 'summer', 'holiday', 'warm', 'hot', 'weather', 'day', 'positive', 'good times', 'shine', 'glow'],
    layers: [{doodle: 'sun', x: 18, y: 14, size: 64, draw: [0, 1.3], color: 'accent2', width: 1.5, motion: [{kind: 'spin', period: 9}, {kind: 'pulse', amp: 0.05, period: 1.5}]}],
  },
  rain: {
    about: 'a rain cloud: a rough patch',
    tags: ['rough patch', 'bad times', 'downturn', 'recession', 'when it rains'],
    search: ['rain', 'raining', 'rainy', 'cloud', 'storm', 'gloomy', 'bad day', 'rough', 'downturn', 'recession', 'weather', 'wet', 'miserable', 'winter'],
    layers: [
      {doodle: 'cloud-rain', x: 16, y: 12, size: 68, draw: [0, 1.2], color: 'blue', width: 1.5, motion: [{kind: 'bob', amp: 2, period: 2.2}]},
      {line: [34, 74, 30, 86], x: 0, y: 0, size: 100, draw: [1.2, 1.3], color: 'blue', width: 2, motion: [{kind: 'drop', from: -10, at: 1.3, every: 0.8, dur: 0.5}]},
      {line: [54, 76, 50, 88], x: 0, y: 0, size: 100, draw: [1.3, 1.4], color: 'blue', width: 2, motion: [{kind: 'drop', from: -10, at: 1.6, every: 0.8, dur: 0.5}]},
      {line: [72, 72, 68, 84], x: 0, y: 0, size: 100, draw: [1.4, 1.5], color: 'blue', width: 2, motion: [{kind: 'drop', from: -10, at: 1.45, every: 0.8, dur: 0.5}]},
    ],
    loop: 3.2,
  },
  globe: {
    about: 'the world, turning',
    tags: ['around the world', 'global markets', 'worldwide', 'international', 'overseas'],
    search: ['world', 'globe', 'global', 'international', 'abroad', 'overseas', 'everywhere', 'earth', 'planet', 'countries', 'foreign', 'travel'],
    layers: [{doodle: 'globe', x: 18, y: 14, size: 64, draw: [0, 1.3], color: 'blue', width: 1.5, motion: [{kind: 'sway', deg: 6, period: 2.6}, {kind: 'bob', amp: 2, period: 2.6}]}],
  },
  plane: {
    about: 'a plane taking off',
    tags: ['holiday', 'holidays', 'flights', 'flight', 'trip abroad', 'vacation'],
    search: ['plane', 'travel', 'holiday', 'flight', 'fly', 'flying', 'trip', 'abroad', 'vacation', 'jet', 'airport', 'away', 'adventure', 'explore'],
    layers: [{doodle: 'plane', x: 18, y: 24, size: 60, draw: [0, 1.1], width: 1.5, motion: [{kind: 'rise', dy: -26, dx: 22, at: 1.3, dur: 2.4}, {kind: 'bob', amp: 2, period: 1.1}]}],
    loop: 4.2,
  },
  medal: {
    about: 'a medal, dropping in and swinging',
    tags: ['first place', 'gold medal', 'champion', 'winner winner', 'top of the class'],
    search: ['medal', 'winner', 'first', 'champion', 'best', 'achievement', 'gold', 'award', 'prize', 'win', 'won', 'victory', 'top', 'number one'],
    layers: [{doodle: 'medal', x: 24, y: 10, size: 52, draw: [0, 1.1], color: 'accent2', width: 1.5, origin: '50% 10%', motion: [{kind: 'sway', deg: 7, period: 1.6}]}],
  },
  bars: {
    about: 'a bar chart',
    tags: ['the data', 'the numbers show', 'statistics', 'the figures', 'bar chart'],
    search: ['chart', 'graph', 'data', 'stats', 'statistics', 'numbers', 'bar', 'bars', 'figures', 'compare', 'comparison', 'report', 'results', 'analysis'],
    layers: [{doodle: 'chart-column', x: 16, y: 14, size: 68, draw: [0, 1.3], color: 'blue', width: 1.5, motion: [{kind: 'pulse', amp: 0.04, period: 1.6}]}],
  },
  percent: {
    about: 'a percent sign, spinning',
    tags: ['interest rate', 'interest rates', 'apr', 'apy', 'annual rate', 'rate of return', 'per cent'],
    search: ['percent', 'percentage', '%', 'rate', 'rates', 'interest', 'apr', 'yield', 'fee', 'fees', 'discount', 'off', 'sale', 'inflation'],
    layers: [{doodle: 'percent', x: 20, y: 16, size: 60, draw: [0, 1.0], color: 'accent', width: 1.8, motion: [{kind: 'flip', period: 3, at: 1.2}]}],
  },
  maths: {
    about: 'a calculator working it out',
    tags: ['do the maths', 'do the math', 'work it out', 'run the numbers', 'add it up', 'adds up'],
    search: ['maths', 'math', 'calculate', 'calculator', 'sums', 'add up', 'work out', 'numbers', 'count', 'total', 'formula', 'equation', 'budget'],
    layers: [{doodle: 'calculator', x: 24, y: 10, size: 52, draw: [0, 1.2], width: 1.5, motion: [{kind: 'shake', deg: 2, period: 0.25, at: 1.2, for: 0.6}, {kind: 'pulse', amp: 0.03, period: 1.2}]}],
  },
  'money-rain': {
    about: 'banknotes raining down',
    tags: ['make it rain', 'raining money', 'loads of money', 'rolling in it', 'money money money', 'payday'],
    search: ['money', 'cash', 'rich', 'wealth', 'wealthy', 'notes', 'paid', 'payday', 'salary', 'income', 'pounds', 'dollars', 'quid', 'dosh', 'loaded', 'bank'],
    layers: [
      {doodle: 'banknote', x: 6, y: 14, size: 36, draw: [0, 0.6], color: 'accent', width: 1.5, motion: [{kind: 'drop', from: -24, at: 0.8, every: 2.1, dur: 1.4, stay: true}, {kind: 'sway', deg: 14, period: 0.9}]},
      {doodle: 'banknote', x: 54, y: 8, size: 36, draw: [0.6, 1.2], color: 'accent', width: 1.5, motion: [{kind: 'drop', from: -24, at: 1.5, every: 2.1, dur: 1.4, stay: true}, {kind: 'sway', deg: -14, period: 1.1}]},
      {doodle: 'banknote', x: 30, y: 44, size: 36, draw: [1.2, 1.8], color: 'accent', width: 1.5, motion: [{kind: 'drop', from: -24, at: 2.2, every: 2.1, dur: 1.4, stay: true}, {kind: 'sway', deg: 10, period: 1}]},
    ],
    loop: 4.2,
  },
  coins: {
    about: 'a few coins',
    tags: ['spare change', 'small change', 'loose change', 'pennies', 'round up', 'round ups', 'pocket money'],
    search: ['coins', 'coin', 'change', 'pennies', 'penny', 'cents', 'pence', 'small', 'little', 'tiny', 'bits', 'pocket money', 'spare'],
    layers: [{doodle: 'coins', x: 18, y: 16, size: 64, draw: [0, 1.2], color: 'accent2', width: 1.5, motion: [{kind: 'bob', amp: 3, period: 1.3}, {kind: 'tip', deg: 4, period: 1.3}]}],
  },
  pound: {
    about: 'a pound sign',
    tags: ['pound sterling', 'sterling', 'the pound', 'in pounds'],
    search: ['pound', 'pounds', '£', 'sterling', 'gbp', 'uk', 'british', 'britain', 'england', 'quid', 'currency', 'money'],
    layers: [{doodle: 'pound-sterling', x: 20, y: 14, size: 60, draw: [0, 1.0], color: 'accent', width: 1.8, motion: [{kind: 'pulse', amp: 0.08, period: 1.2}]}],
  },
  dollar: {
    about: 'a dollar sign',
    tags: ['us dollar', 'us dollars', 'the dollar', 'in dollars', 'greenback'],
    search: ['dollar', 'dollars', '$', 'usd', 'us', 'usa', 'america', 'american', 'bucks', 'currency', 'money', 'cash'],
    layers: [{doodle: 'dollar-sign', x: 20, y: 14, size: 60, draw: [0, 1.0], color: 'accent', width: 1.8, motion: [{kind: 'pulse', amp: 0.08, period: 1.2}]}],
  },
  euro: {
    about: 'a euro sign',
    tags: ['the euro', 'in euros', 'eurozone'],
    search: ['euro', 'euros', '€', 'eur', 'europe', 'european', 'eu', 'currency', 'money'],
    layers: [{doodle: 'euro', x: 20, y: 14, size: 60, draw: [0, 1.0], color: 'accent', width: 1.8, motion: [{kind: 'pulse', amp: 0.08, period: 1.2}]}],
  },
  bitcoin: {
    about: 'a bitcoin, flipping',
    tags: ['bitcoin', 'crypto', 'cryptocurrency', 'blockchain', 'ethereum', 'altcoin', 'altcoins'],
    search: ['bitcoin', 'crypto', 'btc', 'blockchain', 'ethereum', 'eth', 'token', 'coin', 'digital', 'web3', 'nft', 'defi', 'hodl', 'moon'],
    layers: [{doodle: 'bitcoin', x: 20, y: 14, size: 60, draw: [0, 1.1], color: 'accent2', width: 1.6, motion: [{kind: 'flip', period: 2.6, at: 1.2}]}],
  },
  recycle: {
    about: 'the recycling arrows, turning: again and again',
    tags: ['reinvest', 'reinvested', 'reinvesting', 'rinse and repeat', 'over and over', 'again and again'],
    search: ['recycle', 'reuse', 'again', 'repeat', 'cycle', 'loop', 'reinvest', 'round', 'rotate', 'recurring', 'routine', 'process', 'circular', 'green'],
    layers: [{doodle: 'recycle', x: 18, y: 14, size: 64, draw: [0, 1.3], color: 'accent', width: 1.5, motion: [{kind: 'spin', period: 6}]}],
  },
  drained: {
    about: 'a battery running low',
    tags: ['burnt out', 'burnout', 'running on empty', 'drained', 'exhausted'],
    search: ['tired', 'drained', 'exhausted', 'burnout', 'empty', 'low', 'running out', 'battery', 'energy', 'flat', 'done', 'worn out', 'spent'],
    layers: [{doodle: 'battery', x: 10, y: 28, size: 80, draw: [0, 1.0], width: 1.5, motion: [{kind: 'shake', deg: 2, period: 0.2, at: 1.4, for: 0.5}, {kind: 'pulse', amp: 0.03, period: 1.8}]}],
  },
  'look-closer': {
    about: 'a pair of glasses: read the small print',
    tags: ['small print', 'fine print', 'read the terms', 'look closely', 'closer look', 'the detail'],
    search: ['look', 'glasses', 'check', 'inspect', 'detail', 'details', 'careful', 'read', 'zoom', 'focus', 'examine', 'review', 'audit', 'scrutiny'],
    layers: [{doodle: 'glasses', x: 8, y: 26, size: 84, draw: [0, 1.1], width: 1.5, motion: [{kind: 'bob', amp: 2, period: 2}, {kind: 'tip', deg: 3, period: 2.4}]}],
  },
  trash: {
    about: 'a bin: throwing money away',
    tags: ['throwing money away', 'money down the drain', 'waste of money', 'wasted money', 'rip off', 'rip-off'],
    search: ['trash', 'bin', 'waste', 'wasted', 'wasting', 'rubbish', 'junk', 'useless', 'scrap', 'delete', 'garbage', 'throw away', 'dump', 'pointless'],
    layers: [{doodle: 'trash-2', x: 24, y: 12, size: 52, draw: [0, 1.1], width: 1.5, origin: '50% 100%', motion: [{kind: 'tip', deg: 5, period: 1.8}]}],
  },
  puzzle: {
    about: 'a puzzle piece',
    tags: ['piece of the puzzle', 'pieces of the puzzle', 'fits together', 'the missing piece'],
    search: ['puzzle', 'confusing', 'confused', 'complicated', 'complex', 'figure out', 'strategy', 'plan', 'problem', 'solve', 'solution', 'piece', 'fit', 'tricky'],
    layers: [{doodle: 'puzzle', x: 18, y: 14, size: 64, draw: [0, 1.2], color: 'blue', width: 1.5, motion: [{kind: 'sway', deg: 8, period: 2}, {kind: 'bob', amp: 3, period: 2}]}],
  },
  people: {
    about: 'a few people together',
    tags: ['most people', 'everyone else', 'the average person', 'your friends and family', 'the community'],
    search: ['people', 'everyone', 'family', 'friends', 'community', 'team', 'audience', 'viewers', 'crowd', 'society', 'public', 'others', 'group', 'together', 'we'],
    layers: [{doodle: 'users', x: 14, y: 16, size: 72, draw: [0, 1.3], width: 1.5, motion: [{kind: 'bob', amp: 2, period: 2.2}]}],
  },
  you: {
    about: 'one person: you',
    tags: ['this is you', 'that is you', 'the average you'],
    search: ['you', 'yourself', 'me', 'myself', 'person', 'individual', 'personal', 'someone', 'user', 'profile', 'account', 'human', 'single'],
    layers: [{doodle: 'user', x: 22, y: 12, size: 56, draw: [0, 1.0], width: 1.5, motion: [{kind: 'pulse', amp: 0.05, period: 1.6}, {kind: 'bob', amp: 2, period: 1.6}]}],
  },
  laptop: {
    about: 'a laptop',
    tags: ['side hustle', 'work from home', 'working from home', 'online business', 'freelance', 'freelancing'],
    search: ['laptop', 'online', 'internet', 'website', 'app', 'computer', 'remote', 'digital', 'tech', 'work', 'office', 'email', 'screen', 'wfh', 'typing'],
    layers: [{doodle: 'laptop', x: 10, y: 20, size: 80, draw: [0, 1.2], width: 1.5, motion: [{kind: 'pulse', amp: 0.02, period: 1.4}]}],
  },
  ticket: {
    about: 'a ticket: a night out',
    tags: ['night out', 'nights out', 'concert tickets', 'cinema trip', 'entertainment'],
    search: ['ticket', 'tickets', 'event', 'concert', 'gig', 'cinema', 'movie', 'night out', 'fun', 'entertainment', 'show', 'festival', 'match', 'game', 'admission'],
    layers: [{doodle: 'ticket', x: 14, y: 20, size: 72, draw: [0, 1.1], color: 'accent2', width: 1.5, motion: [{kind: 'tip', deg: 6, period: 1.8}, {kind: 'bob', amp: 2, period: 1.8}]}],
  },
  siren: {
    about: 'a flashing siren: scam alert',
    tags: ['scam', 'scams', 'scammer', 'scammers', 'fraud', 'red flag', 'red flags', 'scam alert', 'too good to be true'],
    search: ['siren', 'alert', 'alarm', 'emergency', 'urgent', 'warning', 'danger', 'scam', 'fraud', 'police', 'red flag', 'beware', 'caution', 'stop'],
    layers: [
      {doodle: 'siren', x: 20, y: 14, size: 60, draw: [0, 1.2], color: 'accent', width: 1.6, motion: [{kind: 'pulse', amp: 0.06, period: 0.5}]},
      ...rays(50, 20, 24, 36, 5, 1.2, 'accent'),
    ],
  },
  castle: {
    about: 'a castle: the dream home',
    tags: ['dream home', 'dream house', 'mansion', 'living like a king', 'living like royalty'],
    search: ['castle', 'mansion', 'dream', 'dreams', 'luxury', 'big house', 'goals', 'rich', 'palace', 'royal', 'fancy', 'posh', 'fortress', 'empire'],
    layers: [{doodle: 'castle', x: 12, y: 14, size: 76, draw: [0, 1.4], width: 1.5, motion: [{kind: 'pulse', amp: 0.02, period: 2.2}]}],
  },
  sail: {
    about: 'a sailing boat, bobbing along',
    tags: ['smooth sailing', 'plain sailing', 'stay the course', 'ride it out', 'weather the storm'],
    search: ['sail', 'sailing', 'boat', 'cruise', 'steady', 'journey', 'voyage', 'sea', 'ocean', 'yacht', 'ship', 'drift', 'float', 'wave', 'tide'],
    layers: [
      {doodle: 'sailboat', x: 16, y: 10, size: 68, draw: [0, 1.2], width: 1.5, motion: [{kind: 'bob', amp: 4, period: 2.2}, {kind: 'tip', deg: 6, period: 2.2}]},
      {path: 'M6 86 q12 -8 24 0 t24 0 t24 0 t24 0', x: 0, y: 0, size: 100, draw: [1.2, 1.7], color: 'blue', width: 2, motion: [{kind: 'slide', dx: -12, at: 1.7, dur: 2.2, every: 2.2}]},
    ],
    loop: 4.4,
  },
  strong: {
    about: 'a dumbbell being lifted',
    tags: ['financially strong', 'financial muscle', 'heavy lifting', 'do the heavy lifting', 'get strong'],
    search: ['strong', 'strength', 'fitness', 'gym', 'training', 'discipline', 'muscle', 'heavy', 'lift', 'workout', 'power', 'tough', 'resilient', 'flex'],
    layers: [{doodle: 'dumbbell', x: 10, y: 24, size: 80, draw: [0, 1.1], width: 1.6, motion: [{kind: 'rise', dy: -12, at: 1.2, dur: 0.6}, {kind: 'bob', amp: 6, period: 1.4}]}],
  },
  news: {
    about: 'a newspaper: the headlines',
    tags: ['the headlines', 'headline', 'in the news', 'breaking news', 'the papers', 'the press'],
    search: ['news', 'headlines', 'headline', 'media', 'press', 'paper', 'newspaper', 'breaking', 'announcement', 'article', 'story', 'journalist', 'report'],
    layers: [{doodle: 'newspaper', x: 12, y: 14, size: 76, draw: [0, 1.3], width: 1.5, motion: [{kind: 'tip', deg: 2, period: 2.6}, {kind: 'pulse', amp: 0.02, period: 2.6}]}],
  },
  mic: {
    about: 'a microphone',
    tags: ['podcast', 'on the podcast', 'mic drop', 'interview', 'announcement'],
    search: ['mic', 'microphone', 'talk', 'speak', 'podcast', 'announce', 'say', 'voice', 'interview', 'speech', 'record', 'recording', 'sing', 'karaoke', 'mic drop'],
    layers: [{doodle: 'mic', x: 24, y: 10, size: 52, draw: [0, 1.1], width: 1.5, origin: '50% 100%', motion: [{kind: 'sway', deg: 5, period: 1.6}]}],
  },
  tv: {
    about: 'a television',
    tags: ['on the telly', 'binge watching', 'netflix and', 'streaming subscriptions', 'tv licence'],
    search: ['tv', 'television', 'telly', 'watch', 'show', 'netflix', 'series', 'binge', 'screen', 'streaming', 'film', 'movie', 'channel', 'remote', 'sofa'],
    layers: [{doodle: 'tv', x: 12, y: 16, size: 76, draw: [0, 1.3], width: 1.5, motion: [{kind: 'pulse', amp: 0.02, period: 1.2}]}],
  },
  health: {
    about: 'a stethoscope: health',
    tags: ['health insurance', 'the doctor', 'medical bills', 'sick pay', 'off sick'],
    search: ['health', 'doctor', 'nhs', 'hospital', 'medical', 'insurance', 'check up', 'illness', 'sick', 'ill', 'medicine', 'nurse', 'healthcare', 'wellbeing', 'dentist'],
    layers: [{doodle: 'stethoscope', x: 16, y: 12, size: 68, draw: [0, 1.3], color: 'blue', width: 1.5, motion: [{kind: 'sway', deg: 4, period: 2.2}]}],
  },
  baby: {
    about: 'a baby',
    tags: ['having a baby', 'new baby', 'new parents', 'childcare', 'child benefit', 'nursery fees'],
    search: ['baby', 'kids', 'children', 'child', 'family', 'parent', 'parents', 'newborn', 'nursery', 'toddler', 'pregnant', 'mum', 'dad', 'cute'],
    layers: [{doodle: 'baby', x: 18, y: 12, size: 64, draw: [0, 1.3], width: 1.5, motion: [{kind: 'sway', deg: 6, period: 2.4}, {kind: 'bob', amp: 2, period: 1.2}]}],
  },
  luck: {
    about: 'a four-leaf clover',
    tags: ['good luck', 'got lucky', 'pure luck', 'down to luck', 'lucky break', 'stroke of luck'],
    search: ['luck', 'lucky', 'fortune', 'chance', 'clover', 'charm', 'fingers crossed', 'hope', 'wish', 'irish', 'green', 'random', 'fate'],
    layers: [{doodle: 'clover', x: 18, y: 12, size: 64, draw: [0, 1.2], color: 'accent', width: 1.5, motion: [{kind: 'spin', period: 8}, {kind: 'bob', amp: 3, period: 2}]}],
  },
  forever: {
    about: 'an infinity sign, drawn and redrawn',
    tags: ['for the rest of your life', 'for life', 'forever', 'never ending', 'in perpetuity', 'never stops'],
    search: ['forever', 'infinite', 'infinity', 'endless', 'unlimited', 'always', 'limitless', 'eternal', 'never ends', 'long term', 'lifetime', 'ongoing', 'loop'],
    layers: [{doodle: 'infinity', x: 8, y: 26, size: 84, draw: [0, 1.4], color: 'blue', width: 1.8, motion: [{kind: 'pulse', amp: 0.05, period: 2}]}],
  },
  rainbow: {
    about: 'a rainbow: the pot of gold',
    tags: ['pot of gold', 'end of the rainbow', 'chasing rainbows', 'pipe dream'],
    search: ['rainbow', 'gold', 'dream', 'dreams', 'fantasy', 'too good to be true', 'hope', 'hopeful', 'optimistic', 'pride', 'colours', 'colors', 'magic', 'unicorn'],
    layers: [{doodle: 'rainbow', x: 8, y: 22, size: 84, draw: [0, 1.5], color: 'accent', width: 1.6, motion: [{kind: 'pulse', amp: 0.03, period: 2.2}]}],
  },
  stopwatch: {
    about: 'a stopwatch: against the clock',
    tags: ['against the clock', 'race against time', 'before the deadline', 'the deadline', 'running out of time'],
    search: ['stopwatch', 'timer', 'seconds', 'quick', 'fast', 'speed', 'race', 'deadline', 'countdown', 'hurry', 'rush', 'time', 'late', 'now'],
    layers: [{doodle: 'timer', x: 22, y: 12, size: 56, draw: [0, 1.1], width: 1.5, motion: [{kind: 'shake', deg: 3, period: 0.5}, {kind: 'pulse', amp: 0.04, period: 1}]}],
  },
  shop: {
    about: 'a little shop',
    tags: ['small business', 'local business', 'high street', 'open a shop', 'own business', 'start a business'],
    search: ['shop', 'store', 'business', 'small business', 'high street', 'retail', 'sell', 'selling', 'market', 'stall', 'owner', 'startup', 'entrepreneur', 'trade'],
    layers: [{doodle: 'store', x: 12, y: 14, size: 76, draw: [0, 1.4], width: 1.5, motion: [{kind: 'pulse', amp: 0.02, period: 2.2}]}],
  },
  location: {
    about: 'a map pin, dropping in',
    tags: ['where you live', 'in your area', 'local area', 'postcode', 'location location'],
    search: ['location', 'place', 'here', 'where', 'local', 'area', 'near me', 'map', 'pin', 'address', 'city', 'town', 'london', 'move', 'moving'],
    layers: [{doodle: 'map-pin', x: 24, y: 10, size: 52, draw: [0, 1.0], color: 'accent', width: 1.5, origin: '50% 100%', motion: [{kind: 'bob', amp: 5, period: 1.3}, {kind: 'sway', deg: 4, period: 2}]}],
  },
  tree: {
    about: 'a tree: decades of growth',
    tags: ['plant a tree', 'the best time to plant', 'oak tree', 'decades', 'over decades', 'for decades'],
    search: ['tree', 'long term', 'patience', 'patient', 'years', 'decades', 'roots', 'oak', 'nature', 'forest', 'wood', 'green', 'grow', 'shade', 'leaves'],
    layers: [{doodle: 'tree-deciduous', x: 14, y: 8, size: 72, draw: [0, 1.4], color: 'accent', width: 1.5, origin: '50% 100%', motion: [{kind: 'sway', deg: 3, period: 3}]}],
  },
  frozen: {
    about: 'a snowflake: frozen',
    tags: ['frozen', 'freeze', 'freezes', 'on ice', 'cold feet', 'frozen out'],
    search: ['frozen', 'freeze', 'cold', 'winter', 'ice', 'snow', 'pause', 'paused', 'on hold', 'stuck', 'chill', 'christmas', 'brr', 'stop'],
    layers: [{doodle: 'snowflake', x: 18, y: 14, size: 64, draw: [0, 1.3], color: 'blue', width: 1.5, motion: [{kind: 'spin', period: 12}, {kind: 'bob', amp: 3, period: 2.4}]}],
  },
  bike: {
    about: 'a bicycle rolling along',
    tags: ['cycle to work', 'cycling to work', 'on a bike', 'by bike'],
    search: ['bike', 'bicycle', 'cycling', 'cycle', 'commute', 'ride', 'riding', 'fitness', 'cheap travel', 'wheels', 'pedal', 'exercise'],
    layers: [{doodle: 'bike', x: 8, y: 22, size: 84, draw: [0, 1.4], width: 1.5, motion: [{kind: 'slide', dx: 14, at: 1.5, dur: 3, every: 3}, {kind: 'bob', amp: 1.5, period: 0.5}]}],
    loop: 4.5,
  },
  train: {
    about: 'the front of a train',
    tags: ['train fares', 'train fare', 'season ticket', 'commuting', 'the commute', 'on the tube'],
    search: ['train', 'commute', 'commuting', 'travel', 'rail', 'railway', 'tube', 'metro', 'station', 'journey', 'transport', 'public transport', 'bus'],
    layers: [{doodle: 'train-front', x: 18, y: 10, size: 64, draw: [0, 1.4], width: 1.5, motion: [{kind: 'shake', deg: 1, period: 0.2}, {kind: 'pulse', amp: 0.04, period: 2.4}]}],
  },
  'night-out': {
    about: 'a pint and a glass of wine',
    tags: ['nights out', 'night out', 'drinks with friends', 'at the pub', 'round of drinks', 'eating out'],
    search: ['night out', 'drinks', 'drink', 'pub', 'beer', 'wine', 'pint', 'party', 'weekend', 'takeaway', 'eating out', 'bar', 'cheers', 'friday', 'social'],
    layers: [
      {doodle: 'beer', x: 6, y: 18, size: 50, draw: [0, 1.0], color: 'accent2', width: 1.5, origin: '70% 100%', motion: [{kind: 'sway', deg: -6, period: 1.6}]},
      {doodle: 'wine', x: 52, y: 14, size: 46, draw: [1.0, 1.9], color: 'accent', width: 1.5, origin: '30% 100%', motion: [{kind: 'sway', deg: 6, period: 1.6}]},
    ],
  },
  shopping: {
    about: 'a shopping bag, swinging',
    tags: ['impulse buy', 'impulse buys', 'impulse purchase', 'retail therapy', 'shopping spree', 'splurge', 'splurged'],
    search: ['shopping', 'shop', 'buy', 'bought', 'spend', 'spending', 'splurge', 'impulse', 'haul', 'clothes', 'sale', 'bag', 'purchase', 'checkout', 'amazon', 'order'],
    layers: [{doodle: 'shopping-bag', x: 22, y: 12, size: 56, draw: [0, 1.1], color: 'accent', width: 1.5, origin: '50% 0%', motion: [{kind: 'sway', deg: 7, period: 1.5}]}],
  },
  verified: {
    about: 'a verified badge',
    tags: ['fca regulated', 'regulated', 'fscs protected', 'legit', 'legitimate', 'the real deal'],
    search: ['verified', 'approved', 'certified', 'legit', 'official', 'trusted', 'trust', 'genuine', 'real', 'authentic', 'badge', 'tick', 'checked', 'confirmed', 'safe'],
    layers: [{doodle: 'badge-check', x: 18, y: 14, size: 64, draw: [0, 1.2], color: 'blue', width: 1.5, motion: [{kind: 'pop', at: 1.2}, {kind: 'pulse', amp: 0.04, period: 1.6}]}],
  },
  contract: {
    about: 'a scroll: the paperwork',
    tags: ['the contract', 'sign the contract', 'terms and conditions', 'the paperwork', 'your will', 'make a will'],
    search: ['contract', 'agreement', 'terms', 'document', 'paperwork', 'sign', 'signed', 'legal', 'will', 'policy', 'form', 'forms', 'letter', 'deed', 'lease'],
    layers: [{doodle: 'scroll', x: 16, y: 12, size: 68, draw: [0, 1.3], width: 1.5, motion: [{kind: 'tip', deg: 3, period: 2.4}]}],
  },
  compass: {
    about: 'a compass, finding north',
    tags: ['which way', 'find your way', 'a sense of direction', 'lost your way', 'the right direction'],
    search: ['compass', 'direction', 'plan', 'navigate', 'lost', 'strategy', 'route', 'path', 'way', 'guide', 'north', 'map', 'explore', 'find', 'where'],
    layers: [{doodle: 'compass', x: 18, y: 14, size: 64, draw: [0, 1.3], width: 1.5, motion: [{kind: 'sway', deg: 20, period: 1.8}]}],
  },
  rescue: {
    about: 'a life ring: the safety net',
    tags: ['safety net', 'bail you out', 'bailed out', 'bail out', 'lifeline', 'a lifeline', 'rainy day fund'],
    search: ['rescue', 'help', 'lifeline', 'bail out', 'bailout', 'safety net', 'emergency', 'emergency fund', 'saved', 'support', 'save me', 'sos', 'backup', 'cushion'],
    layers: [{doodle: 'life-buoy', x: 18, y: 14, size: 64, draw: [0, 1.3], color: 'accent', width: 1.5, motion: [{kind: 'spin', period: 10}, {kind: 'bob', amp: 3, period: 2}]}],
  },
  office: {
    about: 'an office block',
    tags: ['your employer', 'the company', 'big corporation', 'corporate', 'the office', 'nine to five', '9 to 5'],
    search: ['office', 'company', 'corporate', 'corporation', 'job', 'employer', 'business', 'work', 'hq', 'building', 'career', 'boss', 'employee', 'city'],
    layers: [{doodle: 'building-2', x: 18, y: 10, size: 64, draw: [0, 1.4], width: 1.5, motion: [{kind: 'pulse', amp: 0.02, period: 2.2}]}],
  },
  petrol: {
    about: 'a fuel pump',
    tags: ['petrol prices', 'fuel prices', 'price of petrol', 'fill up the car', 'filling up', 'energy bills', 'energy bill'],
    search: ['petrol', 'fuel', 'gas', 'diesel', 'pump', 'filling up', 'energy', 'bill', 'bills', 'prices', 'car', 'driving', 'station', 'oil', 'electric'],
    layers: [{doodle: 'fuel', x: 20, y: 12, size: 60, draw: [0, 1.2], width: 1.5, motion: [{kind: 'bob', amp: 2, period: 2}]}],
  },
  giving: {
    about: 'a hand holding out coins',
    tags: ['give back', 'giving back', 'donate', 'donation', 'to charity', 'generous', 'generosity', 'hand it over'],
    search: ['give', 'giving', 'donate', 'donation', 'charity', 'tip', 'generous', 'pay', 'paying', 'hand over', 'hand out', 'share', 'sharing', 'offer', 'gift', 'help'],
    layers: [{doodle: 'hand-coins', x: 14, y: 14, size: 72, draw: [0, 1.3], color: 'accent2', width: 1.5, motion: [{kind: 'bob', amp: 3, period: 1.8}]}],
  },
  music: {
    about: 'a pair of headphones',
    tags: ['spotify subscription', 'music subscription', 'playlist', 'put your headphones on'],
    search: ['music', 'song', 'listen', 'spotify', 'playlist', 'tune', 'vibe', 'vibes', 'headphones', 'audio', 'sound', 'dj', 'beat', 'radio', 'jam'],
    layers: [{doodle: 'headphones', x: 16, y: 14, size: 68, draw: [0, 1.2], width: 1.5, motion: [{kind: 'bob', amp: 3, period: 0.6}, {kind: 'sway', deg: 3, period: 1.2}]}],
  },
  game: {
    about: 'a game controller',
    tags: ['video games', 'gaming', 'level up', 'levelling up', 'next level', 'the game'],
    search: ['game', 'games', 'gaming', 'play', 'playing', 'console', 'xbox', 'playstation', 'nintendo', 'fun', 'level up', 'controller', 'gamer', 'win', 'score'],
    layers: [{doodle: 'gamepad-2', x: 10, y: 20, size: 80, draw: [0, 1.3], width: 1.5, motion: [{kind: 'shake', deg: 3, period: 0.3, at: 1.3, for: 0.6}, {kind: 'bob', amp: 2, period: 1.4}]}],
  },
  pet: {
    about: 'a dog',
    tags: ['your dog', 'your cat', 'vet bills', 'pet insurance', 'the vet', 'a pet'],
    search: ['pet', 'dog', 'cat', 'puppy', 'kitten', 'vet', 'animal', 'animals', 'pets', 'doggo', 'woof', 'paw', 'good boy', 'cute'],
    layers: [{doodle: 'dog', x: 16, y: 12, size: 68, draw: [0, 1.3], width: 1.5, motion: [{kind: 'bob', amp: 3, period: 0.7}, {kind: 'tip', deg: 3, period: 1.4}]}],
  },
  food: {
    about: 'an apple: the food shop',
    tags: ['food shop', 'food shopping', 'the big shop', 'groceries', 'grocery', 'weekly shop', 'meal prep', 'meal plan'],
    search: ['food', 'groceries', 'eat', 'eating', 'healthy', 'diet', 'supermarket', 'meal', 'lunch', 'dinner', 'fruit', 'apple', 'snack', 'hungry', 'cook', 'cooking', 'kitchen'],
    layers: [{doodle: 'apple', x: 20, y: 12, size: 60, draw: [0, 1.1], color: 'accent', width: 1.5, motion: [{kind: 'sway', deg: 6, period: 2}, {kind: 'bob', amp: 2, period: 2}]}],
  },
  smoking: {
    about: 'a cigarette: an expensive habit',
    tags: ['smoking', 'cigarettes', 'pack a day', 'quit smoking', 'vaping'],
    search: ['smoking', 'cigarette', 'vape', 'vaping', 'bad habit', 'quit', 'habit', 'addiction', 'addicted', 'smoke', 'tobacco', 'stop smoking'],
    layers: [{doodle: 'cigarette', x: 8, y: 30, size: 84, draw: [0, 1.0], width: 1.5, motion: [{kind: 'tip', deg: 3, period: 2}]}],
  },
  creative: {
    about: 'a paint palette',
    tags: ['creative side', 'creative work', 'as a hobby', 'your hobby', 'hobbies'],
    search: ['creative', 'art', 'design', 'paint', 'painting', 'colour', 'color', 'artist', 'hobby', 'craft', 'drawing', 'draw', 'make', 'maker', 'style'],
    layers: [{doodle: 'palette', x: 16, y: 14, size: 68, draw: [0, 1.3], color: 'accent', width: 1.5, motion: [{kind: 'sway', deg: 5, period: 2.2}]}],
  },
  measure: {
    about: 'a ruler: measure it',
    tags: ['measure it', 'track it', 'what gets measured', 'keep track', 'track your spending', 'track your'],
    search: ['measure', 'measuring', 'track', 'tracking', 'metric', 'size', 'how big', 'how much', 'ruler', 'length', 'scale', 'compare', 'inch', 'cm', 'progress'],
    layers: [{doodle: 'ruler', x: 14, y: 14, size: 72, draw: [0, 1.2], width: 1.5, motion: [{kind: 'tip', deg: 4, period: 2.4}]}],
  },
  night: {
    about: 'a moon and a star: late at night',
    tags: ['late at night', 'at night', 'stay up late', 'overnight', 'the small hours'],
    search: ['night', 'late', 'evening', 'dark', 'tonight', 'overnight', 'stay up', 'midnight', 'moon', 'stars', 'bedtime', 'nocturnal', 'dream'],
    layers: [
      {doodle: 'moon', x: 14, y: 20, size: 56, draw: [0, 0.9], color: 'blue', width: 1.5, motion: [{kind: 'sway', deg: 3, period: 3}]},
      {doodle: 'star', x: 66, y: 10, size: 22, draw: [0.9, 1.2], color: 'accent2', width: 1.6, fill: true, motion: [{kind: 'pulse', amp: 0.2, period: 1.2}]},
    ],
  },
  fishing: {
    about: 'a fish on the line: patience, and phishing',
    tags: ['phishing', 'phishing email', 'phishing scam', 'take the bait', 'hook, line and sinker', 'fishing'],
    search: ['fish', 'fishing', 'phishing', 'bait', 'hook', 'catch', 'patience', 'scam', 'link', 'lure', 'reel', 'sea', 'ocean', 'trap'],
    layers: [{doodle: 'fish', x: 14, y: 22, size: 72, draw: [0, 1.2], color: 'blue', width: 1.5, motion: [{kind: 'slide', dx: 10, at: 1.3, dur: 1.4, every: 2.8}, {kind: 'bob', amp: 3, period: 1.4}]}],
    loop: 4.1,
  },
  'early-bird': {
    about: 'a bird: the early one',
    tags: ['early bird', 'the early bird', 'head start', 'a head start', 'start early', 'started early', 'starting early'],
    search: ['bird', 'early', 'first', 'morning', 'start early', 'head start', 'ahead', 'before', 'beginner', 'begin', 'sunrise', 'tweet', 'twitter', 'fly'],
    layers: [{doodle: 'bird', x: 16, y: 16, size: 68, draw: [0, 1.2], width: 1.5, motion: [{kind: 'bob', amp: 4, period: 0.9}, {kind: 'sway', deg: 4, period: 1.8}]}],
  },
  bug: {
    about: 'a bug: something is broken',
    tags: ['a bug', 'the bug', 'glitch', 'glitchy', 'bugs in', 'is broken', 'went wrong'],
    search: ['bug', 'glitch', 'problem', 'issue', 'broken', 'error', 'pest', 'fault', 'crash', 'fail', 'failed', 'wrong', 'insect', 'annoying', 'fix'],
    layers: [{doodle: 'bug', x: 18, y: 14, size: 64, draw: [0, 1.2], width: 1.5, motion: [{kind: 'shake', deg: 4, period: 0.2}, {kind: 'slide', dx: 8, at: 1.4, dur: 1, every: 2}]}],
    loop: 3.4,
  },
};

Object.assign(ART, ILLUS); // the traced illustrations join the catalogue under their own names
Object.assign(ART, FLIPS); // and the stop-motion ones, which only come when a scene names them

// a drawing with no tags (the stop-motion ones) is never picked by the words: an empty pattern would match every scene
const PICK: [RegExp, string][] = Object.entries(ART).filter(([, def]) => def.tags.length > 0).map(([name, def]) => [new RegExp('\\b(' + def.tags.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'i'), name]);

/** The drawing for a scene: the one it names, else the one whose words come up most in the texts (a longer, more
 * specific phrase counts for more than a short word, so "piggy bank" beats "save"). `among` narrows the choice. */
export const pickArt = (explicit: string | undefined, ...texts: (string | undefined)[]): string | undefined => (explicit ? (ART[explicit] ? explicit : undefined) : pickArtAmong(() => true, ...texts));

export const pickArtAmong = (among: (name: string) => boolean, ...texts: (string | undefined)[]): string | undefined => {
  const hay = texts.filter(Boolean).join(' ');
  let best: string | undefined;
  let bestScore = 0;
  for (const [re, name] of PICK) {
    if (!among(name)) continue;
    const hits = hay.match(new RegExp(re.source, 'gi')) ?? [];
    const score = hits.reduce((n, h) => n + 2 + h.length, 0);
    if (score > bestScore) {
      best = name;
      bestScore = score;
    }
  }
  return best;
};

/** a picture of people and situations (a traced illustration or a stop-motion one) rather than a drawn icon */
export const isTraced = (name: string) => !!(ART[name]?.svg || ART[name]?.flip);

/** Every drawing's name, with what it shows and the words that call it up (for the studio's library). */
export const artCatalogue = () => Object.entries(ART).map(([name, def]) => ({name, about: def.about, tags: def.tags, search: def.search ?? []}));

// ------------------------------------------------------------------ drawing one

const colorOf = (brand: Brand, c?: Color) => (c === 'accent' ? brand.accent : c === 'accent2' ? brand.accent2 : c === 'blue' ? brand.blue ?? brand.accent : c === 'muted' ? brand.muted : brand.ink);

type ArtProps = {name: string; size: number; brand: Brand; start?: number; seed?: number; style?: React.CSSProperties; by?: number}; // by: the frame a short scene needs the drawing finished by

/** rough length of a path from its coordinates (control points included): enough to pace a pen */
const pathLen = (d: string) => {
  const nums = d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
  let len = 0;
  for (let i = 2; i + 1 < nums.length; i += 2) len += Math.hypot(nums[i] - nums[i - 2], nums[i + 1] - nums[i - 1]);
  return len;
};
/** how long a traced drawing takes to draw: a marker covers about 900 units a second, between 1.2 and 4.5 seconds */
export const tracedSeconds = (svg: {paths: string[]}, quick = false) => {
  const len = svg.paths.reduce((n, d) => n + pathLen(d), 0);
  return quick ? Math.max(1.0, Math.min(1.8, len / 1800)) : Math.max(1.2, Math.min(4.5, len / 900)); // quick: the illustrated style, where the picture should be down before the words start
};

/** A traced illustration drawn stroke by stroke in its own order, each stroke published for the hand to follow. */
const Traced: React.FC<{def: NonNullable<ArtDef['svg']>; size: number; brand: Brand; start: number; seed: number; style?: React.CSSProperties; by?: number}> = ({def, size, brand, start, seed, style, by}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const lens = React.useMemo(() => def.paths.map(pathLen), [def]);
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  // a short scene wants the picture down before its cut: the strokes go on faster (never quicker than a third of a second)
  const frames = Math.max(Math.round(fps * 0.3), Math.min(Math.round(tracedSeconds(def, !!brand.illustrated) * fps), by !== undefined ? by - start : Infinity));
  const win: [number, number] = [start, start + frames];
  const d = Math.max(0, Math.min(1, (frame - win[0]) / Math.max(1e-6, win[1] - win[0])));
  const tilt = (rnd(seed) - 0.5) * 3;
  const scale = size / Math.max(def.w, def.h);
  let acc = 0;
  return (
    <div style={{position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `rotate(${tilt}deg)`, ...style}}>
      <svg width={def.w * scale} height={def.h * scale} viewBox={`0 0 ${def.w} ${def.h}`} fill="none" stroke={brand.ink} strokeWidth={def.width} strokeLinecap="round" strokeLinejoin="round" style={{overflow: 'visible', display: 'block'}}>
        {def.paths.map((p, i) => {
          const from = acc / total;
          acc += lens[i];
          const to = acc / total;
          const q = Math.max(0, Math.min(1, (d - from) / Math.max(1e-6, to - from)));
          const dash = q < 1 ? {pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - q} : {};
          return <path key={i} d={p} {...dash} data-pen-win={`${win[0]},${win[1]},l`} data-pen-sub={`${from},${to}`} visibility={q <= 0 ? 'hidden' : undefined} />;
        })}
      </svg>
    </div>
  );
};

/** How long a stop-motion drawing's poses take to play once, in frames: the first pose held a beat, then one step a pose. */
const flipFrames = (def: NonNullable<ArtDef['flip']>, fps: number) => Math.round(fps * 0.3) + Math.round(def.step * fps) * (def.frames.length - 1);

/** A stop-motion drawing: the first pose lands, the rest follow in steps (8 or so a second, the way stop motion moves),
 * and the last pose holds, or the run repeats after a pause with `loop`. A short scene (`by`) gets quicker steps so
 * the last pose is up before its cut. The frames are ink on a transparent ground, so the board shows through. */
const Flip: React.FC<{def: NonNullable<ArtDef['flip']>; size: number; start: number; style?: React.CSSProperties; by?: number}> = ({def, size, start, style, by}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame - start;
  if (t < 0) return null;
  const hold = Math.round(fps * 0.3);
  const n = def.frames.length;
  const room = by !== undefined ? by - start - hold : Infinity;
  const step = Math.max(2, Math.min(Math.round(def.step * fps), Math.floor(room / Math.max(1, n - 1))));
  const run = hold + step * (n - 1);
  const tt = def.loop ? t % (run + Math.round(fps * 0.9)) : t;
  const i = tt < hold ? 0 : Math.min(n - 1, 1 + Math.floor((tt - hold) / step));
  const appear = Math.min(1, t / 4);
  return (
    <div style={{position: 'relative', width: size, height: size, opacity: appear, ...style}}>
      {def.frames.map((f, k) => (
        // every pose is mounted so each is loaded before it is needed; only the current one shows
        <Img key={f} src={staticFile(f)} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', visibility: k === i ? 'visible' : 'hidden'}} />
      ))}
    </div>
  );
};

/** One drawing from the catalogue, `size` px square, its strokes going on from frame `start`, then moving. */
export const Art: React.FC<ArtProps> = ({name, size, brand, start = 0, seed = 1, style, by}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const def = ART[name];
  if (!def) return null;
  if (def.svg) return <Traced def={def.svg} size={size} brand={brand} start={start} seed={seed} style={style} by={by} />;
  if (def.flip) return <Flip def={def.flip} size={size} start={start} style={style} by={by} />;
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
  const {height, width, isVertical} = useLayout();
  const name = pickArt(scene.props.art, undefined);
  if (!name || !brand.board) return null;
  if (scene.type === 'broll' || scene.type === 'news') return null; // the footage and the clipping carry no drawing
  // on a text scene in the illustrated style a named traced drawing is the scene's big picture (PaperText draws it), unless it was dragged somewhere
  if (brand.illustrated && (scene.type === 'text' || scene.type === 'hook') && isTraced(name) && scene.props.art_x === undefined) return null;
  // a Short has its lines across the top, the character lower right and the captions in between: a placed drawing
  // goes lower left, no bigger than a fifth of the height, whatever the long video's art_at and art_size say
  const at = isVertical ? 'bl' : String(scene.props.art_at ?? 'tr');
  const size = height * (isVertical ? Math.min(0.2, Number(scene.props.art_size ?? 0.2)) : Math.max(0.12, Math.min(0.8, Number(scene.props.art_size ?? 0.3))));
  const start = Math.round(Number(scene.props.art_start ?? 0.8) * fps);
  // `art_x` / `art_y`: where its centre sits, as a share of the width and height (dragged into place in the studio)
  const free = scene.props.art_x !== undefined && scene.props.art_y !== undefined;
  const place: React.CSSProperties = free ? {left: Number(scene.props.art_x) * width - size / 2, top: Number(scene.props.art_y) * height - size / 2} : PLACE[at] ?? PLACE.tr;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div style={{position: 'absolute', ...place, width: size, height: size}}>
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

/** One drawing, finished and settled, on nothing: the still the studio uses for thumbnails and previews. */
export const ArtStill: React.FC<{name: string; brand?: Brand}> = ({name, brand}) => {
  const {width, height, fps} = useVideoConfig();
  const b = brand ?? ({bg: 'transparent', ink: '#1d1d1f', muted: '#767a82', accent: '#1b8a4c', accent2: '#d93025', blue: '#1a56db', marker: '#fff176', board: true} as Brand);
  const def = ART[name];
  const drawn = def ? Math.max(...def.layers.map((l) => l.draw[1])) : 0;
  const size = Math.min(width, height) * 0.9;
  // a negative start puts the drawing part-way through its motion (mid-roll, mid-flight), at frame 0
  return (
    <AbsoluteFill style={{background: 'transparent', justifyContent: 'center', alignItems: 'center'}}>
      <Art name={name} size={size} brand={b} start={-Math.round((drawn + 0.45 * (def?.loop ?? 2.4)) * fps)} seed={3} />
    </AbsoluteFill>
  );
};

/** How long a drawing takes to draw and run through one loop, in seconds (for the GIF renders). */
export const artSeconds = (name: string) => {
  const def = ART[name];
  if (!def) return 3;
  if (def.svg) return Math.ceil(tracedSeconds(def.svg) + 1.2);
  if (def.flip) return Math.ceil(flipFrames(def.flip, 30) / 30 + 1.2);
  const drawn = Math.max(...def.layers.map((l) => l.draw[1]));
  return Math.ceil(drawn + (def.loop ?? 2.4) + 0.4);
};

void DOODLES;
void interpolate;
