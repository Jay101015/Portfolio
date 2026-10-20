import {useVideoConfig} from 'remotion';

/** Scale factor so the same scene code lays out on 16:9 and 9:16 canvases. */
export const useLayout = () => {
  const {width, height, fps} = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  const isVertical = height > width;
  const pad = (isVertical ? 72 : 120) * u;
  return {width, height, fps, u, isVertical, pad};
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
