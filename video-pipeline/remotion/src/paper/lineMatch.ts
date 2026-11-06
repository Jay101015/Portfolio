/**
 * Where on the voice each written board line belongs. A board's lines (board="a | b | c") used to go up at even
 * shares of the scene's words, so "Take off the state pension, £12,548" was written 3.5 s before it was said
 * (retirement Shorts, round 2). Each line now looks for itself in the words, after the line before it:
 *   1. its first two words said together ("take off"),
 *   2. its figure, digit by digit, across the transcriber's split words ("1" ",492" is £1,492),
 *   3. its first word that carries meaning ("pension"),
 * and only falls back to the even share when the voice never says any of it. Pure: no React, so it can be tested.
 */
export type LineWord = {w: string; s: number; e: number};

const STOP = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'is', 'are', 'was', 'be', 'by', 'at', 'as', 'it', 'its', 'this', 'that', 'with', 'from', 'your', 'you', 'youd', 'youll', 'what', 'how', 'if', 'so', 'but', 'not', 'no', 'up', 'out', 'about', 'than', 'then', 'into', 'every', 'each', 'all', 'more', 'less']);

const tok = (s: string) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9%\s]/g, ' ').split(/\s+/).filter(Boolean);
const digitsOf = (s: string) => s.replace(/[^0-9]/g, '');

/** the index of the word where `text` is said, searching from `from` on; null when it is never said */
export const lineIndex = (text: string, words: LineWord[], from: number): number | null => {
  const wt = words.map((w) => tok(w.w).join(''));
  const t = tok(text);
  // 1. the first two words, said together
  if (t.length >= 2) {
    for (let i = from; i < wt.length - 1; i++) if (wt[i] === t[0] && wt[i + 1] === t[1]) return i;
  }
  // 2. the figure: "£12,548" matched as 12548 across one to three heard words
  const fig = (text.match(/£?\d[\d,.]*(?:\s*(?:million|billion|k|m|%))?/i) ?? [])[0];
  const digits = fig ? digitsOf(fig) : '';
  if (digits.length >= 2) {
    for (let i = from; i < words.length; i++) {
      if (!/[0-9]/.test(words[i].w)) continue;
      let acc = '';
      for (let j = i; j < Math.min(words.length, i + 3); j++) {
        acc += digitsOf(words[j].w);
        if (acc === digits) return i;
        if (!digits.startsWith(acc)) break;
      }
    }
  }
  // 3. the first word that carries meaning
  const key = t.find((x) => x.length > 2 && !STOP.has(x));
  if (key) for (let i = from; i < wt.length; i++) if (wt[i] === key) return i;
  return null;
};

/** for each line, the index of the word it is written on: the first line on the first word, the rest where they
 * are said (never before the line above), else at their share of the scene */
export const lineIndices = (texts: string[], words: LineWord[]): number[] => {
  const out: number[] = [];
  let prev = 0;
  texts.forEach((text, k) => {
    if (!words.length) return out.push(0);
    const share = Math.min(words.length - 1, Math.round((k * words.length) / texts.length));
    if (k === 0) {
      out.push(0);
      return;
    }
    const found = lineIndex(text, words, prev + 1);
    const at = found ?? Math.max(share, prev + 1);
    prev = Math.min(words.length - 1, at);
    out.push(prev);
  });
  return out;
};
