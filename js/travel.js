/* Travel insurance progressive enquiry — vanilla-JS wizard on travel.html.
   Asks contact details, then steps through who's travelling, their ages, trip
   dates, destination, sum insured and pre-existing conditions. Each answer locks
   with a green check and fades in the next question; completed steps stay visible
   (greyed/minimised) and can be edited. On submit the whole formData object is
   logged as JSON and sent to Kevin server-side (shared enquiry endpoint). */
(function () {
  var wizard = document.getElementById('tvWizard');
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
    members: [],        // expanded individuals, e.g. ['Self','Spouse','Son 1']
    counts: {},         // { Son: 2, Daughter: 1 }
    ages: {},           // { 'Self': 30, 'Son 1': 5, ... }
    departure: null,
    arrival: null,
    country: null,
    sumInsured: null,
    conditions: []
  };

  // Ordered data steps (after the contact step). Used for advancing + reset-on-edit.
  var ORDER = ['tvStep2', 'tvStep3', 'tvStep4', 'tvStep5', 'tvStep6', 'tvStep7'];
  var RENDERERS = {
    tvStep2: renderMembers,
    tvStep3: renderAges,
    tvStep4: renderDates,
    tvStep5: renderCountry,
    tvStep6: renderSum,
    tvStep7: renderConditions
  };
  // formData keys owned by each step, wiped when that step (or an earlier one) is edited.
  var OWNS = {
    tvStep2: ['members', 'counts'],
    tvStep3: ['ages'],
    tvStep4: ['departure', 'arrival'],
    tvStep5: ['country'],
    tvStep6: ['sumInsured'],
    tvStep7: ['conditions']
  };

  var restartBtn = document.getElementById('tvRestart');

  // ---- reveal / collapse helpers ----
  function reveal(node) {
    node.classList.remove('hidden');
    node.classList.add('tv-enter');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { node.classList.remove('tv-enter'); });
    });
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Collapse a step into its greyed summary row (green check + label + value + Edit).
  function complete(container, label, value) {
    var summary = container.querySelector('.tv-step-summary');
    summary.textContent = '';
    summary.appendChild(el('span', 'tv-check', '✓'));
    var body = el('div', 'tv-summary-body');
    body.appendChild(el('div', 'tv-summary-label', label));
    body.appendChild(el('div', 'tv-summary-value', value));
    summary.appendChild(body);
    var edit = el('button', 'tv-edit', 'Edit');
    edit.type = 'button';
    edit.addEventListener('click', function () { editStep(container.id); });
    summary.appendChild(edit);
    container.classList.add('completed-step');
  }

  // Re-open a completed step and reset every step after it.
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
    document.getElementById('tvDone').classList.add('hidden');
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

  function activeOf(container) { return container.querySelector('.tv-step-active'); }
  function fieldError(err, msg) { err.hidden = false; err.textContent = msg; }

  // ===============================================================
  // STEP 1 — Contact details + age
  // ===============================================================
  var nameInput = document.getElementById('tvName');
  var emailInput = document.getElementById('tvEmail');
  var phoneInput = document.getElementById('tvPhone');
  var ageInput = document.getElementById('tvAge');
  var ageBtn = document.getElementById('tvAgeBtn');
  var ageErr = document.getElementById('tvAgeErr');
  var step1 = document.getElementById('tvStep1');

  var EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

  phoneInput.addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '').slice(0, 10);
  });
  ageInput.addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '').slice(0, 3);
  });
  ageInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); ageBtn.click(); }
  });

  ageBtn.addEventListener('click', function () {
    var name = nameInput.value.trim();
    var email = emailInput.value.trim();
    var phone = phoneInput.value.trim();
    var age = parseInt(ageInput.value, 10);
    if (name.length < 2) { return fieldError(ageErr, 'Please enter your name.'); }
    if (!EMAIL_RE.test(email)) { return fieldError(ageErr, 'Please enter a valid email address, e.g. name@example.com.'); }
    if (!/^[0-9]{10}$/.test(phone)) { return fieldError(ageErr, 'Please enter a valid 10-digit mobile number.'); }
    if (!(age >= 1 && age <= 120)) { return fieldError(ageErr, 'Please enter a valid age between 1 and 120.'); }
    ageErr.hidden = true;
    formData.name = name;
    formData.email = email;
    formData.phone = phone;
    formData.age = age;
    restartBtn.classList.remove('hidden');
    complete(step1, 'Your details', name + ' · ' + age + ' yrs · ' + phone);
    var first = document.getElementById(ORDER[0]);
    RENDERERS[ORDER[0]](first);
    reveal(first);
  });

  // ===============================================================
  // STEP 2 — Member selection
  // ===============================================================
  var MEMBER_TYPES = ['Self', 'Spouse', 'Son', 'Daughter', 'Father', 'Mother'];
  // Only these ask "how many?" and expand into numbered individuals.
  var COUNTED = ['Son', 'Daughter'];

  function renderMembers(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'tv-q', "Who's travelling?"));

    var tiles = el('div', 'tv-tiles');
    var counts = el('div', 'tv-counts');

    var chosenTypes = {};
    formData.members.forEach(function (m) {
      chosenTypes[m.replace(/\s+\d+$/, '')] = true;
    });

    function renderCounts() {
      counts.textContent = '';
      COUNTED.forEach(function (t) {
        if (!chosenTypes[t]) return;
        var row = el('div', 'tv-count-row');
        var cid = 'tvCount' + t;
        var lab = el('label', '', 'How many ' + (t === 'Son' ? 'sons' : 'daughters') + '?');
        lab.setAttribute('for', cid);
        var inp = document.createElement('input');
        inp.className = 'f'; inp.type = 'number'; inp.min = '1'; inp.max = '5';
        inp.id = cid; inp.dataset.type = t;
        inp.value = String(formData.counts[t] || 1);
        inp.addEventListener('input', function () {
          if (parseInt(this.value, 10) > 5) this.value = '5';
        });
        row.appendChild(lab);
        row.appendChild(inp);
        counts.appendChild(row);
      });
    }

    MEMBER_TYPES.forEach(function (type) {
      var tile = el('label', 'tv-tile' + (chosenTypes[type] ? ' on' : ''));
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.value = type; cb.checked = !!chosenTypes[type];
      cb.addEventListener('change', function () {
        chosenTypes[type] = cb.checked;
        tile.classList.toggle('on', cb.checked);
        if (COUNTED.indexOf(type) >= 0) { renderCounts(); }
      });
      tile.appendChild(cb);
      tile.appendChild(el('span', '', type));
      tiles.appendChild(tile);
    });

    active.appendChild(tiles);
    active.appendChild(counts);
    renderCounts();

    var err = el('div', 'tv-error'); err.hidden = true;
    active.appendChild(err);

    var next = el('button', 'btn btn-primary tv-next', 'Next');
    next.type = 'button';
    next.addEventListener('click', function () {
      var picked = MEMBER_TYPES.filter(function (t) { return chosenTypes[t]; });
      if (!picked.length) { return fieldError(err, 'Please select at least one traveller.'); }

      var counts2 = {};
      var bad = false;
      COUNTED.forEach(function (t) {
        if (chosenTypes[t]) {
          var v = parseInt(counts.querySelector('input[data-type="' + t + '"]').value, 10);
          if (!(v >= 1 && v <= 5)) { bad = true; }
          counts2[t] = v;
        }
      });
      if (bad) { return fieldError(err, 'Please enter how many (1–5) for sons/daughters.'); }
      err.hidden = true;

      var members = [];
      picked.forEach(function (t) {
        if (COUNTED.indexOf(t) < 0) { members.push(t); }
        else { for (var i = 1; i <= counts2[t]; i++) { members.push(t + ' ' + i); } }
      });
      formData.members = members;
      formData.counts = counts2;

      complete(container, 'Travellers', summariseMembers(picked, counts2));
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
  // STEP 3 — Dynamic ages (Self's age already captured in step 1)
  // ===============================================================
  function ageLabel(member) {
    if (member === 'Spouse') return "Spouse's age";
    return member + ' age'; // 'Son 1 age', 'Father age'
  }

  function renderAges(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'tv-q', 'How old is everyone travelling?'));

    var others = formData.members.filter(function (m) { return m !== 'Self'; });
    var grid = el('div', 'tv-ages');
    if (!others.length) {
      grid.appendChild(el('p', 'tv-note', 'Just you travelling — we already have your age from step 1.'));
    }
    others.forEach(function (member, i) {
      var field = el('div', 'tv-age-field');
      var id = 'tvAgeM' + i;
      var lab = el('label', '', ageLabel(member));
      lab.setAttribute('for', id);
      var inp = document.createElement('input');
      inp.className = 'f'; inp.type = 'number'; inp.min = '1'; inp.max = '120';
      inp.id = id; inp.dataset.member = member;
      if (formData.ages[member] != null) inp.value = String(formData.ages[member]);
      field.appendChild(lab);
      field.appendChild(inp);
      grid.appendChild(field);
    });
    active.appendChild(grid);

    var err = el('div', 'tv-error'); err.hidden = true;
    active.appendChild(err);

    var next = el('button', 'btn btn-primary tv-next', 'Next');
    next.type = 'button';
    next.addEventListener('click', function () {
      var ages = {};
      var ok = true;
      grid.querySelectorAll('input').forEach(function (inp) {
        var v = parseInt(inp.value, 10);
        if (!(v >= 1 && v <= 120)) ok = false;
        ages[inp.dataset.member] = v;
      });
      if (!ok) { return fieldError(err, 'Please enter a valid age (1–120) for everyone.'); }
      // Self's age carries over from step 1.
      if (formData.members.indexOf('Self') >= 0) { ages['Self'] = formData.age; }
      err.hidden = true;
      formData.ages = ages;
      var value = formData.members.map(function (m) { return m + ' ' + ages[m]; }).join(', ');
      complete(container, 'Ages', value);
      advanceFrom(container.id);
    });
    active.appendChild(next);
  }

  // ===============================================================
  // STEP 4 — Travel dates
  // ===============================================================
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

  function renderDates(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'tv-q', 'When are you travelling?'));
    var today = todayStr();
    var wrap = el('div', 'tv-dates');

    var depField = el('div', 'tv-date-field');
    var depLab = el('label', '', 'Date of departure'); depLab.setAttribute('for', 'tvDep');
    var dep = document.createElement('input');
    dep.className = 'f'; dep.type = 'date'; dep.id = 'tvDep'; dep.min = today;
    if (formData.departure) dep.value = formData.departure;
    depField.appendChild(depLab); depField.appendChild(dep);

    var arrField = el('div', 'tv-date-field');
    var arrLab = el('label', '', 'Date of arrival (return)'); arrLab.setAttribute('for', 'tvArr');
    var arr = document.createElement('input');
    arr.className = 'f'; arr.type = 'date'; arr.id = 'tvArr'; arr.min = formData.departure || today;
    if (formData.arrival) arr.value = formData.arrival;
    arrField.appendChild(arrLab); arrField.appendChild(arr);

    // Keep the arrival floor in step with the chosen departure.
    dep.addEventListener('change', function () { arr.min = dep.value || today; });

    wrap.appendChild(depField);
    wrap.appendChild(arrField);
    active.appendChild(wrap);

    var err = el('div', 'tv-error'); err.hidden = true;
    active.appendChild(err);

    var next = el('button', 'btn btn-primary tv-next', 'Next');
    next.type = 'button';
    next.addEventListener('click', function () {
      var d = dep.value, a = arr.value;
      if (!d) { return fieldError(err, 'Please choose your date of departure.'); }
      if (d < today) { return fieldError(err, 'Departure date must be today or later.'); }
      if (!a) { return fieldError(err, 'Please choose your date of arrival.'); }
      if (a <= d) { return fieldError(err, 'Arrival must be after departure.'); }
      err.hidden = true;
      formData.departure = d;
      formData.arrival = a;
      complete(container, 'Travel dates', d + ' → ' + a);
      advanceFrom(container.id);
    });
    active.appendChild(next);
  }

  // ===============================================================
  // STEP 5 — Country of visit (auto-advance)
  // ===============================================================
  var COUNTRIES = [
    'United States', 'United Kingdom', 'United Arab Emirates', 'Thailand', 'Singapore',
    'Malaysia', 'France', 'Italy', 'Switzerland', 'Australia', 'Japan', 'Canada', 'Maldives', 'Other'
  ];

  function renderCountry(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'tv-q', 'Which country are you visiting?'));

    var sel = document.createElement('select');
    sel.className = 'f tv-select';
    var ph = document.createElement('option');
    ph.value = ''; ph.textContent = 'Select a country'; ph.disabled = true; ph.selected = !formData.country;
    sel.appendChild(ph);
    COUNTRIES.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c; o.textContent = c;
      if (formData.country === c) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () {
      if (!sel.value) return;
      formData.country = sel.value;
      complete(container, 'Country', sel.value);
      advanceFrom(container.id);
    });
    active.appendChild(sel);
  }

  // ===============================================================
  // STEP 6 — Sum insured (auto-advance)
  // ===============================================================
  var SUMS = [
    { label: 'USD 1L', amount: '$100,000' },
    { label: 'USD 2.5L', amount: '$250,000' },
    { label: 'USD 5L', amount: '$500,000' },
    { label: 'USD 10L', amount: '$1,000,000' }
  ];

  function renderSum(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'tv-q', 'How much cover do you want?'));
    var grid = el('div', 'tv-grid');
    SUMS.forEach(function (s) {
      var val = s.label + ' (' + s.amount + ')';
      var btn = el('button', 'tv-si' + (formData.sumInsured === val ? ' on' : ''));
      btn.type = 'button';
      btn.appendChild(el('span', 'tv-si-label', s.label));
      btn.appendChild(el('span', 'tv-si-amt', s.amount));
      btn.addEventListener('click', function () {
        formData.sumInsured = val;
        complete(container, 'Sum insured', val);
        advanceFrom(container.id);
      });
      grid.appendChild(btn);
    });
    active.appendChild(grid);
  }

  // ===============================================================
  // STEP 7 — Pre-existing conditions (final submit)
  // ===============================================================
  var CONDITIONS = ['Diabetes', 'Hypertension', 'Asthma', 'Heart Disease', 'None of these'];
  var NONE = 'None of these';

  function renderConditions(container) {
    var active = activeOf(container);
    active.textContent = '';
    active.appendChild(el('label', 'tv-q', 'Any pre-existing conditions?'));

    var wrap = el('div', 'tv-conditions');
    var selected = formData.conditions.slice();
    var pills = {};

    function syncClasses() {
      CONDITIONS.forEach(function (c) {
        pills[c].classList.toggle('on', selected.indexOf(c) >= 0);
        pills[c].querySelector('input').checked = selected.indexOf(c) >= 0;
      });
    }

    CONDITIONS.forEach(function (c) {
      var pill = el('label', 'tv-cond');
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.value = c;
      cb.addEventListener('change', function () {
        if (c === NONE) {
          selected = cb.checked ? [NONE] : [];
        } else if (cb.checked) {
          selected = selected.filter(function (x) { return x !== NONE; });
          selected.push(c);
        } else {
          selected = selected.filter(function (x) { return x !== c; });
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

    var err = el('div', 'tv-error'); err.hidden = true;
    active.appendChild(err);

    var submit = el('button', 'btn btn-primary tv-next', 'Submit for Quote');
    submit.type = 'button';
    submit.addEventListener('click', function () {
      if (!selected.length) { return fieldError(err, 'Please choose a condition, or “None of these”.'); }
      err.hidden = true;
      formData.conditions = selected.slice();
      console.log('Travel cover enquiry captured:\n' + JSON.stringify(formData, null, 2));
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
  // fields, so the travel-specific answers are packed into the "products" line
  // (kept to one line — the endpoint strips line breaks).
  function sendEnquiry(submit, err, container, selected) {
    var products = 'Travel cover — Travellers: ' + membersText()
      + ' | Trip: ' + formData.departure + ' to ' + formData.arrival
      + ' | Country: ' + formData.country
      + ' | Sum insured: ' + formData.sumInsured;

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

    fetch(ENQUIRY_ENDPOINT, { method: 'POST', body: data, mode: 'no-cors' })
      .then(function () {
        complete(container, 'Conditions', selected.join(', '));
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
    var done = document.getElementById('tvDone');
    done.textContent = '';
    done.appendChild(el('div', 'tv-done-icon', '✓'));
    done.appendChild(el('h3', '', 'Enquiry sent!'));
    done.appendChild(el('p', '', 'Thanks ' + formData.name + ' — your travel details have reached Kevin. He\'ll be in touch shortly.'));

    var recap = el('dl', 'tv-recap');
    function row(label, value) {
      var r = el('div', 'tv-recap-row');
      r.appendChild(el('dt', '', label));
      r.appendChild(el('dd', '', value));
      recap.appendChild(r);
    }
    row('Name', formData.name);
    row('Contact', formData.phone + ' · ' + formData.email);
    row('Travellers', membersText());
    row('Trip dates', formData.departure + ' → ' + formData.arrival);
    row('Country', formData.country);
    row('Sum insured', formData.sumInsured);
    row('Conditions', formData.conditions.join(', '));
    done.appendChild(recap);

    var wa = el('a', 'btn btn-primary', 'Message Kevin on WhatsApp');
    wa.href = 'https://wa.me/' + WA_NUM + '?text='
      + encodeURIComponent('Hi Kevin! I just sent a travel cover enquiry through the website.');
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
    formData = { name: '', email: '', phone: '', age: null, members: [], counts: {}, ages: {}, departure: null, arrival: null, country: null, sumInsured: null, conditions: [] };
    ORDER.forEach(function (id) {
      var c = document.getElementById(id);
      c.classList.add('hidden');
      c.classList.remove('completed-step');
      activeOf(c).textContent = '';
      c.querySelector('.tv-step-summary').textContent = '';
    });
    document.getElementById('tvDone').classList.add('hidden');
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
