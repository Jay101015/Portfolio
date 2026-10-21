import type {Brand} from './types';

export const presets: Record<string, Brand> = {
  // Hand-drawn storytime look: paper background, ink text, marker colours, hard cuts.
  toon: {
    name: 'MONEY MOVES',
    bg: '#f7f0e3',
    panel: '#ffffff',
    text: '#1a1714',
    muted: '#6f6760',
    accent: '#e5484d',
    accent2: '#ffb020',
    font: "'Patrick Hand', 'Comic Sans MS', 'Chalkboard SE', cursive",
    display: "'Gochi Hand', 'Caveat Brush', 'Comic Sans MS', cursive",
    ink: '#1a1714',
    toon: true,
  },
  movie: {
    name: 'REEL TAKES',
    bg: '#0e0b10',
    panel: '#1c1620',
    text: '#f6f1ee',
    muted: '#a89ca8',
    accent: '#e63946',
    accent2: '#f4a261',
    font: 'Inter, "Helvetica Neue", Arial, sans-serif',
    display: '"Space Grotesk", Inter, "Helvetica Neue", Arial, sans-serif',
    ink: '#f6f1ee',
    toon: false,
  },
  // Motion-graphics look for money explainers: deep navy, green and gold, big type, no host.
  finance: {
    name: 'MONEY MOVES',
    bg: '#0b1020',
    panel: '#141b33',
    text: '#f4f6fb',
    muted: '#9aa3b8',
    accent: '#22c55e',
    accent2: '#f5b942',
    font: 'Inter, "Helvetica Neue", Arial, sans-serif',
    display: '"Space Grotesk", Inter, "Helvetica Neue", Arial, sans-serif',
    ink: '#f4f6fb',
    toon: false,
  },
};

presets.paper = {
  // The notebook look: a page someone wrote on. Warm paper, ink, a serif for the big words, handwriting for the notes,
  // charts sketched by hand, a highlighter for the word being said. No glow, no gradients, no pills.
  name: 'MONEY MOVES',
  bg: '#f4efe6',
  panel: '#fffdf8',
  text: '#1b1a17',
  muted: '#6f6a60',
  accent: '#1f6f4a',
  accent2: '#c2410c',
  font: 'Inter, "Helvetica Neue", Arial, sans-serif',
  display: 'Fraunces, Georgia, "Times New Roman", serif',
  ink: '#1b1a17',
  toon: false,
  paper: true,
  hand: 'Caveat, "Comic Sans MS", cursive',
  marker: '#ffe66d',
};

presets.whiteboard = {
  // The whiteboard look: the same page layouts as paper, but a clean white board, marker handwriting for everything,
  // every line written on left to right at a marker's pace, doodles drawn stroke by stroke, and a hand holding the
  // marker that follows whatever is being written. Three markers: black, green, red (and a blue for charts).
  name: 'MONEY MOVES',
  bg: '#fbfbf9',
  panel: '#ffffff',
  text: '#1d1d1f',
  muted: '#767a82',
  accent: '#1b8a4c',
  accent2: '#d93025',
  font: "'Patrick Hand', 'Comic Sans MS', cursive",
  display: "'Caveat Brush', 'Patrick Hand', cursive",
  ink: '#1d1d1f',
  toon: false,
  paper: true,
  board: true,
  hand: "Caveat, 'Patrick Hand', cursive",
  marker: '#fff176',
  blue: '#1a56db',
};

// The board look in other skins, so videos do not all look the same: the same writing, hand and drawings on a
// chalkboard, a lined notebook page, squared paper and a warm cream card. Each keeps three marker colours.
presets.chalkboard = {
  ...presets.whiteboard,
  bg: '#1f3a2f',
  panel: '#24453a',
  text: '#f3f1e6',
  muted: '#b9c3b6',
  accent: '#ffd166',
  accent2: '#ff8fa3',
  ink: '#f3f1e6',
  marker: '#5fb4a2',
  blue: '#8ecae6',
  surface: 'chalk',
};
presets.notebook = {
  ...presets.whiteboard,
  bg: '#fdfcf7',
  panel: '#ffffff',
  text: '#1e2a5a',
  muted: '#6b7390',
  accent: '#1e2a5a',
  accent2: '#d62839',
  ink: '#1e2a5a',
  marker: '#ffe66d',
  blue: '#2a7de1',
  surface: 'lined',
};
presets.graph = {
  ...presets.whiteboard,
  bg: '#f6fbfb',
  panel: '#ffffff',
  text: '#143d4a',
  muted: '#6f8a93',
  accent: '#0f766e',
  accent2: '#e76f51',
  ink: '#143d4a',
  marker: '#fff176',
  blue: '#2a6f97',
  surface: 'grid',
};
presets.cream = {
  ...presets.whiteboard,
  bg: '#f7efe1',
  panel: '#fffaf0',
  text: '#3b2a1a',
  muted: '#8a7560',
  accent: '#2a7f62',
  accent2: '#c0392b',
  ink: '#3b2a1a',
  marker: '#ffd980',
  blue: '#3a5ba0',
  surface: 'cream',
};

export const defaultBrand: Brand = presets.toon;

/** Card look that follows the theme: ink-outlined white card on paper, soft panel on dark. */
export const card = (b: Brand, u: number, tilt = 0): React.CSSProperties =>
  b.toon
    ? {background: b.panel, border: `${5 * u}px solid ${b.ink}`, borderRadius: 22 * u, boxShadow: `${10 * u}px ${10 * u}px 0 ${b.ink}`, transform: tilt ? `rotate(${tilt}deg)` : undefined}
    : {background: `${b.panel}dd`, border: `1px solid ${b.text}22`, borderRadius: 28 * u};

export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
