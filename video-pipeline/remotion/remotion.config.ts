import {Config} from '@remotion/cli/config';
import fs from 'node:fs';

// Prefer a locally installed headless Chrome when one exists (set REMOTION_BROWSER
// to override). Remotion downloads its own Chrome Headless Shell otherwise.
const candidates = [
  process.env.REMOTION_BROWSER,
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
].filter(Boolean) as string[];
const browser = candidates.find((p) => fs.existsSync(p));
if (browser) Config.setBrowserExecutable(browser);

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(90);
Config.setOverwriteOutput(true);
Config.setEntryPoint('./src/index.ts');
