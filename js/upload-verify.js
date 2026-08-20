/* Shared upload verification for the website enquiry forms.
   Before a form sends any attached document, it calls window.confirmUpload(...)
   which shows a custom "Have you uploaded the right files?" modal — Yes proceeds
   with the send, No keeps the user on the form to adjust their files.

   CSP-safe: this is an external file ('self'), uses no inline handlers, and sets
   every piece of user-supplied text via textContent (never innerHTML), so file
   names can't inject markup. */
(function () {
  'use strict';
  var modal, msgEl, resolver = null;

  function build() {
    if (modal) { return; }
    modal = document.createElement('div');
    modal.className = 'uv-modal';
    modal.hidden = true;

    var box = document.createElement('div'); box.className = 'uv-box';
    var h = document.createElement('h3'); h.textContent = 'Have you uploaded the correct files?';
    msgEl = document.createElement('p'); msgEl.className = 'uv-msg';
    var actions = document.createElement('div'); actions.className = 'uv-actions';
    var no = document.createElement('button'); no.type = 'button'; no.className = 'btn btn-ghost uv-no'; no.textContent = 'No, let me check';
    var yes = document.createElement('button'); yes.type = 'button'; yes.className = 'btn btn-primary uv-yes'; yes.textContent = 'Yes, send';

    actions.appendChild(no); actions.appendChild(yes);
    box.appendChild(h); box.appendChild(msgEl); box.appendChild(actions);
    modal.appendChild(box);
    document.body.appendChild(modal);

    yes.addEventListener('click', function () { done(true); });
    no.addEventListener('click', function () { done(false); });
    modal.addEventListener('click', function (e) { if (e.target === modal) { done(false); } });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) { done(false); } });
  }

  function done(v) { modal.hidden = true; var r = resolver; resolver = null; if (r) { r(v); } }

  // Shows the confirmation. Returns a Promise<boolean>: true = Yes, false = No.
  window.confirmUpload = function (opts) {
    build();
    opts = opts || {};
    var names = (opts.fileNames || []).filter(Boolean);
    msgEl.textContent = names.length
      ? ('You’re about to send: ' + names.join(', ') + '. Please make sure these are correct.')
      : 'Please double-check your document before sending.';
    modal.hidden = false;
    return new Promise(function (resolve) { resolver = resolve; });
  };

  // Human-readable file size, shared with the forms' file previews.
  window.formatFileSize = function (bytes) {
    if (bytes < 1024) { return bytes + ' B'; }
    var kb = bytes / 1024;
    if (kb < 1024) { return (kb < 10 ? kb.toFixed(1) : Math.round(kb)) + ' KB'; }
    var mb = kb / 1024;
    return (mb < 10 ? mb.toFixed(1) : Math.round(mb)) + ' MB';
  };
})();
