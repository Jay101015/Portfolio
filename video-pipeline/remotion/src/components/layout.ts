import {useMemo} from 'react';
import {useVideoConfig} from 'remotion';
import zones from './upright.json';

/** Scale factor so the same scene code lays out on 16:9 and 9:16 canvases. */
export const useLayout = () => {
  const {width, height, fps} = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  const isVertical = height > width;
  const pad = (isVertical ? 72 : 120) * u;
  return {width, height, fps, u, isVertical, pad};
};

// ------------------------------------------------------------------ a Short's zones (upright.json)
// One file holds the phone's frame: YouTube's own interface, the hook sticker's band, the caption's band, the stage a
// scene's content goes in, the cards, the drawing and the character. A scene asks here where it may draw instead of
// carrying its own fractions, so moving one zone no longer lands it on its neighbour.

export type Rect = {x: number; y: number; w: number; h: number};
/** what stands under a scene's stage on a Short, and so where the stage ends */
export type StageFor = {cards?: boolean; drawing?: boolean; character?: boolean};
/** A Short's stage in pixels. `x, y, w, h` is the rectangle that is clear for the stage's whole height: it stops short
 * of YouTube's buttons when the stage runs down beside them. `wide` is the part above the buttons, which may run to
 * the right margin; `foot` is where the stage ends and `narrowFrom` the height the buttons start at. */
export type UprightStage = Rect & {foot: number; wide: Rect; narrowFrom: number};
/** where a scene type carries the caption: in the caption band, in the middle of a board, or high on a set piece */
export type CaptionPlace = 'band' | 'board' | 'set';

const rect = (left: number, top: number, right: number, bottom: number, width: number, height: number): Rect => ({x: left * width, y: top * height, w: (right - left) * width, h: (bottom - top) * height});

/** The stage of a Short for a scene with cards, a drawing (or loop) or the character under it: the more that stands
 * below, the higher the stage ends (83% bare, 71% over cards, 63% over a drawing, 52% over his head). */
export const uprightStage = ({cards, drawing, character}: StageFor, width: number, height: number): UprightStage => {
  const s = zones.stage;
  const foot = character ? s.foot.character : drawing ? s.foot.drawing : cards ? s.foot.cards : s.foot.bare;
  const wide = rect(s.left, s.top, s.right, Math.min(foot, s.narrow_from), width, height);
  const box = foot > s.narrow_from ? rect(s.left, s.top, s.narrow_right, foot, width, height) : wide;
  return {...box, foot: foot * height, wide, narrowFrom: s.narrow_from * height};
};

/** where a scene of this type carries the caption on a Short (upright.json caption.at; the band unless listed) */
export const captionPlace = (type?: string): CaptionPlace => {
  const at = (zones.caption.at as Record<string, string>)[type ?? ''];
  return at === 'board' || at === 'set' ? at : 'band';
};

/** A Short's zones in pixels for a frame of this size, or null when the frame is not taller than wide. */
export const uprightZones = (width: number, height: number) => {
  if (height <= width) return null;
  const z = zones;
  return {
    width,
    height,
    /** what the Shorts player covers: its header, its title strip and its column of buttons */
    youtube: {top: rect(0, 0, 1, z.youtube.top, width, height), bottom: rect(0, 1 - z.youtube.bottom, 1, 1, width, height), right: rect(1 - z.youtube.right, z.youtube.right_from, 1, 1 - z.youtube.bottom, width, height)},
    sticker: rect(0, z.sticker.top, 1, z.sticker.bottom, width, height),
    caption: rect(0, z.caption.top, 1, z.caption.bottom, width, height),
    captionPlace,
    /** the top of the caption's pill on a scene of this type */
    captionTop: (type?: string) => {
      const at = captionPlace(type);
      return (at === 'board' ? z.caption.board : at === 'set' ? z.caption.set : z.caption.top) * height;
    },
    stage: (under: StageFor = {}) => uprightStage(under, width, height),
    cards: rect(z.stage.left, z.cards.top, z.cards.right, z.cards.bottom, width, height),
    drawing: rect(z.drawing.left, z.drawing.top, z.drawing.right, z.drawing.bottom, width, height),
    character: rect(z.character.left, z.character.top, z.character.right, z.character.bottom, width, height),
  };
};
export type Upright = NonNullable<ReturnType<typeof uprightZones>>;

/** A Short's zones as pixel rectangles, beside useLayout(): null on a landscape frame, so a scene that lays itself
 * out from them (`const up = useUpright(); if (up) ...`) cannot change the long video. */
export const useUpright = (): Upright | null => {
  const {width, height} = useVideoConfig();
  return useMemo(() => uprightZones(width, height), [width, height]);
};

// ------------------------------------------------------------------ how wide the display face sets a line
// The advance width of each character of Caveat Brush (the board look's display face) in ems, read from the face in
// headless Chrome. The face has one weight: an 800 on it is drawn bolder but no wider. A sum of these is within 2% of
// the line the browser sets (the rest is kerning), and unlike a canvas measurement it does not depend on the face
// having loaded by the time a frame is laid out, so a still and its re-render agree.
const CAVEAT_BRUSH: Record<string, number> = {
  ' ': 0.212, '!': 0.221, '"': 0.35, '#': 0.553, '$': 0.432, '%': 0.803, '&': 0.49, "'": 0.19, '(': 0.283,
  ')': 0.301, '*': 0.366, '+': 0.516, ',': 0.203, '-': 0.407, '.': 0.2, '/': 0.279, '0': 0.447, '1': 0.348,
  '2': 0.416, '3': 0.426, '4': 0.46, '5': 0.44, '6': 0.47, '7': 0.394, '8': 0.454, '9': 0.462, ':': 0.207,
  ';': 0.214, '<': 0.516, '=': 0.383, '>': 0.516, '?': 0.439, '@': 0.645, 'A': 0.467, 'B': 0.482, 'C': 0.443,
  'D': 0.534, 'E': 0.401, 'F': 0.47, 'G': 0.52, 'H': 0.553, 'I': 0.38, 'J': 0.412, 'K': 0.496, 'L': 0.362,
  'M': 0.675, 'N': 0.536, 'O': 0.488, 'P': 0.466, 'Q': 0.485, 'R': 0.493, 'S': 0.432, 'T': 0.477, 'U': 0.508,
  'V': 0.474, 'W': 0.66, 'X': 0.507, 'Y': 0.457, 'Z': 0.496, '[': 0.283, '\\': 0.279, ']': 0.301, '^': 0.482,
  '_': 0.64, '`': 0.313, 'a': 0.431, 'b': 0.432, 'c': 0.36, 'd': 0.436, 'e': 0.38, 'f': 0.327, 'g': 0.401,
  'h': 0.426, 'i': 0.227, 'j': 0.235, 'k': 0.416, 'l': 0.24, 'm': 0.588, 'n': 0.444, 'o': 0.383, 'p': 0.436,
  'q': 0.438, 'r': 0.34, 's': 0.34, 't': 0.349, 'u': 0.439, 'v': 0.387, 'w': 0.527, 'x': 0.405, 'y': 0.411,
  'z': 0.408, '{': 0.283, '|': 0.252, '}': 0.301, '~': 0.516, '£': 0.362, '€': 0.443, '−': 0.516, '–': 0.64,
  '—': 0.78, '’': 0.219, '‘': 0.2, '“': 0.344, '”': 0.374, '…': 0.57, '×': 0.516, '→': 1,
};
/** The width of `text` set at `fontSize` in the display face. Another look's display face (a serif, a grotesk) sets
 * about a third wider than the marker, so it is allowed for by that much. */
export const displayWidth = (text: string, fontSize: number, family?: string) => {
  let em = 0;
  for (const c of text) em += CAVEAT_BRUSH[c] ?? 0.45;
  return em * fontSize * (!family || /^['"]?Caveat Brush/.test(family) ? 1 : 1.35);
};
/** how many lines `text` takes in a column `room` wide, its words broken as the browser breaks them (each word and the
 * `gap` ems after it), with 2% in hand so a close call counts as the extra line */
export const displayLines = (text: string, fontSize: number, room: number, family?: string, gap = 0.28) => {
  let lines = 1;
  let x = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = (displayWidth(word, fontSize, family) + gap * fontSize) * 1.02;
    if (x > 0 && x + w > room) {
      lines += 1;
      x = 0;
    }
    x += w;
  }
  return lines;
};

// ------------------------------------------------------------------ the hook sticker on a Short
/** 0 while the hook sticker is big (the first three seconds, the scroll-in moment), 1 once it has settled smaller */
export const stickerSettle = (frame: number, fps: number) => Math.max(0, Math.min(1, (frame - fps * 3) / (fps * 0.4)));
const TILT = Math.sin(Math.PI / 180); // the sticker is turned one degree: a box w wide stands w * TILT taller

export type Sticker = {lines: string[]; size: number; lineHeight: number; padV: number; padH: number; top: number; foot: number};
/** The hook sticker in its band on a Short (upright.json sticker): one line at 72 px, or two lines at 60 px cut where
 * they come out most alike; after three seconds 50 px, on one line if it fits. Its tape hangs from the top of the
 * band and never leaves it: a line too long is set smaller, never wrapped again, and the box is sized so that, turned
 * its one degree, it still stands inside the band. `p` is stickerSettle(); `top` is where the box is placed and `foot`
 * where its turned lower corner ends. */
export const uprightSticker = (text: string, p: number, up: Upright, family?: string): Sticker => {
  const u = up.width / 1080;
  const padH = 22 * u;
  const room = 0.84 * (up.width - 80 * u) - padH * 2; // the widest a line may run: the sticker's box has always been at most 84% of the frame inside its margins
  const em = (s: string) => displayWidth(s, 1, family); // a line's width in ems
  const words = text.split(/\s+/).filter(Boolean);
  let lines = [words.join(' ')];
  let size = (72 - 22 * p) * u;
  let lineHeight = 1.15;
  let padV = 10 * u;
  if (em(lines[0]) * size > room && words.length > 1) {
    const worse = (i: number) => Math.max(em(words.slice(0, i).join(' ')), em(words.slice(i).join(' '))); // the longer of the two lines when cut before word i
    let cut = 1;
    for (let i = 2; i < words.length; i++) if (worse(i) < worse(cut)) cut = i;
    lines = [words.slice(0, cut).join(' '), words.slice(cut).join(' ')];
    size = (60 - 10 * p) * u;
    lineHeight = 1.04;
    padV = 6 * u;
  }
  const widest = Math.max(...lines.map(em));
  size = Math.min(size, room / widest);
  // the turned box inside the band: a pixel clear at the top, and room at the foot for the first of its soft shadow
  // (the widths are taken 2% wide here: the table is that close to the browser, and the band is not to be crossed)
  const safe = widest * 1.02;
  size = Math.min(size, (up.sticker.h - 6 * u - padV * 2 - padH * 2 * TILT) / (lines.length * lineHeight + safe * TILT));
  const rise = ((safe * size + padH * 2) / 2) * TILT; // how far the turned box's corners stand above and below it
  const top = up.sticker.y + u + rise;
  return {lines, size, lineHeight, padV, padH, top, foot: top + lines.length * lineHeight * size + padV * 2 + rise};
};

/** Where the sticker ends on a scene that keeps its older place (a set piece: Video.tsx HookBanner): 9% down at 72 px
 * while it is big, then 7.5% down at 50 px, wrapped by the browser. The caption there rides just under it. */
export const stickerFootOld = (text: string, p: number, width: number, height: number, family?: string) => {
  const u = width / 1080;
  const size = (72 - 22 * p) * u;
  const room = 0.84 * (width - 80 * u) - 44 * u;
  const w = displayWidth(text, size, family);
  const lines = Math.max(1, Math.ceil(w / room));
  return height * (0.09 - 0.015 * p) + lines * size * 1.15 + 20 * u + ((Math.min(w * 1.02, room) + 44 * u) / 2) * TILT;
};

export const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9$%\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);

/** Find the absolute time at which a phrase is first spoken inside an aligned word list. */
export const findPhraseTime = (
  words: {w: string; s: number; e: number}[] | undefined,
  phrase: string,
): number | null => {
  if (!words || words.length === 0) return null;
  const target = norm(phrase);
  if (target.length === 0) return null;
  const probe = target.slice(0, Math.min(2, target.length));
  const tokens = words.map((x) => norm(x.w)[0] ?? '');
  for (let i = 0; i <= tokens.length - probe.length; i++) {
    let ok = true;
    for (let j = 0; j < probe.length; j++) {
      if (tokens[i + j] !== probe[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return words[i].s;
  }
  // "2001: Nvidia, up 308%" said as "In 2001 the winner was Nvidia": the first word, with the second within six of it
  if (probe.length === 2) {
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] !== probe[0]) continue;
      for (let j = i + 1; j < Math.min(tokens.length, i + 7); j++) if (tokens[j] === probe[1]) return words[i].s;
    }
  }
  return null;
};

/** "$10,000" -> {prefix:"$", num:10000, suffix:"", decimals:0, grouped:true} */
export const parseValue = (raw: string) => {
  const m = String(raw).match(/^([^\d\-]*)(-?[\d,]+(?:\.\d+)?)(.*)$/);
  if (!m) return null;
  const [, prefix, numStr, suffix] = m;
  const decimals = (numStr.split('.')[1] ?? '').length;
  return {
    prefix,
    num: parseFloat(numStr.replace(/,/g, '')),
    suffix,
    decimals,
    grouped: numStr.includes(','),
  };
};

export const formatNum = (n: number, decimals = 0, grouped = true) => {
  const fixed = n.toFixed(decimals);
  if (!grouped) return fixed;
  const [int, frac] = fixed.split('.');
  const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `${withCommas}.${frac}` : withCommas;
};

export const compactNum = (n: number, fmt?: string) => {
  const abs = Math.abs(n);
  let body: string;
  if (abs >= 1e9) body = `${(n / 1e9).toFixed(1)}B`;
  else if (abs >= 1e6) body = `${(n / 1e6).toFixed(1)}M`;
  else if (abs >= 1e4) body = `${Math.round(n / 1e3)}K`;
  else body = formatNum(n, abs < 10 && !Number.isInteger(n) ? 1 : 0);
  if (fmt === '%') return `${body}%`;
  if (fmt && fmt.trim() && fmt.trim().length <= 2) return `${fmt.trim()}${body}`; // a currency sign: $, £, €
  return body;
};
