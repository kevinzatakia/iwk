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

// ── Notifications ─────────────────────────────────────────────────────────────
// The portal shows OS notifications itself (via registration.showNotification)
// for new in-app alerts while the app is open or backgrounded. This `push` handler
// is here so the worker is ready for a real server-side Web Push sender later — it
// stays dormant until a push subscription + sender exist.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { message: event.data && event.data.text() }; }
  const title = data.title || 'Insure It With Kevin';
  const options = {
    body: data.message || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || undefined,
    data: { url: data.url || '/portal.html' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Tapping a notification focuses an open portal tab (or opens one) and routes it.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/portal.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if (c.url.indexOf('/portal.html') !== -1 && 'focus' in c) {
          c.postMessage({ type: 'notification-click', url: target });
          return c.focus();
        }
      }
      if (self.clients.openWindow) { return self.clients.openWindow(target); }
    })
  );
});
