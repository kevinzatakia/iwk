/* Progressive Workmen Compensation enquiry form — vanilla-JS wizard (shares the
   yb-* wizard shell with js/health.js and js/term.js). Collects contact details,
   organisation & payroll, work description & policy duration, then risk location
   & an optional medical extension. Each answer locks with a green check and reveals
   the next step; on submit the payload is emailed to Kevin via the shared endpoint. */
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
    name: '', email: '', phone: '',
    org: '', employees: null, salary: null,
    natureOfWork: '', empDesc: '', duration: null,
    riskLocation: '', medical: null
  };

  var ORDER = ['ybStep2', 'ybStep3', 'ybStep4'];
  var RENDERERS = { ybStep2: renderOrg, ybStep3: renderWork, ybStep4: renderLocation };
  var OWNS = {
    ybStep2: ['org', 'employees', 'salary'],
    ybStep3: ['natureOfWork', 'empDesc', 'duration'],
    ybStep4: ['riskLocation', 'medical']
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

  // Small builders reused across steps.
  function field(labelText, node, subText) {
    var f = el('div', 'yb-field');
    var lab = el('label', 'f-label wc-field-label', labelText);
    if (node.id) { lab.setAttribute('for', node.id); }
    f.appendChild(lab);
    f.appendChild(node);
    if (subText) { f.appendChild(el('span', 'wc-sub', subText)); }
    return f;
  }
  function textInput(id, placeholder) {
    var i = document.createElement('input');
    i.className = 'f'; i.id = id; i.type = 'text'; i.placeholder = placeholder || '';
    return i;
  }
  function numberInput(id, placeholder) {
    var i = document.createElement('input');
    i.className = 'f'; i.id = id; i.type = 'text'; i.inputMode = 'numeric'; i.placeholder = placeholder || '';
    i.addEventListener('input', function () { this.value = this.value.replace(/\D/g, ''); });
    return i;
  }
  function textArea(id, placeholder) {
    var t = document.createElement('textarea');
    t.className = 'f'; t.id = id; t.placeholder = placeholder || '';
    return t;
  }
  // Single-select rounded pills.
  function pillGroup(options, current, onSelect) {
    var wrap = el('div', 'wc-pills');
    var pills = [];
    options.forEach(function (opt) {
      var p = el('button', 'wc-pill' + (current === opt ? ' on' : ''), opt);
      p.type = 'button';
      p.addEventListener('click', function () {
        pills.forEach(function (x) { x.classList.remove('on'); });
        p.classList.add('on');
        onSelect(opt);
      });
      pills.push(p);
      wrap.appendChild(p);
    });
    return wrap;
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
  // STEP 2 — Organisation & payroll
  // ===============================================================
  function renderOrg(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'yb-q', 'Organisation & payroll details'));

    var fields = el('div', 'yb-fields');
    var org = textInput('wcOrg', 'e.g. Acme Constructions Pvt Ltd');
    if (formData.org) org.value = formData.org;
    var emp = numberInput('wcEmp', 'e.g. 25');
    if (formData.employees != null) emp.value = String(formData.employees);
    var salWrap = el('div', 'wc-rupee');
    var sal = numberInput('wcSal', 'e.g. 18000');
    if (formData.salary != null) sal.value = String(formData.salary);
    salWrap.appendChild(sal);

    fields.appendChild(field('Name of the organisation', org));
    fields.appendChild(field('Number of employees to be covered', emp));
    var salField = field('Salary per month', salWrap);
    fields.appendChild(salField);
    active.appendChild(fields);

    var err = el('div', 'yb-error'); err.hidden = true;
    active.appendChild(err);

    var next = el('button', 'btn btn-primary yb-next', 'Next');
    next.type = 'button';
    next.addEventListener('click', function () {
      var orgV = org.value.trim();
      var empV = parseInt(emp.value, 10);
      var salV = parseInt(sal.value, 10);
      if (!orgV) { err.hidden = false; err.textContent = 'Please enter the organisation name.'; return; }
      if (!(empV >= 1)) { err.hidden = false; err.textContent = 'Please enter the number of employees (1 or more).'; return; }
      if (!(salV >= 1)) { err.hidden = false; err.textContent = 'Please enter a valid monthly salary.'; return; }
      err.hidden = true;
      formData.org = orgV; formData.employees = empV; formData.salary = salV;
      complete(container, 'Organisation', orgV + ' · ' + empV + ' employees · ₹' + salV.toLocaleString('en-IN') + '/mo');
      advanceFrom(container.id);
    });
    active.appendChild(next);
  }

  // ===============================================================
  // STEP 3 — Work description & policy duration
  // ===============================================================
  var DURATIONS = ['3 Months', '6 Months', '9 Months', '1 Year'];

  function renderWork(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'yb-q', 'Work description & policy duration'));

    var fields = el('div', 'yb-fields');
    var nature = textArea('wcNature', 'Describe the type of work carried out');
    if (formData.natureOfWork) nature.value = formData.natureOfWork;
    var desc = textInput('wcDesc', 'e.g. Civil Workers');
    if (formData.empDesc) desc.value = formData.empDesc;
    fields.appendChild(field('Nature of work', nature));
    fields.appendChild(field('Description of employees', desc, 'e.g. Civil Workers, machine operators, security staff'));
    active.appendChild(fields);

    active.appendChild(el('label', 'wc-pill-q', 'Duration of policy required'));
    var duration = formData.duration;
    active.appendChild(pillGroup(DURATIONS, formData.duration, function (v) { duration = v; }));

    var err = el('div', 'yb-error'); err.hidden = true;
    active.appendChild(err);

    var next = el('button', 'btn btn-primary yb-next', 'Next');
    next.type = 'button';
    next.addEventListener('click', function () {
      var natureV = nature.value.trim();
      var descV = desc.value.trim();
      if (!natureV) { err.hidden = false; err.textContent = 'Please describe the nature of work.'; return; }
      if (!descV) { err.hidden = false; err.textContent = 'Please describe the employees to be covered.'; return; }
      if (!duration) { err.hidden = false; err.textContent = 'Please choose a policy duration.'; return; }
      err.hidden = true;
      formData.natureOfWork = natureV; formData.empDesc = descV; formData.duration = duration;
      complete(container, 'Work details', descV + ' · ' + duration);
      advanceFrom(container.id);
    });
    active.appendChild(next);
  }

  // ===============================================================
  // STEP 4 — Risk location & medical extension (final submit)
  // ===============================================================
  function renderLocation(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'yb-q', 'Risk location & medical cover'));

    var fields = el('div', 'yb-fields');
    var loc = textArea('wcLoc', 'Full address of the work site / risk location');
    if (formData.riskLocation) loc.value = formData.riskLocation;
    fields.appendChild(field('Risk location address', loc));
    active.appendChild(fields);

    active.appendChild(el('label', 'wc-pill-q', 'Do you need coverage for medical expenses for employees?'));
    var note = el('div', 'wc-note', 'Note: Limit for each Employee is 1 Lakh.');
    note.hidden = formData.medical !== 'Yes';
    var medical = formData.medical;
    active.appendChild(pillGroup(['Yes', 'No'], formData.medical, function (v) {
      medical = v;
      note.hidden = (v !== 'Yes');
    }));
    active.appendChild(note);

    var err = el('div', 'yb-error'); err.hidden = true;
    active.appendChild(err);

    var submit = el('button', 'btn btn-primary yb-next', 'Submit for Quote');
    submit.type = 'button';
    submit.addEventListener('click', function () {
      var locV = loc.value.trim();
      if (!locV) { err.hidden = false; err.textContent = 'Please enter the risk location address.'; return; }
      if (!medical) { err.hidden = false; err.textContent = 'Please choose whether you need medical cover.'; return; }
      err.hidden = true;
      formData.riskLocation = locV; formData.medical = medical;
      console.log('Workmen Compensation enquiry captured:\n' + JSON.stringify(formData, null, 2));
      sendEnquiry(submit, err, container);
    });
    active.appendChild(submit);
  }

  // ===============================================================
  // Submit — send to Kevin server-side, then confirm
  // ===============================================================
  var WA_NUM = '918369988285';
  // Shared website enquiry endpoint (also used by the Health / Term forms).
  var ENQUIRY_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxXTjDanx0ZdZExoP3-arcDQo0Wb9EbsZ6_BrDjuYIQxAcyRP42a8KkEHhhiEFg7pys6Q/exec';

  function sendEnquiry(submit, err, container) {
    var products = 'Workmen Compensation — Organisation: ' + formData.org
      + ' | Employees covered: ' + formData.employees
      + ' | Salary/month: ₹' + formData.salary
      + ' | Nature of work: ' + formData.natureOfWork
      + ' | Employee description: ' + formData.empDesc
      + ' | Policy duration: ' + formData.duration
      + ' | Risk location: ' + formData.riskLocation
      + ' | Medical extension: ' + formData.medical;

    var data = new FormData();
    data.append('name', formData.name);
    data.append('email', formData.email);
    data.append('mobile', formData.phone);
    data.append('products', products);
    data.append('health', 'N/A (workmen compensation)');
    data.append('botcheck', '');

    submit.disabled = true;
    submit.textContent = 'Sending…';

    fetch(ENQUIRY_ENDPOINT, { method: 'POST', body: data, mode: 'no-cors' })
      .then(function () {
        complete(container, 'Risk & medical', 'Medical extension: ' + formData.medical);
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
    done.appendChild(el('p', '', 'Thanks ' + formData.name + ' — your Workmen Compensation requirements have reached Kevin. He\'ll be in touch shortly.'));

    var recap = el('dl', 'yb-recap');
    function rowr(label, value) {
      var r = el('div', 'yb-recap-row');
      r.appendChild(el('dt', '', label));
      r.appendChild(el('dd', '', value));
      recap.appendChild(r);
    }
    rowr('Name', formData.name);
    rowr('Contact', formData.phone + ' · ' + formData.email);
    rowr('Organisation', formData.org);
    rowr('Employees', String(formData.employees));
    rowr('Salary / month', '₹' + Number(formData.salary).toLocaleString('en-IN'));
    rowr('Nature of work', formData.natureOfWork);
    rowr('Employee description', formData.empDesc);
    rowr('Duration', formData.duration);
    rowr('Risk location', formData.riskLocation);
    rowr('Medical extension', formData.medical);
    done.appendChild(recap);

    var wa = el('a', 'btn btn-primary', 'Message Kevin on WhatsApp');
    wa.href = 'https://wa.me/' + WA_NUM + '?text='
      + encodeURIComponent('Hi Kevin! I just sent a Workmen Compensation enquiry through the website.');
    wa.target = '_blank'; wa.rel = 'noopener';
    done.appendChild(wa);

    reveal(done);
  }

  // ===============================================================
  // Start over
  // ===============================================================
  restartBtn.addEventListener('click', function () {
    formData = { name: '', email: '', phone: '', org: '', employees: null, salary: null, natureOfWork: '', empDesc: '', duration: null, riskLocation: '', medical: null };
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
