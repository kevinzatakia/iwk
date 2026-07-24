/* Compare Plans — Health Insurance Premium Estimator (vanilla JS).
   Calculates a ballpark premium live from the controls, then runs a
   3-step flow: inputs -> loading spinner -> lead capture -> success. */
(function () {
  var widget = document.getElementById('premium-estimator-widget');
  if (!widget) return;

  // ---- state containers ----
  var states = {
    input:   document.getElementById('est-input'),
    loading: document.getElementById('est-loading'),
    lead:    document.getElementById('est-lead'),
    success: document.getElementById('est-success')
  };
  function show(name) {
    Object.keys(states).forEach(function (k) {
      if (states[k]) { states[k].hidden = (k !== name); }
    });
  }

  // ---- inputs ----
  var ageInput  = document.getElementById('est-age');
  var ageValEl  = document.getElementById('est-age-val');
  var pecInput  = document.getElementById('est-pec');
  var monthlyEl = document.getElementById('est-monthly');
  var yearlyEl  = document.getElementById('est-yearly');

  // ---- calculation (formula from the PRD) ----
  var BASE = 4000; // ₹ / year
  var COVERAGE_MULT = { '5': 1.0, '10': 1.4, '25': 1.8 };

  function ageMultiplier(age) {
    if (age <= 25) { return 1.0; } // 18–25
    if (age <= 35) { return 1.2; } // 26–35
    if (age <= 45) { return 1.5; } // 36–45
    if (age <= 55) { return 2.0; } // 46–55
    return 3.0;                    // 56–65
  }

  // Indian rupee + Indian comma grouping, e.g. ₹1,20,000
  function inr(n) { return '₹' + Math.round(n).toLocaleString('en-IN'); }

  function compute() {
    var age = parseInt(ageInput.value, 10) || 18;
    var covEl = document.querySelector('input[name="coverage"]:checked');
    var cov = covEl ? covEl.value : '5';
    var pec = !!pecInput.checked;

    var yearly = BASE * ageMultiplier(age) * (COVERAGE_MULT[cov] || 1) * (pec ? 1.3 : 1.0);
    var monthly = yearly / 12;

    ageValEl.textContent = age;
    monthlyEl.textContent = inr(monthly);
    yearlyEl.textContent = inr(yearly);
  }

  // recalc live on every control change
  ageInput.addEventListener('input', compute);
  pecInput.addEventListener('change', compute);
  [].forEach.call(document.querySelectorAll('input[name="coverage"]'), function (r) {
    r.addEventListener('change', compute);
  });
  compute(); // initial estimate on load

  // ---- state 1 -> 2 -> 3 ----
  document.getElementById('est-get-quote').addEventListener('click', function () {
    show('loading');
    setTimeout(function () { show('lead'); }, 1500);
  });

  // ---- lead capture ----
  var leadForm = document.getElementById('est-lead-form');
  var nameEl   = document.getElementById('est-name');
  var phoneEl  = document.getElementById('est-phone');
  var statusEl = document.getElementById('est-lead-status');

  // keep the phone field digits-only, max 10
  phoneEl.addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '').slice(0, 10);
  });

  function err(msg) {
    statusEl.hidden = false;
    statusEl.className = 'form-status err';
    statusEl.textContent = msg;
  }

  leadForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!nameEl.value.trim()) { err('Please enter your name.'); return; }
    if (!/^[0-9]{10}$/.test(phoneEl.value.trim())) {
      err('Please enter a valid 10-digit mobile number.');
      return;
    }
    show('success');
  });
})();
