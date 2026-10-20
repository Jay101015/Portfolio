import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';

// Faces bundled in public/fonts (from @fontsource), so renders never hit the network:
// hand-lettered for the toon look, Inter and Space Grotesk for the motion-graphics looks.
const f = (family: string, file: string, weight?: string) => loadFont({family, url: staticFile(`fonts/${file}`), format: 'woff2', weight});
export const fontsReady = Promise.all([
  f('Patrick Hand', 'patrick-hand-latin-400-normal.woff2'),
  f('Gochi Hand', 'gochi-hand-latin-400-normal.woff2'),
  f('Caveat Brush', 'caveat-brush-latin-400-normal.woff2'),
  f('Inter', 'inter-latin-400-normal.woff2', '400'),
  f('Inter', 'inter-latin-600-normal.woff2', '600'),
  f('Inter', 'inter-latin-700-normal.woff2', '700'),
  f('Inter', 'inter-latin-800-normal.woff2', '800'),
  f('Space Grotesk', 'space-grotesk-latin-500-normal.woff2', '500'),
  f('Space Grotesk', 'space-grotesk-latin-700-normal.woff2', '700'),
]).catch(() => undefined);
