/* Fire & property insurance progressive enquiry — vanilla-JS wizard on fire.html.
   Asks contact details, then steps through the risk location + earthquake zone,
   nature of occupancy + building type, an asset-by-asset sum-insured calculator
   (live total), risk-mitigation safety features, bank hypothecation and any extra
   risk notes. Each answer locks with a green check and fades in the next question;
   completed steps stay visible (greyed/minimised) and can be edited.

   For the occupancies NIA rates today (IIB-coded via the Step 3 dropdown), the
   wizard runs the BSUS/Sukshma split-rate fire maths in the browser and shows an
   indicative-premium receipt (base premium, GST, final payable). The good-feature
   discount is applied ONLY to the Flexa (fire) rate, which is then re-aggregated
   with the STFI, EQ and terrorism rates. Occupancies not on the rate chart still
   work exactly as before — a lead-gen enquiry with no instant quote.

   On submit the whole formData object (inputs + any calculated premium) is sent to
   Kevin server-side (shared enquiry Apps Script — same transport as every other
   form; the PRD's EmailJS is intentionally not used, to stay CSP-safe and
   consistent with the rest of the site). */
(function () {
  var wizard = document.getElementById('frWizard');
  if (!wizard) return;

  // Small DOM builder — textContent only, so nothing here can inject markup.
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function labelFor(id, text) { var l = el('label', 'f-label', text); l.setAttribute('for', id); return l; }
  function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function inr(n) { return '₹' + (n || 0).toLocaleString('en-IN'); }
  // GA4 helper — analytics.js exposes window.gtag; guard so the form never breaks.
  function ga(event, params) {
    if (typeof window.gtag === 'function') { try { window.gtag('event', event, params || {}); } catch (e) { /* noop */ } }
  }

  // ===============================================================
  // Local SPLIT-rate dictionary (embedded — CSP blocks fetching json/fire.json).
  // Rates are per ₹1,000 of sum insured (per mille). Stored split so the
  // good-feature discount can be applied to the Flexa (fire) rate alone, then
  // re-aggregated with STFI + EQ + terrorism. Paste more IIB codes here in the
  // same shape as NIA publishes them; the Step 3 dropdown builds from this object.
  // ===============================================================
  var fireOccupancyRates = {
    '1002': { label: 'Places of worship',                                        baseFlexa: 0.105,  baseSTFI: 0.1125, baseEQ: 0.075, baseTerrorism: 0.15, riskCategory: 1 },
    '1003': { label: 'Libraries',                                                baseFlexa: 0.1575, baseSTFI: 0.1125, baseEQ: 0.075, baseTerrorism: 0.15, riskCategory: 1 },
    '1007': { label: 'Office premises / meeting rooms',                          baseFlexa: 0.225,  baseSTFI: 0.1125, baseEQ: 0.075, baseTerrorism: 0.15, riskCategory: 1 },
    '4016': { label: 'Transporter’s godowns & clearing / forwarding agents',     baseFlexa: 0.60,   baseSTFI: 1.125,  baseEQ: 0.075, baseTerrorism: 0.23, riskCategory: 1 }
  };
  var GST_RATE = 0.18;

  var EQ_ZONES = ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4'];
  // Earthquake rate (per mille) by seismic zone — this drives the EQ portion at
  // calc time (the dict's baseEQ is no longer used); then scaled by risk category.
  var EQ_ZONE_RATES = { 'Zone 1': 0.25, 'Zone 2': 0.15, 'Zone 3': 0.10, 'Zone 4': 0.05 };
  var RISK_CATEGORY_EQ_FACTOR = { 1: 0.75, 2: 0.90, 3: 1.25, 4: 2.60 };

  var BUILDING_TYPES = ['Pucca', 'Kutcha'];
  // Kutcha (non-masonry) construction loads the fire (Flexa) rate heavily, per mille.
  var KUTCHA_FLEXA_LOADING = 4.00;

  // ---- state ----
  function freshData() {
    return {
      name: '', email: '', phone: '',
      address: '', pincode: '', eqZone: '',
      occupancyCode: '',   // IIB code (string) for a rated occupancy, or 'other'
      occupancyLabel: '',  // human-readable occupancy (from dropdown or free text)
      buildingType: null,  // 'Pucca' | 'Kutcha'
      assets: {},          // { building: 500000, plant: 0, ... }
      totalSI: 0,
      mitigation: {},      // { hydrant:'Yes', electrical:'No', ... }
      hypothecation: null,
      financier: '',
      details: '',
      quote: null          // { netRate, modifierPct, basePremium, gstAmount, finalPremium } when computable
    };
  }
  var formData = freshData();

  var ASSETS = [
    { key: 'building', label: 'Building including plinth, basement and additional structures' },
    { key: 'furniture', label: 'Furniture & fixtures, fittings and other equipment' },
    { key: 'plant', label: 'Plant & machinery' },
    { key: 'otherContents', label: 'Other contents' },
    { key: 'rawMaterial', label: 'Raw material' },
    { key: 'stocksInProcess', label: 'Stocks in process' },
    { key: 'finishedStock', label: 'Finished stock' },
    { key: 'stocksInTrust', label: 'Stocks held in trust' }
  ];

  // Risk-feature scoring. Good features are positive (a discount); hazards are
  // negative (a loading). The net score is applied to the Flexa (fire) rate only:
  // positive is capped at +50 (max 50% discount); negative has no floor and loads
  // the rate (1 − (−x/100) = 1 + x/100).
  var GOOD_FEATURES = [
    { key: 'hydrant',    q: 'Operational fire hydrant / sprinkler system', points: 10 },
    { key: 'electrical', q: 'Well-maintained electrical installations', points: 10 },
    { key: 'drainage',   q: 'Storm-water drainage / plinth ≥ 1.5 ft', points: 10 },
    { key: 'security',   q: '24×7 security with CCTV', points: 10 },
    { key: 'claimRatio', q: 'Past 3-year claim ratio under 30%', points: 20 }
  ];
  var HAZARDS = [
    { key: 'basement',      q: 'Basement used for operations / storage / plant & machinery', points: -5 },
    { key: 'waterBody',     q: 'Premises within 1 km of a water body', points: -5 },
    { key: 'noFireBrigade', q: 'Thickly populated area with no fire-brigade access', points: -10 },
    { key: 'oldBuilding',   q: 'Building over 30 years old / condition below average', points: -5 }
  ];
  var ALL_MITIGATION = GOOD_FEATURES.concat(HAZARDS);

  // Net feature score → % modifier for the Flexa rate (positive capped at 50).
  function mitigationModifierPct() {
    var score = 0;
    ALL_MITIGATION.forEach(function (m) { if (formData.mitigation[m.key] === 'Yes') { score += m.points; } });
    return Math.min(score, 50);
  }

  // Ordered data steps (after the contact step). Used for advancing + reset-on-edit.
  var ORDER = ['frStep2', 'frStep3', 'frStep4', 'frStep5', 'frStep6', 'frStep7'];
  var RENDERERS = {
    frStep2: renderLocation,
    frStep3: renderOccupancy,
    frStep4: renderAssets,
    frStep5: renderMitigation,
    frStep6: renderHypothecation,
    frStep7: renderDetails
  };
  var OWNS = {
    frStep2: ['address', 'pincode', 'eqZone'],
    frStep3: ['occupancyCode', 'occupancyLabel', 'buildingType'],
    frStep4: ['assets', 'totalSI'],
    frStep5: ['mitigation'],
    frStep6: ['hypothecation', 'financier'],
    frStep7: ['details', 'quote']
  };

  var restartBtn = document.getElementById('frRestart');

  function isCalculable() { return !!fireOccupancyRates[formData.occupancyCode]; }

  // ---- reveal / collapse helpers ----
  function reveal(node) {
    node.classList.remove('hidden');
    node.classList.add('fr-enter');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { node.classList.remove('fr-enter'); });
    });
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function complete(container, label, value) {
    var summary = container.querySelector('.fr-step-summary');
    summary.textContent = '';
    summary.appendChild(el('span', 'fr-check', '✓'));
    var body = el('div', 'fr-summary-body');
    body.appendChild(el('div', 'fr-summary-label', label));
    body.appendChild(el('div', 'fr-summary-value', value));
    summary.appendChild(body);
    var edit = el('button', 'fr-edit', 'Edit');
    edit.type = 'button';
    edit.addEventListener('click', function () { editStep(container.id); });
    summary.appendChild(edit);
    container.classList.add('completed-step');
  }

  function editStep(id) {
    var idx = ORDER.indexOf(id);
    if (idx < 0) return;
    for (var i = ORDER.length - 1; i > idx; i--) {
      var later = document.getElementById(ORDER[i]);
      later.classList.add('hidden');
      later.classList.remove('completed-step');
      (OWNS[ORDER[i]] || []).forEach(function (k) {
        formData[k] = Array.isArray(formData[k]) ? [] : (typeof formData[k] === 'object' ? {} : (k === 'quote' ? null : ''));
      });
    }
    document.getElementById('frQuote').classList.add('hidden');
    formData.quote = null;
    document.getElementById('frDone').classList.add('hidden');
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

  function activeOf(container) { return container.querySelector('.fr-step-active'); }
  function fieldError(err, msg) { err.hidden = false; err.textContent = msg; }

  // ===============================================================
  // STEP 1 — Contact details (name / phone / email)
  // ===============================================================
  var nameInput = document.getElementById('frName');
  var phoneInput = document.getElementById('frPhone');
  var emailInput = document.getElementById('frEmail');
  var contBtn = document.getElementById('frContinueBtn');
  var step1Err = document.getElementById('frErr');
  var step1 = document.getElementById('frStep1');

  var EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

  phoneInput.addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '').slice(0, 10);
  });

  contBtn.addEventListener('click', function () {
    var name = nameInput.value.trim();
    var phone = phoneInput.value.trim();
    var email = emailInput.value.trim();
    if (name.length < 2) { return fieldError(step1Err, 'Please enter your name.'); }
    if (!/^[0-9]{10}$/.test(phone)) { return fieldError(step1Err, 'Please enter a valid 10-digit mobile number.'); }
    if (!EMAIL_RE.test(email)) { return fieldError(step1Err, 'Please enter a valid email address, e.g. name@example.com.'); }
    step1Err.hidden = true;
    formData.name = name;
    formData.phone = phone;
    formData.email = email;
    restartBtn.classList.remove('hidden');
    complete(step1, 'Your details', name + ' · ' + phone);
    var firstId = ORDER[0];
    var first = document.getElementById(firstId);
    RENDERERS[firstId](first);
    reveal(first);
  });

  // ===============================================================
  // STEP 2 — Risk location (address + pincode + earthquake zone)
  // ===============================================================
  function renderLocation(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'fr-q', 'Where is the risk located?'));

    var loc = el('div', 'fr-loc');
    var addrField = el('div', '');
    addrField.appendChild(labelFor('frAddr', 'Risk location address'));
    var addr = document.createElement('textarea');
    addr.className = 'f'; addr.id = 'frAddr'; addr.rows = 3;
    addr.placeholder = 'Building / street / area / city';
    if (formData.address) addr.value = formData.address;
    addrField.appendChild(addr);

    var pinField = el('div', '');
    pinField.appendChild(labelFor('frPin', 'Pincode'));
    var pin = document.createElement('input');
    pin.className = 'f'; pin.id = 'frPin'; pin.type = 'text'; pin.inputMode = 'numeric'; pin.maxLength = 6;
    pin.placeholder = '6-digit pincode';
    if (formData.pincode) pin.value = formData.pincode;
    pin.addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 6); });
    pinField.appendChild(pin);

    var zoneField = el('div', '');
    zoneField.appendChild(labelFor('frEqZone', 'Earthquake zone'));
    var zone = document.createElement('select');
    zone.className = 'f'; zone.id = 'frEqZone';
    var zph = el('option', '', 'Select the earthquake zone…'); zph.value = ''; zone.appendChild(zph);
    EQ_ZONES.forEach(function (z) { var o = el('option', '', z); o.value = z; zone.appendChild(o); });
    if (formData.eqZone) zone.value = formData.eqZone;
    zone.classList.toggle('is-placeholder', !formData.eqZone);
    zone.addEventListener('change', function () { zone.classList.toggle('is-placeholder', !zone.value); err.hidden = true; });
    zoneField.appendChild(zone);
    zoneField.appendChild(el('p', 'fr-help', 'Your earthquake (seismic) zone — it sets the EQ portion of the premium. If unsure, Kevin can confirm it from the pincode.'));

    loc.appendChild(addrField);
    loc.appendChild(pinField);
    loc.appendChild(zoneField);
    active.appendChild(loc);

    var err = el('div', 'fr-error'); err.hidden = true; active.appendChild(err);

    var next = el('button', 'btn btn-primary fr-next', 'Next'); next.type = 'button';
    next.addEventListener('click', function () {
      var a = addr.value.trim(), p = pin.value.trim();
      if (a.length < 5) { return fieldError(err, 'Please enter the risk location address.'); }
      if (!/^[0-9]{6}$/.test(p)) { return fieldError(err, 'Please enter a valid 6-digit pincode.'); }
      if (!zone.value) { return fieldError(err, 'Please select the earthquake zone.'); }
      err.hidden = true;
      formData.address = a;
      formData.pincode = p;
      formData.eqZone = zone.value;
      complete(container, 'Risk location', 'Pincode ' + p + ' · ' + zone.value + ' · ' + truncate(a, 30));
      advanceFrom(container.id);
    });
    active.appendChild(next);
  }

  // ===============================================================
  // STEP 3 — Nature of occupancy (dropdown → IIB code) + building type
  // ===============================================================
  function renderOccupancy(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'fr-q', 'What is the primary nature of occupancy?'));

    var sel = document.createElement('select');
    sel.className = 'f'; sel.id = 'frOcc';
    var ph = el('option', '', 'Select the closest occupancy…'); ph.value = ''; sel.appendChild(ph);
    Object.keys(fireOccupancyRates).forEach(function (code) {
      var o = el('option', '', fireOccupancyRates[code].label); o.value = code; sel.appendChild(o);
    });
    var other = el('option', '', 'Other / not listed here'); other.value = 'other'; sel.appendChild(other);
    if (formData.occupancyCode) sel.value = formData.occupancyCode;
    active.appendChild(sel);
    active.appendChild(el('p', 'fr-help', 'Occupancy refers to how the premises are used or what is stored there. Pick the closest match to get an indicative premium, or “Other” to describe it and Kevin will rate it for you.'));

    // Free-text description, revealed only when "Other" is chosen.
    var otherWrap = el('div', 'fr-occ-other hidden');
    otherWrap.appendChild(labelFor('frOccOther', 'Describe the occupancy / business activity'));
    var ta = document.createElement('textarea');
    ta.className = 'f'; ta.id = 'frOccOther'; ta.rows = 3;
    ta.placeholder = 'e.g. Steel manufacturing factory, cold storage, textile warehouse';
    if (formData.occupancyCode === 'other' && formData.occupancyLabel) ta.value = formData.occupancyLabel;
    otherWrap.appendChild(ta);
    active.appendChild(otherWrap);

    // Building type — Pucca / Kutcha.
    active.appendChild(el('label', 'fr-sub', 'Building type'));
    var btPills = el('div', 'fr-pills');
    BUILDING_TYPES.forEach(function (bt) {
      var pill = el('label', 'fr-pill' + (formData.buildingType === bt ? ' on' : ''));
      var radio = document.createElement('input');
      radio.type = 'radio'; radio.name = 'frBuilding'; radio.value = bt;
      radio.checked = formData.buildingType === bt;
      radio.addEventListener('change', function () {
        formData.buildingType = bt;
        btPills.querySelectorAll('.fr-pill').forEach(function (p) { p.classList.toggle('on', p === pill); });
        err.hidden = true;
      });
      pill.appendChild(radio);
      pill.appendChild(el('span', '', bt));
      btPills.appendChild(pill);
    });
    active.appendChild(btPills);

    var err = el('div', 'fr-error'); err.hidden = true; active.appendChild(err);

    var next = el('button', 'btn btn-primary fr-next', 'Next'); next.type = 'button';

    function syncUi() {
      otherWrap.classList.toggle('hidden', sel.value !== 'other');
      sel.classList.toggle('is-placeholder', sel.value === '');
    }
    sel.addEventListener('change', function () { syncUi(); err.hidden = true; });
    syncUi();

    next.addEventListener('click', function () {
      var code = sel.value;
      if (!code) { return fieldError(err, 'Please select the nature of occupancy.'); }
      var label;
      if (code === 'other') {
        var v = ta.value.trim();
        if (v.length < 3) { return fieldError(err, 'Please describe the nature of occupancy.'); }
        label = v;
      } else {
        label = fireOccupancyRates[code].label;
      }
      if (!formData.buildingType) { return fieldError(err, 'Please select the building type.'); }
      err.hidden = true;
      formData.occupancyCode = code;
      formData.occupancyLabel = label;
      complete(container, 'Occupancy', truncate(label, 40) + ' · ' + formData.buildingType + (code !== 'other' ? ' · IIB ' + code : ''));
      advanceFrom(container.id);
    });
    active.appendChild(next);
  }

  // ===============================================================
  // STEP 4 — Asset description & sum insured (live calculator)
  // ===============================================================
  function renderAssets(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'fr-q', 'Asset description & sum insured'));

    var wrap = el('div', 'fr-assets');
    var totalAmt = el('span', 'fr-total-amt', inr(0));

    function recompute() {
      var total = 0;
      wrap.querySelectorAll('input').forEach(function (inp) { total += parseInt(inp.value, 10) || 0; });
      totalAmt.textContent = inr(total);
      return total;
    }

    ASSETS.forEach(function (a) {
      var row = el('div', 'fr-asset-row');
      var id = 'frA_' + a.key;
      var lab = el('label', '', a.label); lab.setAttribute('for', id);
      var amt = el('div', 'fr-amt');
      amt.appendChild(el('span', 'fr-rupee', '₹'));
      var inp = document.createElement('input');
      inp.className = 'f'; inp.type = 'text'; inp.inputMode = 'numeric'; inp.id = id; inp.dataset.key = a.key;
      inp.placeholder = '0';
      if (formData.assets[a.key]) inp.value = String(formData.assets[a.key]);
      inp.addEventListener('input', function () {
        this.value = this.value.replace(/\D/g, '').slice(0, 12);
        recompute();
      });
      amt.appendChild(inp);
      row.appendChild(lab);
      row.appendChild(amt);
      wrap.appendChild(row);
    });
    active.appendChild(wrap);

    var total = el('div', 'fr-total');
    total.appendChild(el('span', '', 'Total Sum Insured'));
    total.appendChild(totalAmt);
    active.appendChild(total);
    recompute();

    var err = el('div', 'fr-error'); err.hidden = true; active.appendChild(err);

    var next = el('button', 'btn btn-primary fr-next', 'Next'); next.type = 'button';
    next.addEventListener('click', function () {
      var assets = {}, sum = 0;
      wrap.querySelectorAll('input').forEach(function (inp) {
        var v = parseInt(inp.value, 10) || 0;
        assets[inp.dataset.key] = v;
        sum += v;
      });
      if (sum <= 0) { return fieldError(err, 'Please enter a value for at least one asset.'); }
      err.hidden = true;
      formData.assets = assets;
      formData.totalSI = sum;
      complete(container, 'Total Sum Insured', inr(sum));
      advanceFrom(container.id);
    });
    active.appendChild(next);
  }

  // ===============================================================
  // STEP 5 — Risk mitigation / safety features (good-feature discount)
  // ===============================================================
  function renderMitigation(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'fr-q', 'Risk features & hazards'));
    active.appendChild(el('p', 'fr-help', 'Good features cut the fire portion of the premium (up to 50%); hazards add a loading. Anything left unanswered counts as “No”.'));

    // Build a Yes/No pill grid for a list of features/hazards.
    function buildGrid(list) {
      var grid = el('div', 'fr-mit');
      list.forEach(function (m) {
        var row = el('div', 'fr-mit-row');
        row.appendChild(el('div', 'fr-mit-q', m.q));
        var pills = el('div', 'fr-mit-pills');
        ['Yes', 'No'].forEach(function (val) {
          var pill = el('label', 'fr-mini-pill' + (formData.mitigation[m.key] === val ? ' on' : ''));
          var radio = document.createElement('input');
          radio.type = 'radio'; radio.name = 'frMit_' + m.key; radio.value = val;
          radio.checked = formData.mitigation[m.key] === val;
          radio.addEventListener('change', function () {
            formData.mitigation[m.key] = val;
            pills.querySelectorAll('.fr-mini-pill').forEach(function (p) { p.classList.toggle('on', p === pill); });
          });
          pill.appendChild(radio);
          pill.appendChild(el('span', '', val));
          pills.appendChild(pill);
        });
        row.appendChild(pills);
        grid.appendChild(row);
      });
      return grid;
    }

    active.appendChild(el('label', 'fr-sub', 'Good features (reduce premium)'));
    active.appendChild(buildGrid(GOOD_FEATURES));
    active.appendChild(el('label', 'fr-sub', 'Hazards (add loading)'));
    active.appendChild(buildGrid(HAZARDS));

    var next = el('button', 'btn btn-primary fr-next', 'Next'); next.type = 'button';
    next.addEventListener('click', function () {
      // Unanswered features/hazards count as "No" for scoring.
      var goodYes = GOOD_FEATURES.filter(function (m) { return formData.mitigation[m.key] === 'Yes'; }).length;
      var hazYes = HAZARDS.filter(function (m) { return formData.mitigation[m.key] === 'Yes'; }).length;
      var pct = mitigationModifierPct();
      var modTxt = pct > 0 ? ('−' + pct + '% fire rate') : (pct < 0 ? ('+' + Math.abs(pct) + '% loading') : 'no change');
      complete(container, 'Risk features', goodYes + ' good · ' + hazYes + ' hazards · ' + modTxt);
      advanceFrom(container.id);
    });
    active.appendChild(next);
  }

  // ===============================================================
  // STEP 6 — Hypothecation (bank finance)
  // ===============================================================
  function renderHypothecation(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'fr-q', 'Is the property financed / hypothecated to a bank or institution?'));

    var pills = el('div', 'fr-pills');
    var financierWrap = el('div', 'fr-financier hidden');
    financierWrap.appendChild(labelFor('frFin', 'Name of the financier (bank / institution)'));
    var fin = document.createElement('input');
    fin.className = 'f'; fin.id = 'frFin'; fin.placeholder = 'e.g. HDFC Bank';
    if (formData.financier) fin.value = formData.financier;
    financierWrap.appendChild(fin);

    var err = el('div', 'fr-error'); err.hidden = true;
    var nextBtn = el('button', 'btn btn-primary fr-next hidden', 'Next'); nextBtn.type = 'button';

    function makePill(val) {
      var pill = el('label', 'fr-pill' + (formData.hypothecation === val ? ' on' : ''));
      var radio = document.createElement('input');
      radio.type = 'radio'; radio.name = 'frHyp'; radio.value = val;
      radio.checked = formData.hypothecation === val;
      radio.addEventListener('change', function () {
        formData.hypothecation = val;
        pills.querySelectorAll('.fr-pill').forEach(function (p) { p.classList.toggle('on', p === pill); });
        if (val === 'Yes') {
          financierWrap.classList.remove('hidden');
          nextBtn.classList.remove('hidden');
          fin.focus();
        } else {
          financierWrap.classList.add('hidden');
          formData.financier = '';
          err.hidden = true;
          complete(container, 'Hypothecation', 'No');
          advanceFrom(container.id);
        }
      });
      pill.appendChild(radio);
      pill.appendChild(el('span', '', val));
      return pill;
    }
    pills.appendChild(makePill('Yes'));
    pills.appendChild(makePill('No'));
    active.appendChild(pills);
    active.appendChild(financierWrap);
    active.appendChild(err);

    nextBtn.addEventListener('click', function () {
      if (formData.hypothecation !== 'Yes') { return; }
      var f = fin.value.trim();
      if (!f) { return fieldError(err, 'Please enter the name of the financier.'); }
      err.hidden = true;
      formData.financier = f;
      complete(container, 'Hypothecation', 'Yes — ' + f);
      advanceFrom(container.id);
    });
    active.appendChild(nextBtn);

    if (formData.hypothecation === 'Yes') {
      financierWrap.classList.remove('hidden');
      nextBtn.classList.remove('hidden');
    }
  }

  // ===============================================================
  // STEP 7 — Additional risk details → Calculate Quote / Submit
  // ===============================================================
  function renderDetails(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'fr-q', 'Anything specific I need to know regarding the risk or the risk location?'));
    var ta = document.createElement('textarea');
    ta.className = 'f'; ta.id = 'frDetails'; ta.rows = 4;
    ta.placeholder = 'Optional — any additional details about the risk';
    if (formData.details) ta.value = formData.details;
    active.appendChild(ta);

    var err = el('div', 'fr-error'); err.hidden = true; active.appendChild(err);

    var calc = isCalculable();
    var btn = el('button', 'btn btn-primary fr-next', calc ? 'Calculate Quote' : 'Submit for Quote'); btn.type = 'button';
    btn.addEventListener('click', function () {
      formData.details = ta.value.trim();
      complete(container, 'Risk details', formData.details ? truncate(formData.details, 50) : 'None');
      if (calc) {
        formData.quote = calculateFirePremium();
        renderQuote();
      } else {
        formData.quote = null;
        sendEnquiry(btn, err);
      }
    });
    active.appendChild(btn);
  }

  // ===============================================================
  // The maths engine — Sukshma/BSUS SPLIT-rate fire rating.
  // The good-feature discount applies ONLY to the Flexa (fire) rate; STFI, EQ and
  // terrorism are untouched, then the four are re-aggregated into the net rate.
  // ===============================================================
  function calculateFirePremium() {
    var occ = fireOccupancyRates[formData.occupancyCode];
    if (!occ) { return null; }

    // Kutcha construction loads the fire (Flexa) rate before any modifier.
    var flexaRate = occ.baseFlexa + (formData.buildingType === 'Kutcha' ? KUTCHA_FLEXA_LOADING : 0);

    // Earthquake rate is driven by the seismic zone, then scaled by the
    // occupancy's risk category (cat 1/2 discount the EQ rate, 3/4 load it).
    var baseEQ = EQ_ZONE_RATES[formData.eqZone] || 0;
    var eqFactor = RISK_CATEGORY_EQ_FACTOR[occ.riskCategory];
    var adjustedEQ = baseEQ * (eqFactor != null ? eqFactor : 1);

    // Net feature modifier (good features − hazards), positive capped at 50%.
    var modifierPct = mitigationModifierPct();

    // Apply the modifier to the Flexa rate ONLY (post Kutcha loading), then
    // re-aggregate. A negative modifier acts as a loading: 1 − (−x/100) = 1 + x/100.
    var modifiedFlexa = flexaRate * (1 - modifierPct / 100);
    var netRate = modifiedFlexa + occ.baseSTFI + adjustedEQ + occ.baseTerrorism;

    // Round to 2 dp BEFORE the ceil so binary-float noise (e.g. 2.03 landing at
    // 2.0300000000000002) can't nudge a whole-rupee premium up by ₹1.
    function ceil2(n) { return Math.ceil(Math.round(n * 100) / 100); }
    var basePremium = ceil2((formData.totalSI * netRate) / 1000);
    var gstAmount = ceil2(basePremium * GST_RATE);
    var finalPremium = basePremium + gstAmount;

    ga('calculate_premium', {
      insurer: 'New_India_Assurance', product: 'Fire_Sukshma',
      occupancy_code: formData.occupancyCode, sum_insured: formData.totalSI,
      building_type: formData.buildingType, eq_zone: formData.eqZone,
      modifier_pct: modifierPct, value: finalPremium, currency: 'INR'
    });

    return {
      baseFlexa: occ.baseFlexa, flexaRate: flexaRate, modifiedFlexa: modifiedFlexa,
      kutchaLoaded: formData.buildingType === 'Kutcha',
      baseEQ: baseEQ, adjustedEQ: adjustedEQ, modifierPct: modifierPct,
      netRate: netRate, basePremium: basePremium, gstAmount: gstAmount, finalPremium: finalPremium
    };
  }

  // ===============================================================
  // Quote receipt (Step 7 result) → "Submit Request to Agent"
  // ===============================================================
  function renderQuote() {
    var q = formData.quote;
    var panel = document.getElementById('frQuote');
    panel.textContent = '';

    var head = el('div', 'fr-quote-head');
    head.appendChild(el('span', 'eyebrow', 'Indicative premium'));
    head.appendChild(el('h3', '', 'Your estimated fire premium'));
    panel.appendChild(head);

    var receipt = el('dl', 'fr-receipt');
    function row(label, value, cls) {
      var r = el('div', 'fr-receipt-row' + (cls ? ' ' + cls : ''));
      r.appendChild(el('dt', '', label));
      r.appendChild(el('dd', '', value));
      receipt.appendChild(r);
    }
    row('Occupancy', truncate(formData.occupancyLabel, 30));
    row('Building type', formData.buildingType + (q.kutchaLoaded ? ' (fire-rate loaded)' : ''));
    row('Earthquake zone', formData.eqZone);
    row('Total Sum Insured', inr(formData.totalSI));
    if (q.kutchaLoaded) { row('Kutcha construction loading', '+' + KUTCHA_FLEXA_LOADING.toFixed(2) + '‰ on fire rate', 'loading'); }
    row('Net rate', (Math.round(q.netRate * 1000) / 1000) + ' ‰ (per ₹1,000)');
    if (q.modifierPct > 0) { row('Good-feature discount (on fire rate)', '−' + q.modifierPct + '%', 'discount'); }
    else if (q.modifierPct < 0) { row('Hazard loading (on fire rate)', '+' + Math.abs(q.modifierPct) + '%', 'loading'); }
    row('Base premium', inr(q.basePremium));
    row('GST (18%)', inr(q.gstAmount));
    panel.appendChild(receipt);

    var finalWrap = el('dl', 'fr-receipt-final');
    finalWrap.appendChild(el('dt', '', 'Final payable premium'));
    finalWrap.appendChild(el('dd', '', inr(q.finalPremium)));
    panel.appendChild(finalWrap);

    panel.appendChild(el('p', 'fr-disclaimer', 'This is an indicative premium. Final premium is subject to underwriting and applicable GST.'));

    var err = el('div', 'fr-error'); err.hidden = true; panel.appendChild(err);

    var submit = el('button', 'btn btn-primary', 'Submit Request to Agent'); submit.type = 'button';
    submit.addEventListener('click', function () { sendEnquiry(submit, err); });
    panel.appendChild(submit);

    reveal(panel);
  }

  // ===============================================================
  // Submit — send to Kevin server-side, then confirm
  // ===============================================================
  var WA_NUM = '918369988285';

  // Google Apps Script web-app URL that receives enquiries and emails them to
  // Kevin (shared with the main site enquiry form). Property enquiries send no
  // age; the endpoint treats age as optional.
  var ENQUIRY_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzFBqQZCBJ7trrzwTFUq6aOwlXslRdXMyrcTE-QuPB_QYQIbimvnJ4ZCzgyNM9qBuQCXw/exec';

  function mitigationSummary() {
    function yesList(list) {
      return list.filter(function (m) { return formData.mitigation[m.key] === 'Yes'; }).map(function (m) { return m.q; });
    }
    var good = yesList(GOOD_FEATURES), haz = yesList(HAZARDS);
    return 'Good features — ' + (good.join('; ') || 'none') + ' || Hazards — ' + (haz.join('; ') || 'none');
  }

  function sendEnquiry(submit, err) {
    var assetParts = [];
    ASSETS.forEach(function (a) {
      var v = formData.assets[a.key] || 0;
      if (v > 0) assetParts.push(a.label + ': ' + inr(v));
    });
    var q = formData.quote;
    // The endpoint emails a fixed set of fields, so the property answers are
    // packed into the "products" line (one line — the endpoint strips breaks).
    var products = 'Fire & Property cover'
      + ' | Occupancy: ' + formData.occupancyLabel + (formData.occupancyCode !== 'other' ? ' (IIB ' + formData.occupancyCode + ')' : '')
      + ' | Building type: ' + (formData.buildingType || 'n/a')
      + ' | Location: ' + formData.address + ' (Pincode ' + formData.pincode + ', ' + formData.eqZone + ')'
      + ' | Total Sum Insured: ' + inr(formData.totalSI)
      + ' | Assets: ' + (assetParts.join('; ') || 'n/a')
      + ' | Risk features: ' + mitigationSummary()
      + ' | Hypothecation: ' + (formData.hypothecation === 'Yes' ? ('Yes — ' + formData.financier) : 'No')
      + (q ? ' | Indicative premium: Net rate ' + (Math.round(q.netRate * 1000) / 1000) + '‰, fire-rate ' + (q.modifierPct >= 0 ? 'discount ' + q.modifierPct + '%' : 'loading ' + Math.abs(q.modifierPct) + '%') + ', base ' + inr(q.basePremium) + ', GST ' + inr(q.gstAmount) + ', final ' + inr(q.finalPremium) : ' | Indicative premium: not calculated (occupancy off rate chart)')
      + ' | Additional details: ' + (formData.details || 'None');

    var data = new FormData();
    data.append('name', formData.name);
    data.append('email', formData.email);
    data.append('mobile', formData.phone);
    data.append('products', products);
    data.append('botcheck', '');

    submit.disabled = true;
    var originalText = submit.textContent;
    submit.textContent = 'Sending…';

    console.log('Fire & property enquiry captured:\n' + JSON.stringify(formData, null, 2));

    fetch(ENQUIRY_ENDPOINT, { method: 'POST', body: data, mode: 'no-cors' })
      .then(function () {
        ga('generate_lead', { form_name: 'Fire_Property', currency: 'INR', value: q ? q.finalPremium : 1 });
        showDone();
      })
      .catch(function () {
        submit.disabled = false;
        submit.textContent = originalText;
        err.hidden = false;
        err.textContent = "Couldn't send your enquiry — please check your connection and try again.";
      });
  }

  function showDone() {
    var done = document.getElementById('frDone');
    done.textContent = '';
    done.appendChild(el('div', 'fr-done-icon', '✓'));
    done.appendChild(el('h3', '', 'Enquiry sent!'));
    done.appendChild(el('p', '', 'Thanks ' + formData.name + ' — your property details have been submitted for review. Kevin will be in touch shortly.'));

    var recap = el('dl', 'fr-recap');
    function row(label, value) {
      var r = el('div', 'fr-recap-row');
      r.appendChild(el('dt', '', label));
      r.appendChild(el('dd', '', value));
      recap.appendChild(r);
    }
    row('Name', formData.name);
    row('Contact', formData.phone + ' · ' + formData.email);
    row('Risk location', 'Pincode ' + formData.pincode + ' · ' + formData.eqZone);
    row('Occupancy', truncate(formData.occupancyLabel, 40) + ' · ' + (formData.buildingType || ''));
    row('Total Sum Insured', inr(formData.totalSI));
    if (formData.quote) { row('Indicative premium', inr(formData.quote.finalPremium) + ' (incl. GST)'); }
    row('Hypothecation', formData.hypothecation === 'Yes' ? ('Yes — ' + formData.financier) : 'No');
    done.appendChild(recap);

    var wa = el('a', 'btn btn-primary', 'Message Kevin on WhatsApp');
    wa.href = 'https://wa.me/' + WA_NUM + '?text='
      + encodeURIComponent('Hi Kevin! I just sent a fire & property cover enquiry through the website'
        + (formData.quote ? ' (indicative premium ' + inr(formData.quote.finalPremium) + ').' : '.'));
    wa.target = '_blank';
    wa.rel = 'noopener';
    done.appendChild(wa);

    reveal(done);
  }

  // ===============================================================
  // Footer links + start over
  // ===============================================================
  var footWa = document.getElementById('footWa');
  var footMail = document.getElementById('footMail');
  if (footWa) { footWa.href = 'https://wa.me/' + WA_NUM + '?text=' + encodeURIComponent("Hi Kevin! I'd like some help with insurance."); }
  if (footMail) { footMail.href = 'mailto:admin@insureitwithkevin.in'; }

  restartBtn.addEventListener('click', function () {
    formData = freshData();
    ORDER.forEach(function (id) {
      var c = document.getElementById(id);
      c.classList.add('hidden');
      c.classList.remove('completed-step');
      activeOf(c).textContent = '';
      c.querySelector('.fr-step-summary').textContent = '';
    });
    document.getElementById('frQuote').classList.add('hidden');
    document.getElementById('frDone').classList.add('hidden');
    step1.classList.remove('completed-step');
    nameInput.value = '';
    phoneInput.value = '';
    emailInput.value = '';
    step1Err.hidden = true;
    restartBtn.classList.add('hidden');
    step1.scrollIntoView({ behavior: 'smooth', block: 'center' });
    nameInput.focus();
  });
})();
