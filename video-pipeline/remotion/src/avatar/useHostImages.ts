import {useEffect, useState} from 'react';
import {continueRender, delayRender, prefetch, staticFile} from 'remotion';
import hostInfo from '../../public/host/host.json';

const urls = new Map<string, string>();
let loading: Promise<void> | null = null;

/** Fetches every layer once into memory (blob URLs) so a frame can never catch a layer half-loaded or evicted. */
const loadAll = () =>
  loading ??
  (loading = Promise.all(
    Object.keys(hostInfo.boxes).map(async (n) => {
      const file = staticFile(`host/${n}`);
      try {
        const blob = await prefetch(file, {method: 'blob-url'}).waitUntilDone();
        urls.set(n, blob);
      } catch {
        urls.set(n, file);
      }
    }),
  ).then(() => undefined));

/** Holds the frame until the painted host's layers are in memory; returns the resolver for layer URLs, or null while loading. */
export const useHostImages = (): ((name: string) => string) | null => {
  const [ready, setReady] = useState(urls.size === Object.keys(hostInfo.boxes).length);
  useEffect(() => {
    if (ready) return;
    const handle = delayRender('host layers');
    loadAll().then(() => {
      setReady(true);
      continueRender(handle);
    });
  }, [ready]);
  return ready ? (n) => urls.get(n) ?? staticFile(`host/${n}`) : null;
};
