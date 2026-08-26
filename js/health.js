/* Progressive health-cover enquiry form — vanilla-JS wizard on the Compare Plans
   page. Asks age, then steps through who to cover, their ages, zone, policy
   intent, sum insured and pre-existing conditions. Each answer locks with a green
   check and fades in the next question; completed steps stay visible
   (greyed/minimised) and can be edited. On submit the whole formData object is
   logged as JSON and the summary is handed to Kevin over email. */
(function () {
  var wizard = document.getElementById('ybWizard');
  if (!wizard) return;

  // Small DOM builder — textContent only, so nothing here can inject markup.
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // ---- state ----
  var formData = {
    name: '',
    email: '',
    phone: '',
    age: null,
    members: [],        // expanded individuals, e.g. ['Self','Spouse','Son 1','Son 2']
    counts: {},         // { Son: 2, Daughter: 1 }
    ages: {},           // { 'Self': 30, 'Son 1': 5, ... }
    zone: null,
    intent: null,
    sumInsured: null,
    conditions: [],
    // ---- premium-calculator inputs (steps 7–9, used only when eligible) ----
    policyTermYears: 1,   // 1 | 2 | 3  → long-term discount
    // Per-adult health metrics (members aged 18+ only), keyed by member name:
    // { "Self": { bmi, isDiabeticOverLimit, isHypertensiveOverLimit, hospitalizedLast3Years }, ... }
    healthMetrics: {}
  };

  // Ordered data steps (after the age step). Used for advancing and reset-on-edit.
  var ORDER = ['ybStep2', 'ybStep3', 'ybStep4', 'ybStep5', 'ybStep6', 'ybStep7'];
  var RENDERERS = {
    ybStep2: renderMembers,
    ybStep3: renderAges,
    ybStep4: renderZone,
    ybStep5: renderIntent,
    ybStep6: renderSum,
    ybStep7: renderConditions
  };
  // formData keys owned by each step, wiped when that step (or an earlier one) is edited.
  var OWNS = {
    ybStep2: ['members', 'counts'],
    ybStep3: ['ages'],
    ybStep4: ['zone'],
    ybStep5: ['intent'],
    ybStep6: ['sumInsured'],
    ybStep7: ['conditions']
  };

  var restartBtn = document.getElementById('ybRestart');

  // ---- reveal / collapse helpers ----
  function reveal(node) {
    node.classList.remove('hidden');
    node.classList.add('yb-enter');
    // Two RAFs so the browser paints the hidden->shown state before transitioning.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { node.classList.remove('yb-enter'); });
    });
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Collapse a step into its greyed summary row (green check + label + value + Edit).
  function complete(container, label, value) {
    var summary = container.querySelector('.yb-step-summary');
    summary.textContent = '';
    summary.appendChild(el('span', 'yb-check', '✓'));
    var body = el('div', 'yb-summary-body');
    body.appendChild(el('div', 'yb-summary-label', label));
    body.appendChild(el('div', 'yb-summary-value', value));
    summary.appendChild(body);
    var edit = el('button', 'yb-edit', 'Edit');
    edit.type = 'button';
    edit.addEventListener('click', function () { editStep(container.id); });
    summary.appendChild(edit);
    container.classList.add('completed-step');
  }

  // Re-open a completed step and reset every step after it.
  function editStep(id) {
    var idx = ORDER.indexOf(id);
    if (idx < 0) return;
    // Reset later steps: hide, un-complete, and wipe the data they own.
    for (var i = ORDER.length - 1; i > idx; i--) {
      var later = document.getElementById(ORDER[i]);
      later.classList.add('hidden');
      later.classList.remove('completed-step');
      (OWNS[ORDER[i]] || []).forEach(function (k) {
        formData[k] = Array.isArray(formData[k]) ? [] : (typeof formData[k] === 'object' ? {} : null);
      });
    }
    // The conditional steps 8–10 (calculator flow) always reset on any edit.
    ['ybStep8', 'ybStep9', 'ybStep10'].forEach(function (sid) {
      var s = document.getElementById(sid);
      if (!s) { return; }
      s.classList.add('hidden'); s.classList.remove('completed-step');
      activeOf(s).textContent = ''; s.querySelector('.yb-step-summary').textContent = '';
    });
    lastEstimate = null;
    document.getElementById('ybDone').classList.add('hidden');
    // Re-open the chosen step with its current answers still in place.
    var container = document.getElementById(id);
    container.classList.remove('completed-step');
    RENDERERS[id](container);
    reveal(container);
  }

  function advanceFrom(id) {
    var idx = ORDER.indexOf(id);
    if (idx < 0 || idx === ORDER.length - 1) { showDone(); return; }
    var nextId = ORDER[idx + 1];
    var next = document.getElementById(nextId);
    RENDERERS[nextId](next);
    reveal(next);
  }

  function activeOf(container) { return container.querySelector('.yb-step-active'); }

  // ===============================================================
  // STEP 1 — Contact details + age
  // ===============================================================
  var nameInput = document.getElementById('ybName');
  var emailInput = document.getElementById('ybEmail');
  var phoneInput = document.getElementById('ybPhone');
  var ageInput = document.getElementById('ybAge');
  var ageBtn = document.getElementById('ybAgeBtn');
  var ageErr = document.getElementById('ybAgeErr');
  var step1 = document.getElementById('ybStep1');

  var EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

  // Keep phone and age digits-only.
  phoneInput.addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '').slice(0, 10);
  });
  ageInput.addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '').slice(0, 3);
  });
  ageInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); ageBtn.click(); }
  });

  function step1Error(msg) { ageErr.hidden = false; ageErr.textContent = msg; }

  ageBtn.addEventListener('click', function () {
    var name = nameInput.value.trim();
    var email = emailInput.value.trim();
    var phone = phoneInput.value.trim();
    var age = parseInt(ageInput.value, 10);
    if (name.length < 2) { return step1Error('Please enter your name.'); }
    if (!EMAIL_RE.test(email)) { return step1Error('Please enter a valid email address, e.g. name@example.com.'); }
    if (!/^[0-9]{10}$/.test(phone)) { return step1Error('Please enter a valid 10-digit mobile number.'); }
    if (!(age >= 1 && age <= 120)) { return step1Error('Please enter a valid age between 1 and 120.'); }
    ageErr.hidden = true;
    formData.name = name;
    formData.email = email;
    formData.phone = phone;
    formData.age = age;
    restartBtn.classList.remove('hidden');
    complete(step1, 'Your details', name + ' · ' + age + ' yrs · ' + phone);
    // Straight into the questions.
    var first = document.getElementById(ORDER[0]);
    RENDERERS[ORDER[0]](first);
    reveal(first);
  });

  // ===============================================================
  // STEP 2 — Member selection
  // ===============================================================
  var MEMBER_TYPES = ['Self', 'Spouse', 'Son', 'Daughter', 'Father', 'Mother'];
  // Only these ask "how many?" and expand into numbered individuals; the rest
  // are single people.
  var COUNTED = ['Son', 'Daughter'];

  function renderMembers(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'yb-q', 'Who would you like to cover?'));

    var tiles = el('div', 'yb-tiles');
    var counts = el('div', 'yb-counts');

    // Which types are currently chosen (from formData, so Edit keeps state).
    var chosenTypes = {};
    formData.members.forEach(function (m) {
      var t = m.replace(/\s+\d+$/, ''); // 'Son 2' -> 'Son'
      chosenTypes[t] = true;
    });

    function renderCounts() {
      counts.textContent = '';
      COUNTED.forEach(function (t) {
        if (!chosenTypes[t]) return;
        var row = el('div', 'yb-count-row');
        var lab = el('label', '', 'How many ' + (t === 'Son' ? 'sons' : 'daughters') + '?');
        var cid = 'ybCount' + t;
        lab.setAttribute('for', cid);
        var inp = document.createElement('input');
        inp.className = 'f'; inp.type = 'number'; inp.min = '1'; inp.max = '5';
        inp.id = cid; inp.dataset.type = t;
        inp.value = String(formData.counts[t] || 1);
        inp.addEventListener('input', function () {
          var v = parseInt(this.value, 10);
          if (v > 5) this.value = '5';
          if (v < 1 || isNaN(v)) { /* let blur/validation handle empties */ }
        });
        row.appendChild(lab);
        row.appendChild(inp);
        counts.appendChild(row);
      });
    }

    MEMBER_TYPES.forEach(function (type) {
      var tile = el('label', 'yb-tile' + (chosenTypes[type] ? ' on' : ''));
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.value = type; cb.checked = !!chosenTypes[type];
      cb.addEventListener('change', function () {
        chosenTypes[type] = cb.checked;
        tile.classList.toggle('on', cb.checked);
        if ((type === 'Son' || type === 'Daughter')) { renderCounts(); }
      });
      tile.appendChild(cb);
      tile.appendChild(el('span', '', type));
      tiles.appendChild(tile);
    });

    active.appendChild(tiles);
    active.appendChild(counts);
    renderCounts();

    var err = el('div', 'yb-error'); err.hidden = true;
    active.appendChild(err);

    var next = el('button', 'btn btn-primary yb-next', 'Next');
    next.type = 'button';
    next.addEventListener('click', function () {
      var picked = MEMBER_TYPES.filter(function (t) { return chosenTypes[t]; });
      if (!picked.length) {
        err.hidden = false; err.textContent = 'Please select at least one member.';
        return;
      }
      // Validate counts for Son / Daughter.
      var counts2 = {};
      var bad = false;
      COUNTED.forEach(function (t) {
        if (chosenTypes[t]) {
          var inp = counts.querySelector('input[data-type="' + t + '"]');
          var v = parseInt(inp.value, 10);
          if (!(v >= 1 && v <= 5)) { bad = true; }
          counts2[t] = v;
        }
      });
      if (bad) {
        err.hidden = false; err.textContent = 'Please enter how many (1–5) for sons/daughters.';
        return;
      }
      err.hidden = true;

      // Expand into individuals (Son/Daughter multiply by their count).
      var members = [];
      picked.forEach(function (t) {
        if (COUNTED.indexOf(t) < 0) { members.push(t); }
        else {
          for (var i = 1; i <= counts2[t]; i++) { members.push(t + ' ' + i); }
        }
      });
      formData.members = members;
      formData.counts = counts2;

      complete(container, 'Members', summariseMembers(picked, counts2));
      advanceFrom(container.id);
    });
    active.appendChild(next);
  }

  function summariseMembers(picked, counts) {
    return picked.map(function (t) {
      if (t === 'Son') return counts.Son + (counts.Son > 1 ? ' Sons' : ' Son');
      if (t === 'Daughter') return counts.Daughter + (counts.Daughter > 1 ? ' Daughters' : ' Daughter');
      return t;
    }).join(', ');
  }

  // ===============================================================
  // STEP 3 — Dynamic ages
  // ===============================================================
  function ageLabel(member) {
    if (member === 'Self') return 'Your age';
    if (member === 'Spouse') return "Spouse's age";
    return member + ' age'; // 'Son 1 age'
  }

  function renderAges(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'yb-q', 'How old is everyone?'));

    var grid = el('div', 'yb-ages');
    formData.members.forEach(function (member, i) {
      var field = el('div', 'yb-age-field');
      var id = 'ybAgeM' + i;
      var lab = el('label', '', ageLabel(member));
      lab.setAttribute('for', id);
      var inp = document.createElement('input');
      inp.className = 'f'; inp.type = 'number'; inp.min = '1'; inp.max = '120';
      inp.id = id; inp.dataset.member = member;
      // Pre-fill "Your age" with the age from step 1; keep any prior edits.
      var prior = formData.ages[member];
      if (prior != null) inp.value = String(prior);
      else if (member === 'Self' && formData.age != null) inp.value = String(formData.age);
      field.appendChild(lab);
      field.appendChild(inp);
      grid.appendChild(field);
    });
    active.appendChild(grid);

    var err = el('div', 'yb-error'); err.hidden = true;
    active.appendChild(err);

    var next = el('button', 'btn btn-primary yb-next', 'Next');
    next.type = 'button';
    next.addEventListener('click', function () {
      var ages = {};
      var ok = true;
      grid.querySelectorAll('input').forEach(function (inp) {
        var v = parseInt(inp.value, 10);
        if (!(v >= 1 && v <= 120)) ok = false;
        ages[inp.dataset.member] = v;
      });
      if (!ok) {
        err.hidden = false; err.textContent = 'Please enter a valid age (1–120) for everyone.';
        return;
      }
      err.hidden = true;
      formData.ages = ages;
      var value = formData.members.map(function (m) { return m + ' ' + ages[m]; }).join(', ');
      complete(container, 'Ages', value);
      advanceFrom(container.id);
    });
    active.appendChild(next);
  }

  // ===============================================================
  // STEP 4 — City / Zone (auto-advance)
  // ===============================================================
  var ZONES = [
    { value: 'Zone 1', title: 'Zone 1', sub: 'Delhi NCR, Mumbai, Thane, Navi Mumbai, Surat, Ahmedabad, Vadodara' },
    { value: 'Zone 2', title: 'Zone 2', sub: 'Rest of India' }
  ];

  function renderZone(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'yb-q', 'Where do you live?'));
    var wrap = el('div', 'yb-pills');
    ZONES.forEach(function (z) {
      var pill = el('label', 'yb-pill' + (formData.zone === z.value ? ' on' : ''));
      var radio = document.createElement('input');
      radio.type = 'radio'; radio.name = 'ybZone'; radio.value = z.value;
      radio.checked = formData.zone === z.value;
      radio.addEventListener('change', function () {
        formData.zone = z.value;
        complete(container, 'Zone', z.title + ' · ' + z.sub);
        advanceFrom(container.id);
      });
      pill.appendChild(radio);
      pill.appendChild(el('span', 'yb-pill-title', z.title));
      pill.appendChild(el('span', 'yb-pill-sub', z.sub));
      wrap.appendChild(pill);
    });
    active.appendChild(wrap);
  }

  // ===============================================================
  // STEP 5 — Policy intent (auto-advance)
  // ===============================================================
  var INTENTS = [
    { value: 'Buy a new policy', icon: '🆕' },
    { value: 'Already have a health policy', icon: '📄' }
  ];

  function renderIntent(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'yb-q', 'What brings you here?'));
    var wrap = el('div', 'yb-cards');
    INTENTS.forEach(function (opt) {
      var card = el('label', 'yb-card' + (formData.intent === opt.value ? ' on' : ''));
      var radio = document.createElement('input');
      radio.type = 'radio'; radio.name = 'ybIntent'; radio.value = opt.value;
      radio.checked = formData.intent === opt.value;
      radio.addEventListener('change', function () {
        formData.intent = opt.value;
        complete(container, 'Policy intent', opt.value);
        advanceFrom(container.id);
      });
      card.appendChild(radio);
      card.appendChild(el('span', 'yb-card-ic', opt.icon));
      card.appendChild(el('span', 'yb-card-title', opt.value));
      wrap.appendChild(card);
    });
    active.appendChild(wrap);
  }

  // ===============================================================
  // STEP 6 — Sum insured (auto-advance)
  // ===============================================================
  var SUMS = ['5L', '10L', '15L', '20L', '25L', '50L', '75L', '1Cr'];

  function renderSum(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'yb-q', 'How much cover do you want?'));
    var grid = el('div', 'yb-grid');
    SUMS.forEach(function (s) {
      var btn = el('button', 'yb-si' + (formData.sumInsured === s ? ' on' : ''), '₹' + s);
      btn.type = 'button';
      btn.addEventListener('click', function () {
        formData.sumInsured = s;
        complete(container, 'Sum insured', '₹' + s);
        advanceFrom(container.id);
      });
      grid.appendChild(btn);
    });
    active.appendChild(grid);
  }

  // ===============================================================
  // STEP 7 — Pre-existing conditions (final submit)
  // ===============================================================
  var CONDITIONS = ['Diabetes', 'Hypertension', 'Asthma', 'Heart Disease', 'Thyroid', 'None of these'];
  var NONE = 'None of these';

  function renderConditions(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'yb-q', 'Any pre-existing conditions?'));

    var wrap = el('div', 'yb-conditions');
    var selected = formData.conditions.slice();

    var pills = {};
    function syncClasses() {
      CONDITIONS.forEach(function (c) {
        pills[c].classList.toggle('on', selected.indexOf(c) >= 0);
        pills[c].querySelector('input').checked = selected.indexOf(c) >= 0;
      });
    }

    CONDITIONS.forEach(function (c) {
      var pill = el('label', 'yb-cond');
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.value = c;
      cb.addEventListener('change', function () {
        if (c === NONE) {
          selected = cb.checked ? [NONE] : [];
        } else {
          if (cb.checked) { selected = selected.filter(function (x) { return x !== NONE; }); selected.push(c); }
          else { selected = selected.filter(function (x) { return x !== c; }); }
        }
        syncClasses();
      });
      pill.appendChild(cb);
      pill.appendChild(el('span', '', c));
      wrap.appendChild(pill);
      pills[c] = pill;
    });
    active.appendChild(wrap);
    syncClasses();

    var err = el('div', 'yb-error'); err.hidden = true;
    active.appendChild(err);

    // The HbA1c / BP / hospitalisation questions are asked PER adult member in
    // step 8 (health metrics), gated by whichever broad conditions are chosen here.
    var submit = el('button', 'btn btn-primary yb-next', calcEligible() ? 'Continue →' : 'Send Enquiry');
    submit.type = 'button';
    submit.addEventListener('click', function () {
      if (!selected.length) { err.hidden = false; err.textContent = 'Please choose a condition, or “None of these”.'; return; }
      err.hidden = true;
      formData.conditions = selected.slice();
      console.log('Health cover enquiry captured:\n' + JSON.stringify(formData, null, 2));
      if (calcEligible()) {
        complete(container, 'Conditions', selected.join(', '));
        renderHealthMetrics(step8);
        reveal(step8);
      } else {
        submitEnquiry(submit, err, container, 'Conditions', selected.join(', '), 'Send Enquiry');
      }
    });
    active.appendChild(submit);
  }

  // ===============================================================
  // STEPS 8–10 — Health metrics, policy details, and the indicative premium.
  // Shown only when eligible (proposer 18–45 and every member 0–45); otherwise
  // step 7 goes straight to Send Enquiry. Plan defaults to Basic; GST is computed
  // but hidden (we show the pre-GST premium).
  // ===============================================================
  var PLAN_TYPE = 'Basic Plan - Annual';

  // Data (rates + modifiers + optional covers) loads directly via
  // js/nia-yuva-rates.js (window.NIA_YUVA_DATA) — no fetch, so it works locally too.
  var DB = window.NIA_YUVA_DATA || null;

  // ── Core logic ─────────────────────────────────────────────────────────────
  // Base rate via .find(), then modifiers in order: optional covers → floater
  // discount → health parameters (summed across all adults) → long-term. GST is
  // computed but NOT displayed (we return the pre-GST premium in `.premium`).
  function calculateFinalPremium(input, db) {
    var mods = db.modifiers || {}, covers = db.optionalCovers || {};

    // Base premium = SUM of EACH member's individual rate (by their own age), so
    // the premium reflects how many people are covered. The family/floater discount
    // below then rewards bundling them under one sum insured.
    function memberRate(age) {
      var r = db.premiumData.find(function (x) {
        return x.planType === input.planType && x.zone === input.zone
          && x.sumInsured === input.sumInsured
          && age >= x.ageMin && age <= x.ageMax;
      });
      if (!r) { throw new Error('No premium rate for a member aged ' + age + '.'); }
      return r.basePremium;
    }
    var ages = input.memberAges || [];
    if (!ages.length) { throw new Error('No members to price.'); }
    var base = 0;
    ages.forEach(function (age) { base += memberRate(age); });

    // Optional covers (enhanced maternity — Platinum only in practice).
    var addon = 0;
    if (input.wantsMaternity && input.maternityLimit && covers.enhancedMaternity) {
      var mat = covers.enhancedMaternity.find(function (m) { return m.zone === input.zone && m.limit === input.maternityLimit; });
      if (mat) { addon = mat.annualPremium; }
    }
    var baseWithAddons = base + addon;
    var running = baseWithAddons;

    // Family/floater discount by member count (capped at 4).
    var count = Math.min(Math.max(ages.length, 1), 4);
    var floaterDisc = (mods.floaterDiscount && mods.floaterDiscount[String(count)]) || 0;
    running *= (1 - floaterDisc);

    // Health parameters — evaluated PER adult member (18+), then summed across
    // ALL adults (discounts negative, loadings positive). Minors are excluded.
    var hp = 0, m = mods.healthParameters || {};
    (input.adults || []).forEach(function (a) {
      if (a.bmi != null) {
        if (a.bmi >= 18.5 && a.bmi < 32) { hp += (m.bmiHealthy || 0); }
        else if (a.bmi > 32) { hp += (m.bmiOverweight || 0); }
      }
      hp += a.isDiabeticOverLimit ? (m.diabetic || 0) : (m.nonDiabetic || 0);
      hp += a.isHypertensiveOverLimit ? (m.hypertensive || 0) : (m.nonHypertensive || 0);
      if (!a.hospitalizedLast3Years) { hp += (m.noHospitalization3Yrs || 0); }
    });
    running *= (1 + hp);

    // Long-term discount (by policy term). Loyalty discount removed.
    var ltDisc = (mods.longTermDiscount && mods.longTermDiscount[String(input.policyTermYears || 1)]) || 0;
    running *= (1 - ltDisc);

    var finalBeforeTax = Math.round(running);
    var gst = running * ((db.metadata && db.metadata.taxRateGST) || 0.18);
    return {
      basePremium: Math.round(baseWithAddons),
      finalBeforeTax: finalBeforeTax,
      discountAmount: Math.round(baseWithAddons - finalBeforeTax), // + = net saving
      gstAmount: Math.round(gst),
      totalWithGst: Math.round(running + gst),
      premium: finalBeforeTax // displayed value (GST hidden)
    };
  }
  window.calculateFinalPremium = calculateFinalPremium;

  function inr(n) { return '₹' + Number(n).toLocaleString('en-IN'); }
  function track(event, params) { try { if (typeof window.gtag === 'function') { window.gtag('event', event, params || {}); } } catch (e) {} }

  // Calculator eligibility: proposer 18–45, and EVERY member aged 0–45.
  function calcEligible() {
    if (!(formData.age >= 18 && formData.age <= 45)) { return false; }
    if (!formData.members || !formData.members.length) { return false; }
    var ages = formData.ages || {};
    for (var i = 0; i < formData.members.length; i++) {
      var a = ages[formData.members[i]];
      if (!(a >= 0 && a <= 45)) { return false; }
    }
    return true;
  }

  function zoneNum(z) { var m = String(z || '').match(/(\d)/); return m ? parseInt(m[1], 10) : null; }
  function sumNum(s) {
    s = String(s || '').toLowerCase().replace(/\s/g, '');
    var map = { '5l': 500000, '10l': 1000000, '15l': 1500000, '20l': 2000000, '25l': 2500000, '50l': 5000000, '75l': 7500000, '1cr': 10000000 };
    return map[s] || null;
  }

  var lastEstimate = null; // remembered for the recap + enquiry payload
  var step8 = document.getElementById('ybStep8');   // health metrics
  var step9 = document.getElementById('ybStep9');   // policy details
  var step10 = document.getElementById('ybStep10'); // estimate

  // Members aged 18+ (health parameters apply to adults only; minors excluded).
  function adultMembers() {
    var ages = formData.ages || {};
    return (formData.members || []).filter(function (m) { return ages[m] != null && ages[m] >= 18; });
  }

  // ── STEP 8: Per-adult health metrics (BMI + condition/hospitalisation toggles) ──
  function renderHealthMetrics(container) {
    var active = activeOf(container);
    active.textContent = '';
    var adults = adultMembers();
    active.appendChild(el('label', 'yb-q', adults.length > 1 ? 'A few health details for each adult' : 'A couple of health details for a sharper rate'));
    active.appendChild(el('span', 'calc-help', 'Used only to apply the insurer’s health-parameter discounts. Children aren’t asked.'));

    var hasDiab = formData.conditions.indexOf('Diabetes') >= 0;
    var hasHtn = formData.conditions.indexOf('Hypertension') >= 0;
    var ages = formData.ages || {};
    var err = el('div', 'yb-error'); err.hidden = true;

    var blocks = adults.map(function (member) {
      var prev = (formData.healthMetrics && formData.healthMetrics[member]) || {};
      var box = el('div', 'calc-member-box');
      box.appendChild(el('div', 'calc-member-head', member + ' · ' + ages[member] + ' yrs'));

      var fields = el('div', 'yb-fields');
      function numField(label, ph, val) {
        var f = el('div', 'yb-field');
        f.appendChild(el('label', 'f-label', label));
        var i = document.createElement('input'); i.className = 'f'; i.type = 'text'; i.inputMode = 'decimal'; i.placeholder = ph;
        i.addEventListener('input', function () { this.value = this.value.replace(/[^\d.]/g, ''); });
        if (val != null) { i.value = String(val); }
        f.appendChild(i);
        fields.appendChild(f);
        return i;
      }
      var hIn = numField('Height (cm)', 'e.g. 170', prev._heightCm);
      var wIn = numField('Weight (kg)', 'e.g. 68', prev._weightKg);
      box.appendChild(fields);

      function yesNo(labelText, current) {
        var qb = el('div', 'calc-subq-box');
        qb.appendChild(el('label', 'calc-subq', labelText));
        var pw = el('div', 'calc-pills');
        var state = { v: current };
        [{ v: 'Yes' }, { v: 'No' }].forEach(function (o) {
          var p = el('button', 'calc-pill' + (current === o.v ? ' on' : ''), o.v); p.type = 'button';
          p.addEventListener('click', function () { pw.querySelectorAll('.calc-pill').forEach(function (x) { x.classList.remove('on'); }); p.classList.add('on'); state.v = o.v; });
          pw.appendChild(p);
        });
        qb.appendChild(pw);
        return { box: qb, get: function () { return state.v; } };
      }
      var diabQ = hasDiab ? yesNo('Is their HbA1c above 6.4?', prev.isDiabeticOverLimit ? 'Yes' : (prev._diabAnswered ? 'No' : null)) : null;
      var bpQ = hasHtn ? yesNo('Is their blood pressure above 139/89?', prev.isHypertensiveOverLimit ? 'Yes' : (prev._bpAnswered ? 'No' : null)) : null;
      var hospQ = yesNo('Hospitalised over 24 hrs in the last 3 years?', prev.hospitalizedLast3Years ? 'Yes' : (prev._hospAnswered ? 'No' : null));
      if (diabQ) { box.appendChild(diabQ.box); }
      if (bpQ) { box.appendChild(bpQ.box); }
      box.appendChild(hospQ.box);

      active.appendChild(box);
      return { member: member, hIn: hIn, wIn: wIn, diabQ: diabQ, bpQ: bpQ, hospQ: hospQ };
    });

    active.appendChild(err);
    var next = el('button', 'btn btn-primary yb-next', 'Next');
    next.type = 'button';
    next.addEventListener('click', function () {
      var metrics = {};
      for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        var hcm = parseFloat(b.hIn.value), wkg = parseFloat(b.wIn.value);
        if (!(hcm >= 50 && hcm <= 250)) { err.hidden = false; err.textContent = 'Enter a valid height (cm) for ' + b.member + '.'; return; }
        if (!(wkg >= 2 && wkg <= 300)) { err.hidden = false; err.textContent = 'Enter a valid weight (kg) for ' + b.member + '.'; return; }
        if (b.diabQ && !b.diabQ.get()) { err.hidden = false; err.textContent = 'Answer the HbA1c question for ' + b.member + '.'; return; }
        if (b.bpQ && !b.bpQ.get()) { err.hidden = false; err.textContent = 'Answer the blood-pressure question for ' + b.member + '.'; return; }
        if (!b.hospQ.get()) { err.hidden = false; err.textContent = 'Answer the hospitalisation question for ' + b.member + '.'; return; }
        var mtr = hcm / 100;
        metrics[b.member] = {
          _heightCm: hcm, _weightKg: wkg,
          bmi: Math.round((wkg / (mtr * mtr)) * 10) / 10,
          isDiabeticOverLimit: b.diabQ ? (b.diabQ.get() === 'Yes') : false,
          isHypertensiveOverLimit: b.bpQ ? (b.bpQ.get() === 'Yes') : false,
          hospitalizedLast3Years: (b.hospQ.get() === 'Yes'),
          _diabAnswered: !!(b.diabQ && b.diabQ.get()), _bpAnswered: !!(b.bpQ && b.bpQ.get()), _hospAnswered: true
        };
      }
      err.hidden = true;
      formData.healthMetrics = metrics;
      var summary = Object.keys(metrics).map(function (k) { return k + ' BMI ' + metrics[k].bmi; }).join(', ');
      complete(container, 'Health metrics', summary);
      renderPolicyDetails(step9); reveal(step9);
    });
    active.appendChild(next);
  }

  // ── STEP 9: Policy term (long-term discount) ──
  function renderPolicyDetails(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'yb-q', 'Policy preferences'));

    active.appendChild(el('label', 'calc-subq', 'How long would you like the policy for?'));
    var term = formData.policyTermYears || 1;
    var termWrap = el('div', 'calc-pills');
    [{ v: 1, t: '1 year' }, { v: 2, t: '2 years' }, { v: 3, t: '3 years' }].forEach(function (o) {
      var p = el('button', 'calc-pill' + (term === o.v ? ' on' : ''), o.t); p.type = 'button';
      p.addEventListener('click', function () { termWrap.querySelectorAll('.calc-pill').forEach(function (x) { x.classList.remove('on'); }); p.classList.add('on'); term = o.v; });
      termWrap.appendChild(p);
    });
    active.appendChild(termWrap);

    var next = el('button', 'btn btn-primary yb-next', 'See my estimate →');
    next.type = 'button';
    next.addEventListener('click', function () {
      formData.policyTermYears = term;
      complete(container, 'Policy preferences', term + '-year');
      renderCalculator(step10); reveal(step10);
    });
    active.appendChild(next);
  }

  // ── STEP 10: insurer selector + the NIA estimate + a Send Enquiry button ──
  function renderCalculator(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'yb-q', 'Your estimated premium'));

    var chips = el('div', 'calc-companies');
    var niaWrap = el('div');
    var soonWrap = el('div', 'calc-soon-card'); soonWrap.hidden = true;
    soonWrap.appendChild(el('p', null, 'This insurer’s calculator is coming soon — tap “Send Enquiry” below and Kevin will share a personalised quote.'));
    [
      { id: 'nia', name: 'New India Assurance', live: true },
      { id: 'star', name: 'TATA', live: false },
      { id: 'hdfc', name: 'HDFC Ergo', live: false },
    ].forEach(function (co) {
      var chip = el('button', 'calc-company' + (co.live ? ' is-active' : ''));
      chip.type = 'button';
      chip.appendChild(document.createTextNode(co.name + (co.live ? '' : ' ')));
      if (!co.live) { chip.appendChild(el('span', 'calc-soon', 'Soon')); }
      chip.addEventListener('click', function () {
        chips.querySelectorAll('.calc-company').forEach(function (c) { c.classList.remove('is-active'); });
        chip.classList.add('is-active');
        niaWrap.hidden = !co.live; soonWrap.hidden = co.live;
      });
      chips.appendChild(chip);
    });
    active.appendChild(chips);
    active.appendChild(niaWrap);
    active.appendChild(soonWrap);

    renderNiaEstimate(niaWrap);

    var err = el('div', 'yb-error'); err.hidden = true;
    active.appendChild(err);
    var send = el('button', 'btn btn-primary yb-next', 'Send Enquiry');
    send.type = 'button';
    send.addEventListener('click', function () {
      var val = lastEstimate
        ? ('Est. ' + inr(lastEstimate.premium) + ' · ' + formData.members.length + ' member(s)')
        : (formData.members.length + ' member(s)');
      submitEnquiry(send, err, container, 'Premium estimate & enquiry', val, 'Send Enquiry');
    });
    active.appendChild(send);
  }

  // Formats a wizard sum-insured token ("5L","1Cr") for display.
  function siDisplay(s) {
    return s ? ('₹' + String(s).replace(/l$/i, ' Lakh').replace(/cr$/i, ' Crore')) : '—';
  }

  // Computes + renders the New India Assurance estimate from the collected data.
  function renderNiaEstimate(wrap) {
    wrap.textContent = '';
    var zone = zoneNum(formData.zone);
    var si = sumNum(formData.sumInsured);
    var siLabel = siDisplay(formData.sumInsured);
    lastEstimate = null;

    // Every covered member's age — the base premium is summed across all of them.
    var ages = formData.ages || {};
    var memberAges = (formData.members || []).map(function (m) { return ages[m]; }).filter(function (a) { return a != null; });
    var memberCount = memberAges.length;

    wrap.appendChild(el('p', 'calc-basis',
      'New India Assurance — Yuva Bharat (Basic) · ' + siLabel + ' · ' + (formData.zone || '—')
      + ' · ' + memberCount + ' member' + (memberCount === 1 ? '' : 's')));

    if (!DB) {
      wrap.appendChild(el('p', 'calc-disclaimer', 'We couldn’t load the rate chart — tap “Send Enquiry” and Kevin will send you a precise quote.'));
      return;
    }

    // One health-parameter entry per adult member (minors were never asked).
    var adults = Object.keys(formData.healthMetrics || {}).map(function (k) { return formData.healthMetrics[k]; });

    var out = null;
    if (zone != null && si != null && memberCount) {
      try {
        out = calculateFinalPremium({
          planType: PLAN_TYPE, zone: zone, sumInsured: si,
          memberAges: memberAges,
          adults: adults,
          policyTermYears: formData.policyTermYears
        }, DB);
      } catch (e) { out = null; }
    }

    if (!out) {
      wrap.appendChild(el('p', 'calc-disclaimer',
        'We can’t auto-estimate this exact combination (for example a sum insured or zone not in the current chart). Tap “Send Enquiry” and Kevin will send you a precise quote.'));
      return;
    }

    lastEstimate = out;
    var results = el('div', 'calc-results');
    function row(label, value, cls) {
      var r = el('div', 'calc-result-row' + (cls ? ' ' + cls : ''));
      r.appendChild(el('span', null, label));
      r.appendChild(el('strong', null, value));
      results.appendChild(r);
    }
    row('Estimated premium', inr(out.premium), 'calc-total');
    if (out.discountAmount > 0) {
      results.appendChild(el('p', 'calc-savings', '✓ Includes ' + inr(out.discountAmount) + ' in discounts (floater, health & long-term).'));
    }
    results.appendChild(el('p', 'calc-disclaimer', 'This is an indicative premium. Final premium is subject to underwriting and applicable GST.'));

    var wa = el('a', 'btn btn-ghost calc-wa', 'Share this quote with Kevin on WhatsApp');
    wa.target = '_blank'; wa.rel = 'noopener';
    wa.href = 'https://wa.me/' + WA_NUM + '?text=' + encodeURIComponent(
      'Hi Kevin! Yuva Bharat estimate (New India Assurance, Basic) — ' + siLabel + ', ' + (formData.zone || '')
      + ', ' + memberCount + ' member' + (memberCount === 1 ? '' : 's') + ': indicative premium ' + inr(out.premium) + '. Can you help me proceed?');
    results.appendChild(wa);
    wrap.appendChild(results);

    track('calculate_premium', { insurer: 'New_India_Assurance', plan: 'Yuva_Bharat_Basic', zone: zone, sum_insured: si });
  }

  // ===============================================================
  // Submit — send to Kevin server-side, then confirm
  // ===============================================================
  var WA_NUM = '918369988285';

  // Google Apps Script web-app URL that receives enquiries and emails them to
  // Kevin (shared with the main site enquiry form).
  var ENQUIRY_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxCCZ0SPD5rJrCWs4jwlKD5F7RJFoCt-qGi5BW-8F5_K04HF1Yq8Ma3sR836eZ5oE3hSg/exec';

  function membersText() {
    return formData.members.map(function (m) { return m + ' (' + formData.ages[m] + ')'; }).join(', ');
  }

  // One-line per-adult health metrics (BMI/height/weight + HbA1c/BP/hospitalisation)
  // so they reach Kevin in the enquiry email.
  function healthMetricsText() {
    var hm = formData.healthMetrics || {};
    return Object.keys(hm).map(function (name) {
      var d = hm[name], parts = [];
      if (d.bmi != null) { parts.push('BMI ' + d.bmi + ' (' + d._heightCm + 'cm/' + d._weightKg + 'kg)'); }
      if (d._diabAnswered) { parts.push('HbA1c>6.4: ' + (d.isDiabeticOverLimit ? 'Yes' : 'No')); }
      if (d._bpAnswered) { parts.push('BP>139/89: ' + (d.isHypertensiveOverLimit ? 'Yes' : 'No')); }
      parts.push('Hospitalised(3y): ' + (d.hospitalizedLast3Years ? 'Yes' : 'No'));
      return name + ' [' + parts.join(', ') + ']';
    }).join(' | ');
  }

  // Posts the enquiry to the Apps Script endpoint (emails Kevin). Health answers
  // ride in the one-line "products"/"health" fields (the endpoint strips line breaks).
  function postEnquiry() {
    var products = 'Health cover — Members: ' + membersText()
      + ' | Zone: ' + formData.zone
      + ' | Intent: ' + formData.intent
      + ' | Sum insured: ₹' + formData.sumInsured
      + ' | Policy term: ' + (formData.policyTermYears || 1) + 'yr'
      + (lastEstimate ? ' | Est. premium: ₹' + lastEstimate.premium + ' (GST extra)' : '');

    var healthText = formData.conditions.join(', ') || 'None mentioned';
    var metrics = healthMetricsText();
    if (metrics) { healthText += ' || Metrics: ' + metrics; }

    var data = new FormData();
    data.append('name', formData.name);
    data.append('email', formData.email);
    data.append('mobile', formData.phone);
    data.append('age', String(formData.age));
    data.append('products', products);
    data.append('health', healthText);
    data.append('botcheck', '');

    // Apps Script web apps don't return browser-readable CORS headers, so we post
    // in no-cors mode: a resolved fetch means the request was dispatched.
    return fetch(ENQUIRY_ENDPOINT, { method: 'POST', body: data, mode: 'no-cors' });
  }

  // Sends the enquiry, then collapses `container` into a summary and shows "done".
  function submitEnquiry(btn, err, container, label, value, origText) {
    btn.disabled = true; btn.textContent = 'Sending…';
    postEnquiry()
      .then(function () { complete(container, label, value); showDone(); })
      .catch(function () {
        btn.disabled = false; btn.textContent = origText;
        err.hidden = false;
        err.textContent = "Couldn't send your enquiry — please check your connection and try again.";
      });
  }

  function showDone() {
    var done = document.getElementById('ybDone');
    done.textContent = '';
    done.appendChild(el('div', 'yb-done-icon', '✓'));
    done.appendChild(el('h3', '', 'Enquiry sent!'));
    done.appendChild(el('p', '', 'Thanks ' + formData.name + ' — your details have reached Kevin. He\'ll be in touch shortly.'));

    var recap = el('dl', 'yb-recap');
    function row(label, value) {
      var r = el('div', 'yb-recap-row');
      r.appendChild(el('dt', '', label));
      r.appendChild(el('dd', '', value));
      recap.appendChild(r);
    }
    row('Name', formData.name);
    row('Contact', formData.phone + ' · ' + formData.email);
    row('Applicant age', formData.age + ' years');
    row('Members', membersText());
    row('Zone', formData.zone);
    row('Intent', formData.intent);
    row('Sum insured', '₹' + formData.sumInsured);
    row('Conditions', formData.conditions.join(', '));
    if (lastEstimate) { row('Estimated premium', inr(lastEstimate.premium)); }
    done.appendChild(recap);

    var wa = el('a', 'btn btn-primary', 'Message Kevin on WhatsApp');
    wa.href = 'https://wa.me/' + WA_NUM + '?text='
      + encodeURIComponent('Hi Kevin! I just sent a health cover enquiry through the website.');
    wa.target = '_blank';
    wa.rel = 'noopener';
    done.appendChild(wa);

    reveal(done);
  }

  // ===============================================================
  // Start over
  // ===============================================================
  restartBtn.addEventListener('click', function () {
    formData = {
      name: '', email: '', phone: '', age: null, members: [], counts: {}, ages: {},
      zone: null, intent: null, sumInsured: null, conditions: [],
      policyTermYears: 1, healthMetrics: {}
    };
    ORDER.forEach(function (id) {
      var c = document.getElementById(id);
      c.classList.add('hidden');
      c.classList.remove('completed-step');
      activeOf(c).textContent = '';
      c.querySelector('.yb-step-summary').textContent = '';
    });
    ['ybStep8', 'ybStep9', 'ybStep10'].forEach(function (sid) {
      var s = document.getElementById(sid);
      if (!s) { return; }
      s.classList.add('hidden'); s.classList.remove('completed-step');
      activeOf(s).textContent = ''; s.querySelector('.yb-step-summary').textContent = '';
    });
    lastEstimate = null;
    document.getElementById('ybDone').classList.add('hidden');
    step1.classList.remove('completed-step');
    nameInput.value = '';
    emailInput.value = '';
    phoneInput.value = '';
    ageInput.value = '';
    ageErr.hidden = true;
    restartBtn.classList.add('hidden');
    step1.scrollIntoView({ behavior: 'smooth', block: 'center' });
    nameInput.focus();
  });
})();
