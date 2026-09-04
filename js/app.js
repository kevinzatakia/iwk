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
  var EMAIL = 'admin@insureitwithkevin.in';

  var PRODUCTS = ['Guaranteed Returns Plans','Health','Motor','Term','Travel','Home','Fire','Shop','Workmen Compensation','Personal Accident','Port my policy'];
  var DESCRIPTIONS = {
    'Guaranteed Returns Plans': 'Guaranteed maturity payouts with life cover built in — a savings-and-protection plan.',
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

  var state = { selected: [], unsure: false };
  // Policies with their own dedicated multi-step enquiry page. Each is exclusive:
  // selecting one clears and locks every other option (unclick it to go back).
  var EXCLUSIVE_PAGES = {
    'Guaranteed Returns Plans': 'policies/guaranteed-returns.html',
    'Health': 'policies/health.html',
    'Term': 'policies/term.html',
    'Workmen Compensation': 'policies/workmen.html',
    'Personal Accident': 'policies/personal-accident.html',
    'Home': 'policies/home.html',
    'Travel': 'policies/travel.html',
    'Motor': 'policies/motor.html',
    'Fire': 'policies/fire.html',
    'Shop': 'policies/shop.html'
  };
  // Returns the exclusive policy currently selected, or null.
  function exclusiveSelected() {
    for (var i = 0; i < state.selected.length; i++) {
      if (EXCLUSIVE_PAGES[state.selected[i]]) { return state.selected[i]; }
    }
    return null;
  }

  var chipsEl = document.getElementById('chips');
  var hintEl = document.getElementById('pickerHint');
  var descEl = document.getElementById('descList');
  var labelEl = document.getElementById('ctaLabel');
  var waEl = document.getElementById('ctaWa');
  var mailEl = document.getElementById('ctaMail');
  // The picker's "Send enquiry" button links through to the standalone enquiry
  // page, carrying the chosen policies along in the query string.
  var pickerCta = document.querySelector('.picker-cta');

  // Policy chip icons (PNGs from Flaticon, in images/policy-icons/ — see footer
  // credit). Missing files degrade gracefully: the <img> removes itself on error,
  // leaving a clean text-only chip.
  // var ICON_DIR = 'images/';
  // var ICONS = {
  //   'Guaranteed Returns Plans': 'life.png',
  //   'Health': 'health.png',
  //   'Motor': 'motor.png',
  //   'Term': 'term.png',
  //   'Travel': 'travel.png',
  //   'Home': 'home.png',
  //   'Fire': 'fire.png',
  //   'Shop': 'shop.png',
  //   'Workmen Compensation': 'workmen.png',
  //   'Personal Accident': 'personal-accident.png',
  //   'Port my policy': 'port.png'
  // };
  // function chipIcon(file) {
  //   var img = document.createElement('img');
  //   img.className = 'chip-ico'; img.src = ICON_DIR + file; img.alt = ''; img.setAttribute('aria-hidden', 'true');
  //   img.addEventListener('error', function () { img.remove(); });
  //   return img;
  // }
  // function chipLabel(text) {
  //   var s = document.createElement('span'); s.className = 'chip-label'; s.textContent = text; return s;
  // }

  // // build chips
  // PRODUCTS.forEach(function (p) {
  //   var b = document.createElement('button');
  //   b.type = 'button';
  //   b.className = 'chip';
  //   b.dataset.product = p;
  //   if (ICONS[p]) { b.appendChild(chipIcon(ICONS[p])); }
  //   b.appendChild(chipLabel(p));
  //   b.addEventListener('click', function () { toggleProduct(p); });
  //   chipsEl.appendChild(b);
  // });
  // var unsureBtn = document.createElement('button');
  // unsureBtn.type = 'button';
  // unsureBtn.className = 'chip chip-unsure';
  // unsureBtn.appendChild(chipIcon('help.png'));
  // unsureBtn.appendChild(chipLabel('Not sure yet, help me decide'));
  // unsureBtn.addEventListener('click', function () {
  //   state.unsure = !state.unsure;
  //   if (state.unsure) state.selected = [];
  //   render();
  // });
  // chipsEl.appendChild(unsureBtn);

  // Policy chip icons (PNGs from Flaticon, in images/policy-icons/ — see footer
  // credit). Missing files degrade gracefully: the badge removes itself on error,
  // leaving a clean text-only chip.
  var ICON_DIR = 'images/policy-icons/';
  var ICONS = {
    'Guaranteed Returns Plans': 'life.png',
    'Health': 'health.png',
    'Motor': 'motor.png',
    'Term': 'term.png',
    'Travel': 'travel.png',
    'Home': 'home.png',
    'Fire': 'fire.png',
    'Shop': 'shop.png',
    'Workmen Compensation': 'workmen.png',
    'Personal Accident': 'personal.png',
    'Port my policy': 'port.png'
  };

  function chipIcon(file) {
    // Create the circular badge container
    var badge = document.createElement('div');
    badge.className = 'icon-badge';

    // Create the image element
    var img = document.createElement('img');
    img.className = 'chip-ico'; 
    img.src = ICON_DIR + file; 
    img.alt = ''; 
    img.setAttribute('aria-hidden', 'true');
    
    // If the image fails to load, remove the whole badge
    img.addEventListener('error', function () { badge.remove(); });
    
    badge.appendChild(img);
    return badge;
  }

  function chipLabel(text) {
    var s = document.createElement('span'); 
    s.className = 'chip-label'; 
    s.textContent = text; 
    return s;
  }

  // build chips
  PRODUCTS.forEach(function (p) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.product = p;
    if (ICONS[p]) { b.appendChild(chipIcon(ICONS[p])); }
    b.appendChild(chipLabel(p));
    b.addEventListener('click', function () { toggleProduct(p); });
    chipsEl.appendChild(b);
  });

  var unsureBtn = document.createElement('button');
  unsureBtn.type = 'button';
  unsureBtn.className = 'chip chip-unsure';
  unsureBtn.appendChild(chipIcon('not_sure.png'));
  unsureBtn.appendChild(chipLabel('Not sure yet')); // Shortened to fit vertical layout better
  unsureBtn.addEventListener('click', function () {
    state.unsure = !state.unsure;
    if (state.unsure) state.selected = [];
    render();
  });
  chipsEl.appendChild(unsureBtn);

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
    var active = exclusiveSelected();
    if (EXCLUSIVE_PAGES[p]) {
      // Exclusive policy: select it alone, or clear if it's already selected.
      state.unsure = false;
      state.selected = (active === p) ? [] : [p];
      render();
      return;
    }
    // While an exclusive policy is selected, other policies are locked.
    if (active) { return; }
    state.unsure = false;
    var i = state.selected.indexOf(p);
    if (i >= 0) state.selected.splice(i, 1); else state.selected.push(p);
    render();
  }

  // Builds the destination for the "Send enquiry" button. Health and Travel each
  // have their own dedicated page; everything else goes to the standalone enquiry
  // form, with the chosen policies (or the "not sure yet" flag) in the query string.
  function enquiryLink() {
    var active = exclusiveSelected();
    if (active && state.selected.length === 1) { return EXCLUSIVE_PAGES[active]; }
    if (state.unsure) { return 'policies/enquiry.html?unsure=1'; }
    if (state.selected.length) {
      return 'policies/enquiry.html?products=' + encodeURIComponent(state.selected.join(','));
    }
    return 'policies/enquiry.html';
  }

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
    var active = exclusiveSelected();

    chipsEl.querySelectorAll('.chip[data-product]').forEach(function (b) {
      var p = b.dataset.product;
      b.classList.toggle('on', sel.indexOf(p) >= 0);
      // Lock every other chip while an exclusive policy is selected.
      b.disabled = !!active && p !== active;
    });
    unsureBtn.classList.toggle('on', state.unsure);
    unsureBtn.disabled = !!active;

    if (state.unsure) {
      hintEl.innerHTML = "No problem, just reach out and we'll work it out together.";
    } else if (active) {
      hintEl.innerHTML = 'Selected: <b>' + active + '</b> — other options are locked while ' + active + ' is selected.';
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

    labelEl.textContent = state.unsure ? 'figuring out the right cover' : sel.length ? sel.join(', ') : 'a policy';
    waEl.href = waLink();
    mailEl.href = mailLink();
    if (pickerCta) { pickerCta.href = enquiryLink(); }
  }

  document.getElementById('footWa').href = 'https://wa.me/' + WA_NUM + '?text=' + encodeURIComponent("Hi Kevin! I'd like some help with insurance.");
  document.getElementById('footMail').href = 'mailto:' + EMAIL;

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
  var slider = document.getElementById('partnersSlider');
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

  // ---- Slider: same behaviour as the testimonials — auto-advance one card
  // ---- every 5s in a seamless infinite loop, pausing on hover, with the
  // ---- arrows for manual control. ----
  var count = COMPANIES.length;
  if (!count) return;

  // Clone the whole set once and append it. Advancing past the last card then
  // moves into an identical copy, and we snap back to the real start with no
  // animation — invisible because the clone set matches the originals. A full
  // clone (rather than one card) guarantees enough cards to fill the viewport
  // at the wrap point for any number of visible cards (5 / 3 / 2 responsive).
  for (var c = 0; c < count; c++) {
    var cl = track.children[c].cloneNode(true);
    cl.setAttribute('aria-hidden', 'true');
    track.appendChild(cl);
  }

  var index = 0;
  var timer = null;
  var DELAY = 5000;

  // One card + the flex gap, in px. Recomputed each move so it stays correct
  // after the responsive card width changes.
  function step() {
    var w = track.children[0].getBoundingClientRect().width;
    var gap = parseFloat(getComputedStyle(track).columnGap) || 24;
    return w + gap;
  }
  function apply() { track.style.transform = 'translateX(' + (-index * step()) + 'px)'; }

  function slideTo(n) { index = n; apply(); }

  // Snap with no animation — used to make the clone-to-start reset invisible.
  function jumpTo(n) {
    track.style.transition = 'none';
    index = n;
    apply();
    track.offsetWidth; // force reflow so the next move animates again
    track.style.transition = '';
  }

  function next() {
    if (index >= count) { jumpTo(0); }   // safety net if a reset was missed
    slideTo(index + 1);
  }
  function prev() {
    if (index <= 0) { jumpTo(count); }   // snap into the clone set, then step back
    slideTo(index - 1);
  }

  if (nextBtn) { nextBtn.addEventListener('click', function () { next(); restart(); }); }
  if (prevBtn) { prevBtn.addEventListener('click', function () { prev(); restart(); }); }

  // When the move into the cloned set finishes, snap back to the real start.
  track.addEventListener('transitionend', function (e) {
    if (e.target !== track || e.propertyName !== 'transform') { return; }
    if (index >= count) { jumpTo(0); }
  });

  function start() {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { return; }
    timer = setInterval(next, DELAY);
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }
  function restart() { stop(); start(); }

  if (slider) {
    slider.addEventListener('mouseenter', stop);
    slider.addEventListener('mouseleave', start);
  }

  // Keep the current card aligned when the layout (card width) changes.
  window.addEventListener('resize', function () {
    track.style.transition = 'none';
    apply();
    track.offsetWidth;
    track.style.transition = '';
  });

  start();
})();
