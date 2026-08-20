// sw.js — Seamless-update worker (network-fresh, NO same-origin caching; CSP-safe)
//
// The site's strict Content-Security-Policy (connect-src has no 'self', default-src
// 'none') blocks the service worker from fetch()-ing same-origin assets — that is
// what broke the previous caching worker. So this worker deliberately does NOT
// cache app files. Freshness instead comes from the network plus the
// `Cache-Control: no-cache, must-revalidate` headers on HTML/CSS/JS. What this
// worker provides for seamless updates:
//   • a versioned identity (CACHE_NAME) the developer bumps to publish an update,
//   • immediate takeover on install (skipWaiting) + control of open pages (claim),
//   • purging of any legacy caches left behind by older workers,
//   • push / notification handling (further below).
// The page (js/pwa.js) listens for the new worker taking control and reloads once,
// so already-installed home-screen apps jump to the latest version automatically —
// no manual uninstall/reinstall.
//
// ── TO PUBLISH AN UPDATE: bump CACHE_NAME (e.g. v2 → v3), commit, deploy. ────────
// The byte change makes every device detect the new worker, which then activates
// immediately, purges old caches, and triggers the one-time reload in pwa.js.

const CACHE_NAME = 'kevin-app-v6';

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Activate immediately — bypass the "waiting" phase.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    // Purge every cache that isn't the current version (kills legacy caches left
    // by any older cache-first worker), then take control of open pages now.
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Intentional NO-OP passthrough: we never call event.respondWith() or fetch()
  // here, so the browser fetches each resource itself (governed by
  // script-src/style-src/img-src, which allow 'self') and always gets the live
  // network version — nothing is cached. Calling fetch() here would be blocked by
  // connect-src (no 'self'); that is exactly what broke the old caching worker.
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
