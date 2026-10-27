/* Dato content script: holds a prompt on a supported AI chat until it passes policy.
 *
 * State (all in this closure, never written to the page or storage):
 *   policies, settings  - copies of chrome.storage.local, kept live by onChanged
 *   approval            - { text, until }: the exact text the user approved and a short expiry
 *   review              - the open review dialog: { editor, text, decision, trigger, el }
 *   health              - { state, code, detail } reported to the popup and dashboard
 *
 * Browser interception is best-effort. A page, another extension or the user
 * can get around it. It is a guard rail, not a security boundary.
 */
(function () {
  'use strict';
  if (window.top !== window || window.__datoLoaded) return;
  window.__datoLoaded = true;

  var Detect = window.DatoDetect, Policy = window.DatoPolicy, Sites = window.DatoAdapters;
  var adapter = Sites.forHost(location.hostname);
  if (!adapter) return;

  var policies = Object.assign({}, Policy.DEFAULT_POLICIES);
  var settings = Object.assign({}, Policy.DEFAULT_SETTINGS);
  var approval = null;
  var review = null;
  var health = { state: 'checking', code: 'starting', detail: 'Starting checks.' };
  var listenersVerified = false;
  var storageFailed = false;
  var APPROVAL_MS = 3000;

  /* ---------- extension plumbing ---------- */

  function runtimeAlive() { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } }

  function send(message) {
    if (!runtimeAlive()) { assessHealth(); return; }
    try { chrome.runtime.sendMessage(message, function () { void chrome.runtime.lastError; }); } catch (e) { assessHealth(); }
  }

  // Reads storage; changes policies, settings, storageFailed.
  function loadPolicies(then) {
    try {
      chrome.storage.local.get(null, function (all) {
        if (chrome.runtime.lastError || !all) { storageFailed = true; assessHealth(); return; }
        storageFailed = false;
        policies = Policy.cleanPolicies(all);
        settings = Policy.cleanSettings(all.dato_settings);
        if (then) then();
      });
    } catch (e) { storageFailed = true; }
  }

  // Changes policies/settings when the popup or dashboard edits them.
  function watchPolicies() {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local') return;
      var touched = false;
      Policy.CATEGORY_KEYS.forEach(function (k) { if (changes[k]) touched = true; });
      if (touched || changes.dato_settings) {
        loadPolicies(function () { refreshReview('Your policy changed while this was open. This review uses the new policy.'); });
      }
    });
  }

  /* ---------- decisions and approvals ---------- */

  function evaluate(text) {
    return Policy.decide(Detect.scan(text).findings, policies, settings);
  }

  // Reads approval. Approval only covers the exact text that was reviewed.
  function approvalCovers(text) {
    if (!approval) return false;
    if (Date.now() > approval.until || approval.text !== text) { approval = null; return false; }
    return true;
  }

  // Changes approval.
  function approve(text) { approval = { text: text, until: Date.now() + APPROVAL_MS }; }

  // Any edit, or the site clearing the box after sending, ends the approval. Changes approval.
  function dropStaleApproval() {
    if (!approval) return;
    var found = Sites.findEditor(adapter, document);
    if (!found || Sites.readText(found.el) !== approval.text) approval = null;
  }

  function record(outcome, decision, trigger) {
    var event = Policy.summarize(decision);
    event.outcome = outcome;
    event.adapter = adapter.id;
    event.trigger = trigger || 'unknown';
    send({ type: 'dato:event', event: event });
  }

  function stopEvent(e) { e.preventDefault(); e.stopImmediatePropagation(); }

  /* guard: the single checkpoint every send path goes through.
   * Reads approval, review, policies. May open a review. */
  function guard(e, editor, trigger) {
    if (review) { stopEvent(e); focusReview(); return; }
    if (!editor) return;
    var text = Sites.readText(editor);
    if (!Sites.normalize(text)) return;
    if (approvalCovers(text)) return;
    var decision;
    try { decision = evaluate(text); }
    catch (err) { decision = { action: 'block', items: [], strict: settings.strict, canRedact: false, overrideAllowed: !settings.strict, failed: true }; }
    if (decision.action === 'allow') {
      if (decision.items.length) record('allowed', decision, trigger);
      return;
    }
    stopEvent(e);
    openReview({ editor: editor, text: text, decision: decision, trigger: trigger });
  }

  /* ---------- send paths ---------- */

  function editorFor(target) {
    var own = Sites.editorFromTarget(adapter, target);
    if (own) return own;
    var found = Sites.findEditor(adapter, document);
    return found ? found.el : null;
  }

  function onKeydown(e) {
    if (e.type === 'dato-probe') { listenersVerified = true; return; }
    if (e.key !== 'Enter' || e.shiftKey || e.altKey) return;
    if (e.isComposing || e.keyCode === 229) return; // IME: Enter confirms a composition, it does not send.
    var editor = Sites.editorFromTarget(adapter, e.target);
    if (!editor) return;
    guard(e, editor, 'enter');
  }

  function onClick(e) {
    var btn = Sites.isSendControl(adapter, e.target);
    if (!btn || btn.disabled) return;
    var found = Sites.findEditor(adapter, document);
    guard(e, found ? found.el : null, 'click');
  }

  function onSubmit(e) {
    var form = e.target;
    var found = Sites.findEditor(adapter, document);
    if (!found || !form.contains || !form.contains(found.el)) return;
    guard(e, found.el, 'submit');
  }

  // Capture on window at document_start, so these run before the page's own handlers.
  window.addEventListener('keydown', onKeydown, true);
  window.addEventListener('dato-probe', onKeydown, true);
  window.addEventListener('click', onClick, true);
  window.addEventListener('submit', onSubmit, true);

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function enabled(btn) { return btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true'; }

  /* Re-issue the send after approval. Sites often enable their send button a
   * moment after the text changes, so wait briefly for it. */
  async function resume(editor) {
    var started = Date.now();
    while (Date.now() - started < 1500) {
      var s = Sites.findSend(adapter, editor);
      if (s && enabled(s.el)) { s.el.click(); return 'click'; }
      await sleep(50);
    }
    var form = editor.closest && editor.closest('form');
    if (form && form.requestSubmit) { form.requestSubmit(); return 'submit'; }
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    return 'enter';
  }

  /* ---------- review dialog ---------- */

  var h = window.DatoUI.h;

  function renderReview(message) {
    var backdrop = window.DatoUI.reviewDialog({ siteName: adapter.name, decision: review.decision, text: review.text, message: message });
    if (review.el) review.el.replaceWith(backdrop); else document.documentElement.appendChild(backdrop);
    review.el = backdrop;
    backdrop.addEventListener('click', onReviewClick);
    backdrop.addEventListener('keydown', onReviewKey);
    focusReview();
  }

  function focusReview() {
    if (!review || !review.el) return;
    var primary = review.el.querySelector('[data-dato="redact"]') || review.el.querySelector('[data-dato="cancel"]');
    if (primary) primary.focus();
  }

  // Changes review.
  function openReview(r) {
    review = r;
    renderReview('');
    setSentinel('alert', 'Holding a prompt for review');
  }

  // Changes review.
  function closeReview(refocus) {
    if (review && review.el) review.el.remove();
    var editor = review && review.editor;
    review = null;
    setSentinel(health.state, null);
    if (refocus && editor && editor.isConnected) editor.focus();
  }

  // Re-evaluate the open review (policy changed). Reads policies; changes review.
  function refreshReview(message) {
    if (!review) return;
    review.decision = evaluate(review.text);
    if (review.decision.action === 'allow') { closeReview(true); flash('Policy now allows this prompt. Press send again.'); return; }
    renderReview(message);
  }

  function setMessage(text) { var m = review && review.el.querySelector('.dato-msg'); if (m) m.textContent = text; }

  function onReviewKey(e) {
    if (e.key === 'Escape') { stopEvent(e); cancel(); return; }
    if (e.key !== 'Tab') return;
    var items = review.el.querySelectorAll('button:not([disabled]), pre[tabindex]');
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { stopEvent(e); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { stopEvent(e); first.focus(); }
  }

  function onReviewClick(e) {
    if (e.target === review.el) return; // backdrop clicks do nothing; only explicit choices count
    var btn = e.target.closest('[data-dato]');
    if (!btn) return;
    var act = btn.getAttribute('data-dato');
    if (act === 'cancel') cancel();
    else if (act === 'override') override(btn);
    else if (act === 'redact') redactAndSend();
  }

  function cancel() {
    record('cancelled', review.decision, review.trigger);
    closeReview(true);
  }

  /* The text currently in the editor, if it is still exactly what was reviewed. */
  function unchanged() {
    var editor = review.editor;
    if (!editor.isConnected) {
      var found = Sites.findEditor(adapter, document);
      if (!found) return false;
      editor = review.editor = found.el;
    }
    return Sites.readText(editor) === review.text;
  }

  // The prompt changed under the open review: drop the approval path and re-check.
  function stale() {
    record('stale_review', review.decision, review.trigger);
    var editor = review.editor;
    var text = Sites.readText(editor);
    var decision = evaluate(text);
    closeReview(false);
    if (!Sites.normalize(text) || decision.action === 'allow') {
      flash('Prompt changed after review. Nothing was sent. Press send again.');
      return;
    }
    openReview({ editor: editor, text: text, decision: decision, trigger: 'recheck' });
    setMessage('The prompt changed after you reviewed it, so that review no longer applies. This is the new version. Nothing was sent.');
  }

  function override(btn) {
    if (!review.decision.overrideAllowed) return;
    if (review.decision.action === 'block' && !btn.dataset.armed) {
      btn.dataset.armed = '1';
      btn.textContent = 'Click again to send flagged data';
      setMessage('This sends the prompt exactly as written, including the blocked data.');
      return;
    }
    if (!unchanged()) { stale(); return; }
    var editor = review.editor, text = review.text;
    record('override', review.decision, review.trigger);
    approve(text);
    closeReview(false);
    resume(editor);
  }

  function failRedaction(why) {
    record('redaction_failed', review.decision, review.trigger);
    var btn = review.el.querySelector('[data-dato="redact"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Redaction failed'; }
    setMessage(why + ' Nothing was sent. Edit the prompt yourself, then send again.');
  }

  async function redactAndSend() {
    if (!unchanged()) { stale(); return; }
    var current = review, editor = review.editor;
    var btn = review.el.querySelector('[data-dato="redact"]');
    if (btn) btn.disabled = true;
    var redacted = Policy.redactText(review.text, review.decision);
    if (!Policy.redactionHolds(redacted, Detect.scan, policies, settings).ok) { failRedaction('The redacted copy still contains data your policy blocks.'); return; }
    if (!Sites.writeText(editor, redacted)) { failRedaction('Dato could not replace the text in the editor.'); return; }
    // Frameworks can revert the editor on their next render, so check again after a moment.
    await sleep(120);
    if (review !== current) return;
    var written = Sites.readText(editor);
    if (!Policy.redactionHolds(written, Detect.scan, policies, settings).ok) { failRedaction('The editor did not keep the redacted text.'); return; }
    record('redacted', review.decision, review.trigger);
    approve(written);
    closeReview(false);
    resume(editor);
  }

  /* ---------- health ---------- */

  // Reads adapter, listenersVerified, storageFailed; changes health.
  function assessHealth() {
    var next;
    var found = runtimeAlive() ? Sites.findEditor(adapter, document) : null;
    if (!runtimeAlive()) next = ['error', 'orphaned', 'Dato was updated or reloaded. Refresh this tab to restore full protection.'];
    else if (!listenersVerified) next = ['error', 'listeners', 'Dato could not attach its send checks on this page.'];
    else if (storageFailed) next = ['degraded', 'storage', 'Could not read your policies, so the default policy is in use.'];
    else if (!found) next = ['degraded', 'no-editor', 'No prompt box found on this page. If you expected one, ' + adapter.name + ' may have changed its layout.'];
    else if (found.confidence === 'generic') next = ['degraded', 'fallback-editor', adapter.name + "'s layout no longer matches Dato's adapter. A fallback match is in use and may miss sends."];
    else if (Sites.normalize(Sites.readText(found.el)) && !Sites.findSend(adapter, found.el)) next = ['degraded', 'no-send-button', 'Send button not recognised. Enter and form submits are still checked.'];
    else next = ['active', 'ok', 'Checking prompts on ' + adapter.name + ' before they send.'];
    if (next[0] === health.state && next[1] === health.code) return;
    health = { state: next[0], code: next[1], detail: next[2] };
    if (!review) setSentinel(health.state, null);
    if (runtimeAlive()) send({ type: 'dato:health', health: { adapter: adapter.id, state: health.state, code: health.code, detail: health.detail } });
  }

  // Throttled, so streaming replies that mutate the page constantly still get checked.
  var assessTimer = 0;
  function scheduleAssess() {
    if (assessTimer) return;
    assessTimer = setTimeout(function () { assessTimer = 0; assessHealth(); }, 400);
  }

  function probeListeners() { window.dispatchEvent(new Event('dato-probe')); }

  function watchPage() {
    new MutationObserver(function () { dropStaleApproval(); scheduleAssess(); })
      .observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    window.addEventListener('popstate', scheduleAssess);
    window.addEventListener('input', function () { dropStaleApproval(); scheduleAssess(); }, true);
    if (window.navigation) window.navigation.addEventListener('navigatesuccess', scheduleAssess);
  }

  /* ---------- status badge ---------- */

  var BADGE = { checking: 'Checking…', active: 'Protected', degraded: 'Degraded', error: 'Error' };

  // 'alert' shows only its note; other states show their name.
  function setSentinel(state, note) {
    var s = document.getElementById('dato-sentinel');
    if (!s) {
      s = h('div', { id: 'dato-sentinel', role: 'status', 'aria-live': 'polite' }, [h('i', { 'aria-hidden': 'true' }), h('span', {})]);
      document.documentElement.appendChild(s);
    }
    s.className = 'dato-' + state;
    var label = state === 'alert' ? note : BADGE[state] + (note ? ': ' + note : '');
    s.querySelector('span').textContent = 'Dato · ' + label;
    s.title = health.detail;
  }

  // A short note on the badge that clears itself. Changes the badge only.
  var flashTimer = 0;
  function flash(note) {
    setSentinel('alert', note);
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { if (!review) setSentinel(health.state, null); }, 6000);
  }

  /* ---------- popup status ---------- */

  chrome.runtime.onMessage.addListener(function (msg, sender, reply) {
    if (!msg || msg.type !== 'dato:status') return;
    assessHealth();
    reply({ adapter: adapter.id, name: adapter.name, state: health.state, code: health.code, detail: health.detail });
  });

  function start() {
    probeListeners();
    loadPolicies();
    watchPolicies();
    watchPage();
    setSentinel('checking', null);
    setTimeout(assessHealth, 300);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
