// Shared builder helper: an element with an optional class and text.
// textContent (never innerHTML) keeps every builder below injection-safe.
function el(tag, cls, text) {
  var node = document.createElement(tag);
  if (cls) { node.className = cls; }
  if (text) { node.textContent = text; }
  return node;
}

(function () {
  var WA_NUM = '918369988285';
  var EMAIL = 'kevinzatakia10@gmail.com';

  var PRODUCTS = ['Life','Health','Motor','Term','Travel','Home','Fire','Shop','Workmen Compensation','Personal Accident','Port my policy'];
  var DESCRIPTIONS = {
    'Life': 'Pays your family a lump sum if something happens to you.',
    'Health': 'Covers hospital bills and medical treatment costs.',
    'Motor': 'Covers damage to your car or bike, and third-party liability.',
    'Term': 'Pure life cover: the highest payout for the lowest premium.',
    'Travel': 'Covers medical emergencies, delays and lost baggage on a trip.',
    'Home': 'Protects your home and belongings from fire, theft and damage.',
    'Fire': 'Covers loss or damage to property from fire and allied perils.',
    'Shop': 'Protects your shop, stock and equipment from damage or theft.',
    'Workmen Compensation': 'Covers medical costs and compensation for employee injuries at work.',
    'Personal Accident': 'Pays out for injury, disability or death from an accident.',
    'Port my policy': 'Already have a policy but want to switch insurers without losing your benefits.'
  };
  // "How it works" cards. The number is the position, so it's not stored.
  var STEPS = [
    { title: 'Tell me what you need', text: "Pick a product below, or say you're not sure yet; that's completely fine." },
    { title: 'I compare your options', text: 'I check plans across insurers and explain them simply, fine print included.' },
    { title: 'You choose, no pressure', text: "Take your time. I'm here to help, not to push." }
  ];

  // "Why clients work with me" cards.
  var WHY = [
    { icon: '🧭', title: 'Truly independent', text: "Advice across every major insurer, and I'm not tied to any one company." },
    { icon: '🔍', title: 'Fine print, decoded', text: 'I walk you through exclusions and waiting periods before you sign anything.' },
    { icon: '📞', title: 'Direct line to me', text: 'You reach me personally, with no call centres and no hold music, ever.' }
  ];

  var FAQS = [
    { q: 'Do I need an advisor if I can just buy a policy online?', a: 'You can, but the fine print (exclusions, waiting periods, claim process) varies a lot between insurers. I help you compare that properly, and I\'m there when you actually need to file a claim.' },
    { q: 'Do you charge a fee for advice?', a: 'No, my advice is free. Insurers pay me a standard commission, which doesn\'t change your premium.' },
    { q: 'I don\'t know which policy I need. Is that okay?', a: 'Completely normal. Pick "Not sure yet" above and just message me, and we\'ll figure it out together based on your situation.' },
    { q: 'How quickly will you respond?', a: 'Usually within a few hours. WhatsApp is the fastest way to reach me.' }
  ];

  var state = { selected: [], unsure: false, claim: null };

  var chipsEl = document.getElementById('chips');
  var hintEl = document.getElementById('pickerHint');
  var descEl = document.getElementById('descList');
  var boxesEl = document.getElementById('prodBoxes');
  var portEl = document.getElementById('portPanel');
  var portTypeEl = document.getElementById('portTypeField');
  var portTypeInput = document.getElementById('fPortType');
  var labelEl = document.getElementById('ctaLabel');
  var waEl = document.getElementById('ctaWa');
  var mailEl = document.getElementById('ctaMail');
  var claimYesEl = document.getElementById('claimYes');
  var claimNoEl = document.getElementById('claimNo');
  var claimDetailEl = document.getElementById('claimDetail');
  var claimInfoEl = document.getElementById('claimInfo');

  // build chips
  PRODUCTS.forEach(function (p) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = p;
    b.dataset.product = p;
    b.addEventListener('click', function () { toggleProduct(p); });
    chipsEl.appendChild(b);
  });
  var unsureBtn = document.createElement('button');
  unsureBtn.type = 'button';
  unsureBtn.className = 'chip chip-unsure';
  unsureBtn.textContent = 'Not sure yet, help me decide';
  unsureBtn.addEventListener('click', function () {
    state.unsure = !state.unsure;
    if (state.unsure) state.selected = [];
    render();
  });
  chipsEl.appendChild(unsureBtn);

  // build form checkboxes
  PRODUCTS.forEach(function (p) {
    var label = document.createElement('label');
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.name = 'product';
    cb.value = p;
    cb.addEventListener('change', function () { toggleProduct(p); });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(p));
    boxesEl.appendChild(label);
  });

  // build "how it works" steps
  var stepsGrid = document.getElementById('stepsGrid');
  STEPS.forEach(function (s, i) {
    var step = el('div', 'step');
    step.appendChild(el('div', 'step-num', String(i + 1)));
    step.appendChild(el('h3', '', s.title));
    step.appendChild(el('p', '', s.text));
    stepsGrid.appendChild(step);
  });

  // build "why clients work with me" cards
  var whyGrid = document.getElementById('whyGrid');
  WHY.forEach(function (w) {
    var item = el('div', 'why-item');
    item.appendChild(el('span', 'ic', w.icon));
    item.appendChild(el('h3', '', w.title));
    item.appendChild(el('p', '', w.text));
    whyGrid.appendChild(item);
  });

  // build FAQs
  var faqList = document.getElementById('faqList');
  FAQS.forEach(function (f) {
    var d = document.createElement('details');
    var s = document.createElement('summary');
    s.textContent = f.q;
    var a = document.createElement('div');
    a.className = 'a';
    a.textContent = f.a;
    d.appendChild(s);
    d.appendChild(a);
    faqList.appendChild(d);
  });

  function toggleProduct(p) {
    state.unsure = false;
    var i = state.selected.indexOf(p);
    if (i >= 0) state.selected.splice(i, 1); else state.selected.push(p);
    render();
  }

  claimYesEl.addEventListener('click', function () { state.claim = 'yes'; render(); });
  claimNoEl.addEventListener('click', function () { state.claim = 'no'; render(); });

  function waLink() {
    var text = state.unsure
      ? "Hi Kevin, I'm not sure which insurance I need yet. Could you help me figure it out?"
      : state.selected.length
        ? "Hi Kevin, I'm interested in " + state.selected.join(', ') + " insurance. Could you share more details?"
        : "Hi Kevin, I'd like some help choosing an insurance policy.";
    return 'https://wa.me/' + WA_NUM + '?text=' + encodeURIComponent(text);
  }

  function mailLink() {
    var subject = state.unsure ? 'Insurance enquiry (not sure yet)'
      : state.selected.length ? 'Enquiry: ' + state.selected.join(', ') + ' insurance'
      : 'Insurance enquiry';
    var body = state.unsure
      ? "Hi Kevin,\n\nI'm not sure which insurance I need yet. Could you help me figure it out?"
      : state.selected.length
        ? "Hi Kevin,\n\nI'm interested in " + state.selected.join(', ') + " insurance. Could you share more details?"
        : "Hi Kevin,\n\nI'd like some help choosing an insurance policy.";
    return 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }

  function render() {
    var sel = state.selected;

    chipsEl.querySelectorAll('.chip[data-product]').forEach(function (b) {
      b.classList.toggle('on', sel.indexOf(b.dataset.product) >= 0);
    });
    unsureBtn.classList.toggle('on', state.unsure);

    if (state.unsure) {
      hintEl.innerHTML = "No problem, just reach out and we'll work it out together.";
    } else if (sel.length) {
      hintEl.innerHTML = 'Selected: <b>' + sel.join(', ') + '</b>';
    } else {
      hintEl.textContent = 'Tap as many as you need; you can select more than one.';
    }

    descEl.innerHTML = '';
    sel.forEach(function (p) {
      var d = document.createElement('div');
      d.className = 'desc-item';
      var b = document.createElement('b');
      b.textContent = p;
      d.appendChild(b);
      d.appendChild(document.createTextNode(': ' + DESCRIPTIONS[p]));
      descEl.appendChild(d);
    });

    boxesEl.querySelectorAll('input').forEach(function (cb) {
      cb.checked = sel.indexOf(cb.value) >= 0;
      cb.parentElement.classList.toggle('checked', cb.checked);
    });

    var porting = sel.indexOf('Port my policy') >= 0;
    portEl.hidden = !porting;
    portTypeEl.hidden = !porting;
    claimYesEl.classList.toggle('on', state.claim === 'yes');
    claimNoEl.classList.toggle('on', state.claim === 'no');
    claimDetailEl.hidden = state.claim !== 'yes';

    labelEl.textContent = state.unsure ? 'figuring out the right cover' : sel.length ? sel.join(', ') : 'a policy';
    waEl.href = waLink();
    mailEl.href = mailLink();
  }

  document.getElementById('footWa').href = 'https://wa.me/' + WA_NUM + '?text=' + encodeURIComponent("Hi Kevin! I'd like some help with insurance.");
  document.getElementById('footMail').href = 'mailto:' + EMAIL;

  // Google Apps Script web-app URL that receives enquiries and emails them to
  // Kevin (with the policy document attached when porting). Paste the URL you
  // get after deploying apps-script-enquiry-endpoint.gs — it ends in /exec.
  var ENQUIRY_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxXTjDanx0ZdZExoP3-arcDQo0Wb9EbsZ6_BrDjuYIQxAcyRP42a8KkEHhhiEFg7pys6Q/exec';

  var submitBtn = document.getElementById('formSubmit');
  var statusEl = document.getElementById('formStatus');
  var hpEl = document.getElementById('hpBotcheck');
  var mobileField = document.getElementById('fMobile');
  var ageField = document.getElementById('fAge');
  var MAX_FILE = 5 * 1024 * 1024; // 5 MB
  var ALLOWED_EXT = ['jpg', 'jpeg', 'pdf', 'doc', 'docx'];

  // Allowlist regexes. Because these only permit a fixed character set, they
  // also block SQL-injection / header-injection payloads (quotes, semicolons,
  // spaces, line breaks) as a side effect.
  var EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  var MOBILE_RE = /^[0-9]{10}$/;

  // Live-filter to digits only so letters (incl. "e") can never be entered.
  mobileField.addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '').slice(0, 10);
  });
  ageField.addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '').slice(0, 3);
  });

  function showStatus(kind, msg) {
    statusEl.hidden = false;
    statusEl.className = 'form-status ' + kind;
    statusEl.textContent = msg;
  }

  document.getElementById('enquiryForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    var chosen = state.selected.slice();
    var isPorting = chosen.indexOf('Port my policy') >= 0;
    var fileInput = document.getElementById('policyDoc');

    // Require at least one product (or the "Not sure yet" option).
    if (!state.unsure && chosen.length === 0) {
      showStatus('err', "Please pick at least one product, or choose “Not sure yet”.");
      return;
    }

    // Name / email / mobile / age validation (fallback to the native checks,
    // and the definitive guard for our styled messages).
    if (!f.elements['name'].value.trim()) {
      showStatus('err', 'Please enter your name.');
      return;
    }
    if (!EMAIL_RE.test(f.elements['email'].value.trim())) {
      showStatus('err', 'Please enter a valid email address, e.g. name@example.com.');
      return;
    }
    if (!MOBILE_RE.test(f.elements['mobile'].value.trim())) {
      showStatus('err', 'Please enter a valid 10-digit mobile number (digits only).');
      return;
    }
    var ageNum = parseInt(f.elements['age'].value, 10);
    if (!(ageNum >= 1 && ageNum <= 120)) {
      showStatus('err', 'Please enter a valid age between 1 and 120.');
      return;
    }

    if (isPorting) {
      if (!portTypeInput.value.trim()) {
        showStatus('err', 'Please tell us which policy you\'d like to port (e.g. Health, Motor).');
        return;
      }
      if (!fileInput.files || fileInput.files.length === 0) {
        showStatus('err', "Please attach your existing policy document; it's required for porting.");
        return;
      }
      var ext = fileInput.files[0].name.split('.').pop().toLowerCase();
      if (ALLOWED_EXT.indexOf(ext) < 0) {
        showStatus('err', 'Unsupported file type. Please upload a JPG, JPEG, PDF or Word document.');
        return;
      }
      if (fileInput.files[0].size > MAX_FILE) {
        showStatus('err', 'That file is larger than 5 MB. Please upload a smaller file.');
        return;
      }
      if (!state.claim) {
        showStatus('err', "Please answer whether there's any claim in your expiring policy.");
        return;
      }
      if (state.claim === 'yes' && !claimInfoEl.value.trim()) {
        showStatus('err', 'Please tell us when the claim was made and what it was for.');
        return;
      }
    }

    if (ENQUIRY_ENDPOINT.indexOf('PASTE_YOUR') === 0) {
      showStatus('err', 'The enquiry endpoint is not configured yet. Please set ENQUIRY_ENDPOINT to your Apps Script URL.');
      return;
    }

    var products = state.unsure
      ? 'Not sure yet, needs guidance'
      : (chosen.length ? chosen.join(', ') : 'Not specified');

    // Assembles the payload and posts it to the Apps Script endpoint. The file
    // (if any) is sent as a base64 string field, so no multipart file parsing
    // is needed on the Apps Script side.
    function send(fileData, fileName, fileType) {
      var data = new FormData();
      data.append('name', f.elements['name'].value);
      data.append('email', f.elements['email'].value);
      data.append('mobile', f.elements['mobile'].value);
      data.append('age', f.elements['age'].value);
      data.append('health', f.elements['health'].value || 'None mentioned');
      data.append('products', products);
      data.append('botcheck', hpEl && hpEl.checked ? 'true' : '');
      if (isPorting) {
        data.append('portType', portTypeInput.value.trim());
        data.append('claim', state.claim === 'yes' ? 'Yes' : 'No');
        if (state.claim === 'yes') { data.append('claimDetails', claimInfoEl.value.trim()); }
      }
      if (fileData) {
        data.append('fileData', fileData);
        data.append('fileName', fileName);
        data.append('fileType', fileType);
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
      showStatus('ok', 'Sending your enquiry…');

      // Apps Script web apps don't return CORS headers a browser can read, so
      // we post in no-cors mode: the request still reaches the script and sends
      // the email; a resolved fetch means it was dispatched successfully.
      fetch(ENQUIRY_ENDPOINT, { method: 'POST', body: data, mode: 'no-cors' })
        .then(function () {
          showStatus('ok', "Thank you! Your enquiry has reached Kevin. I'll get back to you within a few hours.");
          f.reset();
          state.selected = [];
          state.unsure = false;
          state.claim = null;
          render();
        })
        .catch(function () {
          showStatus('err', "Couldn't reach the server. Please check your connection and try again, or WhatsApp Kevin directly.");
        })
        .finally(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send enquiry';
        });
    }

    if (isPorting && fileInput.files[0]) {
      var file = fileInput.files[0];
      var reader = new FileReader();
      reader.onload = function () {
        var result = reader.result || '';
        var base64 = result.indexOf(',') >= 0 ? result.split(',')[1] : result;
        send(base64, file.name, file.type || 'application/octet-stream');
      };
      reader.onerror = function () {
        showStatus('err', "Couldn't read the attached file. Please try again with a different file.");
      };
      reader.readAsDataURL(file);
    } else {
      send(null, null, null);
    }
  });

  render();
})();

/* ---------- testimonials ---------- */
(function () {
  // Card data. Add, remove or reorder entries here and the slider, its dots and
  // the avatar initials all follow automatically — no markup changes needed.
  var TESTIMONIALS = [
    {
      quote: 'Kevin compared plans from five insurers and explained the fine print in plain language. I finally understood what I was actually buying.',
      name: 'Aman Kumbhani',
      tag: 'Term Life'
    },
    {
      quote: 'No pushy sales calls, just honest advice. He flagged a waiting-period clause that would have cost me dearly at claim time.',
      name: 'Siyara Mascarenhas',
      tag: 'Health Insurance'
    },
    {
      quote: 'Porting my family floater felt daunting until Kevin walked me through it step by step. Smooth, quick and completely stress-free.',
      name: 'Binny Gulrajani',
      tag: 'Family Floater'
    },
    {
      quote: 'I reach Kevin directly whenever I have a question, with no call centres or hold music. That personal touch made all the difference.',
      name: 'Maitri Gandhi',
      tag: 'Motor Insurance'
    },
    {
      quote: 'Being truly independent, he had no reason to oversell. He recommended a smaller premium plan that fit my actual needs perfectly.',
      name: 'Lakshman Iyer',
      tag: 'Term Life'
    },
    {
      quote: 'Fast, clear and genuinely caring. Kevin replied within the hour and had a quote ready the same day. Highly recommend him.',
      name: "Melissa D'Souza",
      tag: 'Health Insurance'
    },
    {
      quote: 'When my grandfather was hospitalised, Kevin walked us through the entire cashless claim process step by step. He coordinated with the insurer and the hospital desk so the approval came through smoothly, right when we needed it most.',
      name: 'Falvi Ghia',
      tag: 'Claim Settled'
    }
  ];

  var STARS = 5;

  var track = document.getElementById('tstTrack');
  var slider = document.getElementById('tstSlider');
  var dotsWrap = document.getElementById('tstDots');
  var prevArrow = document.getElementById('tstPrev');
  var nextArrow = document.getElementById('tstNext');
  if (!track || !slider || !dotsWrap) return;

  // "Aman Kumbhani" -> "AK"
  function initials(name) {
    return name.split(/\s+/)
      .map(function (w) { return w.charAt(0); })
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  // The reusable card: one testimonial object in, one finished slide out.
  function buildSlide(t) {
    var card = el('div', 'tst-card');
    card.appendChild(el('div', 'tst-stars', new Array(STARS + 1).join('★')));
    card.appendChild(el('p', 'tst-quote', t.quote));

    var text = el('div', 'tst-person-text');
    text.appendChild(el('div', 'tst-name', t.name));
    text.appendChild(el('div', 'tst-meta', t.tag));

    var person = el('div', 'tst-person');
    person.appendChild(el('span', 'tst-avatar', initials(t.name)));
    person.appendChild(text);
    card.appendChild(person);

    var slide = el('div', 'tst-slide');
    slide.appendChild(card);
    return slide;
  }

  TESTIMONIALS.forEach(function (t) { track.appendChild(buildSlide(t)); });

  var count = TESTIMONIALS.length;
  if (!count) return;
  var index = 0;
  var timer = null;
  var DELAY = 5000;

  // Clone the first slide onto the end so we can advance past the last slide
  // and keep moving rightward into a copy of slide 1, then silently reset.
  var clone = track.children[0].cloneNode(true);
  clone.setAttribute('aria-hidden', 'true');
  track.appendChild(clone);

  var dots = [];
  for (var i = 0; i < count; i++) {
    var dot = document.createElement('button');
    dot.className = 'tst-dot' + (i === 0 ? ' on' : '');
    dot.type = 'button';
    dot.setAttribute('aria-label', 'Go to testimonial ' + (i + 1));
    (function (n) { dot.addEventListener('click', function () { slideTo(n); restart(); }); })(i);
    dotsWrap.appendChild(dot);
    dots.push(dot);
  }

  function setDots(active) {
    for (var j = 0; j < dots.length; j++) {
      dots[j].classList.toggle('on', j === active);
    }
  }
  // Animated move to a slide position (index may reach `count`, the clone).
  function slideTo(n) {
    index = n;
    track.style.transform = 'translateX(' + (-index * 100) + '%)';
    setDots(index % count);
  }

  // Snap with no animation — used to make the clone-to-first reset invisible.
  function jumpTo(n) {
    track.style.transition = 'none';
    index = n;
    track.style.transform = 'translateX(' + (-index * 100) + '%)';
    track.offsetWidth; // force reflow so the next move animates again
    track.style.transition = '';
    setDots(index % count);
  }

  function next() {
    // Safety net: if a reset was ever missed (the transition can fail to
    // complete when the page isn't painting), snap back before advancing so
    // index can't run past the clone and strand the track on blank space.
    if (index >= count) { jumpTo(0); }
    slideTo(index + 1);
  }

  // Backward wrap: at the first slide, snap to the end clone (which looks
  // identical to slide 1), then animate one step back so the last real slide
  // slides in from the left — mirror image of the forward loop.
  function prev() {
    if (index <= 0) { jumpTo(count); }
    slideTo(index - 1);
  }

  if (nextArrow) { nextArrow.addEventListener('click', function () { next(); restart(); }); }
  if (prevArrow) { prevArrow.addEventListener('click', function () { prev(); restart(); }); }

  // When the move into the clone finishes, jump back to the real first slide
  // with no animation so the reset is invisible.
  track.addEventListener('transitionend', function (e) {
    if (e.target !== track || e.propertyName !== 'transform') { return; }
    if (index === count) { jumpTo(0); }
  });

  function start() {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    timer = setInterval(next, DELAY);
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }
  function restart() { stop(); start(); }

  slider.addEventListener('mouseenter', stop);
  slider.addEventListener('mouseleave', start);

  start();

  
})();

(function () {
  // Reusable Array holding Partner Companies & Logo URLs
  var COMPANIES = [
    {
      name: "New India Assurance Co. Ltd.",
      logo: "images/New_India_Assurance.svg"
    },
    {
      name: "Oriental Insurance Co. Ltd.",
      logo: "images/Oriental_Insurance_Company_logo.jpeg"
    },
    {
      name: "Generali Central Insurance",
      logo: "images/Generali_Central_Insurance.png"
    },
    {
      name: "HDFC ERGO General Insurance",
      logo: "images/HDFC_ERGO_Logo_2025.png"
    },
    {
      name: "TATA AIG",
      logo: "images/Tata_AIG_Logo.png"
    },
    {
      name: "LIC",
      logo: "images/LIC_Logo_clean.png"
    },
    {
      name: "Bajaj General Insurance Co. Ltd.",
      logo: "images/Bajaj_clean.png"
    },
    {
      name: "TATA AIA",
      logo: "images/Tata_AIA_Life_Insurance_Logo.png"
    },
    {
      name: "HDFC Life",
      logo: "images/HDFC_Life_Logo.svg"
    },
    {
      name: "Care Health",
      logo: "images/Care_Health_Insurance_Logo.webp"
    }
  ];

  var track = document.getElementById('partnersTrack');
  var prevBtn = document.getElementById('partnerPrev');
  var nextBtn = document.getElementById('partnerNext');

  if (!track) return;

  // Reusable Component function to build a Partner Card
  function createPartnerCard(company) {
    var card = document.createElement('div');
    card.className = 'partner-card';

    var circle = document.createElement('div');
    circle.className = 'partner-icon-circle';

    var img = document.createElement('img');
    img.src = company.logo;
    img.alt = company.name + " logo";
    img.className = 'partner-logo-img';
    img.loading = 'lazy';
    
    // Fallback if logo image fails to load
    img.onerror = function() {
      console.error('Failed to load logo image:', this.src);
      console.error('Image error event details:', event);

      this.style.display = 'none';
      circle.textContent = company.name.charAt(0);
      circle.style.fontWeight = 'bold';
      circle.style.fontSize = '24px';
      circle.style.color = 'var(--green-deep)';
    };

    circle.appendChild(img);

    var name = document.createElement('div');
    name.className = 'partner-name';
    name.textContent = company.name;

    card.appendChild(circle);
    card.appendChild(name);

    return card;
  }

  // Populate the slider track dynamically
  COMPANIES.forEach(function (company) {
    track.appendChild(createPartnerCard(company));
  });

  // Slider Logic
  var currentIndex = 0;

  function getVisibleCards() {
    if (window.innerWidth <= 600) return 2;
    if (window.innerWidth <= 900) return 3;
    return 5;
  }

  function updateSlider() {
    var visibleCards = getVisibleCards();
    var maxIndex = Math.max(0, COMPANIES.length - visibleCards);
    if (currentIndex > maxIndex) currentIndex = maxIndex;
    if (currentIndex < 0) currentIndex = 0;

    var cardWidth = track.children[0].getBoundingClientRect().width + 24; // Width + gap
    track.style.transform = 'translateX(' + (-currentIndex * cardWidth) + 'px)';
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', function () {
      var visibleCards = getVisibleCards();
      if (currentIndex < COMPANIES.length - visibleCards) {
        currentIndex++;
        updateSlider();
      }
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', function () {
      if (currentIndex > 0) {
        currentIndex--;
        updateSlider();
      }
    });
  }

  window.addEventListener('resize', updateSlider);
})();
