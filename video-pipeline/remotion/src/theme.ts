import type {Brand} from './types';

export const presets: Record<string, Brand> = {
  movie: {
    name: 'REEL TAKES',
    bg: '#0e0b10',
    panel: '#1c1620',
    text: '#f6f1ee',
    muted: '#a89ca8',
    accent: '#e63946',
    accent2: '#f4a261',
    font: 'Inter, "Inter Display", "Helvetica Neue", Arial, sans-serif',
  },
  finance: {
    name: 'MONEY MOVES',
    bg: '#0b1020',
    panel: '#141b33',
    text: '#f4f6fb',
    muted: '#9aa3b8',
    accent: '#22c55e',
    accent2: '#f5b942',
    font: 'Inter, "Inter Display", "Helvetica Neue", Arial, sans-serif',
  },
};

export const defaultBrand: Brand = presets.movie;

export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
