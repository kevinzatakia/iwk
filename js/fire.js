/* Fire & property insurance progressive enquiry — vanilla-JS wizard on fire.html.
   Asks contact details, then steps through the risk location, nature of occupancy,
   an asset-by-asset sum-insured calculator (live total), bank hypothecation and
   any extra risk notes. Each answer locks with a green check and fades in the next
   question; completed steps stay visible (greyed/minimised) and can be edited. On
   submit the whole formData object is logged as JSON and sent to Kevin
   server-side (shared enquiry endpoint). */
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

  // ---- state ----
  var formData = {
    name: '',
    email: '',
    phone: '',
    address: '',
    pincode: '',
    occupancy: '',
    assets: {},        // { building: 500000, plant: 0, ... }
    totalSI: 0,
    hypothecation: null,
    financier: '',
    details: ''
  };

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

  // Ordered data steps (after the contact step). Used for advancing + reset-on-edit.
  var ORDER = ['frStep2', 'frStep3', 'frStep4', 'frStep5', 'frStep6'];
  var RENDERERS = {
    frStep2: renderLocation,
    frStep3: renderOccupancy,
    frStep4: renderAssets,
    frStep5: renderHypothecation,
    frStep6: renderDetails
  };
  var OWNS = {
    frStep2: ['address', 'pincode'],
    frStep3: ['occupancy'],
    frStep4: ['assets', 'totalSI'],
    frStep5: ['hypothecation', 'financier'],
    frStep6: ['details']
  };

  var restartBtn = document.getElementById('frRestart');

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
        formData[k] = Array.isArray(formData[k]) ? [] : (typeof formData[k] === 'object' ? {} : null);
      });
    }
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
  // STEP 2 — Risk location (address + pincode)
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

    loc.appendChild(addrField);
    loc.appendChild(pinField);
    active.appendChild(loc);

    var err = el('div', 'fr-error'); err.hidden = true; active.appendChild(err);

    var next = el('button', 'btn btn-primary fr-next', 'Next'); next.type = 'button';
    next.addEventListener('click', function () {
      var a = addr.value.trim(), p = pin.value.trim();
      if (a.length < 5) { return fieldError(err, 'Please enter the risk location address.'); }
      if (!/^[0-9]{6}$/.test(p)) { return fieldError(err, 'Please enter a valid 6-digit pincode.'); }
      err.hidden = true;
      formData.address = a;
      formData.pincode = p;
      complete(container, 'Risk location', 'Pincode ' + p + ' · ' + truncate(a, 40));
      advanceFrom(container.id);
    });
    active.appendChild(next);
  }

  // ===============================================================
  // STEP 3 — Nature of occupancy
  // ===============================================================
  function renderOccupancy(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'fr-q', 'What is the primary nature of occupancy or business activity at this location?'));
    var ta = document.createElement('textarea');
    ta.className = 'f'; ta.id = 'frOcc'; ta.rows = 3;
    ta.placeholder = 'e.g. Residential building, steel manufacturing factory, warehouse';
    if (formData.occupancy) ta.value = formData.occupancy;
    active.appendChild(ta);
    active.appendChild(el('p', 'fr-help', 'Occupancy refers to how the premises are used or what is stored there (e.g. Residential Building, Steel Manufacturing Factory, Warehouse).'));

    var err = el('div', 'fr-error'); err.hidden = true; active.appendChild(err);

    var next = el('button', 'btn btn-primary fr-next', 'Next'); next.type = 'button';
    next.addEventListener('click', function () {
      var v = ta.value.trim();
      if (v.length < 3) { return fieldError(err, 'Please describe the nature of occupancy.'); }
      err.hidden = true;
      formData.occupancy = v;
      complete(container, 'Occupancy', truncate(v, 50));
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
  // STEP 5 — Hypothecation (bank finance)
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
          // "No" needs nothing more — auto-advance.
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

    // Re-editing with "Yes" previously chosen — show the financier field + Next.
    if (formData.hypothecation === 'Yes') {
      financierWrap.classList.remove('hidden');
      nextBtn.classList.remove('hidden');
    }
  }

  // ===============================================================
  // STEP 6 — Additional risk details (final submit)
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

    var submit = el('button', 'btn btn-primary fr-next', 'Submit for Quote'); submit.type = 'button';
    submit.addEventListener('click', function () {
      formData.details = ta.value.trim();
      console.log('Fire & property enquiry captured:\n' + JSON.stringify(formData, null, 2));
      sendEnquiry(submit, err, container);
    });
    active.appendChild(submit);
  }

  // ===============================================================
  // Submit — send to Kevin server-side, then confirm
  // ===============================================================
  var WA_NUM = '918369988285';

  // Google Apps Script web-app URL that receives enquiries and emails them to
  // Kevin (shared with the main site enquiry form). Property enquiries send no
  // age; the endpoint treats age as optional.
  var ENQUIRY_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxXTjDanx0ZdZExoP3-arcDQo0Wb9EbsZ6_BrDjuYIQxAcyRP42a8KkEHhhiEFg7pys6Q/exec';

  function sendEnquiry(submit, err, container) {
    var assetParts = [];
    ASSETS.forEach(function (a) {
      var v = formData.assets[a.key] || 0;
      if (v > 0) assetParts.push(a.label + ': ' + inr(v));
    });
    // The endpoint emails a fixed set of fields, so the property answers are
    // packed into the "products" line (one line — the endpoint strips breaks).
    var products = 'Fire & Property cover'
      + ' | Location: ' + formData.address + ' (Pincode ' + formData.pincode + ')'
      + ' | Occupancy: ' + formData.occupancy
      + ' | Total Sum Insured: ' + inr(formData.totalSI)
      + ' | Assets: ' + (assetParts.join('; ') || 'n/a')
      + ' | Hypothecation: ' + (formData.hypothecation === 'Yes' ? ('Yes — ' + formData.financier) : 'No')
      + ' | Additional details: ' + (formData.details || 'None');

    var data = new FormData();
    data.append('name', formData.name);
    data.append('email', formData.email);
    data.append('mobile', formData.phone);
    data.append('products', products);
    data.append('botcheck', '');

    submit.disabled = true;
    submit.textContent = 'Sending…';

    fetch(ENQUIRY_ENDPOINT, { method: 'POST', body: data, mode: 'no-cors' })
      .then(function () {
        complete(container, 'Risk details', formData.details ? truncate(formData.details, 50) : 'None');
        showDone();
      })
      .catch(function () {
        submit.disabled = false;
        submit.textContent = 'Submit for Quote';
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
    row('Risk location', 'Pincode ' + formData.pincode);
    row('Occupancy', truncate(formData.occupancy, 40));
    row('Total Sum Insured', inr(formData.totalSI));
    row('Hypothecation', formData.hypothecation === 'Yes' ? ('Yes — ' + formData.financier) : 'No');
    done.appendChild(recap);

    var wa = el('a', 'btn btn-primary', 'Message Kevin on WhatsApp');
    wa.href = 'https://wa.me/' + WA_NUM + '?text='
      + encodeURIComponent('Hi Kevin! I just sent a fire & property cover enquiry through the website.');
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
  if (footMail) { footMail.href = 'mailto:kevinzatakia10@gmail.com'; }

  restartBtn.addEventListener('click', function () {
    formData = { name: '', email: '', phone: '', address: '', pincode: '', occupancy: '', assets: {}, totalSI: 0, hypothecation: null, financier: '', details: '' };
    ORDER.forEach(function (id) {
      var c = document.getElementById(id);
      c.classList.add('hidden');
      c.classList.remove('completed-step');
      activeOf(c).textContent = '';
      c.querySelector('.fr-step-summary').textContent = '';
    });
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
