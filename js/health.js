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
    conditions: []
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
          // "None of these" clears everything else.
          selected = cb.checked ? [NONE] : [];
        } else {
          if (cb.checked) {
            selected = selected.filter(function (x) { return x !== NONE; });
            selected.push(c);
          } else {
            selected = selected.filter(function (x) { return x !== c; });
          }
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

    var submit = el('button', 'btn btn-primary yb-next', 'Send Enquiry');
    submit.type = 'button';
    submit.addEventListener('click', function () {
      if (!selected.length) {
        err.hidden = false; err.textContent = 'Please choose a condition, or “None of these”.';
        return;
      }
      err.hidden = true;
      formData.conditions = selected.slice();
      // Log the full captured payload as JSON.
      console.log('Health cover enquiry captured:\n' + JSON.stringify(formData, null, 2));
      sendEnquiry(submit, err, container, selected);
    });
    active.appendChild(submit);
  }

  // ===============================================================
  // Submit — send to Kevin server-side, then confirm
  // ===============================================================
  var WA_NUM = '918369988285';

  // Google Apps Script web-app URL that receives enquiries and emails them to
  // Kevin (shared with the main site enquiry form).
  var ENQUIRY_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxXTjDanx0ZdZExoP3-arcDQo0Wb9EbsZ6_BrDjuYIQxAcyRP42a8KkEHhhiEFg7pys6Q/exec';

  function membersText() {
    return formData.members.map(function (m) { return m + ' (' + formData.ages[m] + ')'; }).join(', ');
  }

  // Posts the enquiry to the Apps Script endpoint so it reaches Kevin by email
  // without the visitor needing a mail app. The endpoint emails a fixed set of
  // fields, so the health-specific answers are packed into the "products" line
  // (kept to one line — the endpoint strips line breaks).
  function sendEnquiry(submit, err, container, selected) {
    var products = 'Health cover — Members: ' + membersText()
      + ' | Zone: ' + formData.zone
      + ' | Intent: ' + formData.intent
      + ' | Sum insured: ₹' + formData.sumInsured;

    var data = new FormData();
    data.append('name', formData.name);
    data.append('email', formData.email);
    data.append('mobile', formData.phone);
    data.append('age', String(formData.age));
    data.append('products', products);
    data.append('health', formData.conditions.join(', ') || 'None mentioned');
    data.append('botcheck', '');

    submit.disabled = true;
    submit.textContent = 'Sending…';

    // Apps Script web apps don't return browser-readable CORS headers, so we post
    // in no-cors mode: a resolved fetch means the request was dispatched.
    fetch(ENQUIRY_ENDPOINT, { method: 'POST', body: data, mode: 'no-cors' })
      .then(function () {
        complete(container, 'Conditions', selected.join(', '));
        showDone();
      })
      .catch(function () {
        submit.disabled = false;
        submit.textContent = 'Send Enquiry';
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
    formData = { name: '', email: '', phone: '', age: null, members: [], counts: {}, ages: {}, zone: null, intent: null, sumInsured: null, conditions: [] };
    ORDER.forEach(function (id) {
      var c = document.getElementById(id);
      c.classList.add('hidden');
      c.classList.remove('completed-step');
      activeOf(c).textContent = '';
      c.querySelector('.yb-step-summary').textContent = '';
    });
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
