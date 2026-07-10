/**
 * Insure It With Kevin — website enquiry endpoint.
 *
 * Receives a POST from the website's enquiry form and emails it to you,
 * with the uploaded policy document attached (when porting).
 *
 * SETUP (one time):
 *   1. Go to https://script.google.com  ->  New project
 *   2. Delete the sample code, paste ALL of this file, and Save (Ctrl+S).
 *   3. Deploy  ->  New deployment  ->  gear icon  ->  "Web app".
 *   4. Execute as:  Me        Who has access:  Anyone
 *   5. Deploy  ->  Authorize access  ->  pick your Google account.
 *      You'll see "Google hasn't verified this app" — that's normal for your
 *      own script. Click "Advanced" -> "Go to <project> (unsafe)" -> Allow.
 *   6. Copy the "Web app URL" (it ends in /exec) and paste it into the
 *      website's ENQUIRY_ENDPOINT setting.
 *
 * To change the code later, repeat Deploy -> "Manage deployments" -> edit
 * the existing deployment (this keeps the same URL).
 */

// Where enquiries are delivered:
var TO_EMAIL = 'kevinzatakia10@gmail.com';

// Attachment rules (must match the website's validation):
var ALLOWED_EXTS = ['jpg', 'jpeg', 'pdf', 'doc', 'docx'];
var MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

// Same email shape the website enforces.
var EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function doPost(e) {
  try {
    var p = (e && e.parameter) ? e.parameter : {};

    // Honeypot: real people never fill this hidden field. Silently ignore bots.
    if (p.botcheck) {
      return json_({ success: true });
    }

    // clean_() strips CR/LF (email-header-injection guard) and trims whitespace.
    var name     = clean_(p.name);
    var email    = clean_(p.email);
    var mobile   = clean_(p.mobile);
    var age      = clean_(p.age);
    var products = clean_(p.products);
    var health   = clean_(p.health) || 'None mentioned';
    var claim    = clean_(p.claim);
    var claimDetails = clean_(p.claimDetails);

    var isPorting = products.indexOf('Port my policy') >= 0;

    // Validate EVERYTHING first. If anything is invalid, NO email is sent — we
    // return an error instead. These rules mirror the website's, so a genuine
    // enquiry is never rejected here; only bypassed/tampered posts are.
    var errors = [];
    if (!name) { errors.push('name'); }
    if (!EMAIL_RE.test(email)) { errors.push('email'); }
    if (!/^[0-9]{10}$/.test(mobile)) { errors.push('mobile'); }
    if (!/^[0-9]{1,3}$/.test(age) || +age < 1 || +age > 120) { errors.push('age'); }
    if (!products || products === 'Not specified') { errors.push('products'); }

    // File: validate whenever one is present, and require one when porting.
    var attachment = null;
    if (p.fileData && p.fileName) {
      var ext = (p.fileName.split('.').pop() || '').toLowerCase();
      var bytes = Utilities.base64Decode(p.fileData);
      if (ALLOWED_EXTS.indexOf(ext) < 0) {
        errors.push('file type');
      } else if (bytes.length > MAX_FILE_BYTES) {
        errors.push('file size');
      } else {
        attachment = Utilities.newBlob(bytes, p.fileType || 'application/octet-stream', p.fileName);
      }
    } else if (isPorting) {
      errors.push('missing policy document');
    }
    if (isPorting) {
      if (claim !== 'Yes' && claim !== 'No') { errors.push('claim'); }
      if (claim === 'Yes' && !claimDetails) { errors.push('claim details'); }
    }

    if (errors.length) {
      // Something is invalid — do not send any email.
      return json_({ success: false, error: 'Invalid submission: ' + errors.join(', ') });
    }

    // Everything is valid: build and send.
    var lines = [
      'New enquiry from the Insure It With Kevin website',
      '',
      'Name: ' + name,
      'Email: ' + email,
      'Mobile: ' + mobile,
      'Age: ' + age,
      'Product(s): ' + products,
      'Pre-existing condition: ' + health
    ];
    if (claim) { lines.push('Claim on expiring policy: ' + claim); }
    if (claimDetails) { lines.push('Claim details (when / what for): ' + claimDetails); }

    var options = { name: 'Insure It With Kevin Website', replyTo: email };
    if (attachment) {
      options.attachments = [attachment];
      lines.push('');
      lines.push('Attached document: ' + p.fileName);
    }

    MailApp.sendEmail(TO_EMAIL, 'New insurance enquiry — ' + name, lines.join('\n'), options);

    return json_({ success: true });
  } catch (err) {
    return json_({ success: false, error: String(err) });
  }
}

// Lets you open the URL in a browser to confirm it's deployed.
function doGet() {
  return ContentService.createTextOutput('Insure It With Kevin enquiry endpoint is running.');
}

// Removes line breaks (email-header-injection guard) and trims whitespace.
function clean_(s) {
  return String(s == null ? '' : s).replace(/[\r\n]+/g, ' ').trim();
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
