import {useEffect, useState} from 'react';
import {continueRender, delayRender, prefetch, staticFile} from 'remotion';
import hostInfo from '../../public/host/host.json';

export type HostImages = {src: (name: string) => string; bitmaps: Map<string, ImageBitmap> | null};

const urls = new Map<string, string>();
const bitmaps = new Map<string, ImageBitmap>();
let loading: Promise<void> | null = null;
let done = false;

/** Fetches every layer once into memory (blob URLs) and decodes it into a bitmap, so a frame can never catch a layer half-loaded or evicted. */
const loadAll = () =>
  loading ??
  (loading = Promise.all(
    Object.keys(hostInfo.boxes).map(async (n) => {
      const file = staticFile(`host/${n}`);
      try {
        const blob = await prefetch(file, {method: 'blob-url'}).waitUntilDone();
        urls.set(n, blob);
        const data = await (await fetch(blob)).blob();
        bitmaps.set(n, await createImageBitmap(data));
      } catch {
        urls.set(n, file);
      }
    }),
  ).then(() => {
    done = true;
  }));

/** Holds the frame until the painted host's layers are in memory; returns the layer URLs and decoded bitmaps, or null while loading. */
export const useHostImages = (): HostImages | null => {
  const [ready, setReady] = useState(done);
  useEffect(() => {
    if (ready) return;
    const handle = delayRender('host layers');
    loadAll().then(() => {
      setReady(true);
      continueRender(handle);
    });
  }, [ready]);
  if (!ready) return null;
  const complete = bitmaps.size === Object.keys(hostInfo.boxes).length;
  return {src: (n) => urls.get(n) ?? staticFile(`host/${n}`), bitmaps: complete ? bitmaps : null};
};
