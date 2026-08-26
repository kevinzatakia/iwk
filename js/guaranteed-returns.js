/* Guaranteed Returns Plans — single-view lead-capture form.
   Sends the details to the shared enquiry Apps Script (emails Kevin) and fires the
   three GA4 events from the PRD addendum: form_start (on render), form_error
   (₹2L minimum-Sum-Insured validation), and generate_lead (on successful submit). */
(function () {
  'use strict';

  // Shared website enquiry endpoint (same one term/health/motor use — it emails Kevin).
  var ENQUIRY_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzFBqQZCBJ7trrzwTFUq6aOwlXslRdXMyrcTE-QuPB_QYQIbimvnJ4ZCzgyNM9qBuQCXw/exec';
  var EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  var MIN_SI = 200000;

  function $(id) { return document.getElementById(id); }
  // GA4 helper — analytics.js exposes window.gtag; guard so the form never breaks.
  function ga(event, params) {
    if (typeof window.gtag === 'function') { try { window.gtag('event', event, params || {}); } catch (e) { /* noop */ } }
  }
  function ready(fn) {
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', fn); } else { fn(); }
  }

  ready(function () {
    var form = $('grForm'), nameEl = $('grName'), phoneEl = $('grPhone'), emailEl = $('grEmail');
    var dobEl = $('grDob'), siEl = $('sum_insured_input'), siError = $('grSiError');
    var formError = $('grFormError'), submitBtn = $('grSubmit'), card = $('grCard'), done = $('grDone');
    if (!form) { return; }

    // ── GA4 Event 1: form started (this single-view form is now on screen) ──
    ga('form_start', { form_name: 'Guaranteed_Returns', form_destination: 'Lead_Capture' });

    var siErrorReported = false; // debounce: report the min-SI error once per invalid episode

    // Digits-only phone.
    phoneEl.addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 10); });

    function siInvalid() {
      var raw = siEl.value.trim();
      if (raw === '') { return false; } // empty is caught as "required" on submit, not as the min-SI error
      var n = Number(raw);
      return isNaN(n) || n < MIN_SI;
    }
    function refreshSiUi() {
      var bad = siInvalid();
      siError.hidden = !bad;
      submitBtn.disabled = bad;
      if (!bad) { siErrorReported = false; } // reset so a later dip below ₹2L reports again
    }
    // ── GA4 Event 2: min-SI validation error (debounced, once per episode) ──
    function reportSiError() {
      if (siInvalid() && !siErrorReported) {
        ga('form_error', { form_name: 'Guaranteed_Returns', error_type: 'Minimum_SI_Validation', input_value: siEl.value });
        siErrorReported = true;
      }
    }

    var siTimer;
    siEl.addEventListener('input', function () {
      refreshSiUi();
      clearTimeout(siTimer);
      siTimer = setTimeout(reportSiError, 600);
    });

    function showFormError(msg) { formError.hidden = false; formError.textContent = msg; }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      formError.hidden = true;

      var nm = nameEl.value.trim(), em = emailEl.value.trim(), ph = phoneEl.value.trim(), db = dobEl.value;
      var raw = siEl.value.trim(), n = Number(raw);

      if (nm.length < 2) { return showFormError('Please enter your name.'); }
      if (!/^[0-9]{10}$/.test(ph)) { return showFormError('Please enter a valid 10-digit phone number.'); }
      if (!EMAIL_RE.test(em)) { return showFormError('Please enter a valid email address.'); }
      if (!db) { return showFormError('Please enter your date of birth.'); }
      var dob = new Date(db);
      if (isNaN(dob.getTime()) || dob > new Date()) { return showFormError('Please enter a valid date of birth.'); }
      if (raw === '') { return showFormError('Please enter the sum insured.'); }
      if (isNaN(n) || n < MIN_SI) { refreshSiUi(); reportSiError(); return; } // also capture the error on a submit attempt

      submitBtn.disabled = true; submitBtn.textContent = 'Sending…';

      var products = 'Guaranteed Returns Plan — Sum Insured ₹' + n.toLocaleString('en-IN') + ' | DOB: ' + db;
      var data = new FormData();
      data.append('name', nm);
      data.append('email', em);
      data.append('mobile', ph);
      data.append('age', String(ageFromDob(dob)));
      data.append('products', products);
      data.append('health', 'N/A (guaranteed returns)');
      data.append('botcheck', '');

      // Apps Script sends no readable CORS response, so post fire-and-forget.
      fetch(ENQUIRY_ENDPOINT, { method: 'POST', body: data, mode: 'no-cors' })
        .then(function () {
          // ── GA4 Event 3: lead generated ──
          ga('generate_lead', { form_name: 'Guaranteed_Returns', currency: 'INR', value: 1 });
          form.hidden = true;
          var head = card.querySelector('.gr-head'); if (head) { head.hidden = true; }
          done.hidden = false;
          done.scrollIntoView({ behavior: 'smooth', block: 'center' });
        })
        .catch(function () {
          showFormError('Couldn’t reach the server. Please try again, or WhatsApp Kevin directly.');
          submitBtn.disabled = false; submitBtn.textContent = 'Submit for Quote';
        });
    });

    function ageFromDob(d) {
      var t = new Date(), a = t.getFullYear() - d.getFullYear();
      var m = t.getMonth() - d.getMonth();
      if (m < 0 || (m === 0 && t.getDate() < d.getDate())) { a--; }
      return a;
    }
  });
})();
