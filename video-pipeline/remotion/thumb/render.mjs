// The thumbnail's bundler and renderer. Called by pipeline/thumbnail.py, which builds the props and enforces the rules.
//
//   node render.mjs bundle <public dir> <bundle dir>   bundle thumb/index.ts once (the public dir holds only fonts)
//   node render.mjs render <bundle dir> <jobs.json>    render stills with one browser
//
// jobs.json is a list of {"props": "/abs/props.json", "out": "/abs/name.png"}. The photo travels inside the props as a
// data: URL, so the one bundle serves any photo and nothing is copied into a public folder.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

// The same choice as remotion.config.ts: a locally installed headless Chrome when one exists (REMOTION_BROWSER to
// override), otherwise Remotion uses its own.
const browserExecutable =
  [process.env.REMOTION_BROWSER, '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => p && fs.existsSync(p)) || undefined;

const [mode, a, b] = process.argv.slice(2);

if (mode === 'bundle') {
  const {bundle} = require('@remotion/bundler');
  const t0 = Date.now();
  await bundle({entryPoint: path.join(here, 'index.ts'), publicDir: path.resolve(a), outDir: path.resolve(b)});
  console.log(`bundled the thumbnail entry in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${path.resolve(b)}`);
} else if (mode === 'render') {
  const {openBrowser, renderStill, selectComposition} = require('@remotion/renderer');
  const serveUrl = path.resolve(a);
  const jobs = JSON.parse(fs.readFileSync(b, 'utf8'));
  const t0 = Date.now();
  const browser = await openBrowser('chrome', {browserExecutable});
  let failed = 0;
  try {
    const base = await selectComposition({serveUrl, id: 'Thumb', inputProps: {}, puppeteerInstance: browser, browserExecutable});
    for (const job of jobs) {
      const inputProps = JSON.parse(fs.readFileSync(job.props, 'utf8'));
      // a still is rendered from composition.props, so each job gets its own
      const composition = {...base, props: {...base.defaultProps, ...inputProps}};
      try {
        await renderStill({composition, serveUrl, output: job.out, frame: 0, inputProps, imageFormat: 'png', overwrite: true, puppeteerInstance: browser, browserExecutable});
      } catch (e) {
        failed++;
        console.error('FAILED', job.out, String(e).slice(0, 400));
      }
    }
  } finally {
    await browser.close({silent: true});
  }
  console.log(`rendered ${jobs.length - failed} of ${jobs.length} stills in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (failed) process.exit(1);
} else {
  console.error('usage: node render.mjs bundle <public dir> <bundle dir> | node render.mjs render <bundle dir> <jobs.json>');
  process.exit(2);
}
