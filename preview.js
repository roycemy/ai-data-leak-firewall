/* Install page previews: the extension's real popup and warning screens.
 *
 * Reads the extension's own engine (extension/detectors.js, policy.js, ui.js)
 * and runs it on made-up sample prompts, so these screens match what the
 * extension shows. State here is only the two chosen previews; nothing is
 * saved, sent or connected to the extension.
 */
(function () {
  'use strict';
  var Detect = window.DatoExtDetect, Policy = window.DatoPolicy, UI = window.DatoUI;
  if (!Detect || !Policy || !UI) return;

  var $ = function (id) { return document.getElementById(id); };

  var POPUP_STATES = [
    { id: 'active', label: 'Active', status: { state: 'active', detail: 'Checking prompts on ChatGPT before they send.' } },
    { id: 'unsupported', label: 'Other site', status: { state: 'unsupported', detail: 'Dato only checks ChatGPT, Claude and Gemini. Prompts on this site are not checked.' } },
    { id: 'degraded', label: 'Degraded', status: { state: 'degraded', detail: "ChatGPT's layout no longer matches Dato's adapter. A fallback match is in use and may miss sends." } },
    { id: 'error', label: 'Error', status: { state: 'error', detail: 'Dato is not running in this tab. Refresh the page to start protection.' } }
  ];

  var BASE = Policy.DEFAULT_POLICIES;
  var WARNINGS = [
    { id: 'warn', label: 'Warn', text: 'Email dana@example.com about the offsite agenda.', policies: BASE, settings: {} },
    { id: 'block', label: 'Block', text: 'Deploy with AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE tonight.', policies: BASE, settings: {} },
    { id: 'redact', label: 'Redact', text: 'Deploy with AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE tonight.', policies: Object.assign({}, BASE, { secrets: 'redact' }), settings: {} },
    { id: 'strict', label: 'Strict mode', text: 'Email dana@example.com about the offsite agenda.', policies: BASE, settings: { strict: true } }
  ];

  var chosenPopup = 'active';
  var chosenWarning = 'block';

  function segment(box, items, current, onPick) {
    box.textContent = '';
    items.forEach(function (it) {
      var b = UI.h('button', { type: 'button', class: 'seg-chip', 'aria-pressed': String(it.id === current), text: it.label });
      b.addEventListener('click', function () { onPick(it.id); });
      box.appendChild(b);
    });
  }

  // Reads chosenPopup; replaces the popup preview.
  function renderPopup() {
    var item = POPUP_STATES.filter(function (s) { return s.id === chosenPopup; })[0];
    segment($('popup-seg'), POPUP_STATES, chosenPopup, function (id) { chosenPopup = id; renderPopup(); });
    var host = $('popup-preview');
    host.textContent = '';
    host.appendChild(UI.popupView({ status: item.status, policies: BASE, strict: false, dashboardHref: null, handlers: {}, openPolicies: false }));
    // The popup's own ids would collide with the live page; the preview needs none of them.
    host.querySelectorAll('[id]').forEach(function (el) { el.removeAttribute('id'); });
    host.querySelectorAll('label[for]').forEach(function (l) { l.removeAttribute('for'); });
  }

  // Reads chosenWarning; replaces the warning preview with the real dialog.
  function renderWarning() {
    var item = WARNINGS.filter(function (w) { return w.id === chosenWarning; })[0];
    segment($('warn-seg'), WARNINGS, chosenWarning, function (id) { chosenWarning = id; renderWarning(); });
    var decision = Policy.decide(Detect.scan(item.text).findings, item.policies, item.settings);
    var host = $('warn-preview');
    host.textContent = '';
    var backdrop = UI.reviewDialog({ siteName: 'ChatGPT', decision: decision, text: item.text, message: '' });
    backdrop.removeAttribute('id');
    backdrop.querySelectorAll('[id]').forEach(function (el) { el.removeAttribute('id'); });
    host.appendChild(backdrop);
  }

  // The preview buttons are real UI, but there is nothing to send here. Say so.
  $('warn-preview').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-dato]');
    if (!btn) return;
    $('stage-note').textContent = 'This is a preview, so "' + btn.textContent + '" does nothing here. In Chrome with Dato installed, it acts on your real prompt.';
  });

  var copy = $('copy-ext-url');
  if (copy) copy.addEventListener('click', function () {
    var note = $('copy-note');
    var done = function () { note.textContent = 'Copied. Paste it into Chrome\'s address bar.'; };
    var fail = function () { note.textContent = 'Could not copy. Type chrome://extensions into the address bar.'; };
    try { navigator.clipboard.writeText('chrome://extensions').then(done, fail); } catch (e) { fail(); }
  });

  renderPopup();
  renderWarning();
})();
