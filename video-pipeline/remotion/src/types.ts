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
  paper?: boolean; // the notebook look: warm paper, serif type, sketched charts and handwritten notes
  hand?: string; // handwriting face for annotations on the paper look
  marker?: string; // highlighter colour on the paper look
  board?: boolean; // the whiteboard look: paper layouts, but everything writes itself with a marker and a hand follows
  blue?: string; // the third marker on the board
  surface?: 'board' | 'chalk' | 'lined' | 'grid' | 'cream'; // what the board look is drawn on (default a whiteboard)
  autoArt?: boolean; // little drawings picked from the words in the corner of scenes (`brand.doodles: on`; off by default)
  corner?: boolean; // the channel name in the page corner (`brand.corner: off` hides it)
  fullText?: boolean; // text scenes write every word said (`brand.text: full`); off: the few words that carry it
  creditsOnScreen?: boolean; // footage credits drawn on the picture (`credits: screen`); off: they go to credits.txt for the description
  illustrated?: boolean; // the illustrated style (`brand.style: illustrated`): traced people-and-scene drawings, large, on every scene whose words call one up
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
  | 'outro'
  | 'art'
  | 'hook' | 'takeaway'
  | 'broll' // stock footage filling the whole frame, a short caption and the credit over it
  | 'news' // a real headline on a clipping card: outlet, date, the line
  | 'recap'
  | 'bite'
  | 'grow'
  | 'pie'
  | 'shrink';

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
  hand?: boolean; // show the marker hand following the writing (`hand: on`); off by default, the strokes draw themselves
  theme?: string;
  brand: Partial<Brand>;
  avatar?: Partial<AvatarConfig>;
  host?: 'drawn' | 'painted' | 'none'; // the painted portrait rig, the hand-drawn SVG character, or no host at all (motion graphics carry the video)
  mouth?: number[]; // per-frame mouth openness 0..1
  visemes?: number[]; // per-frame mouth shape 0..6 (rest, open, wide, round, closed, teeth-lip, tongue)
  scenes: Scene[];
  hook?: string; // a Short: the line pinned at the top of the frame for the whole video
  short?: string; // a Short's name (short-1, ...)
};
