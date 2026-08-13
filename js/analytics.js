/* Google Analytics 4 (GA4) — site-wide tag + privacy-safe funnel tracking.
   ============================================================================
   Loads gtag.js, sends the automatic page_view, and tracks the progressive
   insurance forms (form_start / form_step_complete / generate_lead) plus
   WhatsApp / Email / Phone contact clicks.

   PRIVACY: this never sends names, emails, phone numbers or any field VALUE.
   Step tracking reads the step's LABEL (e.g. "Yearly income"), never the answer.

   The form funnel is wired entirely through the DOM (it watches the shared
   progressive-wizard step transitions), so the individual form scripts need no
   changes and every scheme form (both the yb- and mo-/tv-/fr-/sh- variants) is
   covered.

   ▶ SET YOUR MEASUREMENT ID BELOW (GA4 → Admin → Data streams → Web → "G-…").
     Until a real ID is set, everything here is a silent no-op — no network,
     no console noise. */
(function () {
  'use strict';

  // ⬇⬇⬇  Replace G-XXXXXXXXXX with your GA4 Measurement ID.  ⬇⬇⬇
  var GA_ID = 'G-P1KFYRP7C1';
  var ACTIVE = GA_ID.indexOf('G-XXXX') !== 0; // false while the placeholder is set

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { dataLayer.push(arguments); };

  if (ACTIVE) {
    var tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    document.head.appendChild(tag);
    gtag('js', new Date());
    gtag('config', GA_ID); // sends the automatic page_view
  }

  // Safe event helper — never throws, never fires until a real ID is configured.
  function track(event, params) {
    if (!ACTIVE) { return; }
    try { gtag('event', event, params || {}); } catch (e) { /* analytics must never break the page */ }
  }

  // Which scheme form (if any) this page is, keyed by file name.
  var FORM_NAMES = {
    'health': 'Health_Insurance',
    'term': 'Term_Life',
    'workmen': 'Workmen_Compensation',
    'personal-accident': 'Personal_Accident',
    'motor': 'Motor_Insurance',
    'travel': 'Travel_Insurance',
    'fire': 'Fire_Insurance',
    'shop': 'Shop_Insurance'
  };
  function currentFormName() {
    var file = (location.pathname || '').toLowerCase().split('/').pop().replace(/\.html$/, '') || 'index';
    return FORM_NAMES[file] || null;
  }

  function onReady(fn) {
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', fn); }
    else { fn(); }
  }

  onReady(function () {
    bindContactClicks();
    setupFormTracking();
  });

  // ---- Phase 3: contact-click tracking (WhatsApp / Email / Phone) ----
  // Delegated so it also covers links added later (e.g. the success-screen
  // WhatsApp button) and clicks that land on an icon inside the link.
  function bindContactClicks() {
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) { return; }
      var href = (a.getAttribute('href') || '').toLowerCase();
      var method = null;
      if (href.indexOf('wa.me') >= 0 || href.indexOf('api.whatsapp.com') >= 0) { method = 'WhatsApp'; }
      else if (href.indexOf('mailto:') === 0) { method = 'Email'; }
      else if (href.indexOf('tel:') === 0) { method = 'Phone'; }
      if (method) { track('contact_click', { method: method }); }
    }, true);
  }

  // ---- Phase 2: progressive-form funnel tracking (DOM-driven, no PII) ----
  // Prefix-agnostic: the forms come in two flavours (yb-* and mo-*/etc.), but they
  // all share the same conventions — a container id ending in "Wizard", steps that
  // gain a `completed-step` class with an id ending in a digit, a `*-summary-label`
  // holding the step LABEL, and a success element id ending in "Done" that loses
  // its `hidden` class on submit. We key off those, not any one prefix.
  function setupFormTracking() {
    var formName = currentFormName();
    var wizard = document.querySelector('[id$="Wizard"]');
    if (!formName || !wizard) { return; }

    // The visitor opened this scheme's form.
    track('form_start', { form_name: formName, form_destination: 'Lead_Capture' });

    var firedSteps = {}; // dedupe step_complete per step id
    var leadFired = false;

    var obs = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        var t = m.target;
        if (!t || t.nodeType !== 1 || !t.classList) { return; }

        // A step just locked in (greyed summary appears).
        if (t.classList.contains('completed-step') && t.id && !firedSteps[t.id]) {
          firedSteps[t.id] = true;
          var digits = (t.id.match(/(\d+)$/) || [])[1];
          var num = digits ? parseInt(digits, 10) : undefined;
          var labelEl = t.querySelector('[class*="summary-label"]'); // the LABEL, not the answer
          var name = labelEl ? labelEl.textContent.trim().replace(/\s+/g, '_') : ('Step_' + (num || ''));
          track('form_step_complete', { form_name: formName, step_number: num, step_name: name });
        }

        // The success screen just appeared → a lead was generated.
        if (t.id && /Done$/.test(t.id) && !t.classList.contains('hidden') && !leadFired) {
          leadFired = true;
          track('generate_lead', { form_name: formName, currency: 'INR', value: 1 });
        }
      });
    });
    obs.observe(wizard, { attributes: true, attributeFilter: ['class'], subtree: true });
  }
})();
