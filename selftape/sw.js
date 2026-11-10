/* Makes the page cross-origin isolated so the voice model can use several CPU threads (GitHub Pages can't
   send these headers itself). Nothing is cached here, so app updates are never held back. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
  e.respondWith(fetch(req).then((res) => {
    if (res.status === 0) return res; // opaque response: can't be re-wrapped
    const headers = new Headers(res.headers);
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  }));
});
