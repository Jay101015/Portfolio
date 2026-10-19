import type {AvatarConfig} from './avatar/Avatar';

export type Word = {w: string; s: number; e: number};

export type Brand = {
  name: string;
  bg: string;
  panel: string;
  text: string;
  muted: string;
  accent: string;
  accent2: string;
  font: string;
  display: string; // headline face
  ink: string; // outline / primary text colour
  toon: boolean; // hand-drawn styling on (paper, outlines, hard cuts)
};

export type Cue = {t: number; pose?: string; face?: string}; // mid-scene change, absolute seconds

export type SceneType =
  | 'title'
  | 'text'
  | 'stat'
  | 'list'
  | 'chart'
  | 'compare'
  | 'quote'
  | 'image'
  | 'still'
  | 'clip'
  | 'poster'
  | 'score'
  | 'avatar'
  | 'outro';

export type Scene = {
  id: number;
  type: SceneType;
  start: number; // seconds
  end: number; // seconds
  narration: string;
  words?: Word[];
  cues?: Cue[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: Record<string, any>;
};

export type Storyboard = {
  title: string;
  slug: string;
  fps: number;
  durationSec: number;
  audio?: string | null;
  captions: boolean;
  theme?: string;
  brand: Partial<Brand>;
  avatar?: Partial<AvatarConfig>;
  host?: 'drawn' | 'painted'; // the hand-drawn SVG character or the painted portrait rig (default)
  mouth?: number[]; // per-frame mouth openness 0..1
  visemes?: number[]; // per-frame mouth shape 0..6 (rest, open, wide, round, closed, teeth-lip, tongue)
  scenes: Scene[];
};
