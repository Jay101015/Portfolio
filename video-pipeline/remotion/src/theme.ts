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

export const defaultBrand: Brand = presets.toon;

/** Card look that follows the theme: ink-outlined white card on paper, soft panel on dark. */
export const card = (b: Brand, u: number, tilt = 0): React.CSSProperties =>
  b.toon
    ? {background: b.panel, border: `${5 * u}px solid ${b.ink}`, borderRadius: 22 * u, boxShadow: `${10 * u}px ${10 * u}px 0 ${b.ink}`, transform: tilt ? `rotate(${tilt}deg)` : undefined}
    : {background: `${b.panel}dd`, border: `1px solid ${b.text}22`, borderRadius: 28 * u};

export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
