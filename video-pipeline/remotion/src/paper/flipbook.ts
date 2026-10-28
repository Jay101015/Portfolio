// Stop-motion drawings for the art library: a handful of key poses (library/flipbook/manifest.json, cut from
// one generated strip so the character stays the same) played in steps, then held on the last pose. They have no
// tags, so a scene only gets one by naming it (`art=celebrate`); `search` finds them in the studio's library.
import type {ArtDef} from './art';
import manifest from '../../../library/flipbook/manifest.json';

type Entry = {name: string; about: string; search?: string[]; frames: number; step?: number; loop?: boolean};

export const FLIPS: Record<string, ArtDef> = Object.fromEntries(
  (manifest as Entry[]).map((e) => [
    e.name,
    {
      about: e.about,
      tags: [],
      search: e.search ?? [],
      layers: [],
      flip: {frames: Array.from({length: e.frames}, (_, i) => `flipbook/${e.name}/${String(i + 1).padStart(2, '0')}.png`), step: e.step ?? 0.13, loop: !!e.loop},
    },
  ]),
);
