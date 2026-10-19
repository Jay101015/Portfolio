import {useEffect, useState} from 'react';
import {continueRender, delayRender, staticFile} from 'remotion';
import hostInfo from '../../public/host/host.json';

const cache = new Map<string, Promise<void>>();

const load = (url: string) =>
  cache.get(url) ??
  (() => {
    const p = new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = url;
    });
    cache.set(url, p);
    return p;
  })();

/** Holds the frame until every layer of the painted host has decoded, so an SVG <image> never renders blank. */
export const useHostImages = (): boolean => {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const handle = delayRender('host layers');
    Promise.all(Object.keys(hostInfo.boxes).map((n) => load(staticFile(`host/${n}`)))).then(() => {
      setReady(true);
      continueRender(handle);
    });
  }, []);
  return ready;
};
