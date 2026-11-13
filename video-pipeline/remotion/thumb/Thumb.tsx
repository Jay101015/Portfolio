import React, {useEffect, useState} from 'react';
import {AbsoluteFill, Img, cancelRender, continueRender, delayRender} from 'remotion';
import {C, H, HAND, HEAVY, W, fontsReady} from './brand';

// Three layouts that differ in structure, and a fourth for a video with no real picture yet:
//   photo   the picture edge to edge under a dark scrim, the figure block bottom left (the opening frame he approved)
//   band    the picture edge to edge, the figure in heavy type on a solid block flush to the side away from the focus
//   split   the picture on one side, one huge figure on white on the other
//   figure  no picture: the figure and one line on a plain navy ground
// At most two pieces of text, ever: the figure and one short line. Red is only for a loss (tone 'loss', set by the
// prop builder when the text starts with a minus): a red block under white lettering on a dark ground, red lettering
// on white. No ring, highlight, arrow or hand. Nothing reaches the bottom-right corner, where YouTube prints the
// video's length; pipeline/thumbnail.py renders each layout with hideText and checks the difference.

export type Tone = 'plain' | 'loss';
export type Layout = 'photo' | 'band' | 'split' | 'figure';
export type ThumbProps = {
  layout: Layout;
  figure: string;
  line: string; // '' for none
  figureTone: Tone;
  lineTone: Tone;
  photo: string; // a data: URL ('' for none), so one bundle serves any photo
  photoW: number;
  photoH: number;
  focus: [number, number]; // where the subject is in the photo, 0..1 from the top left
  zoom: number; // 1 = the photo just covers its space; more pulls in on the focus point
  hideText: boolean; // the layout without its text and text blocks
};

/** Width in px of `text` set at 100 px. Only called once the faces are loaded. */
const widthAt100 = (text: string, weight: number, family: string): number => {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return Math.max(1, text.length * 56);
  ctx.font = `${weight} 100px ${family}`;
  return Math.max(1, ctx.measureText(text).width);
};

/** The largest size at which `text` is no wider than `maxW`, capped at `maxSize`. */
const fit = (text: string, weight: number, family: string, maxW: number, maxSize: number): number =>
  Math.min(maxSize, Math.floor((100 * maxW) / widthAt100(text, weight, family)));

/** Cover a `bw` x `bh` box with the photo so its focus point sits on (tx, ty), or as near as it can without showing
 * an edge. The photo is enlarged `zmin` times past plain cover, and up to `zmax` times when that is what it takes
 * to bring the focus point to its place (zmin = zmax: it only slides). */
const place = (iw: number, ih: number, bw: number, bh: number, focus: [number, number], tx: number, ty: number, zmin: number, zmax: number): React.CSSProperties => {
  const fx = Math.min(0.95, Math.max(0.05, focus[0]));
  const fy = Math.min(0.95, Math.max(0.05, focus[1]));
  const cover = Math.max(bw / iw, bh / ih);
  const need = Math.max(cover, tx / fx / iw, (bw - tx) / (1 - fx) / iw, ty / fy / ih, (bh - ty) / (1 - fy) / ih);
  const s = Math.min(Math.max(need, cover * zmin), cover * Math.max(zmin, zmax));
  const w = iw * s;
  const h = ih * s;
  return {width: w, height: h, left: Math.min(0, Math.max(bw - w, tx - fx * w)), top: Math.min(0, Math.max(bh - h, ty - fy * h))};
};

const Picture: React.FC<{p: ThumbProps; x: number; w: number; tx: number; ty: number; zmin: number; zmax: number}> = ({p, x, w, tx, ty, zmin, zmax}) => (
  <div style={{position: 'absolute', left: x, top: 0, width: w, height: H, overflow: 'hidden', background: C.navy}}>
    {p.photo && p.photoW > 0 && p.photoH > 0 ? (
      <Img src={p.photo} style={{position: 'absolute', maxWidth: 'none', ...place(p.photoW, p.photoH, w, H, p.focus, tx, ty, zmin, zmax)}} />
    ) : null}
  </div>
);

/** One piece of text on one line. `block` puts a solid block under it. */
const Words: React.FC<{text: string; size: number; family: string; weight: number; color: string; block?: string; tilt?: number}> = ({text, size, family, weight, color, block, tilt}) => (
  <div
    style={{
      fontFamily: family,
      fontWeight: weight,
      fontSize: size,
      lineHeight: 1,
      whiteSpace: 'nowrap',
      color,
      background: block,
      padding: block ? `${Math.round(size * 0.07)}px ${Math.round(size * 0.17)}px ${Math.round(size * 0.1)}px` : 0,
      transform: tilt ? `rotate(${tilt}deg)` : undefined,
      transformOrigin: 'left bottom',
    }}
  >
    {text}
  </div>
);

/** The figure of the split layout may stand on two lines: broken at the space nearest its middle. */
const twoLines = (s: string): string[] => {
  const at = [...s].map((ch, i) => (ch === ' ' ? i : -1)).filter((i) => i > 0);
  if (!at.length) return [s];
  const mid = at.reduce((a, b) => (Math.abs(b - s.length / 2) < Math.abs(a - s.length / 2) ? b : a));
  return [s.slice(0, mid), s.slice(mid + 1)];
};

export const Thumb: React.FC<ThumbProps> = (p) => {
  // sizes are measured, so nothing is laid out (and no still is taken) until the faces have loaded
  const [handle] = useState(() => delayRender('thumbnail faces'));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    fontsReady.then(() => setReady(true)).catch((e) => cancelRender(e));
  }, []);
  useEffect(() => {
    if (ready) continueRender(handle);
  }, [ready, handle]);

  const vis = ready && !p.hideText ? 'visible' : 'hidden';
  const loss = p.figureTone === 'loss';
  const lineLoss = p.lineTone === 'loss';
  const size = (text: string, weight: number, family: string, maxW: number, maxSize: number) => (ready ? fit(text, weight, family, maxW, maxSize) : 10);
  const z = Math.max(1, p.zoom || 1);
  const layout: Layout = p.photo ? (p.layout === 'figure' ? 'photo' : p.layout) : 'figure';

  if (layout === 'photo') {
    // the block and the line stop short of the corner: 44 + 70% of the width is 940 px, the corner starts at 998.
    // The block is kept to the bottom 40% so a face in the top half stays clear of it.
    const fs = size(p.figure, 400, HAND, W * 0.7 - 60, 144);
    const ls = p.line ? Math.min(Math.round(fs * 0.54), size(p.line, 400, HAND, W * 0.62, 78)) : 0;
    return (
      <AbsoluteFill style={{background: C.navy}}>
        <Picture p={p} x={0} w={W} tx={W * 0.5} ty={H * 0.3} zmin={z} zmax={z} />
        <AbsoluteFill style={{background: `linear-gradient(to top, ${C.navy}f2 0%, ${C.navy}b8 26%, ${C.navy}33 52%, ${C.navy}14 100%)`}} />
        <div style={{position: 'absolute', left: 44, bottom: 26, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12, visibility: vis}}>
          <Words text={p.figure} size={fs} family={HAND} weight={400} color={C.paper} block={loss ? C.loss : C.navy} tilt={-2} />
          {p.line ? <Words text={p.line} size={ls} family={HAND} weight={400} color={C.paper} block={lineLoss ? C.loss : undefined} /> : null}
        </div>
      </AbsoluteFill>
    );
  }

  if (layout === 'band') {
    // the block sits on the side away from the subject, and the photo is moved (and enlarged a little) so the
    // subject stands in the middle of what is left. The block ends above the corner: at most 384 px tall round 46%.
    const left = p.focus[0] >= 0.5;
    const inner = W * 0.5 - 88;
    const fs = size(p.figure, 800, HEAVY, inner, 190);
    const ls = p.line ? Math.min(Math.round(fs * 0.56), size(p.line, 700, HEAVY, inner, 88)) : 0;
    const chip = lineLoss && !loss; // a loss line on the navy block gets its own red block
    return (
      <AbsoluteFill style={{background: C.navy}}>
        <Picture p={p} x={0} w={W} tx={left ? W * 0.75 : W * 0.25} ty={H * 0.42} zmin={z} zmax={z * 1.3} />
        <div
          style={{
            position: 'absolute',
            top: H * 0.46,
            transform: 'translateY(-50%)',
            left: left ? 0 : undefined,
            right: left ? undefined : 0,
            background: loss ? C.loss : C.navy,
            padding: '30px 44px 34px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 16,
            visibility: vis,
          }}
        >
          <Words text={p.figure} size={fs} family={HEAVY} weight={800} color={C.paper} />
          {p.line ? <Words text={p.line} size={ls} family={HEAVY} weight={700} color={C.paper} block={chip ? C.loss : undefined} /> : null}
        </div>
      </AbsoluteFill>
    );
  }

  if (layout === 'split') {
    // white takes 54% of the width; the text group is centred at 45% of the height and at most 504 px tall, so
    // on the right-hand side it still ends above the corner. The picture's side is narrow, so the photo is pulled
    // in a quarter on its subject.
    const picLeft = p.focus[0] < 0.5;
    const textW = W * 0.54;
    const picW = W - textW;
    const rows = twoLines(p.figure);
    const fs = Math.min(...rows.map((r) => size(r, 800, HEAVY, textW - 96, rows.length > 1 ? 205 : 250)));
    const ls = p.line ? Math.min(Math.round(fs * 0.46), size(p.line, 700, HEAVY, textW - 96, 84)) : 0;
    return (
      <AbsoluteFill style={{background: C.paper}}>
        <Picture p={p} x={picLeft ? 0 : textW} w={picW} tx={picW * 0.5} ty={H * 0.4} zmin={z * 1.25} zmax={z * 1.25} />
        <div style={{position: 'absolute', left: picLeft ? picW : 0, top: 0, width: textW, height: H * 0.9, boxSizing: 'border-box', padding: '0 48px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', gap: 16, visibility: vis}}>
          <div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-start'}}>
            {rows.map((r, i) => (
              <Words key={i} text={r} size={fs} family={HEAVY} weight={800} color={loss ? C.loss : C.navy} />
            ))}
          </div>
          {p.line ? <Words text={p.line} size={ls} family={HEAVY} weight={700} color={lineLoss ? C.loss : C.navy} /> : null}
        </div>
      </AbsoluteFill>
    );
  }

  // no real picture yet: the figure and one line on a plain ground
  const fs = size(p.figure, 400, HAND, W * 0.84 - (loss ? 120 : 0), 330);
  const ls = p.line ? Math.min(Math.round(fs * 0.42), size(p.line, 400, HAND, W * 0.84, 110)) : 0;
  return (
    <AbsoluteFill style={{background: C.navy}}>
      <div style={{position: 'absolute', left: 72, top: 0, height: H * 0.92, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', gap: 18, visibility: vis}}>
        <Words text={p.figure} size={fs} family={HAND} weight={400} color={C.paper} block={loss ? C.loss : undefined} tilt={loss ? -2 : undefined} />
        {p.line ? <Words text={p.line} size={ls} family={HAND} weight={400} color={C.paper} block={lineLoss ? C.loss : undefined} /> : null}
      </div>
    </AbsoluteFill>
  );
};
