/* Progressive term-life enquiry form — vanilla-JS wizard (mirrors js/health.js).
   Asks contact details + age, yearly income, existing term plan, smoker status,
   then an OPTIONAL ITR upload. Each answer locks with a green check and reveals
   the next question; completed steps stay visible (greyed) and can be edited. On
   submit the payload — plus the ITR file if provided — is emailed to Kevin via the
   shared enquiry endpoint. */
(function () {
  var wizard = document.getElementById('ybWizard');
  if (!wizard) return;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // Reads a file as base64, stripping the data-URL prefix.
  function readB64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { var s = r.result || ''; resolve(s.indexOf(',') >= 0 ? s.split(',')[1] : s); };
      r.onerror = function () { reject(new Error('read failed')); };
      r.readAsDataURL(file);
    });
  }

  // ---- state ----
  var formData = {
    name: '', email: '', phone: '', age: null,
    income: null,
    existing: null,      // 'Yes' | 'No'
    existingSI: null,    // number, when existing === 'Yes'
    smoker: null,        // 'Yes' | 'No'
    itrName: null, itrType: null, itrData: null
  };

  var ORDER = ['ybStep2', 'ybStep3', 'ybStep4', 'ybStep5'];
  var RENDERERS = {
    ybStep2: renderIncome,
    ybStep3: renderExisting,
    ybStep4: renderSmoker,
    ybStep5: renderITR
  };
  var OWNS = {
    ybStep2: ['income'],
    ybStep3: ['existing', 'existingSI'],
    ybStep4: ['smoker'],
    ybStep5: ['itrName', 'itrType', 'itrData']
  };

  var restartBtn = document.getElementById('ybRestart');
  var MAX_FILE = 5 * 1024 * 1024; // 5 MB

  // ---- reveal / collapse helpers (shared shape with health.js) ----
  function reveal(node) {
    node.classList.remove('hidden');
    node.classList.add('yb-enter');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { node.classList.remove('yb-enter'); });
    });
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

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

  function editStep(id) {
    var idx = ORDER.indexOf(id);
    if (idx < 0) return;
    for (var i = ORDER.length - 1; i > idx; i--) {
      var later = document.getElementById(ORDER[i]);
      later.classList.add('hidden');
      later.classList.remove('completed-step');
      (OWNS[ORDER[i]] || []).forEach(function (k) {
        formData[k] = Array.isArray(formData[k]) ? [] : null;
      });
    }
    document.getElementById('ybDone').classList.add('hidden');
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

  phoneInput.addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 10); });
  ageInput.addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 3); });
  ageInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ageBtn.click(); } });

  function step1Error(msg) { ageErr.hidden = false; ageErr.textContent = msg; }

  ageBtn.addEventListener('click', function () {
    var name = nameInput.value.trim();
    var email = emailInput.value.trim();
    var phone = phoneInput.value.trim();
    var age = parseInt(ageInput.value, 10);
    if (name.length < 2) { return step1Error('Please enter your name.'); }
    if (!EMAIL_RE.test(email)) { return step1Error('Please enter a valid email address, e.g. name@example.com.'); }
    if (!/^[0-9]{10}$/.test(phone)) { return step1Error('Please enter a valid 10-digit mobile number.'); }
    if (!(age >= 18 && age <= 99)) { return step1Error('Please enter a valid age between 18 and 99.'); }
    ageErr.hidden = true;
    formData.name = name; formData.email = email; formData.phone = phone; formData.age = age;
    restartBtn.classList.remove('hidden');
    complete(step1, 'Your details', name + ' · ' + age + ' yrs · ' + phone);
    var first = document.getElementById(ORDER[0]);
    RENDERERS[ORDER[0]](first);
    reveal(first);
  });

  // ===============================================================
  // STEP 2 — Yearly income (auto-advance)
  // ===============================================================
  var INCOMES = ['Less than 5L', '5-10L', '10-20L', '20-30L', 'Above 30L'];

  function renderIncome(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'yb-q', 'What is your yearly income?'));
    var wrap = el('div', 'yb-pills');
    INCOMES.forEach(function (opt) {
      var pill = el('label', 'yb-pill' + (formData.income === opt ? ' on' : ''));
      var radio = document.createElement('input');
      radio.type = 'radio'; radio.name = 'tmIncome'; radio.value = opt;
      radio.checked = formData.income === opt;
      radio.addEventListener('change', function () {
        formData.income = opt;
        complete(container, 'Yearly income', opt);
        advanceFrom(container.id);
      });
      pill.appendChild(radio);
      pill.appendChild(el('span', 'yb-pill-title', opt));
      wrap.appendChild(pill);
    });
    active.appendChild(wrap);
  }

  // ===============================================================
  // STEP 3 — Existing term plan (Yes reveals sum-insured input)
  // ===============================================================
  function renderExisting(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'yb-q', 'Do you already have a term plan?'));

    var wrap = el('div', 'yb-cards');

    // Sum-insured reveal (shown only when "Yes").
    var siReveal = el('div', 'tm-si-reveal');
    siReveal.hidden = true;
    var siLabel = el('label', 'f-label', 'How much is the current Sum Insured? (in Rupees)');
    siLabel.setAttribute('for', 'tmExistingSI');
    var siInput = document.createElement('input');
    siInput.className = 'f'; siInput.id = 'tmExistingSI'; siInput.type = 'text';
    siInput.inputMode = 'numeric'; siInput.placeholder = 'e.g. 5000000';
    siInput.addEventListener('input', function () { this.value = this.value.replace(/\D/g, ''); });
    if (formData.existingSI != null) { siInput.value = String(formData.existingSI); }
    var siErr = el('div', 'yb-error'); siErr.hidden = true;
    var siNext = el('button', 'btn btn-primary yb-next', 'Next');
    siNext.type = 'button';
    siNext.addEventListener('click', function () {
      var v = parseInt(siInput.value, 10);
      if (!(v > 0)) { siErr.hidden = false; siErr.textContent = 'Please enter the current sum insured.'; return; }
      siErr.hidden = true;
      formData.existing = 'Yes'; formData.existingSI = v;
      complete(container, 'Existing term plan', 'Yes · ₹' + v.toLocaleString('en-IN'));
      advanceFrom(container.id);
    });
    siReveal.appendChild(siLabel);
    siReveal.appendChild(siInput);
    siReveal.appendChild(siErr);
    siReveal.appendChild(siNext);

    [{ v: 'Yes', icon: '📄' }, { v: 'No', icon: '🆕' }].forEach(function (o) {
      var card = el('label', 'yb-card' + (formData.existing === o.v ? ' on' : ''));
      var radio = document.createElement('input');
      radio.type = 'radio'; radio.name = 'tmExisting'; radio.value = o.v;
      radio.checked = formData.existing === o.v;
      radio.addEventListener('change', function () {
        wrap.querySelectorAll('.yb-card').forEach(function (c) { c.classList.remove('on'); });
        card.classList.add('on');
        if (o.v === 'No') {
          formData.existing = 'No'; formData.existingSI = null;
          siReveal.hidden = true;
          complete(container, 'Existing term plan', 'No');
          advanceFrom(container.id);
        } else {
          formData.existing = 'Yes';
          siReveal.hidden = false;
          siReveal.scrollIntoView({ behavior: 'smooth', block: 'center' });
          siInput.focus();
        }
      });
      card.appendChild(radio);
      card.appendChild(el('span', 'yb-card-ic', o.icon));
      card.appendChild(el('span', 'yb-card-title', o.v));
      wrap.appendChild(card);
    });

    active.appendChild(wrap);
    active.appendChild(siReveal);
    if (formData.existing === 'Yes') { siReveal.hidden = false; }
  }

  // ===============================================================
  // STEP 4 — Smoker status (auto-advance)
  // ===============================================================
  function renderSmoker(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'yb-q', 'Do you smoke or use tobacco?'));
    var wrap = el('div', 'yb-cards');
    [{ v: 'No', icon: '🚭' }, { v: 'Yes', icon: '🚬' }].forEach(function (o) {
      var card = el('label', 'yb-card' + (formData.smoker === o.v ? ' on' : ''));
      var radio = document.createElement('input');
      radio.type = 'radio'; radio.name = 'tmSmoker'; radio.value = o.v;
      radio.checked = formData.smoker === o.v;
      radio.addEventListener('change', function () {
        formData.smoker = o.v;
        complete(container, 'Smoker', o.v);
        advanceFrom(container.id);
      });
      card.appendChild(radio);
      card.appendChild(el('span', 'yb-card-ic', o.icon));
      card.appendChild(el('span', 'yb-card-title', o.v));
      wrap.appendChild(card);
    });
    active.appendChild(wrap);
  }

  // ===============================================================
  // STEP 5 — Optional ITR upload + submit
  // ===============================================================
  function renderITR(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'yb-q', 'Almost done — upload your ITR (optional)'));

    var box = el('div', 'tm-upload');
    box.appendChild(el('div', 'tm-upload-hint', '(Optional) Upload your latest ITR return with Computation of income.'));
    box.appendChild(el('div', 'tm-upload-sub', 'This helps us understand your Sum Insured eligibility and get a perfect quote.'));
    var fileLabel = el('label', 'tm-file-label', '📎 Choose file');
    fileLabel.setAttribute('for', 'tmItr');
    var fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.id = 'tmItr'; fileInput.className = 'tm-file-input';
    fileInput.accept = '.pdf,.jpg,.jpeg';
    box.appendChild(fileLabel);
    box.appendChild(fileInput);
    var nameRow = el('div', 'tm-file-name'); nameRow.hidden = true;
    box.appendChild(nameRow);
    active.appendChild(box);

    var err = el('div', 'yb-error'); err.hidden = true;
    active.appendChild(err);

    var row = el('div', 'tm-submit-row');
    var skipBtn = el('button', 'btn btn-ghost', 'Skip & Submit Quote'); skipBtn.type = 'button';
    var upBtn = el('button', 'btn btn-primary', 'Upload & Submit'); upBtn.type = 'button'; upBtn.hidden = true;
    row.appendChild(skipBtn);
    row.appendChild(upBtn);
    active.appendChild(row);

    function showName() {
      nameRow.hidden = false;
      nameRow.textContent = '✓ ' + formData.itrName;
      var x = el('button', 'tm-file-clear', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Remove file');
      x.addEventListener('click', function () { clearFile(); });
      nameRow.appendChild(x);
      upBtn.hidden = false;
    }
    function clearFile() {
      formData.itrName = null; formData.itrType = null; formData.itrData = null;
      nameRow.hidden = true; nameRow.textContent = ''; upBtn.hidden = true; fileInput.value = '';
    }

    fileInput.addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) { clearFile(); return; }
      if (f.size > MAX_FILE) { err.hidden = false; err.textContent = 'That file is larger than 5 MB.'; clearFile(); return; }
      err.hidden = true;
      readB64(f).then(function (b64) {
        formData.itrName = f.name; formData.itrType = f.type || 'application/octet-stream'; formData.itrData = b64;
        showName();
      }).catch(function () { err.hidden = false; err.textContent = 'Could not read that file. Please try another.'; clearFile(); });
    });

    if (formData.itrName) { showName(); } // restore on edit

    skipBtn.addEventListener('click', function () { submitTerm(container, skipBtn, upBtn, err, false); });
    upBtn.addEventListener('click', function () { submitTerm(container, skipBtn, upBtn, err, true); });
  }

  // ===============================================================
  // Submit — send to Kevin server-side, then confirm
  // ===============================================================
  var WA_NUM = '918369988285';
  // Shared website enquiry endpoint (also used by the Health form); it emails
  // Kevin and attaches the file when fileData is present.
  var ENQUIRY_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxXTjDanx0ZdZExoP3-arcDQo0Wb9EbsZ6_BrDjuYIQxAcyRP42a8KkEHhhiEFg7pys6Q/exec';

  function submitTerm(container, skipBtn, upBtn, err, withFile) {
    err.hidden = true;
    // Skipping means the file is not sent — drop it so the recap reflects reality.
    if (!withFile) { formData.itrName = null; formData.itrType = null; formData.itrData = null; }
    var origSkip = skipBtn.textContent, origUp = upBtn.textContent;
    skipBtn.disabled = true; upBtn.disabled = true;
    (withFile ? upBtn : skipBtn).textContent = 'Sending…';

    var products = 'Term life — Yearly income: ' + formData.income
      + ' | Existing term plan: ' + (formData.existing || 'No')
      + (formData.existing === 'Yes' && formData.existingSI ? ' (Sum insured ₹' + formData.existingSI + ')' : '')
      + ' | Smoker: ' + formData.smoker;

    console.log('Term life enquiry captured:\n' + JSON.stringify(formData, null, 2));

    var data = new FormData();
    data.append('name', formData.name);
    data.append('email', formData.email);
    data.append('mobile', formData.phone);
    data.append('age', String(formData.age));
    data.append('products', products);
    data.append('health', 'N/A (term life)');
    data.append('botcheck', '');
    if (withFile && formData.itrData) {
      data.append('fileData', formData.itrData);
      data.append('fileName', formData.itrName);
      data.append('fileType', formData.itrType);
    }

    fetch(ENQUIRY_ENDPOINT, { method: 'POST', body: data, mode: 'no-cors' })
      .then(function () {
        complete(container, 'ITR document', (withFile && formData.itrName) ? formData.itrName : 'Skipped');
        showDone();
      })
      .catch(function () {
        skipBtn.disabled = false; upBtn.disabled = false;
        skipBtn.textContent = origSkip; upBtn.textContent = origUp;
        err.hidden = false;
        err.textContent = "Couldn't send your enquiry — please check your connection and try again.";
      });
  }

  function showDone() {
    var done = document.getElementById('ybDone');
    done.textContent = '';
    done.appendChild(el('div', 'yb-done-icon', '✓'));
    done.appendChild(el('h3', '', 'Enquiry sent!'));
    done.appendChild(el('p', '', 'Thanks ' + formData.name + ' — your term life details have reached Kevin. He\'ll be in touch shortly.'));

    var recap = el('dl', 'yb-recap');
    function rowr(label, value) {
      var r = el('div', 'yb-recap-row');
      r.appendChild(el('dt', '', label));
      r.appendChild(el('dd', '', value));
      recap.appendChild(r);
    }
    rowr('Name', formData.name);
    rowr('Contact', formData.phone + ' · ' + formData.email);
    rowr('Age', formData.age + ' years');
    rowr('Yearly income', formData.income);
    rowr('Existing term plan', (formData.existing || 'No') + (formData.existing === 'Yes' && formData.existingSI ? ' · ₹' + formData.existingSI.toLocaleString('en-IN') : ''));
    rowr('Smoker', formData.smoker);
    rowr('ITR document', formData.itrName || 'Not uploaded');
    done.appendChild(recap);

    var wa = el('a', 'btn btn-primary', 'Message Kevin on WhatsApp');
    wa.href = 'https://wa.me/' + WA_NUM + '?text='
      + encodeURIComponent('Hi Kevin! I just sent a term life enquiry through the website.');
    wa.target = '_blank'; wa.rel = 'noopener';
    done.appendChild(wa);

    reveal(done);
  }

  // ===============================================================
  // Start over
  // ===============================================================
  restartBtn.addEventListener('click', function () {
    formData = { name: '', email: '', phone: '', age: null, income: null, existing: null, existingSI: null, smoker: null, itrName: null, itrType: null, itrData: null };
    ORDER.forEach(function (id) {
      var c = document.getElementById(id);
      c.classList.add('hidden');
      c.classList.remove('completed-step');
      activeOf(c).textContent = '';
      c.querySelector('.yb-step-summary').textContent = '';
    });
    document.getElementById('ybDone').classList.add('hidden');
    step1.classList.remove('completed-step');
    nameInput.value = ''; emailInput.value = ''; phoneInput.value = ''; ageInput.value = '';
    ageErr.hidden = true;
    restartBtn.classList.add('hidden');
    step1.scrollIntoView({ behavior: 'smooth', block: 'center' });
    nameInput.focus();
  });
})();
