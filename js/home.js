/* Progressive Home (New India Bharat Griha Raksha) enquiry form — vanilla-JS
   wizard sharing the yb-* wizard shell with the other scheme forms. Collects
   contact, property basics, safety/maintenance, claims history, risk factors and
   location, then emails the lot to Kevin via the shared enquiry endpoint. */
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
    name: '', phone: '', email: '',
    sqFt: null, buildingAge: null,
    safety: { q1: null, q2: null, q3: null, q4: null },
    claims: { bracket: null, pastPremium: null, pastClaim: null },
    risks: { q9: null, q10: null, q11: null, q12: null },
    address: '', pincode: ''
  };

  var ORDER = ['ybStep2', 'ybStep3', 'ybStep4', 'ybStep5', 'ybStep6'];
  var RENDERERS = {
    ybStep2: renderProperty, ybStep3: renderSafety, ybStep4: renderClaims,
    ybStep5: renderRisks, ybStep6: renderLocation
  };
  var OWNS = {
    ybStep2: ['sqFt', 'buildingAge'],
    ybStep3: ['safety'],
    ybStep4: ['claims'],
    ybStep5: ['risks'],
    ybStep6: ['address', 'pincode']
  };

  var restartBtn = document.getElementById('ybRestart');

  // ---- reveal / collapse helpers (shared shape with the other scheme forms) ----
  function reveal(node) {
    node.classList.remove('hidden');
    node.classList.add('yb-enter');
    requestAnimationFrame(function () { requestAnimationFrame(function () { node.classList.remove('yb-enter'); }); });
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
      (OWNS[ORDER[i]] || []).forEach(function (k) { formData[k] = (typeof formData[k] === 'object' && formData[k] !== null && !Array.isArray(formData[k])) ? {} : null; });
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

  // Shared builders.
  function numInput(id, ph, val) {
    var i = document.createElement('input');
    i.className = 'f'; if (id) { i.id = id; } i.type = 'text'; i.inputMode = 'numeric'; i.placeholder = ph || '';
    i.addEventListener('input', function () { this.value = this.value.replace(/\D/g, ''); });
    if (val != null) { i.value = String(val); }
    return i;
  }
  function field(labelText, node) {
    var f = el('div', 'yb-field');
    f.appendChild(el('label', 'f-label hm-field-label', labelText));
    f.appendChild(node);
    return f;
  }
  // A labelled Yes/No question. `current` prefills; onChange fires with 'Yes'/'No'.
  function yesNoQ(labelText, current, onChange) {
    var q = el('div', 'hm-q');
    q.appendChild(el('label', 'hm-q-label', labelText));
    var pw = el('div', 'hm-pills');
    [{ v: 'Yes' }, { v: 'No' }].forEach(function (o) {
      var p = el('button', 'hm-pill' + (current === o.v ? ' on' : ''), o.v); p.type = 'button';
      p.addEventListener('click', function () { pw.querySelectorAll('.hm-pill').forEach(function (x) { x.classList.remove('on'); }); p.classList.add('on'); onChange(o.v); });
      pw.appendChild(p);
    });
    q.appendChild(pw);
    return q;
  }

  // ===============================================================
  // STEP 1 — Contact details
  // ===============================================================
  var nameInput = document.getElementById('ybName');
  var emailInput = document.getElementById('ybEmail');
  var phoneInput = document.getElementById('ybPhone');
  var contactBtn = document.getElementById('ybContactBtn');
  var contactErr = document.getElementById('ybContactErr');
  var step1 = document.getElementById('ybStep1');

  var EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

  phoneInput.addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 10); });
  function step1Error(msg) { contactErr.hidden = false; contactErr.textContent = msg; }

  contactBtn.addEventListener('click', function () {
    var name = nameInput.value.trim();
    var email = emailInput.value.trim();
    var phone = phoneInput.value.trim();
    if (name.length < 2) { return step1Error('Please enter your name.'); }
    if (!/^[0-9]{10}$/.test(phone)) { return step1Error('Please enter a valid 10-digit mobile number.'); }
    if (!EMAIL_RE.test(email)) { return step1Error('Please enter a valid email address, e.g. name@example.com.'); }
    contactErr.hidden = true;
    formData.name = name; formData.email = email; formData.phone = phone;
    restartBtn.classList.remove('hidden');
    complete(step1, 'Your details', name + ' · ' + phone);
    var first = document.getElementById(ORDER[0]);
    RENDERERS[ORDER[0]](first);
    reveal(first);
  });

  // ===============================================================
  // STEP 2 — Property basics
  // ===============================================================
  function renderProperty(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'yb-q', 'About your property'));

    var fields = el('div', 'yb-fields');
    var sq = numInput('hmSqFt', 'e.g. 1200', formData.sqFt);
    var age = numInput('hmBldgAge', 'e.g. 12', formData.buildingAge);
    fields.appendChild(field('Total square feet to be insured', sq));
    fields.appendChild(field('Age of the building (years)', age));
    active.appendChild(fields);

    var err = el('div', 'yb-error'); err.hidden = true;
    active.appendChild(err);
    var next = el('button', 'btn btn-primary yb-next', 'Continue');
    next.type = 'button';
    next.addEventListener('click', function () {
      var s = parseInt(sq.value, 10), a = parseInt(age.value, 10);
      if (!(s >= 1)) { err.hidden = false; err.textContent = 'Please enter the area in square feet.'; return; }
      if (!(a >= 0 && a <= 200)) { err.hidden = false; err.textContent = 'Please enter a valid building age (years).'; return; }
      err.hidden = true;
      formData.sqFt = s; formData.buildingAge = a;
      complete(container, 'Property', s + ' sq ft · ' + a + ' yr old');
      advanceFrom(container.id);
    });
    active.appendChild(next);
  }

  // ===============================================================
  // STEP 3 — Safety & maintenance (Q1–Q4)
  // ===============================================================
  function renderSafety(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'yb-q', 'Safety & maintenance'));
    formData.safety = formData.safety || { q1: null, q2: null, q3: null, q4: null };
    var s = formData.safety;
    var local = { q1: s.q1, q2: s.q2, q3: s.q3, q4: s.q4 };

    active.appendChild(yesNoQ('Working fire hydrant / sprinkler / water-spray system / fire alarm / smoke detectors?', local.q1, function (v) { local.q1 = v; }));
    active.appendChild(yesNoQ('Electrical installation well-maintained with standard equipment?', local.q2, function (v) { local.q2 = v; }));
    active.appendChild(yesNoQ('Storm-water drainage, with plinth at least 1.5 ft above ground?', local.q3, function (v) { local.q3 = v; }));
    active.appendChild(yesNoQ('High-standard security with guards and 24×7 cameras?', local.q4, function (v) { local.q4 = v; }));

    var err = el('div', 'yb-error'); err.hidden = true;
    active.appendChild(err);
    var next = el('button', 'btn btn-primary yb-next', 'Continue');
    next.type = 'button';
    next.addEventListener('click', function () {
      if (!local.q1 || !local.q2 || !local.q3 || !local.q4) { err.hidden = false; err.textContent = 'Please answer all four questions.'; return; }
      err.hidden = true;
      formData.safety = local;
      var yes = ['q1', 'q2', 'q3', 'q4'].filter(function (k) { return local[k] === 'Yes'; }).length;
      complete(container, 'Safety & maintenance', yes + ' of 4 measures in place');
      advanceFrom(container.id);
    });
    active.appendChild(next);
  }

  // ===============================================================
  // STEP 4 — Claims history (Q5–Q8, one bracket)
  // ===============================================================
  var CLAIM_BRACKETS = ['No claims in last 3 years', 'Below 70%', '70% – 100%', '100% – 200%', 'Above 200%'];

  function renderClaims(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'yb-q', 'Claims history (last 3 years)'));
    formData.claims = formData.claims || { bracket: null, pastPremium: null, pastClaim: null };

    active.appendChild(el('label', 'hm-q-label', 'What has your claim ratio been over the past 3 years?'));
    var bracket = formData.claims.bracket;

    var reveal2 = el('div', 'hm-reveal');
    reveal2.appendChild(el('div', 'hm-q-label', 'Roughly, over those 3 years:'));
    var pfields = el('div', 'yb-fields');
    var premWrap = el('div', 'hm-rupee'); var prem = numInput('hmPrem', 'Total premium paid', formData.claims.pastPremium); premWrap.appendChild(prem);
    var claimWrap = el('div', 'hm-rupee'); var clm = numInput('hmClaim', 'Total claims received', formData.claims.pastClaim); claimWrap.appendChild(clm);
    pfields.appendChild(field('Premium (Rs.)', premWrap));
    pfields.appendChild(field('Claim (Rs.)', claimWrap));
    reveal2.appendChild(pfields);
    reveal2.hidden = !(bracket && bracket !== CLAIM_BRACKETS[0]);

    var pills = el('div', 'hm-pills');
    CLAIM_BRACKETS.forEach(function (b) {
      var p = el('button', 'hm-pill' + (bracket === b ? ' on' : ''), b); p.type = 'button';
      p.addEventListener('click', function () {
        pills.querySelectorAll('.hm-pill').forEach(function (x) { x.classList.remove('on'); });
        p.classList.add('on'); bracket = b;
        reveal2.hidden = (b === CLAIM_BRACKETS[0]); // no reveal for "No claims"
      });
      pills.appendChild(p);
    });
    active.appendChild(pills);
    active.appendChild(reveal2);

    var err = el('div', 'yb-error'); err.hidden = true;
    active.appendChild(err);
    var next = el('button', 'btn btn-primary yb-next', 'Continue');
    next.type = 'button';
    next.addEventListener('click', function () {
      if (!bracket) { err.hidden = false; err.textContent = 'Please choose your claim-ratio band.'; return; }
      err.hidden = true;
      formData.claims = {
        bracket: bracket,
        pastPremium: (bracket !== CLAIM_BRACKETS[0] && prem.value) ? parseInt(prem.value, 10) : null,
        pastClaim: (bracket !== CLAIM_BRACKETS[0] && clm.value) ? parseInt(clm.value, 10) : null
      };
      complete(container, 'Claims history', bracket);
      advanceFrom(container.id);
    });
    active.appendChild(next);
  }

  // ===============================================================
  // STEP 5 — Risk factors (Q9–Q12)
  // ===============================================================
  function renderRisks(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'yb-q', 'Risk factors'));
    formData.risks = formData.risks || { q9: null, q10: null, q11: null, q12: null };
    var r = formData.risks;
    // Q12 defaults to Yes when the building is over 30 years old (overridable).
    var q12Default = r.q12 != null ? r.q12 : (formData.buildingAge > 30 ? 'Yes' : null);
    var local = { q9: r.q9, q10: r.q10, q11: r.q11, q12: q12Default };

    active.appendChild(yesNoQ('Is the basement used for operations / storage / plant & machinery?', local.q9, function (v) { local.q9 = v; }));
    active.appendChild(yesNoQ('Is the property within 1 km of a water body (sea / lake / river)?', local.q10, function (v) { local.q10 = v; }));
    active.appendChild(yesNoQ('Is it in a thickly-populated area with no fire-brigade access?', local.q11, function (v) { local.q11 = v; }));
    active.appendChild(yesNoQ('Is the building over 30 years old, or in below-average condition?', local.q12, function (v) { local.q12 = v; }));

    var err = el('div', 'yb-error'); err.hidden = true;
    active.appendChild(err);
    var next = el('button', 'btn btn-primary yb-next', 'Continue');
    next.type = 'button';
    next.addEventListener('click', function () {
      if (!local.q9 || !local.q10 || !local.q11 || !local.q12) { err.hidden = false; err.textContent = 'Please answer all four questions.'; return; }
      err.hidden = true;
      formData.risks = local;
      var yes = ['q9', 'q10', 'q11', 'q12'].filter(function (k) { return local[k] === 'Yes'; }).length;
      complete(container, 'Risk factors', yes + ' risk factor' + (yes === 1 ? '' : 's') + ' flagged');
      advanceFrom(container.id);
    });
    active.appendChild(next);
  }

  // ===============================================================
  // STEP 6 — Location (final submit)
  // ===============================================================
  function renderLocation(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'yb-q', 'Where is the property?'));

    var fields = el('div', 'yb-fields');
    var addr = document.createElement('textarea'); addr.className = 'f'; addr.id = 'hmAddr'; addr.placeholder = 'Full address of the insured property';
    if (formData.address) { addr.value = formData.address; }
    var pin = numInput('hmPin', '6-digit PIN code', formData.pincode);
    pin.maxLength = 6; pin.addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 6); });
    fields.appendChild(field('Full address', addr));
    fields.appendChild(field('PIN code', pin));
    active.appendChild(fields);

    var err = el('div', 'yb-error'); err.hidden = true;
    active.appendChild(err);
    var submit = el('button', 'btn btn-primary yb-next', 'Send Enquiry');
    submit.type = 'button';
    submit.addEventListener('click', function () {
      var a = addr.value.trim();
      if (!a) { err.hidden = false; err.textContent = 'Please enter the property address.'; return; }
      if (!/^[0-9]{6}$/.test(pin.value)) { err.hidden = false; err.textContent = 'Please enter a valid 6-digit PIN code.'; return; }
      err.hidden = true;
      formData.address = a; formData.pincode = pin.value;
      console.log('Home enquiry captured:\n' + JSON.stringify(formData, null, 2));
      sendEnquiry(submit, err, container);
    });
    active.appendChild(submit);
  }

  // ===============================================================
  // Submit — send to Kevin server-side, then confirm
  // ===============================================================
  var WA_NUM = '918369988285';
  var ENQUIRY_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzFBqQZCBJ7trrzwTFUq6aOwlXslRdXMyrcTE-QuPB_QYQIbimvnJ4ZCzgyNM9qBuQCXw/exec';

  function sendEnquiry(submit, err, container) {
    var s = formData.safety, r = formData.risks, c = formData.claims;
    var claimStr = c.bracket + ((c.pastPremium || c.pastClaim) ? ' (Premium ₹' + (c.pastPremium || '-') + ', Claim ₹' + (c.pastClaim || '-') + ')' : '');
    var products = 'Home / Bharat Griha Raksha — ' + formData.sqFt + ' sq ft · building ' + formData.buildingAge + ' yrs'
      + ' | Safety: fire-systems ' + s.q1 + ', electrical ' + s.q2 + ', drainage/plinth ' + s.q3 + ', security ' + s.q4
      + ' | Claim ratio(3y): ' + claimStr
      + ' | Risks: basement ' + r.q9 + ', near-water ' + r.q10 + ', poor-fire-access ' + r.q11 + ', old/weak-building ' + r.q12
      + ' | Location: ' + formData.address + ', PIN ' + formData.pincode;

    var data = new FormData();
    data.append('name', formData.name);
    data.append('email', formData.email);
    data.append('mobile', formData.phone);
    data.append('products', products);
    data.append('health', 'N/A (home insurance)');
    data.append('botcheck', '');

    submit.disabled = true;
    submit.textContent = 'Sending…';

    fetch(ENQUIRY_ENDPOINT, { method: 'POST', body: data, mode: 'no-cors' })
      .then(function () { complete(container, 'Location', formData.address + ' · ' + formData.pincode); showDone(); })
      .catch(function () {
        submit.disabled = false; submit.textContent = 'Send Enquiry';
        err.hidden = false; err.textContent = "Couldn't send your enquiry — please check your connection and try again.";
      });
  }

  function showDone() {
    var done = document.getElementById('ybDone');
    done.textContent = '';
    done.appendChild(el('div', 'yb-done-icon', '✓'));
    done.appendChild(el('h3', '', 'Enquiry sent!'));
    done.appendChild(el('p', '', 'Thanks ' + formData.name + ' — your home insurance details have reached Kevin. He\'ll be in touch shortly.'));

    var recap = el('dl', 'yb-recap');
    function row(label, value) {
      var d = el('div', 'yb-recap-row');
      d.appendChild(el('dt', '', label));
      d.appendChild(el('dd', '', value));
      recap.appendChild(d);
    }
    row('Name', formData.name);
    row('Contact', formData.phone + ' · ' + formData.email);
    row('Property', formData.sqFt + ' sq ft · ' + formData.buildingAge + ' yr old');
    row('Claim ratio (3y)', formData.claims.bracket);
    row('Location', formData.address + ' · ' + formData.pincode);
    done.appendChild(recap);

    var wa = el('a', 'btn btn-primary', 'Message Kevin on WhatsApp');
    wa.href = 'https://wa.me/' + WA_NUM + '?text=' + encodeURIComponent('Hi Kevin! I just sent a home insurance (Bharat Griha Raksha) enquiry through the website.');
    wa.target = '_blank'; wa.rel = 'noopener';
    done.appendChild(wa);

    reveal(done);
  }

  // ===============================================================
  // Start over
  // ===============================================================
  restartBtn.addEventListener('click', function () {
    formData = {
      name: '', phone: '', email: '', sqFt: null, buildingAge: null,
      safety: { q1: null, q2: null, q3: null, q4: null },
      claims: { bracket: null, pastPremium: null, pastClaim: null },
      risks: { q9: null, q10: null, q11: null, q12: null },
      address: '', pincode: ''
    };
    ORDER.forEach(function (id) {
      var c = document.getElementById(id);
      c.classList.add('hidden');
      c.classList.remove('completed-step');
      activeOf(c).textContent = '';
      c.querySelector('.yb-step-summary').textContent = '';
    });
    document.getElementById('ybDone').classList.add('hidden');
    step1.classList.remove('completed-step');
    nameInput.value = ''; emailInput.value = ''; phoneInput.value = '';
    contactErr.hidden = true;
    restartBtn.classList.add('hidden');
    step1.scrollIntoView({ behavior: 'smooth', block: 'center' });
    nameInput.focus();
  });
})();
