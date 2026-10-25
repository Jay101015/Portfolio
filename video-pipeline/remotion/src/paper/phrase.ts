import type {Word} from '../types';

/**
 * What goes on the board when a sentence is spoken: not the sentence, the three to five words that carry it.
 * The whiteboard channels write "1% fee → 28% less" while the voice says the whole thing; the ear gets the
 * sentence, the eye gets the point. The studio's preview mirrors this picker word for word (keyPhrase in the page).
 *
 * A figure (£10,000, 7%, 40 years) anchors the phrase: it is kept with the content words around it. Without one,
 * the first content words of the sentence are kept, in order. Filler and function words go.
 */
const STOP = new Set(
  (
    'a an the and or but so because if then than that this these those there here it its is are was were be been being am ' +
    'do does did done have has had having i you we they he she me my your our their his her them us of to in on at for with ' +
    'from by as about into over under up down out off not no yes just very really quite pretty basically actually literally ' +
    'honestly kind sort like right okay ok well now today let lets get got gets getting go going gone went come comes came ' +
    'make makes made making thing things way ways lot lots bit also too even still already always never ever some any every ' +
    'each all most many much more less few little big good bad own same other another such only when where which who whom ' +
    'whose what why how while before after again once can could will would should may might must shall need needs needed ' +
    'want wants wanted know knows knew think thinks thought say says said tell tells told mean means meant guys everyone ' +
    'hi hello hey welcome back channel video im ive youre youve thats theyre were weve dont doesnt didnt cant wont isnt ' +
    'arent wasnt werent gonna wanna yeah sounds sound seems seem takes take tells tell nearly almost whether part parts people person someone something anything everything nothing somebody nobody'
  ).split(' '),
);

const clean = (w: string) => w.toLowerCase().replace(/[^a-z0-9£$€%]/g, '');
const NUMBER_WORDS = /^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|half|third|quarter|double|triple|percent|per)$/;
const isFigure = (w: string) => /[£$€%]|\d/.test(w) || NUMBER_WORDS.test(clean(w));
const isContent = (w: string) => isFigure(w) || (!STOP.has(clean(w)) && clean(w).length > 0);
const trimEnds = (w: string) => w.replace(/^[^A-Za-z0-9£$€]+/, '').replace(/[,;:.]+$/, '');

/** The indices of the words to keep from a sentence, in order (at most `max`). */
export const keyIndices = (words: string[], max = 5): number[] => {
  if (words.length <= max) return words.map((_, i) => i);
  const fig = words.findIndex(isFigure);
  const picked: number[] = [];
  if (fig >= 0) {
    // the figure, then content words outwards from it: the ones after first (they say what the figure is), then before
    picked.push(fig);
    let l = fig - 1;
    let r = fig + 1;
    while (picked.length < max && (l >= 0 || r < words.length)) {
      if (r < words.length && isContent(words[r]) && picked.length < max) picked.push(r);
      if (l >= 0 && isContent(words[l]) && picked.length < max) picked.unshift(l);
      l -= 1;
      r += 1;
    }
  } else {
    for (let i = 0; i < words.length && picked.length < max; i++) if (isContent(words[i])) picked.push(i);
    if (!picked.length) for (let i = 0; i < Math.min(max, words.length); i++) picked.push(i);
  }
  return picked.sort((a, b) => a - b);
};

/** The phrase as text, tidy: ends trimmed, first letter up. */
export const keyPhrase = (text: string, max = 5): string => {
  const words = String(text).split(/\s+/).filter(Boolean);
  const kept = keyIndices(words, max).map((i) => trimEnds(words[i])).filter(Boolean);
  const s = kept.join(' ');
  return s ? s[0].toUpperCase() + s.slice(1) : '';
};

/** The phrase as timed words, so it is written as those words are said. */
export const keyWords = (group: Word[], max = 5): Word[] => {
  const kept = keyIndices(
    group.map((w) => w.w),
    max,
  );
  return kept.map((i, k) => {
    const w = group[i];
    let text = trimEnds(w.w);
    if (k === 0 && text) text = text[0].toUpperCase() + text.slice(1);
    return {w: text || w.w, s: w.s, e: w.e};
  });
};

/** One caption-sized line for a scene: the first clause of the first sentence (up to a comma, "and", "but",
 * "because"), at most eight words, no trailing punctuation. A line a person would write on a board, not a word pick. */
export const captionLine = (text: string, max = 8): string => {
  const sents = text.split(/(?<=[.!?])\s+/).filter((x) => x.trim());
  const first = sents.find((x) => x.trim().split(/\s+/).length >= 4) ?? sents[0] ?? '';
  let clause = first.split(/,|;|:/)[0] ?? first;
  const short = clause.split(/\s+(?:and|but|because|so|which|while)\s+/i)[0] ?? clause;
  if (short.trim().split(/\s+/).length >= 4) clause = short; // a conjunction cuts the line only when what is left still says something
  const words = clause.trim().split(/\s+/).filter(Boolean).slice(0, max);
  return words.join(' ').replace(/[.,;:!?]+$/, '');
};
