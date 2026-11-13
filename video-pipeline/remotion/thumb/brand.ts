import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';

// The thumbnail is its own Remotion entry and imports nothing from ../src, so it type-checks and bundles while the
// renderer is being edited. The channel's colours (library/brand/palette.md) are copied here;
// tests/test_thumbnail.py checks them against the whiteboard preset in ../src/theme.ts.
export const C = {
  navy: '#041B3C', // every word and block that is not a loss
  loss: '#D7263D', // red only ever means a loss: a figure or a line that starts with a minus
  green: '#0B8F58',
  marker: '#FFE86B', // held with the others; no layout draws a highlight, ring, arrow or hand
  paper: '#F8F9F8',
} as const;

export const W = 1280;
export const H = 720;

// YouTube prints the video's length over the bottom-right corner. No text and no text block may reach into this
// share of the frame; pipeline/thumbnail.py holds the same two numbers and checks every render against them.
export const CORNER = {w: 0.22, h: 0.18};

export const HAND = "'Caveat Brush', cursive"; // the lettering of the opening frame he approved
export const HEAVY = 'Inter, Arial, sans-serif';

// Faces come from public/fonts (the builder links remotion/public/fonts into a temporary public folder), so a render
// never needs the network. A face that fails to load stops the render: a thumbnail in a fallback face is wrong.
const f = (family: string, file: string, weight: string) => loadFont({family, url: staticFile(`fonts/${file}`), format: 'woff2', weight});
export const fontsReady: Promise<unknown> = Promise.all([
  f('Caveat Brush', 'caveat-brush-latin-400-normal.woff2', '400'),
  f('Inter', 'inter-latin-700-normal.woff2', '700'),
  f('Inter', 'inter-latin-800-normal.woff2', '800'),
]);
