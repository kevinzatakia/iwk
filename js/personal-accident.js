/* Progressive Personal Accident enquiry form — vanilla-JS wizard (shares the yb-*
   wizard shell with js/health.js and js/term.js). Collects contact details + age,
   yearly income, coverage (sum insured + accidental-medical extension), and policy
   type (individual vs group). On submit the payload is emailed to Kevin via the
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

  // ---- state ----
  var formData = {
    name: '', email: '', phone: '', age: null,
    income: null,
    sumInsured: '',
    medical: null,        // 'Yes' | 'No'
    policyType: null      // 'Self / Individual' | 'Employees (Group Personal Accident)'
  };

  var ORDER = ['ybStep2', 'ybStep3', 'ybStep4'];
  var RENDERERS = { ybStep2: renderIncome, ybStep3: renderCoverage, ybStep4: renderPolicyType };
  var OWNS = {
    ybStep2: ['income'],
    ybStep3: ['sumInsured', 'medical'],
    ybStep4: ['policyType']
  };

  var restartBtn = document.getElementById('ybRestart');

  // ---- reveal / collapse helpers (shared shape with health.js / term.js) ----
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
      (OWNS[ORDER[i]] || []).forEach(function (k) { formData[k] = null; });
    }
    document.getElementById('ybDone').classList.add('hidden');
    var container = document.getElementById(id);
    container.classList.remove('completed-step');
    RENDERERS[id](container);
    reveal(container);
  }

  function advanceFrom(id) {
    var idx = ORDER.indexOf(id);
    if (idx < 0 || idx === ORDER.length - 1) { return; }
    var nextId = ORDER[idx + 1];
    var next = document.getElementById(nextId);
    RENDERERS[nextId](next);
    reveal(next);
  }

  function activeOf(container) { return container.querySelector('.yb-step-active'); }

  // Yes/No (and similar) single-select cards that DON'T auto-advance.
  function cardGroup(options, current, onSelect) {
    var wrap = el('div', 'yb-cards');
    var cards = [];
    options.forEach(function (o) {
      var card = el('label', 'yb-card' + (current === o.v ? ' on' : ''));
      var radio = document.createElement('input');
      radio.type = 'radio'; radio.name = o.name || 'paGroup'; radio.value = o.v;
      radio.checked = current === o.v;
      radio.addEventListener('change', function () {
        cards.forEach(function (c) { c.classList.remove('on'); });
        card.classList.add('on');
        onSelect(o.v);
      });
      card.appendChild(radio);
      card.appendChild(el('span', 'yb-card-ic', o.icon));
      card.appendChild(el('span', 'yb-card-title', o.v));
      cards.push(card);
      wrap.appendChild(card);
    });
    return wrap;
  }

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
    active.appendChild(el('label', 'yb-q', 'How much is your yearly income?'));
    var wrap = el('div', 'yb-pills');
    INCOMES.forEach(function (opt) {
      var pill = el('label', 'yb-pill' + (formData.income === opt ? ' on' : ''));
      var radio = document.createElement('input');
      radio.type = 'radio'; radio.name = 'paIncome'; radio.value = opt;
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
  // STEP 3 — Coverage (sum insured + accidental medical extension)
  // ===============================================================
  function renderCoverage(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'yb-q', 'What cover are you looking for?'));

    var fields = el('div', 'yb-fields');
    var siField = el('div', 'yb-field');
    var siLabel = el('label', 'f-label', 'How much Sum Insured are you looking for?');
    siLabel.setAttribute('for', 'paSum');
    var si = document.createElement('input');
    si.className = 'f'; si.id = 'paSum'; si.type = 'text'; si.placeholder = 'e.g. 50 Lakhs, 1 Crore';
    if (formData.sumInsured) si.value = formData.sumInsured;
    siField.appendChild(siLabel);
    siField.appendChild(si);
    fields.appendChild(siField);
    active.appendChild(fields);

    active.appendChild(el('label', 'pa-subq', 'Do you need coverage for Accidental Medical Expenses?'));
    var medical = formData.medical;
    active.appendChild(cardGroup(
      [{ v: 'Yes', icon: '✅', name: 'paMedical' }, { v: 'No', icon: '🚫', name: 'paMedical' }],
      formData.medical,
      function (v) { medical = v; }
    ));

    var err = el('div', 'yb-error'); err.hidden = true;
    active.appendChild(err);

    var next = el('button', 'btn btn-primary yb-next', 'Next');
    next.type = 'button';
    next.addEventListener('click', function () {
      var siV = si.value.trim();
      if (!siV) { err.hidden = false; err.textContent = 'Please enter the sum insured you\'re looking for.'; return; }
      if (!medical) { err.hidden = false; err.textContent = 'Please choose whether you need accidental medical cover.'; return; }
      err.hidden = true;
      formData.sumInsured = siV; formData.medical = medical;
      complete(container, 'Coverage', 'SI: ' + siV + ' · Medical: ' + medical);
      advanceFrom(container.id);
    });
    active.appendChild(next);
  }

  // ===============================================================
  // STEP 4 — Policy type (final submit)
  // ===============================================================
  function renderPolicyType(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'yb-q', 'Who are you looking to insure?'));

    var policyType = formData.policyType;
    active.appendChild(cardGroup(
      [
        { v: 'Self / Individual', icon: '🧍', name: 'paPolicy' },
        { v: 'Employees (Group Personal Accident)', icon: '👥', name: 'paPolicy' }
      ],
      formData.policyType,
      function (v) { policyType = v; }
    ));

    var err = el('div', 'yb-error'); err.hidden = true;
    active.appendChild(err);

    var submit = el('button', 'btn btn-primary yb-next', 'Submit for Quote');
    submit.type = 'button';
    submit.addEventListener('click', function () {
      if (!policyType) { err.hidden = false; err.textContent = 'Please choose who you\'re looking to insure.'; return; }
      err.hidden = true;
      formData.policyType = policyType;
      console.log('Personal Accident enquiry captured:\n' + JSON.stringify(formData, null, 2));
      sendEnquiry(submit, err, container);
    });
    active.appendChild(submit);
  }

  // ===============================================================
  // Submit — send to Kevin server-side, then confirm
  // ===============================================================
  var WA_NUM = '918369988285';
  // Shared website enquiry endpoint (also used by the Health / Term / Workmen forms).
  var ENQUIRY_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzFBqQZCBJ7trrzwTFUq6aOwlXslRdXMyrcTE-QuPB_QYQIbimvnJ4ZCzgyNM9qBuQCXw/exec';

  function sendEnquiry(submit, err, container) {
    var products = 'Personal Accident — Yearly income: ' + formData.income
      + ' | Sum insured: ' + formData.sumInsured
      + ' | Accidental medical expenses: ' + formData.medical
      + ' | Policy type: ' + formData.policyType;

    var data = new FormData();
    data.append('name', formData.name);
    data.append('email', formData.email);
    data.append('mobile', formData.phone);
    data.append('age', String(formData.age));
    data.append('products', products);
    data.append('health', 'N/A (personal accident)');
    data.append('botcheck', '');

    submit.disabled = true;
    submit.textContent = 'Sending…';

    fetch(ENQUIRY_ENDPOINT, { method: 'POST', body: data, mode: 'no-cors' })
      .then(function () {
        complete(container, 'Policy type', formData.policyType);
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
    var done = document.getElementById('ybDone');
    done.textContent = '';
    done.appendChild(el('div', 'yb-done-icon', '✓'));
    done.appendChild(el('h3', '', 'Enquiry sent!'));
    done.appendChild(el('p', '', 'Thanks ' + formData.name + ' — your Personal Accident details have reached Kevin. He\'ll be in touch shortly.'));

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
    rowr('Sum insured', formData.sumInsured);
    rowr('Accidental medical', formData.medical);
    rowr('Policy type', formData.policyType);
    done.appendChild(recap);

    var wa = el('a', 'btn btn-primary', 'Message Kevin on WhatsApp');
    wa.href = 'https://wa.me/' + WA_NUM + '?text='
      + encodeURIComponent('Hi Kevin! I just sent a Personal Accident enquiry through the website.');
    wa.target = '_blank'; wa.rel = 'noopener';
    done.appendChild(wa);

    reveal(done);
  }

  // ===============================================================
  // Start over
  // ===============================================================
  restartBtn.addEventListener('click', function () {
    formData = { name: '', email: '', phone: '', age: null, income: null, sumInsured: '', medical: null, policyType: null };
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
