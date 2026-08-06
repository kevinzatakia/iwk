/* PWA bootstrap — CSP-safe, no caching.
   Must be an external file: the site's CSP is `script-src 'self'` (no inline).
   - Phase 2: registers the no-op service worker (kill switch + install criteria).
   - Phase 3: reveals the header "Install app" button when the browser offers it. */
(function () {
  // ---- Phase 2: register the safe service worker ----
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').then(function (reg) {
        console.log('Safe PWA worker registered.', reg.scope);
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
