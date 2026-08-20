/* Client Portal — routing, auth, and Google Apps Script calls.
   SPA: shows/hides <section class="pv"> views without reloading. */
(function () {
  'use strict';

  // ============================================================
  // CONFIG — set these two after deploying the Apps Script backend.
  // ============================================================
  // Paste the /exec URL of the deployed portal Apps Script (see
  // apps-script-portal-endpoint.gs) here:
  var PORTAL_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwDJDjcEmMT1dIwZT_iS_zyUjy19MrERCkLhZXOUczNyRIYo61uQh7UeK-8ShcVf1a8/exec';
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
    var pin = $('regPin').value;
    var pin2 = $('regPin2').value;

    if (first.length < 1) { return fieldErr(err, 'Please enter your first name.'); }
    if (!EMAIL_RE.test(email)) { return fieldErr(err, 'Please enter a valid email address.'); }
    if (!/^[0-9]{10}$/.test(phone)) { return fieldErr(err, 'Please enter your 10-digit phone number.'); }
    if (!/^[0-9]{4}$/.test(pin)) { return fieldErr(err, 'Your PIN must be exactly 4 digits.'); }
    if (pin !== pin2) { return fieldErr(err, 'The two PINs do not match.'); }

    var btn = $('registerBtn'); btn.disabled = true; btn.textContent = 'Creating…';
    gasGet({ action: 'register', firstName: first, lastName: last, email: email, phone: phone, pin: pin })
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
    closeAllPanels();
    loadProfile();
    loadFamily();
    loadNotifications();
    startNotifPolling();
    maybeShowPushOptin();
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
  function uploadFiles(files, nameFn) {
    var chain = Promise.resolve(), ok = 0;
    files.forEach(function (f) {
      chain = chain.then(function () {
        return readB64(f).then(function (b64) {
          return gasUpload({ action: 'clientUpload', email: getEmail(), fileName: nameFn(f), mimeType: f.type || 'application/octet-stream', fileData: b64 }).then(function () { ok++; });
        });
      });
    });
    return chain.then(function () { loadClient(); return ok; });
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
  // opts: { title, accept, multiple, note, commitLabel, onCommit(files) -> Promise<count> }
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
    return { box: box, open: function () { box.hidden = false; setStatus(null); } };
  }

  // Mount the "My Uploads" staged uploader.
  var myUploader = buildUploader({
    title: 'Upload a document',
    accept: '.pdf,.jpg,.jpeg,.png,image/*,.heic,.heif',
    multiple: true,
    note: 'PDF, JPG or PNG · up to 5 MB each',
    onCommit: function (files) { return uploadFiles(files, function (f) { return f.name; }); }
  });
  $('myUploadMount').appendChild(myUploader.box);
  $('myUploadOpen').addEventListener('click', function () { myUploader.open(); });

  // ============================================================
  // FAMILY ORGANIZER (POC mode)
  //   A user with dependent profiles (managed by Kevin in the Sheet) can turn on
  //   "Family Mode" to see everyone's policies, renewals and claims in one hub.
  //   The mode preference + banner dismissal live in localStorage (no backend
  //   write needed); the data itself is read-only via getFamily.
  // ============================================================
  var family = { isFamilyPoc: false, profiles: [], policies: [], claims: [] };
  var familyFilter = 'all'; // 'all' or a profileId

  function familyModeOn() { return localStorage.getItem('portalFamilyMode') === 'on'; }
  function setFamilyMode(on) {
    localStorage.setItem('portalFamilyMode', on ? 'on' : 'off');
    renderFamilyChrome();
    if (on) { familyFilter = 'all'; renderFamilyHub(); }
  }

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

  function loadFamily() {
    family = { isFamilyPoc: false, profiles: [], policies: [], claims: [] };
    gasGet({ action: 'getFamily', email: getEmail() })
      .then(function (data) {
        if (data && data.status === 'success') {
          family = {
            isFamilyPoc: !!data.isFamilyPoc,
            profiles: data.profiles || [],
            policies: data.policies || [],
            claims: data.claims || []
          };
        }
        renderFamilyChrome();
        if (familyModeOn()) { renderFamilyHub(); }
        renderDashboardPanels();
      })
      .catch(function () { renderFamilyChrome(); renderDashboardPanels(); }); // silent: family mode is a bonus, not core
  }

  // Show/hide the banner, toggle and hub based on the saved preference. Family
  // Mode is available to every client now — they build their own family list via
  // "Add family member", so we no longer gate on having existing profiles.
  function renderFamilyChrome() {
    var on = familyModeOn();
    var dismissed = localStorage.getItem('portalFamilyBannerDismissed') === '1';

    $('familyToggleRow').hidden = false;
    $('familyModeSwitch').checked = on;
    $('familyOptinBanner').hidden = !(!on && !dismissed);

    $('familyHub').hidden = !on;
    // In family mode the structured policies replace the read-only "Your Policies"
    // file list, but keep "My Uploads" so documents can still be shared.
    $('policiesFolder').hidden = on;
  }

  function filteredPolicies() {
    return familyFilter === 'all' ? family.policies
      : family.policies.filter(function (p) { return p.profileId === familyFilter; });
  }
  function filteredClaims() {
    return familyFilter === 'all' ? family.claims
      : family.claims.filter(function (c) { return c.profileId === familyFilter; });
  }

  function renderFamilyHub() {
    // Aggregate stats (always family-wide, regardless of the active filter).
    var totalCover = family.policies.reduce(function (s, p) { return s + (Number(p.sumInsured) || 0); }, 0);
    $('familyTotalCover').textContent = totalCover ? inr(totalCover) : '—';
    $('familyCoverSub').textContent = family.policies.length +
      (family.policies.length === 1 ? ' active policy' : ' active policies');
    var openClaims = family.claims.filter(function (c) { return !isClaimDone(c.status); }).length;
    $('familyActiveClaims').textContent = String(openClaims);

    renderMemberList();
    renderMemberTabs();
    renderTimeline();
    renderPoliciesLedger();
    renderClaims();
  }

  // The editable roster of family members inside the "Family members" card.
  function renderMemberList() {
    var ul = $('familyMemberList');
    ul.innerHTML = '';
    if (!family.profiles.length) { ul.appendChild(el('li', 'portal-empty', 'No family members yet.')); return; }
    family.profiles.forEach(function (p) {
      var li = el('li', 'portal-member-row');
      var box = el('div', 'portal-member-info');
      box.appendChild(el('span', 'portal-member-name', p.name || 'Member'));
      if (p.relationship) { box.appendChild(el('span', 'portal-member-rel', p.relationship)); }
      li.appendChild(box);
      var del = el('button', 'portal-doc-del', 'Remove');
      del.type = 'button';
      del.setAttribute('aria-label', 'Remove ' + (p.name || 'member'));
      del.addEventListener('click', function () { deleteMember(p, del); });
      li.appendChild(del);
      ul.appendChild(li);
    });
  }

  function renderMemberTabs() {
    var wrap = $('familyMemberTabs');
    wrap.innerHTML = '';
    var tabs = [{ id: 'all', label: 'All family' }];
    family.profiles.forEach(function (p) {
      var self = /^(self|me|myself|primary)$/i.test(p.relationship || '');
      tabs.push({ id: p.profileId, label: self ? 'Me' : (p.name || p.relationship || 'Member') });
    });
    tabs.forEach(function (t) {
      var b = el('button', 'portal-memtab' + (familyFilter === t.id ? ' is-active' : ''), t.label);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.addEventListener('click', function () { familyFilter = t.id; renderFamilyHub(); });
      wrap.appendChild(b);
    });
  }

  function renderTimeline() {
    var ul = $('familyTimeline');
    ul.innerHTML = '';
    var upcoming = filteredPolicies()
      .filter(function (p) { return toDate(p.renewalDate); })
      .sort(function (a, b) { return toDate(a.renewalDate) - toDate(b.renewalDate); })
      .slice(0, 3);
    if (!upcoming.length) { ul.appendChild(el('li', 'portal-empty', 'No upcoming renewals.')); return; }
    upcoming.forEach(function (p) {
      var li = el('li', 'portal-timeline-item');
      var left = el('div', 'portal-tl-main');
      left.appendChild(el('span', 'portal-tl-title', (p.policyType || p.insurer || 'Policy')));
      left.appendChild(el('span', 'portal-tl-meta', profileName(p.profileId) + ' · ' + fmtDate(p.renewalDate)));
      li.appendChild(left);
      var days = daysUntil(p.renewalDate);
      var pillText = days == null ? '' : (days < 0 ? 'Overdue' : (days === 0 ? 'Due today' : 'in ' + days + 'd'));
      var pill = el('span', 'portal-tl-pill' + (days != null && days <= 14 ? ' is-soon' : ''), pillText);
      li.appendChild(pill);
      ul.appendChild(li);
    });
  }

  function renderPoliciesLedger() {
    var ul = $('familyPolicies');
    ul.innerHTML = '';
    var pols = filteredPolicies();
    if (!pols.length) { ul.appendChild(el('li', 'portal-empty', 'No policies to show.')); return; }
    pols.forEach(function (p) {
      var li = el('li', 'portal-ledger-item');
      var main = el('div', 'portal-ledger-main');
      main.appendChild(el('span', 'portal-ledger-title', (p.policyType || 'Policy') + (p.insurer ? ' · ' + p.insurer : '')));
      var metaBits = [profileName(p.profileId)];
      if (p.sumInsured) { metaBits.push('Cover ' + inr(p.sumInsured)); }
      if (p.renewalDate) { metaBits.push('Renews ' + fmtDate(p.renewalDate)); }
      main.appendChild(el('span', 'portal-ledger-meta', metaBits.join(' · ')));
      li.appendChild(main);

      var right = el('div', 'portal-ledger-right');
      if (p.premiumAmount) { right.appendChild(el('span', 'portal-ledger-amt', inr(p.premiumAmount))); }
      var share = el('button', 'portal-share-btn', 'Share');
      share.type = 'button';
      share.setAttribute('aria-label', 'Share premium details');
      share.addEventListener('click', function () { sharePremium(p); });
      right.appendChild(share);
      li.appendChild(right);
      ul.appendChild(li);
    });
  }

  // Build the pre-formatted WhatsApp message and open the share sheet.
  function sharePremium(p) {
    var name = profileName(p.profileId);
    var type = p.policyType || p.insurer || 'insurance';
    var amt = p.premiumAmount ? inr(p.premiumAmount) : 'the premium';
    var date = p.renewalDate ? fmtDate(p.renewalDate) : 'soon';
    var msg = 'Hi ' + name + ', your ' + type + ' renewal of ' + amt + ' is due on ' + date +
      '. Let me know once you’ve transferred it to me so I can pay Kevin.';
    if (navigator.share) {
      navigator.share({ text: msg }).catch(function () { openWhatsApp(msg); });
    } else {
      openWhatsApp(msg);
    }
  }
  function openWhatsApp(msg) { window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank', 'noopener'); }

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
      if (c.lastUpdated) { main.appendChild(el('span', 'portal-claim-meta', 'Updated ' + fmtDate(c.lastUpdated))); }
      li.appendChild(main);
      var done = isClaimDone(c.status);
      li.appendChild(el('span', 'portal-claim-status' + (done ? ' is-done' : ''), c.status || 'In progress'));
      ul.appendChild(li);
    });
  }

  // ---- add / remove family members ----
  function showMemberForm(show) {
    $('addMemberForm').hidden = !show;
    $('addMemberBtn').hidden = show;
    $('memberErr').hidden = true;
    if (show) { $('memberName').focus(); }
  }

  $('addMemberBtn').addEventListener('click', function () { showMemberForm(true); });
  $('memberCancelBtn').addEventListener('click', function () { $('addMemberForm').reset(); showMemberForm(false); });

  $('addMemberForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('memberErr'); err.hidden = true;
    var name = $('memberName').value.trim();
    var rel = $('memberRelationship').value;
    if (name.length < 2) { return fieldErr(err, 'Please enter the person\'s name.'); }

    var btn = $('memberSaveBtn'); btn.disabled = true; btn.textContent = 'Saving…';
    // Small payload → JSONP GET (like deleteDocument) so we can read the reply.
    gasGet({ action: 'addProfile', email: getEmail(), name: name, relationship: rel })
      .then(function (data) {
        if (data && data.status === 'success') {
          $('addMemberForm').reset(); showMemberForm(false);
          status('ok', 'Added ' + name + '.');
          loadFamily();
        } else {
          fieldErr(err, (data && data.message) || 'Could not add. Please try again.');
        }
      })
      .catch(function (e2) { fieldErr(err, e2.message || 'Network error. Please try again.'); })
      .then(function () { btn.disabled = false; btn.textContent = 'Save member'; });
  });

  function deleteMember(p, btn) {
    if (!window.confirm('Remove ' + (p.name || 'this member') + ' from your family list?')) { return; }
    btn.disabled = true; btn.textContent = 'Removing…';
    gasGet({ action: 'deleteProfile', email: getEmail(), profileId: p.profileId })
      .then(function (data) {
        if (data && data.status === 'success') { status('ok', 'Removed ' + (p.name || 'member') + '.'); loadFamily(); }
        else { status('err', (data && data.message) || 'Could not remove.'); btn.disabled = false; btn.textContent = 'Remove'; }
      })
      .catch(function (e2) { status('err', e2.message || 'Could not remove.'); btn.disabled = false; btn.textContent = 'Remove'; });
  }

  // ---- family wiring ----
  $('familyModeSwitch').addEventListener('change', function () { setFamilyMode(this.checked); });
  $('familyActivate').addEventListener('click', function () { setFamilyMode(true); });
  $('familyActivateModal').addEventListener('click', function () { $('modalFamily').hidden = true; setFamilyMode(true); });
  $('familyLearnMore').addEventListener('click', function () { $('modalFamily').hidden = false; });
  $('familyDismiss').addEventListener('click', function () {
    localStorage.setItem('portalFamilyBannerDismissed', '1');
    $('familyOptinBanner').hidden = true;
  });

  // ============================================================
  // PROFILE + DASHBOARD PANELS (Claims / Expired Policies)
  // ============================================================
  var profile = { firstName: '', lastName: '', email: '', phone: '' };

  function loadProfile() {
    gasGet({ action: 'getProfile', email: getEmail() })
      .then(function (data) {
        if (data && data.status === 'success') {
          profile = { firstName: data.firstName || '', lastName: data.lastName || '', email: data.email || getEmail(), phone: String(data.phone || '').trim() };
          fillProfileModal();
          $('phoneWarning').hidden = !!profile.phone; // nag only when we KNOW there's no phone
          maybeNudgePhone();
        } else {
          profile = { firstName: getName(), lastName: '', email: getEmail(), phone: '' };
          fillProfileModal();
          $('phoneWarning').hidden = true;
        }
      })
      .catch(function () {
        profile = { firstName: getName(), lastName: '', email: getEmail(), phone: '' };
        fillProfileModal();
        $('phoneWarning').hidden = true;
      });
  }

  function fillProfileModal() {
    $('profileName').textContent = ((profile.firstName || '') + ' ' + (profile.lastName || '')).trim() || getName();
    $('profileEmail').textContent = profile.email || getEmail();
    $('profilePhone').value = profile.phone || '';
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

  $('navProfile').addEventListener('click', function () { closeDrawer(); openProfile(); });
  $('phoneWarning').addEventListener('click', openProfile);

  $('profileForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('profileErr'); err.hidden = true;
    var phone = $('profilePhone').value.trim();
    if (phone && !/^[0-9]{10}$/.test(phone)) { return fieldErr(err, 'Please enter a valid 10-digit phone number.'); }

    var btn = $('profileSaveBtn'); btn.disabled = true; btn.textContent = 'Saving…';
    gasGet({ action: 'updateProfile', email: getEmail(), phone: phone })
      .then(function (data) {
        if (data && data.status === 'success') {
          profile.phone = String(data.phone || phone).trim();
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

  function closeAllPanels() {
    activeDashboardPanel = null;
    ['claims', 'expired'].forEach(function (n) {
      $(n + 'Panel').hidden = true;
      var t = $(n + 'Toggle'); t.classList.remove('is-open'); t.setAttribute('aria-expanded', 'false');
    });
  }

  function togglePanel(name) {
    if (activeDashboardPanel === name) { closeAllPanels(); return; }
    closeAllPanels();
    activeDashboardPanel = name;
    $(name + 'Panel').hidden = false;
    var t = $(name + 'Toggle'); t.classList.add('is-open'); t.setAttribute('aria-expanded', 'true');
  }

  // Populate both panels from the current family data (re-run whenever it loads).
  function renderDashboardPanels() { renderClaimsPanel(); renderExpiredPanel(); }

  function renderClaimsPanel() {
    var ul = $('claimsPanelList');
    ul.innerHTML = '';
    var claims = family.claims || [];
    if (!claims.length) { ul.appendChild(el('li', 'portal-empty', 'No active or past claims found.')); return; }
    claims.forEach(function (c) {
      var li = el('li', 'portal-claim-item');
      var main = el('div', 'portal-claim-main');
      main.appendChild(el('span', 'portal-claim-title', profileName(c.profileId) + ' · ' + (c.policyType || 'Policy')));
      if (c.actionRequired) { main.appendChild(el('span', 'portal-claim-action', c.actionRequired)); }
      if (c.lastUpdated) { main.appendChild(el('span', 'portal-claim-meta', 'Updated ' + fmtDate(c.lastUpdated))); }
      li.appendChild(main);
      var done = isClaimDone(c.status);
      li.appendChild(el('span', 'portal-claim-status' + (done ? ' is-done' : ''), c.status || 'In progress'));
      // Documents-pending claims get an inline multi-file upload (iOS HEIC ok).
      if (isPendingDocs(c.status)) { li.classList.add('has-upload'); li.appendChild(buildClaimUpload(c)); }
      ul.appendChild(li);
    });
  }

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

  function renderExpiredPanel() {
    var ul = $('expiredPanelList');
    ul.innerHTML = '';
    var todayMs = new Date().setHours(0, 0, 0, 0);
    var expired = (family.policies || []).filter(function (p) {
      var d = toDate(p.renewalDate); return d && d.setHours(0, 0, 0, 0) < todayMs;
    });
    if (!expired.length) { ul.appendChild(el('li', 'portal-empty', 'No expired policies — you\'re all up to date.')); return; }
    expired.forEach(function (p) {
      var li = el('li', 'portal-expired-item');
      var main = el('div', 'portal-ledger-main');
      main.appendChild(el('span', 'portal-ledger-title', (p.policyType || 'Policy') + (p.insurer ? ' · ' + p.insurer : '')));
      var bits = [profileName(p.profileId)];
      if (p.premiumAmount) { bits.push('Premium ' + inr(p.premiumAmount)); }
      bits.push('Expired ' + fmtDate(p.renewalDate));
      main.appendChild(el('span', 'portal-ledger-meta', bits.join(' · ')));
      li.appendChild(main);
      var cta = el('a', 'portal-revive-btn', 'Message Kevin to Revive');
      cta.href = reviveWhatsAppUrl(p); cta.target = '_blank'; cta.rel = 'noopener';
      li.appendChild(cta);
      ul.appendChild(li);
    });
  }

  function reviveWhatsAppUrl(p) {
    var name = profileName(p.profileId);
    var type = p.policyType || p.insurer || 'policy';
    var when = p.renewalDate ? fmtDate(p.renewalDate) : '';
    var msg = 'Hi Kevin, I’d like to revive the ' + type + ' policy for ' + name +
      (when ? ' that expired on ' + when : '') + '. Please help me renew it.';
    return 'https://wa.me/918369988285?text=' + encodeURIComponent(msg);
  }

  $('claimsToggle').addEventListener('click', function () { togglePanel('claims'); });
  $('expiredToggle').addEventListener('click', function () { togglePanel('expired'); });
  $('claimsPanelClose').addEventListener('click', closeAllPanels);
  $('expiredPanelClose').addEventListener('click', closeAllPanels);

  // Scroll a just-opened panel into view.
  function scrollToPanel(name) {
    togglePanel(name);
    var p = $(name + 'Panel');
    if (p && !p.hidden) { p.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }

  // ============================================================
  // NOTIFICATIONS (in-app centre + OS notifications while open)
  // ============================================================
  var notifications = [];
  var notifTimer = null;
  var NOTIF_POLL_MS = 90000;

  function loadNotifications() {
    gasGet({ action: 'getNotifications', email: getEmail() })
      .then(function (data) {
        if (data && data.status === 'success') {
          notifications = data.notifications || [];
          renderNotifBadge(data.unread || 0);
          renderNotifList();
          maybeOsNotify();
        }
      })
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
    var li = el('li', 'portal-user-row');
    li.tabIndex = 0; li.setAttribute('role', 'button');
    var box = el('div');
    box.appendChild(el('div', 'portal-user-name', fullName(u) || u.email));
    box.appendChild(el('div', 'portal-user-email', u.email));
    li.appendChild(box);
    li.appendChild(el('span', 'portal-user-view', 'View ›'));
    if (selectedUser && (selectedUser.email || '').toLowerCase() === (u.email || '').toLowerCase()) {
      li.classList.add('is-selected');
    }
    li.addEventListener('click', function () { viewClient(u); });
    li.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); viewClient(u); } });
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
    $('viewingName').textContent = fullName(u) || u.email;
    $('viewingFolder').hidden = false;
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

  // Read-only document rows for the admin viewing panel (no delete).
  function renderViewList(ul, docs, emptyMsg) {
    ul.innerHTML = '';
    if (!docs.length) { ul.appendChild(el('li', 'portal-empty', emptyMsg)); return; }
    docs.forEach(function (d) {
      var li = el('li');
      var main = el('div', 'portal-doc-main');
      var a = el('a', null, d.fileName || 'Document');
      a.href = d.fileURL || '#'; a.target = '_blank'; a.rel = 'noopener';
      main.appendChild(a);
      if (d.timestamp) { main.appendChild(el('span', 'portal-doc-meta', new Date(d.timestamp).toLocaleDateString())); }
      li.appendChild(main);
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
      // If we're viewing this client, refresh their documents to show the new policy.
      if (selectedUser && (selectedUser.email || '').toLowerCase() === target.toLowerCase()) {
        setTimeout(function () { loadClientDocs(selectedUser.email); }, 1200);
      }
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
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeDrawer(); closeNotifCenter(); } });

  $('navLogout').addEventListener('click', function () { closeDrawer(); stopNotifPolling(); clearSession(); showView('home-view'); });
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
