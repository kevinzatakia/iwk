// Standalone enquiry page. The "Send enquiry" button on the home page's policy
// picker links here, passing the chosen policies in the query string
// (?products=Life,Health  or  ?unsure=1). We read those, pre-select the matching
// product boxes, then run the same validation + Apps Script submission the
// inline form used to do.
(function () {
  var WA_NUM = '918369988285';
  var EMAIL = 'admin@insureitwithkevin.in';

  var PRODUCTS = ['Life', 'Health', 'Motor', 'Term', 'Travel', 'Home', 'Fire', 'Shop', 'Workmen Compensation', 'Personal Accident', 'Port my policy'];

  var state = { selected: [], unsure: false, claim: null };

  var boxesEl = document.getElementById('prodBoxes');
  var portEl = document.getElementById('portPanel');
  var portTypeEl = document.getElementById('portTypeField');
  var portTypeInput = document.getElementById('fPortType');
  var claimYesEl = document.getElementById('claimYes');
  var claimNoEl = document.getElementById('claimNo');
  var claimDetailEl = document.getElementById('claimDetail');
  var claimInfoEl = document.getElementById('claimInfo');
  var summaryEl = document.getElementById('enquirySummary');

  // ---- Read the policies passed from the picker on the home page. -----------
  var params = new URLSearchParams(window.location.search);
  if (params.get('unsure') === '1') {
    state.unsure = true;
  } else {
    var raw = params.get('products');
    if (raw) {
      raw.split(',').forEach(function (p) {
        p = p.trim();
        // Only accept values from the known product list, and never duplicate.
        if (PRODUCTS.indexOf(p) >= 0 && state.selected.indexOf(p) < 0) {
          state.selected.push(p);
        }
      });
    }
  }

  // ---- Build the product checkboxes. ----------------------------------------
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

  function toggleProduct(p) {
    state.unsure = false;
    var i = state.selected.indexOf(p);
    if (i >= 0) state.selected.splice(i, 1); else state.selected.push(p);
    render();
  }

  claimYesEl.addEventListener('click', function () { state.claim = 'yes'; render(); });
  claimNoEl.addEventListener('click', function () { state.claim = 'no'; render(); });

  // Builds the "You selected: …" summary safely, without innerHTML, so a stray
  // query value can never inject markup.
  function renderSummary() {
    if (!summaryEl) return;
    summaryEl.textContent = '';
    if (state.unsure) {
      summaryEl.hidden = false;
      summaryEl.textContent = "You asked for help deciding — fill in your details below and I'll guide you.";
    } else if (state.selected.length) {
      summaryEl.hidden = false;
      summaryEl.appendChild(document.createTextNode('You selected: '));
      var b = document.createElement('b');
      b.textContent = state.selected.join(', ');
      summaryEl.appendChild(b);
    } else {
      summaryEl.hidden = true;
    }
  }

  function render() {
    boxesEl.querySelectorAll('input').forEach(function (cb) {
      cb.checked = state.selected.indexOf(cb.value) >= 0;
      cb.parentElement.classList.toggle('checked', cb.checked);
    });

    var porting = state.selected.indexOf('Port my policy') >= 0;
    portEl.hidden = !porting;
    portTypeEl.hidden = !porting;
    claimYesEl.classList.toggle('on', state.claim === 'yes');
    claimNoEl.classList.toggle('on', state.claim === 'no');
    claimDetailEl.hidden = state.claim !== 'yes';

    renderSummary();
  }

  // ---- Footer WhatsApp / email links. ---------------------------------------
  document.getElementById('footWa').href = 'https://wa.me/' + WA_NUM + '?text=' + encodeURIComponent("Hi Kevin! I'd like some help with insurance.");
  document.getElementById('footMail').href = 'mailto:' + EMAIL;

  // Google Apps Script web-app URL that receives enquiries and emails them to
  // Kevin (with the policy document attached when porting). Paste the URL you
  // get after deploying apps-script-enquiry-endpoint.gs — it ends in /exec.
  var ENQUIRY_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzFBqQZCBJ7trrzwTFUq6aOwlXslRdXMyrcTE-QuPB_QYQIbimvnJ4ZCzgyNM9qBuQCXw/exec';

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
      showStatus('err', "Please pick at least one product, or go back and choose “Not sure yet”.");
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

    function doSend() {
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
    }

    // When a document is attached, confirm it's the right one before sending.
    if (isPorting && fileInput.files[0] && window.confirmUpload) {
      window.confirmUpload({ fileNames: [fileInput.files[0].name] }).then(function (ok) { if (ok) { doSend(); } });
    } else {
      doSend();
    }
  });

  render();
})();
