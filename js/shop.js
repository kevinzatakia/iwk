/* Shop fire insurance progressive enquiry — vanilla-JS wizard on shop.html.
   Asks contact details, then steps through the shop location, nature of occupancy,
   an asset-by-asset sum-insured calculator (live total), bank hypothecation and
   any extra risk notes. Each answer locks with a green check and fades in the next
   question; completed steps stay visible (greyed/minimised) and can be edited. On
   submit the whole formData object is logged as JSON and sent to Kevin
   server-side (shared enquiry endpoint). */
(function () {
  var wizard = document.getElementById('shWizard');
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
    { key: 'building', label: 'Building including plinth' },
    { key: 'stock', label: 'Sum insured of the stock' },
    { key: 'furniture', label: 'Furniture & fixtures, fittings and other equipment' },
    { key: 'signs', label: 'Neon and glow signs' },
    { key: 'electronics', label: 'Electronic equipments (total value)', note: '(You can list the specific electronic items in the final step.)' }
  ];

  // Ordered data steps (after the contact step). Used for advancing + reset-on-edit.
  var ORDER = ['shStep2', 'shStep3', 'shStep4', 'shStep5', 'shStep6'];
  var RENDERERS = {
    shStep2: renderLocation,
    shStep3: renderOccupancy,
    shStep4: renderAssets,
    shStep5: renderHypothecation,
    shStep6: renderDetails
  };
  var OWNS = {
    shStep2: ['address', 'pincode'],
    shStep3: ['occupancy'],
    shStep4: ['assets', 'totalSI'],
    shStep5: ['hypothecation', 'financier'],
    shStep6: ['details']
  };

  var restartBtn = document.getElementById('shRestart');

  // ---- reveal / collapse helpers ----
  function reveal(node) {
    node.classList.remove('hidden');
    node.classList.add('sh-enter');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { node.classList.remove('sh-enter'); });
    });
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function complete(container, label, value) {
    var summary = container.querySelector('.sh-step-summary');
    summary.textContent = '';
    summary.appendChild(el('span', 'sh-check', '✓'));
    var body = el('div', 'sh-summary-body');
    body.appendChild(el('div', 'sh-summary-label', label));
    body.appendChild(el('div', 'sh-summary-value', value));
    summary.appendChild(body);
    var edit = el('button', 'sh-edit', 'Edit');
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
    document.getElementById('shDone').classList.add('hidden');
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

  function activeOf(container) { return container.querySelector('.sh-step-active'); }
  function fieldError(err, msg) { err.hidden = false; err.textContent = msg; }

  // ===============================================================
  // STEP 1 — Contact details (name / phone / email)
  // ===============================================================
  var nameInput = document.getElementById('shName');
  var phoneInput = document.getElementById('shPhone');
  var emailInput = document.getElementById('shEmail');
  var contBtn = document.getElementById('shContinueBtn');
  var step1Err = document.getElementById('shErr');
  var step1 = document.getElementById('shStep1');

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
    active.appendChild(el('label', 'sh-q', 'Where is your shop located?'));

    var loc = el('div', 'sh-loc');
    var addrField = el('div', '');
    addrField.appendChild(labelFor('shAddr', 'Shop address'));
    var addr = document.createElement('textarea');
    addr.className = 'f'; addr.id = 'shAddr'; addr.rows = 3;
    addr.placeholder = 'Shop name / street / area / city';
    if (formData.address) addr.value = formData.address;
    addrField.appendChild(addr);

    var pinField = el('div', '');
    pinField.appendChild(labelFor('shPin', 'Pincode'));
    var pin = document.createElement('input');
    pin.className = 'f'; pin.id = 'shPin'; pin.type = 'text'; pin.inputMode = 'numeric'; pin.maxLength = 6;
    pin.placeholder = '6-digit pincode';
    if (formData.pincode) pin.value = formData.pincode;
    pin.addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 6); });
    pinField.appendChild(pin);

    loc.appendChild(addrField);
    loc.appendChild(pinField);
    active.appendChild(loc);

    var err = el('div', 'sh-error'); err.hidden = true; active.appendChild(err);

    var next = el('button', 'btn btn-primary sh-next', 'Next'); next.type = 'button';
    next.addEventListener('click', function () {
      var a = addr.value.trim(), p = pin.value.trim();
      if (a.length < 5) { return fieldError(err, 'Please enter your shop address.'); }
      if (!/^[0-9]{6}$/.test(p)) { return fieldError(err, 'Please enter a valid 6-digit pincode.'); }
      err.hidden = true;
      formData.address = a;
      formData.pincode = p;
      complete(container, 'Shop location', 'Pincode ' + p + ' · ' + truncate(a, 40));
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
    active.appendChild(el('label', 'sh-q', 'What is the primary nature of business or occupancy of the shop?'));
    var ta = document.createElement('textarea');
    ta.className = 'f'; ta.id = 'shOcc'; ta.rows = 3;
    ta.placeholder = 'e.g. Pharmacy shop, stationery shop, grocery store';
    if (formData.occupancy) ta.value = formData.occupancy;
    active.appendChild(ta);
    active.appendChild(el('p', 'sh-help', 'Occupancy refers to the type of goods stored or business conducted at the location (e.g. Pharmacy Shop, Stationery Shop, Grocery Store).'));

    var err = el('div', 'sh-error'); err.hidden = true; active.appendChild(err);

    var next = el('button', 'btn btn-primary sh-next', 'Next'); next.type = 'button';
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
    active.appendChild(el('label', 'sh-q', 'Asset description & sum insured'));

    var wrap = el('div', 'sh-assets');
    var totalAmt = el('span', 'sh-total-amt', inr(0));

    function recompute() {
      var total = 0;
      wrap.querySelectorAll('input').forEach(function (inp) { total += parseInt(inp.value, 10) || 0; });
      totalAmt.textContent = inr(total);
      return total;
    }

    ASSETS.forEach(function (a) {
      var row = el('div', 'sh-asset-row');
      var id = 'shA_' + a.key;
      var lab = el('label', '', a.label); lab.setAttribute('for', id);
      var amt = el('div', 'sh-amt');
      amt.appendChild(el('span', 'sh-rupee', '₹'));
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
      // Optional helper note under a specific asset (e.g. electronics).
      if (a.note) { wrap.appendChild(el('p', 'sh-asset-note', a.note)); }
    });
    active.appendChild(wrap);

    var total = el('div', 'sh-total');
    total.appendChild(el('span', '', 'Total Sum Insured'));
    total.appendChild(totalAmt);
    active.appendChild(total);
    recompute();

    var err = el('div', 'sh-error'); err.hidden = true; active.appendChild(err);

    var next = el('button', 'btn btn-primary sh-next', 'Next'); next.type = 'button';
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
    active.appendChild(el('label', 'sh-q', 'Is the shop financed / hypothecated to a bank or institution?'));

    var pills = el('div', 'sh-pills');
    var financierWrap = el('div', 'sh-financier hidden');
    financierWrap.appendChild(labelFor('shFin', 'Name of the financier (bank / institution)'));
    var fin = document.createElement('input');
    fin.className = 'f'; fin.id = 'shFin'; fin.placeholder = 'e.g. HDFC Bank';
    if (formData.financier) fin.value = formData.financier;
    financierWrap.appendChild(fin);

    var err = el('div', 'sh-error'); err.hidden = true;
    var nextBtn = el('button', 'btn btn-primary sh-next hidden', 'Next'); nextBtn.type = 'button';

    function makePill(val) {
      var pill = el('label', 'sh-pill' + (formData.hypothecation === val ? ' on' : ''));
      var radio = document.createElement('input');
      radio.type = 'radio'; radio.name = 'shHyp'; radio.value = val;
      radio.checked = formData.hypothecation === val;
      radio.addEventListener('change', function () {
        formData.hypothecation = val;
        pills.querySelectorAll('.sh-pill').forEach(function (p) { p.classList.toggle('on', p === pill); });
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
    active.appendChild(el('label', 'sh-q', 'Anything specific I need to know regarding the risk, location, or a list of specific electronic equipments?'));
    var ta = document.createElement('textarea');
    ta.className = 'f'; ta.id = 'shDetails'; ta.rows = 4;
    ta.placeholder = 'Optional — additional risk details, or a list of specific electronic items';
    if (formData.details) ta.value = formData.details;
    active.appendChild(ta);

    var err = el('div', 'sh-error'); err.hidden = true; active.appendChild(err);

    var submit = el('button', 'btn btn-primary sh-next', 'Submit for Quote'); submit.type = 'button';
    submit.addEventListener('click', function () {
      formData.details = ta.value.trim();
      console.log('Shop fire enquiry captured:\n' + JSON.stringify(formData, null, 2));
      sendEnquiry(submit, err, container);
    });
    active.appendChild(submit);
  }

  // ===============================================================
  // Submit — send to Kevin server-side, then confirm
  // ===============================================================
  var WA_NUM = '918369988285';

  // Google Apps Script web-app URL that receives enquiries and emails them to
  // Kevin (shared with the main site enquiry form). Shop enquiries send no
  // age; the endpoint treats age as optional.
  var ENQUIRY_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxXTjDanx0ZdZExoP3-arcDQo0Wb9EbsZ6_BrDjuYIQxAcyRP42a8KkEHhhiEFg7pys6Q/exec';

  function sendEnquiry(submit, err, container) {
    var assetParts = [];
    ASSETS.forEach(function (a) {
      var v = formData.assets[a.key] || 0;
      if (v > 0) assetParts.push(a.label + ': ' + inr(v));
    });
    // The endpoint emails a fixed set of fields, so the shop answers are
    // packed into the "products" line (one line — the endpoint strips breaks).
    var products = 'Shop Fire cover'
      + ' | Shop location: ' + formData.address + ' (Pincode ' + formData.pincode + ')'
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
    var done = document.getElementById('shDone');
    done.textContent = '';
    done.appendChild(el('div', 'sh-done-icon', '✓'));
    done.appendChild(el('h3', '', 'Enquiry sent!'));
    done.appendChild(el('p', '', 'Thanks ' + formData.name + ' — your shop details have been submitted for review. Kevin will be in touch shortly.'));

    var recap = el('dl', 'sh-recap');
    function row(label, value) {
      var r = el('div', 'sh-recap-row');
      r.appendChild(el('dt', '', label));
      r.appendChild(el('dd', '', value));
      recap.appendChild(r);
    }
    row('Name', formData.name);
    row('Contact', formData.phone + ' · ' + formData.email);
    row('Shop location', 'Pincode ' + formData.pincode);
    row('Occupancy', truncate(formData.occupancy, 40));
    row('Total Sum Insured', inr(formData.totalSI));
    row('Hypothecation', formData.hypothecation === 'Yes' ? ('Yes — ' + formData.financier) : 'No');
    done.appendChild(recap);

    var wa = el('a', 'btn btn-primary', 'Message Kevin on WhatsApp');
    wa.href = 'https://wa.me/' + WA_NUM + '?text='
      + encodeURIComponent('Hi Kevin! I just sent a shop insurance enquiry through the website.');
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
      c.querySelector('.sh-step-summary').textContent = '';
    });
    document.getElementById('shDone').classList.add('hidden');
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
