/* Abandoned-lead capture — a silent background tracker for the website's lead
   forms. As the user fills a form, contact + answers are cached in localStorage;
   if they advance a step or leave the page with at least a phone/email on file,
   the partial data is POSTed to the enquiry Apps Script and logged as an
   "Abandoned Lead". A successful final submit marks that lead Converted and clears
   the cache. No UI, no effect on the forms themselves.

   CSP-safe: external file ('self'), posts only to the already-allowed
   script.google.com endpoint, no inline handlers. */
(function () {
  'use strict';

  var LEAD_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxXTjDanx0ZdZExoP3-arcDQo0Wb9EbsZ6_BrDjuYIQxAcyRP42a8KkEHhhiEFg7pys6Q/exec';
  var KEY = 'partialLeadData';

  // Which lead form this page is (by filename). Non-form pages → tracker is off.
  var FORM_TYPES = {
    motor: 'Motor', term: 'Term', health: 'Health', travel: 'Travel', home: 'Home',
    fire: 'Fire', shop: 'Shop', workmen: 'Workmen Compensation',
    'personal-accident': 'Personal Accident', 'guaranteed-returns': 'Guaranteed Returns',
    enquiry: 'Enquiry'
  };
  var file = (location.pathname || '').toLowerCase().split('/').pop().replace(/\.html$/, '') || 'index';
  var FORM_TYPE = FORM_TYPES[file];
  if (!FORM_TYPE) { return; }

  function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function save() { if (data) { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} } }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} data = null; }

  // Reuse an in-progress session for this form (survives reloads / step changes);
  // otherwise start a fresh one.
  var data = load();
  if (!data || data.FormType !== FORM_TYPE || !data.LeadSessionID) {
    data = {
      LeadSessionID: 'lead_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      FormType: FORM_TYPE, CurrentStep: 1, LastUpdated: Date.now()
    };
    save();
  }

  // Only ever sync once we have a way to contact the person.
  function shouldSync() {
    return !!data && ((data.phone && String(data.phone).length > 5) || (data.email && String(data.email).indexOf('@') >= 0));
  }

  // ---- field caching (delegated, so it covers steps rendered later) ----
  function classify(el, key, value) {
    var k = (key || '').toLowerCase(), t = (el.type || '').toLowerCase();
    if (t === 'tel' || /phone|mobile/.test(k)) { if (value) { data.phone = value; } }
    else if (t === 'email' || /e-?mail/.test(k)) { if (value) { data.email = value; } }
    else if ((/name$/.test(k) || k === 'name') && !/user|file|company/.test(k)) { if (value) { data.name = value; } }
  }
  function capture(el) {
    if (!data || !el || !el.tagName) { return; }
    var tag = el.tagName.toLowerCase();
    if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') { return; }
    var t = (el.type || '').toLowerCase();
    if (t === 'file' || t === 'hidden' || t === 'submit' || t === 'button' || t === 'password') { return; }
    var key = el.name || el.id || (el.getAttribute && el.getAttribute('aria-label')) || '';
    if (!key) { return; }
    var value;
    if (t === 'checkbox') { value = el.checked; }
    else if (t === 'radio') { if (!el.checked) { return; } value = el.value; }
    else { value = el.value; }
    data[key] = value;
    classify(el, key, value);
    data.LastUpdated = Date.now();
    save();
  }
  ['input', 'change', 'blur'].forEach(function (ev) {
    document.addEventListener(ev, function (e) { capture(e.target); }, true);
  });

  // ---- silent sync ----
  function payload() {
    var out = {}; for (var k in data) { if (data.hasOwnProperty(k)) { out[k] = data[k]; } }
    out.action = 'logAbandonedLead';
    return JSON.stringify(out);
  }
  function syncFetch() {
    if (!shouldSync()) { return; }
    try {
      _fetch(LEAD_ENDPOINT, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: payload() });
    } catch (e) {}
  }
  function syncBeacon() {
    if (!shouldSync()) { return; }
    try {
      if (navigator.sendBeacon) { navigator.sendBeacon(LEAD_ENDPOINT, new Blob([payload()], { type: 'text/plain;charset=utf-8' })); }
      else { syncFetch(); }
    } catch (e) {}
  }

  // ---- Trigger 1: advancing a step (Next / Continue) ----
  document.addEventListener('click', function (e) {
    if (!data) { return; }
    var btn = e.target && e.target.closest ? e.target.closest('button, a') : null;
    if (!btn) { return; }
    var txt = (btn.textContent || '').trim();
    if (/\b(next|continue)\b/i.test(txt) && !/submit|send|skip|upload/i.test(txt)) {
      data.CurrentStep = (parseInt(data.CurrentStep, 10) || 1) + 1;
      data.LastUpdated = Date.now();
      save();
      syncFetch();
    }
  }, true);

  // ---- Trigger 2: exit intent / tab close ----
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') { syncBeacon(); } });
  window.addEventListener('pagehide', syncBeacon);

  // ---- Final submit → mark Converted + clear the cache ----
  // The forms submit by POSTing FormData to the enquiry endpoint; we wrap fetch to
  // notice that and, once it resolves, tell the backend this session converted.
  var _fetch = window.fetch;
  window.fetch = function (url, opts) {
    var isFinal = !!data && opts && (opts.method || '').toUpperCase() === 'POST' &&
      (typeof FormData !== 'undefined' && opts.body instanceof FormData) && /script\.google\.com/.test(String(url));
    var sid = isFinal ? data.LeadSessionID : null;
    var p = _fetch.apply(this, arguments);
    if (isFinal) {
      p.then(function () {
        if (sid) {
          try {
            var body = JSON.stringify({ action: 'markConverted', sessionId: sid });
            if (navigator.sendBeacon) { navigator.sendBeacon(LEAD_ENDPOINT, new Blob([body], { type: 'text/plain;charset=utf-8' })); }
            else { _fetch(LEAD_ENDPOINT, { method: 'POST', mode: 'no-cors', keepalive: true, body: body }); }
          } catch (e) {}
        }
        clear();
      }).catch(function () {});
    }
    return p;
  };
})();
