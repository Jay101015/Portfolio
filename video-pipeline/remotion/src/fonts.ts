import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';

// Hand-lettered faces bundled in public/fonts (from @fontsource), so renders never hit the network.
export const fontsReady = Promise.all([
  loadFont({family: 'Patrick Hand', url: staticFile('fonts/patrick-hand-latin-400-normal.woff2'), format: 'woff2'}),
  loadFont({family: 'Gochi Hand', url: staticFile('fonts/gochi-hand-latin-400-normal.woff2'), format: 'woff2'}),
  loadFont({family: 'Caveat Brush', url: staticFile('fonts/caveat-brush-latin-400-normal.woff2'), format: 'woff2'}),
]).catch(() => undefined);
