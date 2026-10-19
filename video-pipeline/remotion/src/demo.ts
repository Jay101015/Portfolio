import type {Storyboard, Word} from './types';
import {presets} from './theme';

// Evenly spaced placeholder word timings so the studio preview works without an aligned voiceover.
const spread = (text: string, start: number, end: number): Word[] => {
  const ws = text.split(/\s+/).filter(Boolean);
  const step = (end - start) / Math.max(1, ws.length);
  return ws.map((w, i) => ({w, s: start + i * step, e: start + (i + 1) * step - 0.05}));
};

const n1 = 'What should you actually do with your first ten thousand dollars?';
const n2 = 'Most people get here and freeze. So the money sits in checking, earning nothing.';
const n3 = 'Here is the order that works. Build a starter emergency fund. Kill any debt above eight percent. Then invest the rest.';
const n4 = 'Left alone in a broad index fund at seven percent a year, that ten thousand becomes about seventy six thousand in thirty years.';

export const demoStoryboard: Storyboard = {
  title: 'Your First $10,000',
  slug: 'demo',
  fps: 30,
  durationSec: 28,
  audio: null,
  captions: true,
  theme: 'toon',
  brand: presets.toon,
  avatar: {},
  scenes: [
    {id: 1, type: 'avatar', start: 0, end: 5, narration: n1, words: spread(n1, 0.3, 4.6), props: {headline: 'Your First $10,000', sub: 'Demo storyboard', pose: 'wave'}},
    {id: 2, type: 'stat', start: 5, end: 11, narration: n2, words: spread(n2, 5.2, 10.6), props: {value: '$10,000', label: 'Sitting in checking', sub: 'Earning roughly nothing', source: 'Illustrative'}},
    {id: 3, type: 'list', start: 11, end: 19, narration: n3, words: spread(n3, 11.2, 18.6), props: {title: 'The order', items: ['Starter emergency fund', 'Kill any debt above 8%', 'Invest the rest']}},
    {id: 4, type: 'chart', start: 19, end: 28, narration: n4, words: spread(n4, 19.2, 27.4), props: {chartType: 'line', title: '$10,000 at 7% a year', yFormat: '$', xLabel: 'Year', series: [{name: 'Index fund', points: [[0, 10000], [5, 14026], [10, 19672], [15, 27590], [20, 38697], [25, 54274], [30, 76123]]}], source: 'Compound growth, 7% annual, illustrative'}},
  ],
};
