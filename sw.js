// sw.js — DUMMY / NO-OP WORKER (no caching, no CSP violations)
//
// This intentionally does NOT cache anything. The previous caching worker's
// fetch() calls were blocked by the site's strict Content-Security-Policy
// (connect-src only allows the Apps Script backend), which broke asset loading.
// This worker exists purely to (a) act as a kill switch that unregisters/clears
// the old broken caches, and (b) satisfy the browser's PWA install criteria.

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Activate immediately, replacing any old worker.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    // Kill switch: delete every cache left behind by the previous broken worker.
    caches.keys().then((cacheNames) => {
      return Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // DO NOTHING.
  // This empty fetch listener exists purely to satisfy the browser's PWA install
  // criteria. It never intercepts, caches, or re-fetches requests — so it can't
  // trigger any CSP/offline crash.
});
