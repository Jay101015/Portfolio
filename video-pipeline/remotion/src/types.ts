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
};

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
  mouth?: number[]; // per-frame mouth openness 0..1
  scenes: Scene[];
};
