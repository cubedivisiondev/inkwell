/* INKWELL service worker.
 *
 * Tolerant precache: Promise.allSettled rather than addAll, so one missing asset
 * cannot fail the whole install and leave the tool uncached.
 *
 * Navigations are network-first so a deploy is picked up on the next visit rather
 * than being pinned to a stale shell. Everything else is cache-first, which is
 * what makes the tool work offline once it has been opened.
 *
 * ?nosw disables registration entirely - The Mac app embed loads it that way
 * (RULE 25), because the app serves the tool over its own privileged scheme.
 */
const VERSION = 'inkwell-v0.3.0';
const ASSETS = [
  '/', '/index.html', '/style/base.css',
  '/inkwell.js', '/inkwell-app.js', '/inkwell-stars.js', '/worker.js',
  '/puddy-tools.js?v=15',
  '/fonts/Satoshi-Regular.woff2', '/fonts/Satoshi-Medium.woff2',
  '/fonts/Satoshi-Bold.woff2', '/fonts/Satoshi-Black.woff',
  '/fonts/SpaceMono-Regular.woff2', '/fonts/SpaceMono-Bold.woff2',
  '/manifest.json', '/favicon.svg', '/puddy-logo.svg',
  '/icons/icon-192.png', '/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => Promise.allSettled(ASSETS.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((r) => {
        const copy = r.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return r;
      }).catch(() => caches.match(req).then((r) => r || caches.match('/index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return r;
    }))
  );
});
