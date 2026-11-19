// Network-first service worker.
// Every same-origin GET asks the server first (revalidating past the browser's
// HTTP cache), so a reload always picks up a new deploy. The last good copy of
// each file is kept so the app still opens when offline.
const CACHE = 'chatbox-v1';

// Pages sends Cache-Control: max-age=600, which lets the browser's in-memory
// cache reuse old files on reload without asking this worker. Re-label every
// response as no-cache so each load comes back through here.
function fresh(res) {
  const headers = new Headers(res.headers);
  headers.set('Cache-Control', 'no-cache');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Archivo from Google Fonts: keep a copy so the installed app keeps its typeface offline.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req);
        const net = fetch(req)
          .then((res) => {
            if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
            return res;
          })
          .catch(() => null);
        if (hit) return e.waitUntil(net), hit;
        return (await net) || Response.error();
      })()
    );
    return;
  }
  if (url.origin !== self.location.origin) return; // AI APIs: leave alone
  if (/\/proxy(\/|$)/.test(url.pathname)) return; // local relay, never cache

  e.respondWith(
    (async () => {
      try {
        const res = await fetch(req, { cache: 'no-cache' });
        if (res.ok) {
          const copy = res.clone();
          e.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
        }
        return fresh(res);
      } catch (err) {
        const hit = await caches.match(req);
        if (hit) return fresh(hit);
        if (req.mode === 'navigate') {
          const shell = await caches.match(new URL('./', self.registration.scope).href);
          if (shell) return fresh(shell);
        }
        throw err;
      }
    })()
  );
});
