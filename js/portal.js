/* Client Portal — routing, auth, and Google Apps Script calls.
   SPA: shows/hides <section class="pv"> views without reloading. */
(function () {
  'use strict';

  // ============================================================
  // CONFIG — set these two after deploying the Apps Script backend.
  // ============================================================
  // Paste the /exec URL of the deployed portal Apps Script (see
  // apps-script-portal-endpoint.gs) here:
  var PORTAL_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwDFsRtDJ0pYHgyJ6z9lu_N5ZfZVDwX5Vev2wSwmjy0T462bhF2N_m6i--RnQ1PNe9W/exec';
  // The one email address that unlocks the admin dashboard:
  var ADMIN_EMAIL = 'kevinzatakia10@gmail.com';

  var MAX_FILE = 5 * 1024 * 1024; // 5 MB
  var EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

  // ---- tiny helpers ----
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function isAdmin(email) { return (email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase(); }

  var statusEl = $('portalStatus');
  function status(kind, msg) {
    statusEl.hidden = false;
    statusEl.className = 'portal-status ' + kind;
    statusEl.textContent = msg;
    if (kind === 'ok') { setTimeout(function () { statusEl.hidden = true; }, 4000); }
  }
  function clearStatus() { statusEl.hidden = true; }
  function fieldErr(node, msg) { node.hidden = false; node.textContent = msg; }

  // ---- session ----
  function getEmail() { return localStorage.getItem('portalEmail'); }
  function getName() { return localStorage.getItem('portalName') || 'there'; }
  function setSession(email, name) {
    localStorage.setItem('portalEmail', email);
    if (name) { localStorage.setItem('portalName', name); }
  }
  function clearSession() { localStorage.removeItem('portalEmail'); localStorage.removeItem('portalName'); }

  // ---- GAS requests ----
  // Apps Script Web Apps send NO CORS header and 302-redirect every request, so a
  // browser fetch() can't read the reply ("Failed to fetch"). We work around that
  // two ways:
  //   • reads  → JSONP: load the endpoint as a <script> that calls us back. Script
  //     tags aren't subject to CORS, so we actually get the JSON. (Requires the
  //     Apps Script domains in the page's script-src CSP.)
  //   • writes → no-cors POST: uploads carry a big base64 body that won't fit in a
  //     GET URL, so we POST them fire-and-forget (the reply is opaque/unreadable)
  //     and re-read the document list afterwards to confirm.
  var jsonpSeq = 0;

  function notConfigured() {
    return PORTAL_ENDPOINT.indexOf('PASTE_YOUR') === 0;
  }

  // JSONP GET for read actions. `params` becomes the query string.
  function gasGet(params) {
    if (notConfigured()) {
      return Promise.reject(new Error('The portal backend URL is not configured yet (PORTAL_ENDPOINT in js/portal.js).'));
    }
    return new Promise(function (resolve, reject) {
      var cb = 'gasjsonp_' + (++jsonpSeq) + '_' + Date.now();
      var script = document.createElement('script');
      var settled = false;
      var timer = setTimeout(function () { finish(new Error('The request timed out. Please try again.')); }, 25000);

      function cleanup() {
        clearTimeout(timer);
        try { delete window[cb]; } catch (_) { window[cb] = undefined; }
        if (script.parentNode) { script.parentNode.removeChild(script); }
      }
      function finish(err, data) {
        if (settled) { return; }
        settled = true;
        cleanup();
        if (err) { reject(err); } else { resolve(data); }
      }

      window[cb] = function (data) { finish(null, data); };
      script.onerror = function () { finish(new Error('Could not reach the server. Please try again.')); };

      var qs = 'callback=' + encodeURIComponent(cb);
      Object.keys(params).forEach(function (k) {
        qs += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      });
      script.src = PORTAL_ENDPOINT + '?' + qs;
      document.head.appendChild(script);
    });
  }

  // no-cors POST for uploads. Resolves once Apps Script has processed the request;
  // the response is opaque, so success is confirmed by re-reading the doc list.
  function gasUpload(payload) {
    if (notConfigured()) {
      return Promise.reject(new Error('The portal backend URL is not configured yet (PORTAL_ENDPOINT in js/portal.js).'));
    }
    return fetch(PORTAL_ENDPOINT, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
  }

  function readB64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { var s = r.result || ''; resolve(s.indexOf(',') >= 0 ? s.split(',')[1] : s); };
      r.onerror = function () { reject(new Error('Could not read the file.')); };
      r.readAsDataURL(file);
    });
  }

  // ============================================================
  // ROUTING
  // ============================================================
  var VIEWS = ['home-view', 'register-view', 'login-view', 'client-dashboard-view', 'admin-dashboard-view'];

  function setNav(view) {
    var onClient = view === 'client-dashboard-view';
    var onAdmin = view === 'admin-dashboard-view';
    $('navAbout').hidden = !onClient;
    $('navPolicies').hidden = !onClient;
    $('navLogout').hidden = !(onClient || onAdmin);
  }

  function showView(id) {
    clearStatus();
    VIEWS.forEach(function (v) { var n = $(v); if (n) { n.hidden = (v !== id); } });
    setNav(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Route based on the stored session.
  function route() {
    var email = getEmail();
    if (!email) { showView('home-view'); return; }
    if (isAdmin(email)) { showView('admin-dashboard-view'); loadAdmin(); }
    else { showView('client-dashboard-view'); loadClient(); }
  }

  // ============================================================
  // REGISTER
  // ============================================================
  $('registerForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('registerErr'); err.hidden = true;
    var first = $('regFirst').value.trim();
    var last = $('regLast').value.trim();
    var email = $('regEmail').value.trim();
    var pin = $('regPin').value;
    var pin2 = $('regPin2').value;

    if (first.length < 1) { return fieldErr(err, 'Please enter your first name.'); }
    if (!EMAIL_RE.test(email)) { return fieldErr(err, 'Please enter a valid email address.'); }
    if (!/^[0-9]{4}$/.test(pin)) { return fieldErr(err, 'Your PIN must be exactly 4 digits.'); }
    if (pin !== pin2) { return fieldErr(err, 'The two PINs do not match.'); }

    var btn = $('registerBtn'); btn.disabled = true; btn.textContent = 'Creating…';
    gasGet({ action: 'register', firstName: first, lastName: last, email: email, pin: pin })
      .then(function (data) {
        if (data && data.status === 'success') {
          setSession(email, first);
          status('ok', 'Account created — welcome!');
          route();
        } else {
          fieldErr(err, (data && data.message) || 'Could not register. Please try again.');
        }
      })
      .catch(function (e2) { fieldErr(err, e2.message || 'Network error. Please try again.'); })
      .then(function () { btn.disabled = false; btn.textContent = 'Create account'; });
  });

  // ============================================================
  // LOGIN
  // ============================================================
  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('loginErr'); err.hidden = true;
    var email = $('logEmail').value.trim();
    var pin = $('logPin').value;
    if (!EMAIL_RE.test(email)) { return fieldErr(err, 'Please enter a valid email address.'); }
    if (!/^[0-9]{4}$/.test(pin)) { return fieldErr(err, 'Your PIN must be exactly 4 digits.'); }

    var btn = $('loginBtn'); btn.disabled = true; btn.textContent = 'Logging in…';
    gasGet({ action: 'login', email: email, pin: pin })
      .then(function (data) {
        if (data && data.status === 'success') {
          setSession(email, data.firstName || '');
          route();
        } else {
          fieldErr(err, (data && data.message) || 'Incorrect email or PIN.');
        }
      })
      .catch(function (e2) { fieldErr(err, e2.message || 'Network error. Please try again.'); })
      .then(function () { btn.disabled = false; btn.textContent = 'Log in'; });
  });

  // ============================================================
  // CLIENT DASHBOARD
  // ============================================================
  function docRow(doc) {
    var li = el('li');
    var main = el('div', 'portal-doc-main');
    var a = el('a', null, doc.fileName || 'Document');
    a.href = doc.fileURL || '#'; a.target = '_blank'; a.rel = 'noopener';
    main.appendChild(a);
    if (doc.timestamp) { main.appendChild(el('span', 'portal-doc-meta', new Date(doc.timestamp).toLocaleDateString())); }
    li.appendChild(main);

    var del = el('button', 'portal-doc-del', 'Delete');
    del.type = 'button';
    del.setAttribute('aria-label', 'Delete ' + (doc.fileName || 'document'));
    del.addEventListener('click', function () { deleteDoc(doc, del); });
    li.appendChild(del);
    return li;
  }

  function deleteDoc(doc, btn) {
    if (!doc || !doc.fileURL) { return; }
    if (!window.confirm('Delete "' + (doc.fileName || 'this document') + '"? It will be removed from your portal.')) { return; }
    btn.disabled = true; btn.textContent = 'Deleting…';
    gasGet({ action: 'deleteDocument', email: getEmail(), fileURL: doc.fileURL })
      .then(function (data) {
        if (data && data.status === 'success') { status('ok', 'Deleted.'); loadClient(); }
        else { status('err', (data && data.message) || 'Could not delete.'); btn.disabled = false; btn.textContent = 'Delete'; }
      })
      .catch(function (e2) { status('err', e2.message || 'Could not delete.'); btn.disabled = false; btn.textContent = 'Delete'; });
  }

  function loadClient() {
    $('clientName').textContent = getName();
    var pol = $('policiesList'), up = $('uploadsList');
    pol.innerHTML = ''; pol.appendChild(el('li', 'portal-empty', 'Loading…'));
    up.innerHTML = ''; up.appendChild(el('li', 'portal-empty', 'Loading…'));

    gasGet({ action: 'getDocuments', email: getEmail() })
      .then(function (data) {
        var docs = (data && data.documents) || [];
        var policies = docs.filter(function (d) { return (d.uploadedBy || '').toLowerCase() === 'admin'; });
        var uploads = docs.filter(function (d) { return (d.uploadedBy || '').toLowerCase() !== 'admin'; });
        renderList(pol, policies, 'No policies shared yet.');
        renderList(up, uploads, 'You haven\'t uploaded anything yet.');
      })
      .catch(function (e2) {
        pol.innerHTML = ''; pol.appendChild(el('li', 'portal-empty', 'Could not load.'));
        up.innerHTML = ''; up.appendChild(el('li', 'portal-empty', 'Could not load.'));
        status('err', e2.message || 'Could not load your documents.');
      });
  }

  function renderList(ul, docs, emptyMsg) {
    ul.innerHTML = '';
    if (!docs.length) { ul.appendChild(el('li', 'portal-empty', emptyMsg)); return; }
    docs.forEach(function (d) { ul.appendChild(docRow(d)); });
  }

  $('clientUploadInput').addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) { return; }
    if (file.size > MAX_FILE) { status('err', 'That file is larger than 5 MB.'); return; }
    status('ok', 'Uploading ' + file.name + '…');
    readB64(file).then(function (b64) {
      return gasUpload({ action: 'clientUpload', email: getEmail(), fileName: file.name, mimeType: file.type || 'application/octet-stream', fileData: b64 });
    }).then(function () {
      // no-cors reply is opaque; re-read to confirm the file landed.
      status('ok', 'Uploaded.');
      loadClient();
    }).catch(function (e2) { status('err', e2.message || 'Upload failed.'); });
  });

  // ============================================================
  // ADMIN DASHBOARD
  // ============================================================
  var adminFile = null;

  function loadAdmin() {
    var list = $('usersList'), sel = $('adminTargetUser');
    list.innerHTML = ''; list.appendChild(el('li', 'portal-empty', 'Loading…'));

    gasGet({ action: 'getAllUsers', email: getEmail() })
      .then(function (data) {
        if (!data || data.status !== 'success') { throw new Error((data && data.message) || 'Could not load users.'); }
        var users = data.users || [];
        list.innerHTML = '';
        sel.innerHTML = '<option value="" disabled selected>Select a client…</option>';
        if (!users.length) { list.appendChild(el('li', 'portal-empty', 'No clients registered yet.')); return; }
        users.forEach(function (u) {
          var li = el('li');
          var box = el('div');
          box.appendChild(el('div', 'portal-user-name', ((u.firstName || '') + ' ' + (u.lastName || '')).trim() || u.email));
          box.appendChild(el('div', 'portal-user-email', u.email));
          li.appendChild(box);
          list.appendChild(li);

          var opt = el('option', null, (((u.firstName || '') + ' ' + (u.lastName || '')).trim() || u.email) + ' — ' + u.email);
          opt.value = u.email;
          sel.appendChild(opt);
        });
      })
      .catch(function (e2) {
        list.innerHTML = ''; list.appendChild(el('li', 'portal-empty', 'Could not load.'));
        status('err', e2.message || 'Could not load users.');
      });
  }

  $('adminUploadInput').addEventListener('change', function () {
    adminFile = (this.files && this.files[0]) || null;
    $('adminFileName').textContent = adminFile ? ('✓ ' + adminFile.name) : '';
  });

  $('adminSendForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('adminErr'); err.hidden = true;
    var target = $('adminTargetUser').value;
    if (!target) { return fieldErr(err, 'Please select a client.'); }
    if (!adminFile) { return fieldErr(err, 'Please choose a file to send.'); }
    if (adminFile.size > MAX_FILE) { return fieldErr(err, 'That file is larger than 5 MB.'); }

    var btn = $('adminSendBtn'); btn.disabled = true; btn.textContent = 'Sending…';
    readB64(adminFile).then(function (b64) {
      return gasUpload({ action: 'adminUpload', email: getEmail(), targetEmail: target, fileName: adminFile.name, mimeType: adminFile.type || 'application/octet-stream', fileData: b64 });
    }).then(function () {
      // no-cors reply is opaque; the send is optimistic (the admin gate is enforced server-side).
      status('ok', 'Sent to ' + target + '.');
      $('adminSendForm').reset(); adminFile = null; $('adminFileName').textContent = '';
    }).catch(function (e2) { fieldErr(err, e2.message || 'Could not send.'); })
      .then(function () { btn.disabled = false; btn.textContent = 'Send to client'; });
  });

  // ============================================================
  // NAV / MODALS / WIRING
  // ============================================================
  // "data-go" buttons switch views.
  document.querySelectorAll('[data-go]').forEach(function (b) {
    b.addEventListener('click', function () { showView(b.getAttribute('data-go')); });
  });

  // Slide-in drawer (Log out + Main site).
  var drawer = $('portalDrawer'), overlay = $('drawerOverlay'), menuToggle = $('menuToggle');
  function openDrawer() {
    drawer.classList.add('is-open'); overlay.classList.add('is-visible');
    menuToggle.setAttribute('aria-expanded', 'true'); drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeDrawer() {
    drawer.classList.remove('is-open'); overlay.classList.remove('is-visible');
    menuToggle.setAttribute('aria-expanded', 'false'); drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
  menuToggle.addEventListener('click', openDrawer);
  overlay.addEventListener('click', closeDrawer);
  $('menuClose').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeDrawer(); } });

  $('navLogout').addEventListener('click', function () { closeDrawer(); clearSession(); showView('home-view'); });
  $('navAbout').addEventListener('click', function () { $('modalAbout').hidden = false; });
  $('navPolicies').addEventListener('click', function () { $('modalPolicies').hidden = false; });
  document.querySelectorAll('[data-close-modal]').forEach(function (b) {
    b.addEventListener('click', function () { b.closest('.pmodal').hidden = true; });
  });
  document.querySelectorAll('.pmodal').forEach(function (m) {
    m.addEventListener('click', function (e) { if (e.target === m) { m.hidden = true; } });
  });

  // Digits-only for PIN fields.
  ['regPin', 'regPin2', 'logPin'].forEach(function (id) {
    $(id).addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 4); });
  });

  // Go.
  route();
})();
