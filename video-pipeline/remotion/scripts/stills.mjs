// Many stills from one bundle with one browser, under a second each. Called by pipeline/proof.py for the proof sheet.
//
//   node scripts/stills.mjs <bundle dir> <jobs.json> <out dir> [scale] [at once]
//
// jobs.json is a list of {"name": "nvidia", "props": "/abs/storyboard.json", "comp": "Main", "frames": [12, 300]}:
// props is a storyboard (the long video's, or a Short's cut), comp is Main (1920 x 1080) or Vertical (1080 x 1920),
// frames are frame numbers at the storyboard's own rate. Each still is written as
// <out dir>/<name>-<comp>-<frame, six digits>.png. scale is the share of full size (0.4 by default: 768 x 432, or
// 432 x 768 upright). 'at once' is how many stills are in the browser together (1 by default).
//
// The bundle is made once with `npx remotion bundle --public-dir=<public folder> --out-dir=<bundle dir>` and is as
// true as the day it was made: after a change under src/, bundle again. The browser is REMOTION_BROWSER when that is
// set (a locally installed headless Chrome, as in remotion.config.ts); otherwise Remotion uses its own.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url); // @remotion/renderer from the node_modules beside this folder
const {openBrowser, renderStill, selectComposition} = require('@remotion/renderer');

const [bundleArg, jobsPath, outArg, scaleArg, atOnceArg] = process.argv.slice(2);
if (!bundleArg || !jobsPath || !outArg) {
  console.error('usage: node stills.mjs <bundle dir> <jobs.json> <out dir> [scale] [at once]');
  process.exit(2);
}
const serveUrl = path.resolve(bundleArg);
if (!fs.existsSync(path.join(serveUrl, 'index.html'))) {
  console.error(`no bundle at ${serveUrl} (no index.html): make one with npx remotion bundle --out-dir=${serveUrl}`);
  process.exit(2);
}
const outDir = path.resolve(outArg);
const scale = Number(scaleArg || 0.4);
const atOnce = Math.max(1, Math.round(Number(atOnceArg || 1)));
const jobs = JSON.parse(fs.readFileSync(jobsPath, 'utf8'));
fs.mkdirSync(outDir, {recursive: true});

const asked = process.env.REMOTION_BROWSER;
if (asked && !fs.existsSync(asked)) {
  console.error(`REMOTION_BROWSER is set to ${asked}, which is not there`);
  process.exit(2);
}
const browserExecutable = asked || undefined;

const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(0) + 's';
const browser = await openBrowser('chrome', {browserExecutable});
let done = 0;
let failed = 0;
try {
  // every composition first (a storyboard sets its own length), then all the stills through one queue
  const queue = [];
  for (const job of jobs) {
    const inputProps = JSON.parse(fs.readFileSync(job.props, 'utf8'));
    const composition = await selectComposition({serveUrl, id: job.comp, inputProps, puppeteerInstance: browser, browserExecutable});
    const seen = new Set();
    for (const frame of job.frames) {
      const f = Math.max(0, Math.min(composition.durationInFrames - 1, Math.round(frame)));
      if (seen.has(f)) continue;
      seen.add(f);
      queue.push({job, composition, inputProps, f});
    }
    job.left = seen.size;
    job.count = seen.size;
  }
  const one = async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      const {job, composition, inputProps, f} = next;
      const output = path.join(outDir, `${job.name}-${job.comp}-${String(f).padStart(6, '0')}.png`);
      try {
        await renderStill({composition, serveUrl, output, frame: f, inputProps, scale, puppeteerInstance: browser, browserExecutable, imageFormat: 'png', overwrite: true});
        done++;
      } catch (e) {
        failed++;
        console.error('FAIL', job.name, job.comp, f, String(e).slice(0, 300));
      }
      if (--job.left === 0) console.log(job.name, job.comp, job.count, 'frames', secs());
    }
  };
  await Promise.all(Array.from({length: atOnce}, one));
} finally {
  await browser.close({silent: true});
}
console.log('done', done, 'stills', failed, 'failed', secs());
process.exit(failed ? 1 : 0);
