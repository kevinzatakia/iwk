/* Motor insurance progressive enquiry — vanilla-JS wizard on motor.html.
   Asks contact details, car number + claim history, then two document uploads
   (expiring policy + RC book), then add-on preferences. Each answer locks with a
   green check and fades in the next question; completed steps stay visible
   (greyed/minimised) and can be edited. On submit both files are read to base64
   and the whole thing is sent to Kevin server-side (shared enquiry endpoint),
   which emails it with both documents attached. */
(function () {
  var wizard = document.getElementById('moWizard');
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

  var FILE_EXT = ['pdf', 'jpg', 'jpeg'];
  var FILE_MAX = 5 * 1024 * 1024; // 5 MB

  // ---- state ----
  var formData = {
    name: '',
    email: '',
    phone: '',
    carNumber: '',
    claim: null,           // 'Yes' | 'No'
    multiClaim: null,      // 'Yes' | 'No' (only when claim === 'Yes')
    expiringPolicy: null,  // File
    rcBook: null,          // File
    addons: ''
  };

  // Ordered data steps (after the contact step). Used for advancing + reset-on-edit.
  var ORDER = ['moStep2', 'moStep3', 'moStep4', 'moStep5'];
  var RENDERERS = {
    moStep2: renderCar,
    moStep3: renderExpiringUpload,
    moStep4: renderRcUpload,
    moStep5: renderAddons
  };
  var OWNS = {
    moStep2: ['carNumber', 'claim', 'multiClaim'],
    moStep3: ['expiringPolicy'],
    moStep4: ['rcBook'],
    moStep5: ['addons']
  };

  var restartBtn = document.getElementById('moRestart');

  // ---- reveal / collapse helpers ----
  function reveal(node) {
    node.classList.remove('hidden');
    node.classList.add('mo-enter');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { node.classList.remove('mo-enter'); });
    });
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function complete(container, label, value) {
    var summary = container.querySelector('.mo-step-summary');
    summary.textContent = '';
    summary.appendChild(el('span', 'mo-check', '✓'));
    var body = el('div', 'mo-summary-body');
    body.appendChild(el('div', 'mo-summary-label', label));
    body.appendChild(el('div', 'mo-summary-value', value));
    summary.appendChild(body);
    var edit = el('button', 'mo-edit', 'Edit');
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
      // Motor's owned fields are all scalars / File / null — clear to null.
      (OWNS[ORDER[i]] || []).forEach(function (k) { formData[k] = null; });
    }
    document.getElementById('moDone').classList.add('hidden');
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

  function activeOf(container) { return container.querySelector('.mo-step-active'); }
  function fieldError(err, msg) { err.hidden = false; err.textContent = msg; }

  // Yes/No pill group. Calls onSelect(value) on change; reflects `current`.
  function pillGroup(name, current, onSelect) {
    var wrap = el('div', 'mo-pills');
    ['Yes', 'No'].forEach(function (val) {
      var pill = el('label', 'mo-pill' + (current === val ? ' on' : ''));
      var radio = document.createElement('input');
      radio.type = 'radio'; radio.name = name; radio.value = val; radio.checked = current === val;
      radio.addEventListener('change', function () {
        wrap.querySelectorAll('.mo-pill').forEach(function (pl) { pl.classList.toggle('on', pl === pill); });
        onSelect(val);
      });
      pill.appendChild(radio);
      pill.appendChild(el('span', '', val));
      wrap.appendChild(pill);
    });
    return wrap;
  }

  // ===============================================================
  // STEP 1 — Contact details (name / phone / email)
  // ===============================================================
  var nameInput = document.getElementById('moName');
  var phoneInput = document.getElementById('moPhone');
  var emailInput = document.getElementById('moEmail');
  var contBtn = document.getElementById('moContinueBtn');
  var step1Err = document.getElementById('moErr');
  var step1 = document.getElementById('moStep1');

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
  // STEP 2 — Car details & claim history
  // ===============================================================
  function renderCar(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'mo-q', 'Car details & claim history'));

    var fields = el('div', 'mo-fields');
    var f = el('div', 'mo-field');
    f.appendChild(labelFor('moCarNo', 'Car number'));
    var carNo = document.createElement('input');
    carNo.className = 'f'; carNo.id = 'moCarNo'; carNo.autocomplete = 'off';
    carNo.placeholder = 'e.g. MH 12 AB 1234';
    if (formData.carNumber) carNo.value = formData.carNumber;
    carNo.addEventListener('input', function () { this.value = this.value.toUpperCase(); });
    f.appendChild(carNo);
    fields.appendChild(f);
    active.appendChild(fields);

    var err = el('div', 'mo-error'); err.hidden = true;

    // Follow-up question, revealed only when the first claim answer is "Yes".
    var followWrap = el('div', 'mo-claim-follow' + (formData.claim === 'Yes' ? '' : ' hidden'));
    followWrap.appendChild(el('div', 'mo-subq', 'Have you taken more than one claim in the expiring policy period?'));
    followWrap.appendChild(pillGroup('moMulti', formData.multiClaim, function (v) { formData.multiClaim = v; err.hidden = true; }));

    active.appendChild(el('div', 'mo-subq', 'Is there a claim in the current expiring policy?'));
    active.appendChild(pillGroup('moClaim', formData.claim, function (v) {
      formData.claim = v;
      err.hidden = true;
      if (v === 'Yes') {
        followWrap.classList.remove('hidden');
      } else {
        followWrap.classList.add('hidden');
        formData.multiClaim = null;
      }
    }));
    active.appendChild(followWrap);
    active.appendChild(err);

    var next = el('button', 'btn btn-primary mo-next', 'Next'); next.type = 'button';
    next.addEventListener('click', function () {
      var cn = carNo.value.trim().toUpperCase();
      if (cn.length < 4) { return fieldError(err, 'Please enter your car number.'); }
      if (formData.claim !== 'Yes' && formData.claim !== 'No') {
        return fieldError(err, 'Please tell us if there is a claim in the expiring policy.');
      }
      if (formData.claim === 'Yes' && formData.multiClaim !== 'Yes' && formData.multiClaim !== 'No') {
        return fieldError(err, 'Please answer whether more than one claim was taken.');
      }
      err.hidden = true;
      formData.carNumber = cn;
      var summary = cn + ' · Claim: ' + formData.claim
        + (formData.claim === 'Yes' ? (' (>1 claim: ' + formData.multiClaim + ')') : '');
      complete(container, 'Car & claim', summary);
      advanceFrom(container.id);
    });
    active.appendChild(next);
  }

  // ===============================================================
  // STEPS 3 & 4 — Document uploads (custom file control)
  // ===============================================================
  function renderUpload(container, cfg) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'mo-q', cfg.title));

    var input = document.createElement('input');
    input.type = 'file'; input.accept = '.pdf,.jpg,.jpeg'; input.id = cfg.inputId; input.className = 'mo-file-input';
    var btn = el('label', 'mo-file-btn'); btn.setAttribute('for', cfg.inputId);
    btn.appendChild(el('span', 'mo-file-icon', '📎'));
    btn.appendChild(el('span', '', 'Choose file (PDF or JPEG)'));
    var nameOut = el('div', 'mo-file-name');

    var err = el('div', 'mo-error'); err.hidden = true;

    function showName(file) {
      nameOut.textContent = '✓ ' + file.name;
      nameOut.className = 'mo-file-name set';
    }
    function clearName() { nameOut.textContent = ''; nameOut.className = 'mo-file-name'; }

    var existing = formData[cfg.key];
    if (existing) { showName(existing); }

    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) { return; }
      var ext = (file.name.split('.').pop() || '').toLowerCase();
      if (FILE_EXT.indexOf(ext) < 0) { formData[cfg.key] = null; clearName(); return fieldError(err, 'Please upload a PDF or JPEG file.'); }
      if (file.size > FILE_MAX) { formData[cfg.key] = null; clearName(); return fieldError(err, 'That file is larger than 5 MB. Please upload a smaller file.'); }
      err.hidden = true;
      formData[cfg.key] = file;
      showName(file);
    });

    active.appendChild(input);
    active.appendChild(btn);
    active.appendChild(nameOut);
    if (cfg.subtext) { active.appendChild(el('p', 'mo-help', cfg.subtext)); }
    active.appendChild(err);

    var next = el('button', 'btn btn-primary mo-next', 'Next'); next.type = 'button';
    next.addEventListener('click', function () {
      if (!formData[cfg.key]) { return fieldError(err, 'Please upload a file to continue.'); }
      err.hidden = true;
      complete(container, cfg.summaryLabel, formData[cfg.key].name);
      advanceFrom(container.id);
    });
    active.appendChild(next);
  }

  function renderExpiringUpload(container) {
    renderUpload(container, {
      key: 'expiringPolicy', inputId: 'moExpiring', summaryLabel: 'Expiring policy',
      title: 'Please upload your expiring policy copy.', subtext: 'Required for NCB continuity.'
    });
  }
  function renderRcUpload(container) {
    renderUpload(container, {
      key: 'rcBook', inputId: 'moRc', summaryLabel: 'RC book',
      title: 'Please upload your RC book.', subtext: null
    });
  }

  // ===============================================================
  // STEP 5 — Add-on coverages (final submit)
  // ===============================================================
  function renderAddons(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'mo-q', 'Any specific coverage that you would like for your car?'));
    var ta = document.createElement('textarea');
    ta.className = 'f'; ta.id = 'moAddons'; ta.rows = 3;
    ta.placeholder = 'Optional — e.g. Zero Depreciation, Engine Cover, Tyre Cover';
    if (formData.addons) ta.value = formData.addons;
    active.appendChild(ta);
    active.appendChild(el('p', 'mo-help', '(e.g. Zero Depreciation, Engine Cover, Tyre Cover)'));

    var err = el('div', 'mo-error'); err.hidden = true; active.appendChild(err);

    var submit = el('button', 'btn btn-primary mo-next', 'Submit for Quote'); submit.type = 'button';
    submit.addEventListener('click', function () {
      formData.addons = ta.value.trim();
      // File objects can't be JSON-stringified — describe them instead.
      console.log('Motor enquiry captured:\n' + JSON.stringify(formData, function (k, v) {
        return (typeof File !== 'undefined' && v instanceof File) ? (v.name + ' (' + v.type + ', ' + v.size + ' bytes)') : v;
      }, 2));
      sendEnquiry(submit, err, container);
    });
    active.appendChild(submit);
  }

  // ===============================================================
  // Submit — read both files to base64, send server-side, then confirm
  // ===============================================================
  var WA_NUM = '918369988285';

  // Google Apps Script web-app URL that receives enquiries and emails them to
  // Kevin (shared with the main site enquiry form). Motor sends two documents as
  // fileData/fileData2 and no age; the endpoint attaches both and treats age as
  // optional.
  var ENQUIRY_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxXTjDanx0ZdZExoP3-arcDQo0Wb9EbsZ6_BrDjuYIQxAcyRP42a8KkEHhhiEFg7pys6Q/exec';

  function readB64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        var res = r.result || '';
        resolve(res.indexOf(',') >= 0 ? res.split(',')[1] : res);
      };
      r.onerror = function () { reject(new Error('read failed')); };
      r.readAsDataURL(file);
    });
  }

  function sendEnquiry(submit, err, container) {
    var ep = formData.expiringPolicy, rc = formData.rcBook;
    submit.disabled = true;
    submit.textContent = 'Sending…';

    Promise.all([readB64(ep), readB64(rc)]).then(function (b64) {
      var products = 'Motor cover — Car: ' + formData.carNumber
        + ' | Claim in expiring policy: ' + formData.claim
        + (formData.claim === 'Yes' ? (' (more than one claim: ' + formData.multiClaim + ')') : '')
        + ' | Add-ons: ' + (formData.addons || 'None');

      var data = new FormData();
      data.append('name', formData.name);
      data.append('email', formData.email);
      data.append('mobile', formData.phone);
      data.append('products', products);
      data.append('botcheck', '');
      data.append('fileData', b64[0]); data.append('fileName', ep.name); data.append('fileType', ep.type || 'application/octet-stream');
      data.append('fileData2', b64[1]); data.append('fileName2', rc.name); data.append('fileType2', rc.type || 'application/octet-stream');

      return fetch(ENQUIRY_ENDPOINT, { method: 'POST', body: data, mode: 'no-cors' });
    }).then(function () {
      complete(container, 'Add-ons', formData.addons ? truncate(formData.addons, 50) : 'None');
      showDone();
    }).catch(function () {
      submit.disabled = false;
      submit.textContent = 'Submit for Quote';
      err.hidden = false;
      err.textContent = "Couldn't send your enquiry — please check your connection and try again.";
    });
  }

  function showDone() {
    var done = document.getElementById('moDone');
    done.textContent = '';
    done.appendChild(el('div', 'mo-done-icon', '✓'));
    done.appendChild(el('h3', '', 'Submitted securely!'));
    done.appendChild(el('p', '', 'Thanks ' + formData.name + ' — your car details and documents have been submitted securely. Kevin will be in touch shortly.'));

    var recap = el('dl', 'mo-recap');
    function row(label, value) {
      var r = el('div', 'mo-recap-row');
      r.appendChild(el('dt', '', label));
      r.appendChild(el('dd', '', value));
      recap.appendChild(r);
    }
    row('Name', formData.name);
    row('Contact', formData.phone + ' · ' + formData.email);
    row('Car number', formData.carNumber);
    row('Claim in expiring policy', formData.claim === 'Yes' ? ('Yes (more than one: ' + formData.multiClaim + ')') : 'No');
    row('Documents', [formData.expiringPolicy && formData.expiringPolicy.name, formData.rcBook && formData.rcBook.name].filter(Boolean).join(', '));
    row('Add-ons', formData.addons ? truncate(formData.addons, 40) : 'None');
    done.appendChild(recap);

    var wa = el('a', 'btn btn-primary', 'Message Kevin on WhatsApp');
    wa.href = 'https://wa.me/' + WA_NUM + '?text='
      + encodeURIComponent('Hi Kevin! I just sent a motor insurance enquiry through the website.');
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
    formData = { name: '', email: '', phone: '', carNumber: '', claim: null, multiClaim: null, expiringPolicy: null, rcBook: null, addons: '' };
    ORDER.forEach(function (id) {
      var c = document.getElementById(id);
      c.classList.add('hidden');
      c.classList.remove('completed-step');
      activeOf(c).textContent = '';
      c.querySelector('.mo-step-summary').textContent = '';
    });
    document.getElementById('moDone').classList.add('hidden');
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
