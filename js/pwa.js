/* PWA bootstrap — CSP-safe, no caching.
   Must be an external file: the site's CSP is `script-src 'self'` (no inline).
   - Phase 2: registers the no-op service worker (kill switch + install criteria).
   - Phase 3: reveals the header "Install app" button when the browser offers it. */
(function () {
  // ---- Phase 2: register the service worker + seamless auto-update ----
  if ('serviceWorker' in navigator) {
    // If this page is already controlled by a worker, a later controllerchange
    // means a NEW version took over → reload once so open/installed apps show the
    // latest build automatically. We skip this on the very first install (no
    // prior controller) to avoid an unnecessary reload.
    var hadController = !!navigator.serviceWorker.controller;
    var reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController || reloading) { return; }
      reloading = true;
      window.location.reload();
    });

    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').then(function (reg) {
        // Check for a new sw.js now, and again each time the app is brought back
        // to the foreground (installed apps can stay open for days). A transient
        // network failure of the update check is harmless — swallow it so it
        // doesn't surface as an uncaught promise rejection.
        reg.update().catch(function () {});
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') { reg.update().catch(function () {}); }
        });
      }).catch(function (err) {
        console.log('SW registration failed:', err);
      });
    });
  }

  // ---- Phase 3: custom "Install app" button ----
  var deferredPrompt = null;
  var installAppBtn = document.getElementById('installAppBtn');

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();          // stop the automatic mini-infobar
    deferredPrompt = e;          // stash the event to trigger later
    if (installAppBtn) { installAppBtn.hidden = false; }
  });

  if (installAppBtn) {
    installAppBtn.addEventListener('click', function () {
      if (!deferredPrompt) { return; }
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function (choice) {
        if (choice && choice.outcome === 'accepted') {
          installAppBtn.hidden = true;
        }
        deferredPrompt = null;
      });
    });
  }

  window.addEventListener('appinstalled', function () {
    if (installAppBtn) { installAppBtn.hidden = true; }
    deferredPrompt = null;
  });
})();
