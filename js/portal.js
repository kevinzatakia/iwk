/* Client Portal — routing, auth, and Google Apps Script calls.
   SPA: shows/hides <section class="pv"> views without reloading. */
(function () {
  'use strict';

  // ============================================================
  // CONFIG — set these two after deploying the Apps Script backend.
  // ============================================================
  // Paste the /exec URL of the deployed portal Apps Script (see
  // apps-script-portal-endpoint.gs) here:
  var PORTAL_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzmtXzedSrhzr5Jq7rFTzdNFuzFl593oWpDVrnTcLWmDjoZgEcFzW1lHOWlStufYgUs/exec';
  // The one email address that unlocks the admin dashboard:
  var ADMIN_EMAIL = 'admin@insureitwithkevin.in';

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
    $('navProfile').hidden = !onClient;
    $('notifBell').hidden = !onClient;
    if (!onClient) { $('notifCenter').hidden = true; }
    $('navLogout').hidden = !(onClient || onAdmin);
    // The slide-in menu (hamburger) is admin-only now; clients log out from the
    // Profile tab and navigate via the bottom nav.
    $('menuToggle').hidden = !onAdmin;
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
    var phone = $('regPhone').value.trim();
    var dob = $('regDob').value;
    var pin = $('regPin').value;
    var pin2 = $('regPin2').value;

    if (first.length < 1) { return fieldErr(err, 'Please enter your first name.'); }
    if (!EMAIL_RE.test(email)) { return fieldErr(err, 'Please enter a valid email address.'); }
    if (!/^[0-9]{10}$/.test(phone)) { return fieldErr(err, 'Please enter your 10-digit phone number.'); }
    if (!/^[0-9]{4}$/.test(pin)) { return fieldErr(err, 'Your PIN must be exactly 4 digits.'); }
    if (pin !== pin2) { return fieldErr(err, 'The two PINs do not match.'); }

    var btn = $('registerBtn'); btn.disabled = true; btn.textContent = 'Creating…';
    gasGet({ action: 'register', firstName: first, lastName: last, email: email, phone: phone, dob: dob, pin: pin })
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
  // readOnly hides the Delete control — used when a member views another family
  // member's or the POC's documents (they may view, not delete).
  function docRow(doc, readOnly) {
    var li = el('li');
    var main = el('div', 'portal-doc-main');
    var a = el('a', null, doc.fileName || 'Document');
    a.href = doc.fileURL || '#'; a.target = '_blank'; a.rel = 'noopener';
    main.appendChild(a);
    var metaBits = [];
    if (doc.timestamp) { metaBits.push(new Date(doc.timestamp).toLocaleDateString()); }
    if (doc.expiryDate) { metaBits.push((isDocExpired(doc) ? 'Expired ' : 'Expires ') + fmtDate(doc.expiryDate)); }
    if (metaBits.length) { main.appendChild(el('span', 'portal-doc-meta', metaBits.join(' · '))); }
    if (doc.linkedViaFamily) { main.appendChild(el('span', 'portal-doc-tag', 'Linked via Family Account')); }
    li.appendChild(main);

    if (readOnly) { return li; }
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
        if (data && data.status === 'success') { status('ok', 'Deleted.'); loadDocuments(); }
        else { status('err', (data && data.message) || 'Could not delete.'); btn.disabled = false; btn.textContent = 'Delete'; }
      })
      .catch(function (e2) { status('err', e2.message || 'Could not delete.'); btn.disabled = false; btn.textContent = 'Delete'; });
  }

  // "Your Policies" (admin-sent documents) split into Active / Expired by each
  // file's own expiry date. Active = expiry today-or-later (or no expiry set);
  // Expired = expiry has already passed.
  var adminPoliciesCache = [];
  var policyFilter = 'active'; // 'active' | 'expired'

  function isDocExpired(doc) {
    var d = toDate(doc && doc.expiryDate);
    if (!d) { return false; } // no expiry on file → treat as active
    return d.setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);
  }

  function renderPoliciesDocs() {
    var ul = $('policiesList');
    if (!ul) { return; }
    var expired = policyFilter === 'expired';
    var list = adminPoliciesCache.filter(function (d) { return isDocExpired(d) === expired; });
    renderList(ul, list, expired
      ? 'No expired policies — you\'re all up to date.'
      : 'No active policies shared yet.');
  }

  function loadClient() {
    $('clientName').textContent = getName();
    switchTab('tab-home');
    closeAllPanels();
    setDocsLoading();
    loadBootstrap();
    startNotifPolling();
    maybeShowPushOptin();
  }

  function setDocsLoading() {
    var pol = $('policiesList'), up = $('uploadsList');
    pol.innerHTML = ''; pol.appendChild(el('li', 'portal-empty', 'Loading…'));
    up.innerHTML = ''; up.appendChild(el('li', 'portal-empty', 'Loading…'));
  }

  // ONE cold-load round-trip replacing the old 5–6 separate JSONP reads (the
  // dominant load latency). Fans the single payload out to the same appliers the
  // individual loaders use.
  function loadBootstrap() {
    gasGet({ action: 'bootstrap', email: getEmail() })
      .then(function (b) {
        if (b && b.status === 'success') {
          applyProfile(b.profile);
          applyFamily(b.family);
          renderFamilyProfiles((b.subProfiles && b.subProfiles.profiles) || []);
          applyNotifications(b.notifications);
          applyDocuments(b.documents);
          return;
        }
        // Old backend without the bootstrap action → use the individual reads once.
        // (Only this case falls back; a timeout must NOT, or it piles 5 more slow
        // calls onto Apps Script's serialized per-user queue.)
        if (b && /unknown action/i.test(b.message || '')) { loadClientLegacy(); return; }
        status('err', (b && b.message) || 'Could not load your portal. Please pull to refresh.');
      })
      .catch(function (e) {
        status('err', (e && e.message) || 'Loading is taking longer than usual. Please refresh.');
      });
  }

  function loadClientLegacy() {
    loadProfile();
    loadFamily();
    loadFamilyProfiles();
    loadNotifications();
    loadDocuments();
  }

  function loadDocuments() {
    setDocsLoading();
    gasGet({ action: 'getDocuments', email: getEmail() })
      .then(applyDocuments)
      .catch(function (e2) {
        var pol = $('policiesList'), up = $('uploadsList');
        pol.innerHTML = ''; pol.appendChild(el('li', 'portal-empty', 'Could not load.'));
        up.innerHTML = ''; up.appendChild(el('li', 'portal-empty', 'Could not load.'));
        status('err', (e2 && e2.message) || 'Could not load your documents.');
      });
  }

  function applyDocuments(data) {
    var docs = (data && data.documents) || [];
    clientDocsCache = docs; // for per-sub-profile document reveal
    var policies = docs.filter(function (d) { return (d.uploadedBy || '').toLowerCase() === 'admin'; });
    var uploads = docs.filter(function (d) { return (d.uploadedBy || '').toLowerCase() !== 'admin'; });
    adminPoliciesCache = policies;
    renderPoliciesDocs();
    renderTimeline(); // renewals are derived from document expiry dates
    renderList($('uploadsList'), uploads, 'You haven\'t uploaded anything yet.');
  }

  function renderList(ul, docs, emptyMsg) {
    ul.innerHTML = '';
    if (!docs.length) { ul.appendChild(el('li', 'portal-empty', emptyMsg)); return; }
    docs.forEach(function (d) { ul.appendChild(docRow(d)); });
  }

  // ============================================================
  // STAGED UPLOADER + VERIFICATION
  //   Files are held locally (never uploaded on selection) so the user can review
  //   and remove them; "Continue" opens a custom Yes/No modal, and only "Yes"
  //   pushes them to the server. Reused for "My Uploads" and claim documents.
  // ============================================================
  function formatBytes(bytes) {
    if (bytes < 1024) { return bytes + ' B'; }
    var kb = bytes / 1024;
    if (kb < 1024) { return (kb < 10 ? kb.toFixed(1) : Math.round(kb)) + ' KB'; }
    var mb = kb / 1024;
    return (mb < 10 ? mb.toFixed(1) : Math.round(mb)) + ' MB';
  }

  // Uploads a list of files sequentially via the existing clientUpload action.
  // nameFn lets the caller prefix the stored filename (e.g. per claim).
  // notify: true → email Kevin a summary after the upload (used for "My Uploads",
  // not for claim-document uploads, which the claim intimation already flags).
  function uploadFiles(files, nameFn, notify) {
    var chain = Promise.resolve(), ok = 0, uploaded = [];
    files.forEach(function (f) {
      chain = chain.then(function () {
        return readB64(f).then(function (b64) {
          return gasUpload({ action: 'clientUpload', email: getEmail(), fileName: nameFn(f), mimeType: f.type || 'application/octet-stream', fileData: b64, expiryDate: f._expiry || '' })
            .then(function () { ok++; uploaded.push(f.name + (f._expiry ? ' (expires ' + f._expiry + ')' : '')); });
        });
      });
    });
    // Only the documents changed — refresh just those (one light getDocuments call)
    // instead of re-running the whole heavy bootstrap, which right after a Drive
    // write can queue behind it (Apps Script serializes a user's calls) and time out.
    return chain.then(function () {
      loadDocuments();
      if (notify && ok) { notifyAdminUpload(uploaded); }
      return ok;
    });
  }

  // Best-effort email to Kevin when a client uploads document(s) — reuses the
  // enquiry Apps Script (same path claims/quotes use), so no portal backend change.
  function notifyAdminUpload(names) {
    var who = ((profile.firstName || '') + ' ' + (profile.lastName || '')).trim() || getName();
    var products = 'PORTAL UPLOAD — ' + who + ' (' + (profile.email || getEmail()) + ') uploaded '
      + names.length + ' document' + (names.length > 1 ? 's' : '') + ': ' + names.join('; ');
    postEnquiry({ name: who, email: profile.email || getEmail(), mobile: profile.phone || '', products: products });
  }

  // Shared verify modal: openVerifyUpload(count, onYes) → Yes runs onYes.
  var verifyPending = null;
  function openVerifyUpload(count, onYes) {
    verifyPending = onYes;
    $('verifyUploadCount').textContent = count === 1
      ? 'This 1 file will be sent to Kevin.'
      : ('These ' + count + ' files will be sent to Kevin.');
    $('modalVerifyUpload').hidden = false;
  }
  $('verifyUploadYes').addEventListener('click', function () {
    $('modalVerifyUpload').hidden = true;
    var cb = verifyPending; verifyPending = null; if (cb) { cb(); }
  });
  $('verifyUploadNo').addEventListener('click', function () {
    $('modalVerifyUpload').hidden = true; verifyPending = null;
  });

  var uploaderSeq = 0;
  // opts: { title, accept, multiple, note, commitLabel, expiry, onCommit(files) -> Promise<count> }
  //   expiry: true → each staged file shows an optional policy-expiry date input; the
  //   chosen date rides on the File as f._expiry for onCommit/uploadFiles to send.
  function buildUploader(opts) {
    var staged = [];
    var seq = ++uploaderSeq;
    var box = el('div', 'portal-uploader'); box.hidden = true;

    var head = el('div', 'portal-uploader-head');
    head.appendChild(el('span', 'portal-uploader-title', opts.title || 'Upload documents'));
    var closeBtn = el('button', 'portal-uploader-close', '×'); closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close uploader');
    head.appendChild(closeBtn); box.appendChild(head);

    var input = document.createElement('input');
    input.type = 'file'; input.className = 'portal-file-input'; input.id = 'uploaderInput_' + seq;
    if (opts.multiple) { input.multiple = true; }
    if (opts.accept) { input.accept = opts.accept; }

    var drop = el('div', 'portal-dropzone');
    var dzInner = el('div', 'portal-dropzone-inner');
    dzInner.appendChild(el('span', 'portal-dropzone-ico', '⬆'));
    var browse = el('label', 'portal-dropzone-browse', 'Browse'); browse.setAttribute('for', input.id);
    dzInner.appendChild(browse);
    dzInner.appendChild(el('span', 'portal-dropzone-hint', opts.note || 'or drop files here'));
    drop.appendChild(dzInner);
    box.appendChild(input); box.appendChild(drop);

    var list = el('ul', 'portal-staged-list'); box.appendChild(list);
    var statusN = el('div', 'portal-uploader-status'); statusN.hidden = true; box.appendChild(statusN);
    var cont = el('button', 'btn btn-primary portal-uploader-continue', opts.commitLabel || 'Continue');
    cont.type = 'button'; cont.disabled = true; box.appendChild(cont);

    function setStatus(kind, msg) {
      if (!kind) { statusN.hidden = true; statusN.innerHTML = ''; return; }
      statusN.className = 'portal-uploader-status ' + kind; statusN.innerHTML = '';
      if (kind === 'busy') { statusN.appendChild(el('span', 'portal-spinner')); }
      else if (kind === 'ok') { statusN.appendChild(el('span', 'portal-check', '✓')); }
      statusN.appendChild(document.createTextNode(msg)); statusN.hidden = false;
    }

    function render() {
      list.innerHTML = '';
      staged.forEach(function (f, i) {
        var li = el('li', 'portal-staged-item');
        var meta = el('div', 'portal-staged-meta');
        meta.appendChild(el('span', 'portal-staged-name', f.name));
        meta.appendChild(el('span', 'portal-staged-size', formatBytes(f.size)));
        li.appendChild(meta);
        if (opts.expiry) {
          var exp = document.createElement('input');
          exp.type = 'date'; exp.className = 'f portal-staged-expiry';
          exp.value = f._expiry || '';
          exp.title = 'Policy expiry date (optional)';
          exp.setAttribute('aria-label', 'Policy expiry date for ' + f.name);
          exp.addEventListener('change', function () { f._expiry = this.value; });
          li.appendChild(exp);
        }
        var rm = el('button', 'portal-staged-remove', '×'); rm.type = 'button';
        rm.setAttribute('aria-label', 'Remove ' + f.name);
        rm.addEventListener('click', function () { staged.splice(i, 1); render(); });
        li.appendChild(rm);
        list.appendChild(li);
      });
      cont.disabled = staged.length === 0;
    }

    function addFiles(fileList) {
      setStatus(null);
      var rejected = 0;
      Array.prototype.slice.call(fileList || []).forEach(function (f) {
        if (f.size > MAX_FILE) { rejected++; return; }
        if (!staged.some(function (s) { return s.name === f.name && s.size === f.size; })) { staged.push(f); }
      });
      if (!opts.multiple && staged.length > 1) { staged = staged.slice(-1); }
      if (rejected) { setStatus('err', rejected + ' file' + (rejected > 1 ? 's' : '') + ' over 5 MB skipped.'); }
      render();
    }

    input.addEventListener('change', function () { addFiles(this.files); this.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-drag'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('is-drag'); }); });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files) { addFiles(e.dataTransfer.files); } });

    closeBtn.addEventListener('click', function () { box.hidden = true; staged = []; render(); setStatus(null); });

    cont.addEventListener('click', function () {
      if (!staged.length) { return; }
      openVerifyUpload(staged.length, function () {
        cont.disabled = true; closeBtn.disabled = true;
        setStatus('busy', 'Uploading ' + staged.length + ' file' + (staged.length > 1 ? 's' : '') + '…');
        opts.onCommit(staged.slice()).then(function (n) {
          staged = []; render();
          setStatus('ok', n + ' document' + (n > 1 ? 's' : '') + ' sent to Kevin');
        }).catch(function (e2) {
          setStatus('err', (e2 && e2.message) || 'Upload failed. Please try again.');
        }).then(function () { closeBtn.disabled = false; cont.disabled = staged.length === 0; });
      });
    });

    render();
    return {
      box: box,
      open: function () { box.hidden = false; setStatus(null); },
      // Clear any staged files/status and keep the box visible (for modal-hosted use).
      reset: function () { staged = []; render(); setStatus(null); box.hidden = false; }
    };
  }

  // ("My Uploads" upload button removed — clients now upload via the "Add Policy"
  // overlay. The uploads list itself still shows what they've sent.)

  // "Your Policies" Active / Expired atomic filter.
  document.querySelectorAll('#policyFilter .portal-filter-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      policyFilter = b.getAttribute('data-filter') === 'expired' ? 'expired' : 'active';
      document.querySelectorAll('#policyFilter .portal-filter-btn').forEach(function (o) {
        var on = o === b;
        o.classList.toggle('is-active', on);
        o.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      renderPoliciesDocs();
    });
  });

  // "Add a policy" — opens the same staged-upload flow as "My Uploads", but in a
  // dark overlay modal (#modalAddPolicy). Files upload to Kevin like any client doc.
  var addPolicyUploader = buildUploader({
    title: 'Upload a document',
    accept: '.pdf,.jpg,.jpeg,.png,image/*,.heic,.heif',
    multiple: true,
    note: 'PDF, JPG or PNG · up to 5 MB each · set the policy expiry (optional)',
    expiry: true, // let the client set each policy's expiry date
    onCommit: function (files) {
      // Uploads are Drive-bound (Google's file-create + share take several seconds
      // each and Apps Script can't speed that up). So don't trap the user on a
      // ~20s spinner — close the overlay now and finish in the background with a
      // status toast for the result.
      $('modalAddPolicy').hidden = true;
      status('ok', 'Uploading your document' + (files.length > 1 ? 's' : '') + '… you can keep using the portal.');
      uploadFiles(files, function (f) { return f.name; }, true)
        .then(function (n) { status('ok', n + ' document' + (n > 1 ? 's' : '') + ' uploaded — sent to Kevin.'); })
        .catch(function () { status('err', 'Upload failed — please try again.'); });
      return Promise.resolve(files.length); // don't keep the (now-hidden) uploader busy
    }
  });
  $('addPolicyMount').appendChild(addPolicyUploader.box);
  addPolicyUploader.box.hidden = false; // always shown inside its modal
  function openAddPolicy() { addPolicyUploader.reset(); $('modalAddPolicy').hidden = false; }

  // ============================================================
  // FAMILY ORGANIZER (POC mode)
  //   A user with dependent profiles (managed by Kevin in the Sheet) can turn on
  //   "Family Mode" to see everyone's policies, renewals and claims in one hub.
  //   The mode preference + banner dismissal live in localStorage (no backend
  //   write needed); the data itself is read-only via getFamily.
  // ============================================================
  var family = { isFamilyPoc: false, profiles: [], policies: [], claims: [] };
  var familyFilter = 'all'; // 'all' or a profileId

  // Family view is now the default for every client (the hub lives on the Home tab).
  function familyModeOn() { return true; }

  // ---- formatting ----
  function inr(n) { return '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN'); }
  function toDate(v) { if (!v) { return null; } var d = new Date(v); return isNaN(d.getTime()) ? null : d; }
  function fmtDate(v) {
    var d = toDate(v); if (!d) { return String(v || '—'); }
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function daysUntil(v) {
    var d = toDate(v); if (!d) { return null; }
    var today = new Date(); today.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0);
    return Math.round((d - today) / 86400000);
  }
  function profileName(id) {
    var p = family.profiles.find(function (x) { return x.profileId === id; });
    if (p) { return p.name || p.relationship || 'Member'; }
    return getName(); // blank/unmatched profileId → the POC themselves
  }
  function isClaimDone(status) { return /complete|approv|settl|paid|closed|done/i.test(status || ''); }

  // Populate the family state + hub from a getFamily payload. Shared by the
  // standalone loadFamily() and the bootstrap fan-out.
  function applyFamily(data) {
    family = { isFamilyPoc: false, role: 'POC', pocEmail: getEmail(), pocName: '', pocDob: '', myProfileId: '', accountSumInsured: 0, profiles: [], policies: [], claims: [] };
    if (data && data.status === 'success') {
      family = {
        isFamilyPoc: !!data.isFamilyPoc,
        role: data.role === 'MEMBER' ? 'MEMBER' : 'POC',
        pocEmail: data.pocEmail || getEmail(),
        pocName: data.pocName || '',
        pocDob: data.pocDob || '',
        myProfileId: data.myProfileId || '',
        accountSumInsured: Number(data.accountSumInsured) || 0,
        profiles: data.profiles || [],
        policies: data.policies || [],
        claims: data.claims || []
      };
    }
    applyRoleGuardrails();
    renderFamilyChrome();
    if (familyModeOn()) { renderFamilyHub(); }
  }

  function loadFamily() {
    gasGet({ action: 'getFamily', email: getEmail() })
      .then(function (data) {
        applyFamily(data);
        // Standalone reload path: a dependent MEMBER's read-only roster is refreshed
        // under the POC's email (the bootstrap path supplies it inline instead).
        if (family.role === 'MEMBER') { loadFamilyProfiles(); }
      })
      .catch(function () { renderFamilyChrome(); }); // silent: family mode is a bonus, not core
  }

  // POC vs MEMBER guardrails (PRD): a dependent member's view is read-only — they
  // cannot add family members or edit account/contact details. Applied whenever the
  // family role is (re)resolved.
  function isMember() { return family.role === 'MEMBER'; }
  function applyRoleGuardrails() {
    var member = isMember();
    var addBtn = $('addFamilyProfileBtn'); if (addBtn) { addBtn.hidden = member; }
    var editBtn = $('profileEditBtn'); if (editBtn) { editBtn.hidden = member; }
  }

  // Show/hide the banner, toggle and hub based on the saved preference. Family
  // Mode is available to every client now — they build their own family list via
  // "Add family member", so we no longer gate on having existing profiles.
  // No-op: family view is always on, and the hub + document folders now live on
  // their own tabs (no toggle/banner to manage).
  function renderFamilyChrome() { }

  function filteredClaims() {
    return familyFilter === 'all' ? family.claims
      : family.claims.filter(function (c) { return c.profileId === familyFilter; });
  }

  function renderFamilyHub() {
    // Total Family Aggregate Sum Insured = the POC's manually-set SI + every
    // dependent Profile's SI. accountSumInsured is the POC's figure resolved
    // server-side, so the family total reads identically for the POC and for every
    // dependent member (bi-directional visibility).
    var acctSI = Number(family.accountSumInsured) || 0;
    var profSI = family.profiles.reduce(function (s, p) { return s + (Number(p.sumInsured) || 0); }, 0);
    var totalCover = acctSI + profSI;
    $('familyTotalCover').textContent = totalCover ? inr(totalCover) : '—';

    // Breakdown sub-line: a POC sees their own account cover; a dependent member
    // sees their individual cover (their profile's SI).
    var myCover = acctSI;
    if (isMember()) {
      var meP = family.profiles.filter(function (p) { return String(p.profileId) === String(family.myProfileId); })[0];
      myCover = meP ? (Number(meP.sumInsured) || 0) : 0;
    }
    $('familyCoverSub').textContent = 'Your cover ' + (myCover ? inr(myCover) : '—') +
      ' · ' + family.profiles.length + ' member' + (family.profiles.length === 1 ? '' : 's');

    // Active claims: the backend already scopes claims to the viewer (POC → the
    // whole family; member → only their own), so this count is correct per role.
    var openClaims = family.claims.filter(function (c) { return !isClaimDone(c.status); }).length;
    $('familyActiveClaims').textContent = String(openClaims);
    var claimsSub = $('familyClaimsSub');
    if (claimsSub) { claimsSub.textContent = isMember() ? 'your claims' : 'across the family'; }

    renderTimeline();
    renderClaims();
  }

  // Upcoming renewals are derived from policy DOCUMENT expiry dates — the POC's own
  // and any family-linked documents — not the hand-filled ledger. Any doc that
  // carries an expiry date counts (POC or family); soonest expiry first.
  function renderTimeline() {
    var ul = $('familyTimeline');
    if (!ul) { return; }
    ul.innerHTML = '';
    var upcoming = (clientDocsCache || [])
      .filter(function (d) { return toDate(d.expiryDate); })
      .sort(function (a, b) { return toDate(a.expiryDate) - toDate(b.expiryDate); });
    if (!upcoming.length) { ul.appendChild(el('li', 'portal-empty', 'No upcoming renewals.')); return; }
    upcoming.forEach(function (d) {
      var li = el('li', 'portal-timeline-item');
      var left = el('div', 'portal-tl-main');
      left.appendChild(el('span', 'portal-tl-title', d.fileName || 'Policy'));
      var who = d.linkedViaFamily ? 'Family member' : profileName(d.profileId);
      left.appendChild(el('span', 'portal-tl-meta', who + ' · ' + fmtDate(d.expiryDate)));
      li.appendChild(left);
      var days = daysUntil(d.expiryDate);
      var pillText = days == null ? '' : (days < 0 ? 'Overdue' : (days === 0 ? 'Due today' : 'in ' + days + 'd'));
      var pill = el('span', 'portal-tl-pill' + (days != null && days <= 14 ? ' is-soon' : ''), pillText);
      li.appendChild(pill);
      ul.appendChild(li);
    });
  }

  function renderClaims() {
    var ul = $('familyClaims');
    ul.innerHTML = '';
    var claims = filteredClaims();
    if (!claims.length) { ul.appendChild(el('li', 'portal-empty', 'No claims on record.')); return; }
    claims.forEach(function (c) {
      var li = el('li', 'portal-claim-item');
      var main = el('div', 'portal-claim-main');
      main.appendChild(el('span', 'portal-claim-title', profileName(c.profileId) + ' · ' + (c.policyType || 'Policy')));
      if (c.actionRequired) { main.appendChild(el('span', 'portal-claim-action', c.actionRequired)); }
      // Self-service intimations carry the richer detail the POC feed shows.
      if (c.intimated) {
        var bits = [];
        if (c.patientName) { bits.push('Patient: ' + c.patientName); }
        if (c.submittedByName) { bits.push('By ' + c.submittedByName); }
        if (c.policyNo) { bits.push('Policy ' + c.policyNo); }
        if (c.hospitalName) { bits.push(c.hospitalName + (c.admission ? ' · ' + fmtDate(c.admission) : '')); }
        if (bits.length) { main.appendChild(el('span', 'portal-claim-meta', bits.join(' · '))); }
      }
      if (c.lastUpdated) { main.appendChild(el('span', 'portal-claim-meta', (c.intimated ? 'Submitted ' : 'Updated ') + fmtDate(c.lastUpdated))); }
      li.appendChild(main);
      var done = isClaimDone(c.status);
      li.appendChild(el('span', 'portal-claim-status' + (done ? ' is-done' : ''), c.status || 'In progress'));
      // Documents-pending claims get an inline multi-file upload (iOS HEIC ok).
      if (isPendingDocs(c.status)) { li.classList.add('has-upload'); li.appendChild(buildClaimUpload(c)); }
      ul.appendChild(li);
    });
  }

  // (Family Mode is always on now — the old opt-in banner/toggle were removed.)

  // ============================================================
  // PROFILE + DASHBOARD PANELS (Claims / Expired Policies)
  // ============================================================
  var profile = { firstName: '', lastName: '', email: '', phone: '', sumInsured: 0, dob: '' };

  // Populate the profile card from a getProfile payload. Shared by loadProfile()
  // and the bootstrap fan-out.
  function applyProfile(data) {
    if (data && data.status === 'success') {
      profile = { firstName: data.firstName || '', lastName: data.lastName || '', email: data.email || getEmail(), phone: String(data.phone || '').trim(), sumInsured: Number(data.sumInsured) || 0, dob: data.dob || '' };
      fillProfileModal();
      $('phoneWarning').hidden = !!profile.phone; // nag only when we KNOW there's no phone
      maybeNudgePhone();
    } else {
      profile = { firstName: getName(), lastName: '', email: getEmail(), phone: '', sumInsured: 0, dob: '' };
      fillProfileModal();
      $('phoneWarning').hidden = true;
    }
    // The POC's own account Sum Insured feeds the Total Family Cover aggregate;
    // re-render the hub now that we have it (order with loadFamily isn't fixed).
    if (familyModeOn()) { renderFamilyHub(); }
  }

  function loadProfile() {
    gasGet({ action: 'getProfile', email: getEmail() })
      .then(applyProfile)
      .catch(function () {
        profile = { firstName: getName(), lastName: '', email: getEmail(), phone: '', sumInsured: 0, dob: '' };
        fillProfileModal();
        $('phoneWarning').hidden = true;
      });
  }

  function fillProfileModal() {
    var nm = ((profile.firstName || '') + ' ' + (profile.lastName || '')).trim() || getName();
    var em = profile.email || getEmail();
    $('profileName').textContent = nm;
    $('profileEmail').textContent = em;
    $('profilePhone').value = profile.phone || '';
    if ($('profileDob')) { $('profileDob').value = profile.dob || ''; }
    // Mirror onto the Profile tab card.
    if ($('profileTabName')) { $('profileTabName').textContent = nm; }
    if ($('profileTabEmail')) { $('profileTabEmail').textContent = em; }
    if ($('profileTabPhone')) { $('profileTabPhone').textContent = profile.phone || '—'; }
  }

  function openProfile() {
    fillProfileModal();
    $('profileErr').hidden = true;
    $('profileNote').hidden = !!profile.phone; // educational copy shown when no phone yet
    $('modalProfile').hidden = false;
  }

  // Progressive nudge: if the account has no phone, auto-open the Profile overlay
  // once per session (dismissible via its × — never blocks using the app).
  function maybeNudgePhone() {
    if (profile.phone || sessionStorage.getItem('phoneNudged') === '1') { return; }
    sessionStorage.setItem('phoneNudged', '1');
    openProfile();
  }

  $('navProfile').addEventListener('click', function () { closeDrawer(); switchTab('tab-profile'); });
  $('phoneWarning').addEventListener('click', openProfile);
  $('profileEditBtn').addEventListener('click', openProfile);

  // ============================================================
  // BOTTOM NAV — client SPA tab switching (Home/Documents/Add/Claims/Profile)
  // ============================================================
  // Note: 'tab-addpolicy' is intentionally excluded — the center nav button opens
  // the upload overlay (openAddPolicy) instead of switching to a tab.
  var CLIENT_TABS = ['tab-home', 'tab-documents', 'tab-claims', 'tab-profile'];
  function switchTab(id) {
    if (CLIENT_TABS.indexOf(id) < 0) { id = 'tab-home'; }
    CLIENT_TABS.forEach(function (t) { var n = $(t); if (n) { n.hidden = (t !== id); } });
    document.querySelectorAll('.portal-bn').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-tab') === id);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  document.querySelectorAll('.portal-bn').forEach(function (b) {
    b.addEventListener('click', function () {
      var tab = b.getAttribute('data-tab');
      if (tab === 'tab-addpolicy') { openAddPolicy(); return; }
      switchTab(tab);
    });
  });

  // ---- Claim Intimation overlay ----
  $('claimIntimateBtn').addEventListener('click', function () { $('claimErr').hidden = true; $('modalClaim').hidden = false; });
  $('claimClose').addEventListener('click', function () { $('modalClaim').hidden = true; });
  function showClaimSuccess() { var m = $('modalClaimSuccess'); if (m) { m.hidden = false; } }
  $('claimContact').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 10); });

  $('claimForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('claimErr'); err.hidden = true;
    var f = {
      policyNo: $('claimPolicyNo').value.trim(), insured: $('claimInsured').value.trim(),
      patient: $('claimPatient').value.trim(), hospital: $('claimHospital').value.trim(),
      hospitalAddr: $('claimHospitalAddr').value.trim(), admission: $('claimAdmission').value,
      illness: $('claimIllness').value.trim(), contact: $('claimContact').value.trim()
    };
    if (!f.policyNo || !f.insured || !f.patient || !f.hospital || !f.hospitalAddr || !f.admission || !f.illness) {
      return fieldErr(err, 'Please fill in every field.');
    }
    if (!/^[0-9]{10}$/.test(f.contact)) { return fieldErr(err, 'Please enter a valid 10-digit contact number.'); }
    var products = 'CLAIM INTIMATION — Policy No: ' + f.policyNo + ' | Insured: ' + f.insured
      + ' | Patient: ' + f.patient + ' | Hospital: ' + f.hospital + ', ' + f.hospitalAddr
      + ' | Admitted: ' + f.admission + ' | Illness: ' + f.illness + ' | Contact: ' + f.contact;

    // OPTIMISTIC: confirm to the user immediately and run the two Google-Scripts
    // calls in the BACKGROUND. Waiting on both round-trips (a JSONP persist that can
    // queue behind other portal calls + an enquiry POST) is what made this feel slow.
    var btn = $('claimSubmit'); btn.disabled = false; btn.textContent = 'Submit claim';
    $('modalClaim').hidden = true; $('claimForm').reset();
    var cur = parseInt($('familyActiveClaims').textContent, 10); if (isNaN(cur)) { cur = 0; }
    $('familyActiveClaims').textContent = String(cur + 1); // optimistic +1
    showClaimSuccess();

    // Persist on the portal backend (feeds the POC's Claims feed + counter) AND email
    // Kevin via the enquiry Apps Script. Both are best-effort; reconcile/roll back after.
    var persist = gasGet({
      action: 'submitClaim', email: getEmail(),
      policyNo: f.policyNo, insured: f.insured, patient: f.patient, hospital: f.hospital,
      hospitalAddr: f.hospitalAddr, admission: f.admission, illness: f.illness, contact: f.contact
    }).then(function (r) { return !!(r && r.status === 'success'); }, function () { return false; });
    var mail = postEnquiry({ name: f.insured, email: profile.email || getEmail(), mobile: f.contact, products: products })
      .then(function () { return true; }, function () { return false; });
    Promise.all([persist, mail]).then(function (res) {
      var saved = res[0], mailed = res[1];
      if (saved) {
        loadFamily(); // reconcile the counter/feed to the authoritative server figure
      } else if (!mailed) {
        // Neither channel confirmed — undo the optimistic +1 and warn.
        var c2 = parseInt($('familyActiveClaims').textContent, 10);
        if (!isNaN(c2) && c2 > 0) { $('familyActiveClaims').textContent = String(c2 - 1); }
        status('err', 'We could not confirm your claim reached Kevin — please call him, or try again.');
      }
    });
  });

  // ---- Custom quote request (Add Policy tab) ----
  $('quoteForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('quoteErr'); err.hidden = true;
    var type = $('quotePolicyType').value.trim();
    if (type.length < 2) { return fieldErr(err, 'Please enter the policy type you want.'); }
    var details = $('quoteDetails').value.trim();
    var btn = $('quoteSubmit'); btn.disabled = true; btn.textContent = 'Sending…';
    var products = 'Custom quote request — ' + type + (details ? ' | Details: ' + details : '');
    postEnquiry({ name: getName(), email: profile.email || getEmail(), mobile: profile.phone || '', products: products })
      .then(function () { status('ok', 'Request sent — Kevin will get back to you.'); $('quoteForm').reset(); })
      .catch(function () { fieldErr(err, 'Could not send. Please try again.'); })
      .then(function () { btn.disabled = false; btn.textContent = 'Request quote'; });
  });

  // Website enquiry Apps Script (emails Kevin) — same endpoint the site forms use.
  // Separate from the portal endpoint; no-cors POST, so the reply is opaque.
  var ENQUIRY_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwD5jcJdgk6hXAZAoy2Gz0h0IVaFkRMR2BBu3WkPH2dQ9CHxsVghtpu79TmmPqODpbY/exec';
  function postEnquiry(fields) {
    var data = new FormData();
    data.append('name', fields.name || 'Portal user');
    data.append('email', fields.email || '');
    data.append('mobile', fields.mobile || '');
    data.append('products', fields.products || '');
    data.append('botcheck', '');
    return fetch(ENQUIRY_ENDPOINT, { method: 'POST', body: data, mode: 'no-cors' });
  }

  $('profileForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('profileErr'); err.hidden = true;
    var phone = $('profilePhone').value.trim();
    if (phone && !/^[0-9]{10}$/.test(phone)) { return fieldErr(err, 'Please enter a valid 10-digit phone number.'); }
    var dob = $('profileDob') ? $('profileDob').value : '';

    var btn = $('profileSaveBtn'); btn.disabled = true; btn.textContent = 'Saving…';
    gasGet({ action: 'updateProfile', email: getEmail(), phone: phone, dob: dob })
      .then(function (data) {
        if (data && data.status === 'success') {
          profile.phone = String(data.phone || phone).trim();
          profile.dob = data.dob || dob || '';
          fillProfileModal();
          $('phoneWarning').hidden = !!profile.phone;
          status('ok', 'Profile updated.');
          $('modalProfile').hidden = true;
        } else {
          fieldErr(err, (data && data.message) || 'Could not save. Please try again.');
        }
      })
      .catch(function (e2) { fieldErr(err, e2.message || 'Network error. Please try again.'); })
      .then(function () { btn.disabled = false; btn.textContent = 'Save profile'; });
  });

  // ---- expandable dashboard panels (mutually exclusive) ----
  var activeDashboardPanel = null; // 'claims' | 'expired' | null

  function closeAllPanels() { activeDashboardPanel = null; }

  function isPendingDocs(status) { return /pending/i.test(status || ''); }

  // Claim documents use the same staged uploader (browse → preview → verify).
  function buildClaimUpload(claim) {
    var wrap = el('div', 'portal-claim-upload');
    var ref = claim.claimId || claim.policyType || 'claim';
    var uploader = buildUploader({
      title: 'Upload claim documents',
      accept: 'image/*,.heic,.heif,application/pdf',
      multiple: true,
      note: 'Photos or PDFs · up to 5 MB each',
      onCommit: function (files) { return uploadFiles(files, function (f) { return 'Claim ' + ref + ' — ' + f.name; }); }
    });
    var btn = el('button', 'btn btn-primary portal-claim-upload-btn', '＋ Upload documents');
    btn.type = 'button';
    btn.addEventListener('click', function () { uploader.open(); });
    wrap.appendChild(btn);
    wrap.appendChild(uploader.box);
    return wrap;
  }

  // A notification jump now switches to the relevant tab (claims → Claims,
  // renewal/expired → Documents where the Expired list lives).
  function scrollToPanel(name) {
    if (name === 'claims') { switchTab('tab-claims'); return; }
    // renewal/expired notifications land on Documents, showing the Expired filter.
    if (name === 'expired') {
      policyFilter = 'expired';
      document.querySelectorAll('#policyFilter .portal-filter-btn').forEach(function (o) {
        var on = o.getAttribute('data-filter') === 'expired';
        o.classList.toggle('is-active', on);
        o.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      renderPoliciesDocs();
    }
    switchTab('tab-documents');
  }

  // ============================================================
  // NOTIFICATIONS (in-app centre + OS notifications while open)
  // ============================================================
  var notifications = [];
  var notifTimer = null;
  var NOTIF_POLL_MS = 90000;

  function applyNotifications(data) {
    if (data && data.status === 'success') {
      notifications = data.notifications || [];
      renderNotifBadge(data.unread || 0);
      renderNotifList();
      maybeOsNotify();
    }
  }

  function loadNotifications() {
    gasGet({ action: 'getNotifications', email: getEmail() })
      .then(applyNotifications)
      .catch(function () { /* silent — notifications are non-critical */ });
  }

  function startNotifPolling() {
    if (notifTimer) { clearInterval(notifTimer); }
    notifTimer = setInterval(function () {
      if (getEmail() && !isAdmin(getEmail())) { loadNotifications(); }
    }, NOTIF_POLL_MS);
  }
  function stopNotifPolling() { if (notifTimer) { clearInterval(notifTimer); notifTimer = null; } }

  function renderNotifBadge(unread) {
    var badge = $('notifBadge');
    if (unread > 0) { badge.hidden = false; badge.textContent = unread > 9 ? '9+' : String(unread); }
    else { badge.hidden = true; badge.textContent = ''; }
  }

  function timeAgo(iso) {
    var d = new Date(iso); if (isNaN(d.getTime())) { return ''; }
    var mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) { return 'just now'; }
    if (mins < 60) { return mins + 'm ago'; }
    var hrs = Math.round(mins / 60); if (hrs < 24) { return hrs + 'h ago'; }
    var days = Math.round(hrs / 24); if (days < 7) { return days + 'd ago'; }
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  function renderNotifList() {
    var ul = $('notifList');
    ul.innerHTML = '';
    if (!notifications.length) { ul.appendChild(el('li', 'portal-empty', 'No notifications yet.')); return; }
    notifications.forEach(function (n) {
      var li = el('li', 'portal-notif-item' + (n.isRead ? '' : ' is-unread'));
      li.setAttribute('role', 'button'); li.tabIndex = 0;
      var body = el('div', 'portal-notif-body');
      body.appendChild(el('span', 'portal-notif-itemtitle', n.title || 'Notification'));
      body.appendChild(el('span', 'portal-notif-msg', n.message || ''));
      body.appendChild(el('span', 'portal-notif-time', timeAgo(n.createdAt)));
      li.appendChild(body);
      if (!n.isRead) { li.appendChild(el('span', 'portal-notif-dot')); }
      li.addEventListener('click', function () { onNotifClick(n); });
      li.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNotifClick(n); } });
      ul.appendChild(li);
    });
  }

  function onNotifClick(n) {
    if (!n.isRead) {
      n.isRead = true;
      renderNotifBadge(notifications.filter(function (x) { return !x.isRead; }).length);
      renderNotifList();
      gasGet({ action: 'markNotificationRead', email: getEmail(), notificationId: n.notificationId }).catch(function () {});
    }
    closeNotifCenter();
    routeNotification(n);
  }

  function routeNotification(n) {
    if (n.relatedType === 'claim') { scrollToPanel('claims'); }
    else if (n.relatedType === 'renewal') { scrollToPanel('expired'); }
  }

  function openNotifCenter() {
    $('notifCenter').hidden = false;
    $('notifBell').setAttribute('aria-expanded', 'true');
  }
  function closeNotifCenter() {
    $('notifCenter').hidden = true;
    $('notifBell').setAttribute('aria-expanded', 'false');
  }

  $('notifBell').addEventListener('click', function (e) {
    e.stopPropagation();
    if ($('notifCenter').hidden) { openNotifCenter(); } else { closeNotifCenter(); }
  });
  // Close when clicking outside the centre or bell.
  document.addEventListener('click', function (e) {
    if ($('notifCenter').hidden) { return; }
    if (!$('notifCenter').contains(e.target) && e.target !== $('notifBell') && !$('notifBell').contains(e.target)) { closeNotifCenter(); }
  });

  $('notifMarkAll').addEventListener('click', function () {
    notifications.forEach(function (n) { n.isRead = true; });
    renderNotifBadge(0); renderNotifList();
    gasGet({ action: 'markAllNotificationsRead', email: getEmail() }).catch(function () {});
  });

  // ---- OS notifications (local; fired for genuinely new items while open) ----
  function shownIds() { try { return JSON.parse(localStorage.getItem('notifShownIds') || '[]'); } catch (e) { return []; } }
  function saveShownIds(ids) { localStorage.setItem('notifShownIds', JSON.stringify(ids.slice(-100))); }

  function maybeOsNotify() {
    if (!('Notification' in window) || Notification.permission !== 'granted') { return; }
    var seen = shownIds();
    var fresh = notifications.filter(function (n) { return !n.isRead && seen.indexOf(n.notificationId) < 0; });
    // First ever run: baseline (don't replay old alerts as OS pop-ups).
    if (localStorage.getItem('notifShownInit') !== '1') {
      localStorage.setItem('notifShownInit', '1');
      saveShownIds(seen.concat(notifications.map(function (n) { return n.notificationId; })));
      return;
    }
    if (!fresh.length || !navigator.serviceWorker) { return; }
    navigator.serviceWorker.ready.then(function (reg) {
      fresh.slice(0, 3).forEach(function (n) {
        reg.showNotification(n.title || 'Insure It With Kevin', {
          body: n.message || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
          tag: n.notificationId, data: { url: '/portal.html#' + (n.relatedType || '') }
        });
      });
    }).catch(function () {});
    saveShownIds(seen.concat(fresh.map(function (n) { return n.notificationId; })));
  }

  // SW tells us an OS notification was tapped → route to the right panel.
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'notification-click') {
        var url = e.data.url || '';
        if (url.indexOf('claim') >= 0) { scrollToPanel('claims'); }
        else if (url.indexOf('renewal') >= 0 || url.indexOf('expired') >= 0) { scrollToPanel('expired'); }
      }
    });
  }

  // ---- push opt-in (2nd+ visit, permission still undecided) ----
  function maybeShowPushOptin() {
    if (!('Notification' in window)) { return; }
    var visits = (parseInt(localStorage.getItem('portalVisitCount'), 10) || 0) + 1;
    localStorage.setItem('portalVisitCount', String(visits));
    var show = visits >= 2 && Notification.permission === 'default' && localStorage.getItem('pushOptinDismissed') !== '1';
    $('pushOptin').hidden = !show;
  }

  $('pushEnable').addEventListener('click', function () {
    $('pushOptin').hidden = true;
    if (!('Notification' in window)) { return; }
    Notification.requestPermission().then(function (perm) {
      if (perm === 'granted') { status('ok', 'Notifications enabled — we\'ll alert you about renewals and claims.'); }
      else if (perm === 'denied') { status('err', 'Notifications are blocked. You can re-enable them in your browser settings.'); }
    });
  });
  $('pushDismiss').addEventListener('click', function () {
    localStorage.setItem('pushOptinDismissed', '1');
    $('pushOptin').hidden = true;
  });

  // ============================================================
  // FAMILY SUB-PROFILES (relational accounts + shared modal)
  //   One modal, used by both the admin (for any client) and the client (for
  //   themselves). Backend: createSubProfile/updateSubProfile/deleteSubProfile/
  //   getSubProfiles. Deleting a profile never touches its uploaded documents.
  // ============================================================
  var subCtx = null;         // { mode, parentEmail, parentName, isAdmin, profile }
  var spStaged = [];         // staged files [{ file, expiry }] in the modal
  var clientDocsCache = [];  // this client's docs, for per-sub-profile reveal

  function openSubProfileModal(ctx) {
    subCtx = ctx; spStaged = [];
    var isEdit = ctx.mode === 'edit', p = ctx.profile || {};
    $('subProfileTitle').textContent = isEdit
      ? ('Editing profile: ' + (p.name || 'member'))
      : ('Making new profile for ' + (ctx.parentName || 'this account'));
    $('spName').value = isEdit ? (p.name || '') : '';
    $('spDob').value = isEdit ? (p.dob || '') : '';
    $('spEmail').value = isEdit ? (p.profileEmail || '') : '';
    $('spPhone').value = isEdit ? (p.phone || '') : '';
    $('spRelation').value = isEdit ? (p.relation || '') : '';
    $('spSumInsured').value = (isEdit && p.sumInsured) ? String(p.sumInsured) : '';
    renderSpStaged(); $('spError').hidden = true;
    $('spSubmitBtn').disabled = false; $('spSubmitBtn').textContent = 'Submit';
    // Delete only appears when editing an existing profile AND the requester is admin.
    $('spDeleteBtn').hidden = !(isEdit && ctx.isAdmin);
    $('modalSubProfile').hidden = false;
    $('spName').focus();
  }
  function closeSubProfileModal() { $('modalSubProfile').hidden = true; subCtx = null; spStaged = []; renderSpStaged(); }

  // Multi-file drag-drop staging in the profile modal, each file with its expiry.
  function renderSpStaged() {
    var ul = $('spStaged'); if (!ul) { return; }
    ul.innerHTML = '';
    spStaged.forEach(function (item, i) {
      var li = el('li', 'portal-staged-item');
      var meta = el('div', 'portal-staged-meta');
      meta.appendChild(el('span', 'portal-staged-name', item.file.name));
      meta.appendChild(el('span', 'portal-staged-size', formatBytes(item.file.size)));
      li.appendChild(meta);
      var exp = document.createElement('input');
      exp.type = 'date'; exp.className = 'f portal-staged-expiry'; exp.value = item.expiry || '';
      exp.setAttribute('aria-label', 'Expiry date for ' + item.file.name);
      exp.addEventListener('change', function () { item.expiry = this.value; });
      li.appendChild(exp);
      var rm = el('button', 'portal-staged-remove', '×'); rm.type = 'button';
      rm.setAttribute('aria-label', 'Remove ' + item.file.name);
      rm.addEventListener('click', function () { spStaged.splice(i, 1); renderSpStaged(); });
      li.appendChild(rm);
      ul.appendChild(li);
    });
  }
  function addSpFiles(fileList) {
    var rejected = 0;
    Array.prototype.slice.call(fileList || []).forEach(function (f) {
      if (f.size > MAX_FILE) { rejected++; return; }
      if (!spStaged.some(function (s) { return s.file.name === f.name && s.file.size === f.size; })) {
        spStaged.push({ file: f, expiry: '' });
      }
    });
    if (rejected) { fieldErr($('spError'), rejected + ' file' + (rejected > 1 ? 's' : '') + ' over 5 MB skipped.'); }
    else { $('spError').hidden = true; }
    renderSpStaged();
  }
  $('spFile').addEventListener('change', function () { addSpFiles(this.files); this.value = ''; });
  (function () {
    var dz = $('spDrop'); if (!dz) { return; }
    ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('is-drag'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('is-drag'); }); });
    dz.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files) { addSpFiles(e.dataTransfer.files); } });
  })();
  $('spCancelBtn').addEventListener('click', closeSubProfileModal);

  $('subProfileForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!subCtx) { return; }
    var err = $('spError'); err.hidden = true;
    var name = $('spName').value.trim(), dob = $('spDob').value, email = $('spEmail').value.trim();
    var phone = $('spPhone').value.trim(), relation = $('spRelation').value;
    if (name.length < 2) { return fieldErr(err, 'Please enter a name.'); }
    if (!dob) { return fieldErr(err, 'Please enter a date of birth.'); }
    if (!EMAIL_RE.test(email)) { return fieldErr(err, 'Please enter a valid email address.'); }
    if (phone && !/^[0-9]{10}$/.test(phone)) { return fieldErr(err, 'Phone must be 10 digits, or leave it blank.'); }
    if (!relation) { return fieldErr(err, 'Please choose the relation.'); }

    var btn = $('spSubmitBtn'); btn.disabled = true; btn.textContent = 'Saving…';
    var sumInsured = parseInt(($('spSumInsured').value || '').replace(/[^\d]/g, ''), 10) || 0;
    var payload = { email: getEmail(), name: name, dob: dob, profileEmail: email, phone: phone, relation: relation, sumInsured: sumInsured };
    if (subCtx.mode === 'create') { payload.action = 'createSubProfile'; payload.parentEmail = subCtx.parentEmail; }
    else { payload.action = 'updateSubProfile'; payload.profileId = subCtx.profile.profileId; }

    function fail(msg) { fieldErr(err, msg); btn.disabled = false; btn.textContent = 'Submit'; }

    function proceed() {
      // Every attached document needs an expiry date (like "Send a policy").
      if (spStaged.some(function (s) { return !s.expiry; })) { return fail('Please set an expiry date for every document.'); }
      // 1) Create/update the profile (small payload → readable JSONP), then
      // 2) upload each staged file separately (base64 needs a no-cors POST),
      //    linked to the profile with its own expiry.
      gasGet(payload).then(function (data) {
        if (!data || data.status !== 'success') { return fail((data && data.message) || 'Could not save.'); }
        var profileId = (subCtx.mode === 'create') ? data.profileId : subCtx.profile.profileId;
        uploadSpFiles(profileId, 0);
      }).catch(function (e2) { fail(e2.message || 'Network error.'); });
    }

    // Uploads staged files one-by-one, then closes + refreshes.
    function uploadSpFiles(profileId, idx) {
      if (idx >= spStaged.length) {
        var hadFiles = spStaged.length > 0, ctx = subCtx;
        closeSubProfileModal(); status('ok', 'Saved.');
        setTimeout(function () { refreshAfterSubProfile(ctx); }, hadFiles ? 1200 : 0);
        return;
      }
      var item = spStaged[idx];
      readB64(item.file).then(function (b64) {
        var up = { email: getEmail(), profileId: profileId, expiryDate: item.expiry,
          fileName: item.file.name, mimeType: item.file.type || 'application/octet-stream', fileData: b64 };
        if (subCtx.isAdmin) { up.action = 'adminUpload'; up.targetEmail = subCtx.parentEmail; }
        else { up.action = 'clientUpload'; up.profileEmail = ($('spEmail').value || '').trim().toLowerCase(); }
        return gasUpload(up);
      }).then(function () { uploadSpFiles(profileId, idx + 1); })
        .catch(function (e2) { fail((e2 && e2.message) || 'A document failed to upload.'); });
    }

    // On create, read the sheet first to catch an individual already added under
    // this account (dedupe by email). The backend enforces it too, but this shows
    // the message reliably even when a file makes the write opaque.
    if (subCtx.mode === 'create') {
      gasGet({ action: 'getSubProfiles', email: getEmail(), parentEmail: subCtx.parentEmail })
        .then(function (data) {
          var existing = (data && data.status === 'success' && data.profiles) || [];
          var dup = existing.some(function (x) { return (x.profileEmail || '').toLowerCase() === email.toLowerCase(); });
          if (dup) { return fail('A profile with this email already exists for this account.'); }
          proceed();
        })
        .catch(function () { proceed(); }); // if the check can't run, let the backend guard it
    } else {
      proceed();
    }
  });

  $('spDeleteBtn').addEventListener('click', function () {
    if (!subCtx || subCtx.mode !== 'edit') { return; }
    if (!window.confirm('Delete this profile? Their uploaded documents will NOT be removed.')) { return; }
    var btn = this; btn.disabled = true; btn.textContent = 'Deleting…';
    gasGet({ action: 'deleteSubProfile', email: getEmail(), profileId: subCtx.profile.profileId })
      .then(function (data) {
        if (data && data.status === 'success') { var ctx = subCtx; closeSubProfileModal(); status('ok', 'Profile deleted.'); refreshAfterSubProfile(ctx); }
        else { status('err', (data && data.message) || 'Could not delete.'); }
      })
      .catch(function (e2) { status('err', e2.message || 'Could not delete.'); })
      .then(function () { btn.disabled = false; btn.textContent = 'Delete'; });
  });

  function refreshAfterSubProfile(ctx) {
    if (ctx && ctx.isAdmin) { reloadAdminSubProfiles(ctx.parentEmail); }
    else { loadFamilyProfiles(); loadFamily(); }
  }

  function docCountLabel(n) {
    if (!n) { return ''; }
    return n + (n === 1 ? ' document' : ' documents');
  }

  // ---- client "Family Profiles" section ----
  function loadFamilyProfiles() {
    var wrap = $('familyProfilesList');
    wrap.innerHTML = ''; wrap.appendChild(el('div', 'portal-empty', 'Loading…'));
    // A dependent member views the POC's roster (read-only); a POC views their own.
    var parent = (family && family.pocEmail) || getEmail();
    gasGet({ action: 'getSubProfiles', email: getEmail(), parentEmail: parent })
      .then(function (data) { renderFamilyProfiles((data && data.status === 'success' && data.profiles) || []); })
      .catch(function () { wrap.innerHTML = ''; wrap.appendChild(el('div', 'portal-empty', 'Could not load.')); });
  }

  function renderFamilyProfiles(profiles) {
    var wrap = $('familyProfilesList');
    wrap.innerHTML = '';
    var list = (profiles || []).slice();
    // A dependent member sees the WHOLE family: the POC at the top, then their
    // relatives — but NOT their own card (redundant; their details are shown
    // elsewhere on the page). A POC sees just the dependents they manage.
    if (isMember()) {
      list = list.filter(function (p) { return String(p.profileId) !== String(family.myProfileId); });
      if (family.pocEmail) {
        list.unshift({ isPoc: true, profileId: '', name: family.pocName || 'Primary account holder', relation: 'Primary · POC', profileEmail: family.pocEmail, dob: family.pocDob });
      }
    }
    if (!list.length) {
      wrap.appendChild(el('div', 'portal-empty', isMember() ? 'No family members linked yet.' : 'No family members yet — add one to get started.'));
      return;
    }
    list.forEach(function (p) {
      var card = el('div', 'portal-famcard' + (p.isPoc ? ' portal-famcard-poc' : ''));
      var head = el('div', 'portal-famcard-head');
      var info = el('div', 'portal-famcard-info');
      var nameRow = el('div', 'portal-famcard-name');
      nameRow.appendChild(document.createTextNode(p.name || 'Member'));
      if (!p.isPoc && p.profileId && family.myProfileId && String(p.profileId) === String(family.myProfileId)) {
        nameRow.appendChild(el('span', 'portal-member-rel portal-member-you', 'You'));
      }
      if (p.relation) { nameRow.appendChild(el('span', 'portal-member-rel', p.relation)); }
      info.appendChild(nameRow);
      var meta = []; if (p.profileEmail) { meta.push(p.profileEmail); } if (p.dob) { meta.push('DOB ' + fmtDate(p.dob)); }
      if (docCountLabel(p.docCount)) { meta.push(docCountLabel(p.docCount)); }
      if (meta.length) { info.appendChild(el('div', 'portal-famcard-meta', meta.join(' · '))); }
      head.appendChild(info);

      var actions = el('div', 'portal-famcard-actions');
      var docsWrap = el('ul', 'portal-doclist portal-famcard-docs'); docsWrap.hidden = true;
      // Documents: the POC card pulls the POC's own docs (by email); a member card
      // pulls that member's docs (by profileId). A dependent member views only, so
      // docRow is rendered read-only (no Delete).
      var docsBtn = el('button', 'portal-famcard-btn', 'Documents'); docsBtn.type = 'button';
      actions.appendChild(docsBtn);
      docsBtn.addEventListener('click', function () {
        if (!docsWrap.hidden) { docsWrap.hidden = true; return; }
        docsWrap.innerHTML = ''; docsWrap.appendChild(el('li', 'portal-empty', 'Loading…')); docsWrap.hidden = false;
        var req = p.isPoc
          ? gasGet({ action: 'getDocuments', email: family.pocEmail })
          : gasGet({ action: 'getProfileDocs', email: getEmail(), profileId: p.profileId, profileEmail: p.profileEmail });
        req.then(function (data) {
          var docs = (data && data.documents) || [];
          docsWrap.innerHTML = '';
          if (!docs.length) { docsWrap.appendChild(el('li', 'portal-empty', 'No documents yet.')); }
          else { docs.forEach(function (d) { docsWrap.appendChild(docRow(d, isMember())); }); }
        }).catch(function () { docsWrap.innerHTML = ''; docsWrap.appendChild(el('li', 'portal-empty', 'Could not load.')); });
      });
      // Editing a family member is POC-only (never a dependent member, never the POC card).
      if (!p.isPoc && !isMember()) {
        var editBtn = el('button', 'portal-famcard-btn', 'Edit'); editBtn.type = 'button';
        actions.appendChild(editBtn);
        editBtn.addEventListener('click', function () {
          openSubProfileModal({ mode: 'edit', parentEmail: getEmail(), parentName: getName(), isAdmin: false, profile: p });
        });
      }
      head.appendChild(actions);
      card.appendChild(head);
      card.appendChild(docsWrap);
      wrap.appendChild(card);
    });
  }

  $('addFamilyProfileBtn').addEventListener('click', function () {
    openSubProfileModal({ mode: 'create', parentEmail: getEmail(), parentName: getName(), isAdmin: false });
  });

  // ---- admin accordion helpers (used by userRow) ----
  function loadAdminSubProfiles(u, accordion) {
    accordion.innerHTML = ''; accordion.appendChild(el('div', 'portal-empty', 'Loading…'));
    gasGet({ action: 'getSubProfiles', email: getEmail(), parentEmail: u.email })
      .then(function (data) {
        accordion.dataset.loaded = '1';
        renderAdminSubProfiles(u, accordion, (data && data.status === 'success' && data.profiles) || []);
      })
      .catch(function () { accordion.innerHTML = ''; accordion.appendChild(el('div', 'portal-empty', 'Could not load.')); });
  }
  function renderAdminSubProfiles(u, accordion, profiles) {
    accordion.innerHTML = '';
    if (!profiles.length) { accordion.appendChild(el('div', 'portal-empty', 'No sub-profiles yet.')); return; }
    profiles.forEach(function (p) {
      var row = el('div', 'portal-subrow');
      var info = el('div', 'portal-subrow-info');
      var nm = el('div', 'portal-subrow-name'); nm.appendChild(document.createTextNode(p.name || 'Member'));
      if (p.relation) { nm.appendChild(el('span', 'portal-member-rel', p.relation)); }
      info.appendChild(nm);
      var meta = [p.profileEmail, p.dob ? 'DOB ' + fmtDate(p.dob) : '', p.sumInsured ? 'SI ' + inr(p.sumInsured) : '', docCountLabel(p.docCount)].filter(Boolean).join(' · ');
      if (meta) { info.appendChild(el('div', 'portal-subrow-meta', meta)); }
      row.appendChild(info);
      var actions = el('div', 'portal-subrow-actions');
      var viewBtn = el('button', 'portal-subrow-btn', 'View'); viewBtn.type = 'button';
      var editBtn = el('button', 'portal-subrow-btn', 'Edit'); editBtn.type = 'button';
      viewBtn.addEventListener('click', function () { viewSubProfile(u, p); });
      editBtn.addEventListener('click', function () {
        openSubProfileModal({ mode: 'edit', parentEmail: u.email, parentName: fullName(u) || u.email, isAdmin: true, profile: p });
      });
      actions.appendChild(viewBtn); actions.appendChild(editBtn);
      row.appendChild(actions);
      accordion.appendChild(row);
    });
  }

  // Show a sub-profile's linked policies + documents in the admin viewing panel.
  function viewSubProfile(u, sub) {
    selectedUser = u; // keep the parent linked (don't re-render — that would collapse the accordion)
    $('viewingName').textContent = sub.name || 'profile';
    $('viewAccountSIRow').hidden = true; // account SI is set on the account, not per profile
    $('adminDocsLabel').textContent = '📋 Policies';
    $('clientDocsLabel').textContent = '📎 Documents';
    $('viewingFolder').hidden = false;
    var pList = $('adminDocsList'), dList = $('clientDocsList');
    pList.innerHTML = ''; pList.appendChild(el('li', 'portal-empty', 'Loading…'));
    dList.innerHTML = ''; dList.appendChild(el('li', 'portal-empty', 'Loading…'));
    var matches = function (x) { return sub.profileId && String(x.profileId || '') === String(sub.profileId); };
    // Structured policies for this profile (from the parent's family data).
    gasGet({ action: 'getFamily', email: u.email })
      .then(function (data) { renderPolicyList(pList, ((data && data.policies) || []).filter(matches), 'No policies linked to this profile yet.'); })
      .catch(function () { pList.innerHTML = ''; pList.appendChild(el('li', 'portal-empty', 'Could not load.')); });
    // Documents for this individual — by ProfileID, ProfileEmail, or their own uploads.
    gasGet({ action: 'getProfileDocs', email: getEmail(), profileId: sub.profileId, profileEmail: sub.profileEmail })
      .then(function (data) { renderViewList(dList, (data && data.documents) || [], 'No documents for this profile yet.'); })
      .catch(function () { dList.innerHTML = ''; dList.appendChild(el('li', 'portal-empty', 'Could not load.')); });
  }

  function renderPolicyList(ul, policies, emptyMsg) {
    ul.innerHTML = '';
    if (!policies.length) { ul.appendChild(el('li', 'portal-empty', emptyMsg)); return; }
    policies.forEach(function (p) {
      var li = el('li');
      var main = el('div', 'portal-doc-main');
      main.appendChild(el('span', 'portal-doc-poltitle', (p.policyType || 'Policy') + (p.insurer ? ' · ' + p.insurer : '')));
      var bits = [];
      if (p.premiumAmount) { bits.push('₹' + Math.round(Number(p.premiumAmount)).toLocaleString('en-IN')); }
      if (p.renewalDate) { bits.push('Renews ' + fmtDate(p.renewalDate)); }
      if (bits.length) { main.appendChild(el('span', 'portal-doc-meta', bits.join(' · '))); }
      li.appendChild(main);
      ul.appendChild(li);
    });
  }
  function reloadAdminSubProfiles(parentEmail) {
    var pe = (parentEmail || '').toLowerCase();
    var acc = document.querySelector('.portal-subaccordion[data-parent="' + pe + '"]');
    if (acc && !acc.hidden) {
      var u = allUsers.filter(function (x) { return (x.email || '').toLowerCase() === pe; })[0] || { email: parentEmail };
      loadAdminSubProfiles(u, acc);
    }
  }

  // ============================================================
  // ADMIN DASHBOARD
  // ============================================================
  var adminFile = null;

  // Admin client list state (search + pagination + click-to-view).
  var PAGE_SIZE = 5;
  var allUsers = [];
  var filteredUsers = [];
  var usersPage = 1;
  var selectedUser = null;

  function fullName(u) { return ((u.firstName || '') + ' ' + (u.lastName || '')).trim(); }

  function loadAdmin() {
    var list = $('usersList');
    list.innerHTML = ''; list.appendChild(el('li', 'portal-empty', 'Loading…'));
    $('usersPagerTop').hidden = true; $('usersPagerBottom').hidden = true;
    selectedUser = null; $('viewingFolder').hidden = true;

    gasGet({ action: 'getAllUsers', email: getEmail() })
      .then(function (data) {
        if (!data || data.status !== 'success') { throw new Error((data && data.message) || 'Could not load users.'); }
        allUsers = data.users || [];
        filteredUsers = allUsers.slice();
        usersPage = 1;
        populateSendSelect(allUsers);
        renderUsers();
      })
      .catch(function (e2) {
        list.innerHTML = ''; list.appendChild(el('li', 'portal-empty', 'Could not load.'));
        status('err', e2.message || 'Could not load users.');
      });
  }

  // The "Send a policy" dropdown always lists every client (not paginated).
  function populateSendSelect(users) {
    var sel = $('adminTargetUser');
    sel.innerHTML = '<option value="" disabled selected>Select a client…</option>';
    users.forEach(function (u) {
      var opt = el('option', null, (fullName(u) || u.email) + ' — ' + u.email);
      opt.value = u.email;
      sel.appendChild(opt);
    });
  }

  function renderUsers() {
    var list = $('usersList');
    list.innerHTML = '';
    if (!filteredUsers.length) {
      list.appendChild(el('li', 'portal-empty', allUsers.length ? 'No clients match your search.' : 'No clients registered yet.'));
      renderPager(0);
      return;
    }
    var totalPages = Math.ceil(filteredUsers.length / PAGE_SIZE);
    if (usersPage > totalPages) { usersPage = totalPages; }
    if (usersPage < 1) { usersPage = 1; }
    var start = (usersPage - 1) * PAGE_SIZE;
    filteredUsers.slice(start, start + PAGE_SIZE).forEach(function (u) { list.appendChild(userRow(u)); });
    renderPager(totalPages);
  }

  function userRow(u) {
    var li = el('li', 'portal-user-li');

    var row = el('div', 'portal-user-row');
    row.tabIndex = 0; row.setAttribute('role', 'button');

    var chevron = el('button', 'portal-user-chevron', '›'); chevron.type = 'button';
    chevron.setAttribute('aria-label', 'Show family profiles');
    row.appendChild(chevron);

    var box = el('div', 'portal-user-box');
    box.appendChild(el('div', 'portal-user-name', fullName(u) || u.email));
    box.appendChild(el('div', 'portal-user-email', u.email));
    row.appendChild(box);

    var right = el('div', 'portal-user-actions');
    var createBtn = el('button', 'portal-user-create', '＋ Create Profile'); createBtn.type = 'button';
    right.appendChild(createBtn);
    right.appendChild(el('span', 'portal-user-view', 'View ›'));
    row.appendChild(right);

    if (selectedUser && (selectedUser.email || '').toLowerCase() === (u.email || '').toLowerCase()) {
      row.classList.add('is-selected');
    }
    row.addEventListener('click', function () { viewClient(u); });
    row.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); viewClient(u); } });

    // Nested accordion of this account's sub-profiles.
    var accordion = el('div', 'portal-subaccordion'); accordion.hidden = true;
    accordion.dataset.parent = (u.email || '').toLowerCase();
    chevron.addEventListener('click', function (e) {
      e.stopPropagation();
      var opening = accordion.hidden;
      accordion.hidden = !opening;
      li.classList.toggle('is-expanded', opening);
      if (opening && accordion.dataset.loaded !== '1') { loadAdminSubProfiles(u, accordion); }
    });
    createBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      openSubProfileModal({ mode: 'create', parentEmail: u.email, parentName: fullName(u) || u.email, isAdmin: true });
    });

    li.appendChild(row);
    li.appendChild(accordion);
    return li;
  }

  // Pagination controls (rendered identically above and below the list).
  function renderPager(totalPages) {
    [$('usersPagerTop'), $('usersPagerBottom')].forEach(function (p) {
      p.innerHTML = '';
      if (totalPages <= 1) { p.hidden = true; return; }
      p.hidden = false;
      p.appendChild(pageBtn('‹', usersPage - 1, usersPage === 1, false));
      for (var i = 1; i <= totalPages; i++) { p.appendChild(pageBtn(String(i), i, false, i === usersPage)); }
      p.appendChild(pageBtn('›', usersPage + 1, usersPage === totalPages, false));
    });
  }

  function pageBtn(label, goTo, disabled, active) {
    var b = el('button', 'portal-page-btn' + (active ? ' is-active' : ''), label);
    b.type = 'button';
    if (disabled) { b.disabled = true; }
    b.addEventListener('click', function () { usersPage = goTo; renderUsers(); });
    return b;
  }

  // Show a chosen client's documents (admin-sent + client-uploaded).
  function viewClient(u) {
    selectedUser = u;
    renderUsers(); // refresh the highlight
    var sel = $('adminTargetUser'); if (sel) { sel.value = u.email; } // pre-select them for sending
    $('adminDocsLabel').textContent = '📨 Sent by you';
    $('clientDocsLabel').textContent = '📎 Uploaded by client';
    $('viewingName').textContent = fullName(u) || u.email;
    $('viewingFolder').hidden = false;
    // Account-level Sum Insured editor (this view only, not sub-profiles).
    $('viewAccountSIRow').hidden = false;
    $('viewAccountSI').value = ''; $('viewAccountSIHint').textContent = 'Loading…';
    gasGet({ action: 'getProfile', email: u.email }).then(function (r) {
      if (r && r.status === 'success' && r.sumInsured) { $('viewAccountSI').value = String(r.sumInsured); }
      $('viewAccountSIHint').textContent = '';
    }).catch(function () { $('viewAccountSIHint').textContent = ''; });
    loadClientDocs(u.email);
  }

  function loadClientDocs(email) {
    var aList = $('adminDocsList'), cList = $('clientDocsList');
    aList.innerHTML = ''; aList.appendChild(el('li', 'portal-empty', 'Loading…'));
    cList.innerHTML = ''; cList.appendChild(el('li', 'portal-empty', 'Loading…'));
    gasGet({ action: 'getDocuments', email: email })
      .then(function (data) {
        var docs = (data && data.documents) || [];
        var sent = docs.filter(function (d) { return (d.uploadedBy || '').toLowerCase() === 'admin'; });
        var uploaded = docs.filter(function (d) { return (d.uploadedBy || '').toLowerCase() !== 'admin'; });
        renderViewList(aList, sent, 'You haven\'t sent any policies yet.');
        renderViewList(cList, uploaded, 'This client hasn\'t uploaded anything.');
      })
      .catch(function (e2) {
        aList.innerHTML = ''; aList.appendChild(el('li', 'portal-empty', 'Could not load.'));
        cList.innerHTML = ''; cList.appendChild(el('li', 'portal-empty', 'Could not load.'));
        status('err', e2.message || 'Could not load client documents.');
      });
  }

  // Generic confirm dialog → Promise<boolean>.
  var confirmResolver = null;
  function portalConfirm(message, opts) {
    opts = opts || {};
    $('confirmMsg').textContent = message;
    $('confirmTitle').textContent = opts.title || 'Are you sure?';
    $('confirmYes').textContent = opts.yes || 'Remove';
    $('modalConfirm').hidden = false;
    return new Promise(function (resolve) { confirmResolver = resolve; });
  }
  function closeConfirm(val) {
    $('modalConfirm').hidden = true;
    if (confirmResolver) { confirmResolver(val); confirmResolver = null; }
  }
  $('confirmYes').addEventListener('click', function () { closeConfirm(true); });
  $('confirmNo').addEventListener('click', function () { closeConfirm(false); });

  // Document rows for the admin viewing panel: shows expiry, and a soft-delete
  // (trash) that unlinks the document from the user's view (physical file kept).
  function renderViewList(ul, docs, emptyMsg) {
    ul.innerHTML = '';
    if (!docs.length) { ul.appendChild(el('li', 'portal-empty', emptyMsg)); return; }
    docs.forEach(function (d) {
      var li = el('li');
      var main = el('div', 'portal-doc-main');
      var a = el('a', null, d.fileName || 'Document');
      a.href = d.fileURL || '#'; a.target = '_blank'; a.rel = 'noopener';
      main.appendChild(a);
      var bits = [];
      if (d.timestamp) { bits.push(new Date(d.timestamp).toLocaleDateString()); }
      if (d.expiryDate) { bits.push('Expires ' + fmtDate(d.expiryDate)); }
      if (bits.length) { main.appendChild(el('span', 'portal-doc-meta', bits.join(' · '))); }
      li.appendChild(main);
      // Soft delete (admin). Small payload → JSONP GET returns a readable status.
      var del = el('button', 'portal-doc-del', '🗑'); del.type = 'button';
      del.setAttribute('aria-label', 'Remove ' + (d.fileName || 'document'));
      del.addEventListener('click', function () {
        portalConfirm('Are you sure you want to remove this policy document from the user’s view?').then(function (ok) {
          if (!ok) { return; }
          del.disabled = true;
          gasGet({ action: 'deleteDocument', email: getEmail(), fileURL: d.fileURL })
            .then(function (r) {
              if (r && r.status === 'success') {
                li.remove();
                if (!ul.children.length) { ul.appendChild(el('li', 'portal-empty', emptyMsg)); }
              } else { del.disabled = false; status('err', (r && r.message) || 'Could not remove.'); }
            })
            .catch(function () { del.disabled = false; status('err', 'Could not remove the document.'); });
        });
      });
      li.appendChild(del);
      ul.appendChild(li);
    });
  }

  function closeViewing() {
    selectedUser = null;
    $('viewingFolder').hidden = true;
    renderUsers();
  }

  // Search filters the full client list, resets to page 1.
  $('clientSearch').addEventListener('input', function () {
    var q = this.value.trim().toLowerCase();
    filteredUsers = !q ? allUsers.slice() : allUsers.filter(function (u) {
      return (fullName(u) + ' ' + (u.email || '')).toLowerCase().indexOf(q) >= 0;
    });
    usersPage = 1;
    renderUsers();
  });

  $('viewingClose').addEventListener('click', closeViewing);

  // ---- Admin "Send a Policy": multi-file, drag-drop, per-file expiry ----
  var adminStaged = []; // [{ file, expiry }]

  function renderAdminStaged() {
    var ul = $('adminStaged'); ul.innerHTML = '';
    adminStaged.forEach(function (item, i) {
      var li = el('li', 'portal-staged-item');
      var meta = el('div', 'portal-staged-meta');
      meta.appendChild(el('span', 'portal-staged-name', item.file.name));
      meta.appendChild(el('span', 'portal-staged-size', formatBytes(item.file.size)));
      li.appendChild(meta);
      var exp = document.createElement('input');
      exp.type = 'date'; exp.className = 'f portal-staged-expiry'; exp.value = item.expiry || '';
      exp.setAttribute('aria-label', 'Expiry date for ' + item.file.name);
      exp.addEventListener('change', function () { item.expiry = this.value; });
      li.appendChild(exp);
      var rm = el('button', 'portal-staged-remove', '×'); rm.type = 'button';
      rm.setAttribute('aria-label', 'Remove ' + item.file.name);
      rm.addEventListener('click', function () { adminStaged.splice(i, 1); renderAdminStaged(); });
      li.appendChild(rm);
      ul.appendChild(li);
    });
  }
  function addAdminFiles(fileList) {
    // Internal admin tool → no size / type / quantity limit enforced.
    Array.prototype.slice.call(fileList || []).forEach(function (f) {
      if (!adminStaged.some(function (s) { return s.file.name === f.name && s.file.size === f.size; })) {
        adminStaged.push({ file: f, expiry: '' });
      }
    });
    renderAdminStaged();
  }
  $('adminUploadInput').addEventListener('change', function () { addAdminFiles(this.files); this.value = ''; });
  var adminDrop = $('adminDrop');
  ['dragenter', 'dragover'].forEach(function (ev) { adminDrop.addEventListener(ev, function (e) { e.preventDefault(); adminDrop.classList.add('is-drag'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { adminDrop.addEventListener(ev, function (e) { e.preventDefault(); adminDrop.classList.remove('is-drag'); }); });
  adminDrop.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files) { addAdminFiles(e.dataTransfer.files); } });

  $('adminSendForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('adminErr'); err.hidden = true;
    var target = $('adminTargetUser').value;
    var profileId = ''; // documents attach to the account (POC); no per-profile targeting
    if (!target) { return fieldErr(err, 'Please select a client.'); }
    if (!adminStaged.length) { return fieldErr(err, 'Please add at least one file to send.'); }
    if (adminStaged.some(function (s) { return !s.expiry; })) { return fieldErr(err, 'Please set an expiry date for every file.'); }

    var btn = $('adminSendBtn'); btn.disabled = true; btn.textContent = 'Sending…';
    var total = adminStaged.length, i = 0;
    // Send each file (with its own expiry) in sequence; the backend fires one
    // "new policy document" notification per account+profile+day.
    function next() {
      if (i >= total) {
        status('ok', total + ' document' + (total > 1 ? 's' : '') + ' sent to ' + target + '.');
        adminStaged = []; renderAdminStaged();
        if (selectedUser && (selectedUser.email || '').toLowerCase() === target.toLowerCase()) {
          setTimeout(function () { loadClientDocs(selectedUser.email); }, 1200);
        }
        btn.disabled = false; btn.textContent = 'Send to client';
        return;
      }
      var item = adminStaged[i++];
      readB64(item.file).then(function (b64) {
        return gasUpload({ action: 'adminUpload', email: getEmail(), targetEmail: target, profileId: profileId,
          expiryDate: item.expiry, fileName: item.file.name, mimeType: item.file.type || 'application/octet-stream', fileData: b64 });
      }).then(next).catch(function (e2) {
        fieldErr(err, (e2 && e2.message) || 'Could not send.'); btn.disabled = false; btn.textContent = 'Send to client';
      });
    }
    next();
  });

  // Account-level Sum Insured save (admin sets the POC's SI, admin-gated server-side).
  $('viewAccountSISave').addEventListener('click', function () {
    if (!selectedUser) { return; }
    var si = parseInt(($('viewAccountSI').value || '').replace(/[^\d]/g, ''), 10) || 0;
    var b = this; b.disabled = true; $('viewAccountSIHint').textContent = 'Saving…';
    gasGet({ action: 'updateProfile', email: getEmail(), targetEmail: selectedUser.email, sumInsured: si })
      .then(function (r) { $('viewAccountSIHint').textContent = (r && r.status === 'success') ? '✓ Saved' : ((r && r.message) || 'Could not save.'); })
      .catch(function () { $('viewAccountSIHint').textContent = 'Could not save.'; })
      .then(function () { b.disabled = false; });
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
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeDrawer(); closeNotifCenter(); } });

  $('navLogout').addEventListener('click', function () { closeDrawer(); stopNotifPolling(); clearSession(); showView('home-view'); });
  // Client logout now lives on the Profile tab (below "Edit details").
  $('profileLogoutBtn').addEventListener('click', function () { stopNotifPolling(); clearSession(); showView('home-view'); });
  $('navAbout').addEventListener('click', function () { $('modalAbout').hidden = false; });
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
  // Digits-only (max 10) for phone fields.
  ['regPhone', 'profilePhone'].forEach(function (id) {
    $(id).addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 10); });
  });

  // Go.
  route();
})();
