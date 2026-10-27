/* Dato UI builders: the review dialog and the popup, as DOM.
 * content.js and popup.js use these on real pages. The website imports the
 * same file to preview them, so what the site shows is what people get.
 * No storage, no messaging, no page access: callers pass state in and wire
 * the handlers.
 */
(function (global) {
  'use strict';

  var CATEGORY_NAMES = { secrets: 'Secrets & credentials', pii: 'Personal data', financial: 'Financial data', source: 'Source code', contract: 'Contracts & legal', sensitive: 'Sensitive context' };
  var CATEGORY_HINTS = {
    secrets: 'API keys, tokens, passwords, private keys',
    pii: 'SSNs, card numbers, emails, phones, addresses',
    financial: 'IBANs, account numbers, company figures',
    source: 'Whole-prompt code detection',
    contract: 'Agreement and legal language',
    sensitive: '"Confidential", "internal only" and similar'
  };
  var CATEGORY_WHY = {
    secrets: 'Anyone who sees a credential can use it to act as you or your company.',
    pii: 'Personal data about a real person.',
    financial: 'Bank details or non-public company figures.',
    source: 'Reads like proprietary source code.',
    contract: 'Reads like contract or legal language.',
    sensitive: 'Marked confidential, internal or restricted.'
  };
  var ACTION_LABEL = { allow: 'Allow', warn: 'Warn', redact: 'Redact', block: 'Block' };
  var STATUS = {
    active: { title: 'Active', icon: '✓' },
    degraded: { title: 'Degraded', icon: '!' },
    error: { title: 'Error', icon: '×' },
    unsupported: { title: 'Not protected here', icon: '–' },
    checking: { title: 'Checking…', icon: '…' }
  };

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') el.textContent = attrs[k];
      else if (k === 'class') el.className = attrs[k];
      else el.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) el.appendChild(c); });
    return el;
  }

  /* ---------- review dialog ---------- */

  function verdictCopy(d) {
    var strictLine = d.strict ? ' Strict mode is on, so there is no send-anyway option.' : '';
    if (d.failed) return ['Dato could not check this prompt', 'Something went wrong while scanning, so Dato is holding it instead of guessing.' + strictLine];
    if (d.action === 'block') return ['Blocked by your policy', 'This prompt has data your policy does not let leave this browser. Edit it' + (d.canRedact ? ' or redact it' : '') + ' before sending.' + strictLine];
    if (d.action === 'redact') return ['Redaction required', 'Your policy only sends this once the flagged values are replaced. Check the preview below.'];
    return ['Check this before it sends', 'Dato found data that may be confidential.' + (d.strict ? ' Strict mode is on, so edit or redact it to continue.' : ' You can still send it if you meant to.')];
  }

  function findingRow(item) {
    var f = item.finding;
    return h('li', { class: 'dato-finding' }, [
      h('span', { class: 'dato-pill dato-pill-' + item.effective, text: ACTION_LABEL[item.effective] }),
      h('div', { class: 'dato-finding-copy' }, [
        h('b', { text: f.label + (f.tentative ? ' (possible match)' : '') }),
        h('span', { text: CATEGORY_NAMES[f.category] + ' · ' + CATEGORY_WHY[f.category] }),
        item.note ? h('small', { text: item.note }) : null
      ]),
      h('code', { text: f.length > 0 ? f.masked : 'whole prompt', title: 'Masked: the full value is never shown or stored' })
    ]);
  }

  function previewBlock(text, decision) {
    var redacted = global.DatoPolicy.redactText(text, decision);
    var shown = redacted.length > 1500 ? redacted.slice(0, 1500) + '\n…' : redacted;
    var pre = h('pre', { class: 'dato-preview', tabindex: '0', 'aria-label': 'Redacted prompt preview' });
    shown.split(/(\[REDACTED: [^\]]+\])/).forEach(function (part, i) {
      pre.appendChild(i % 2 ? h('mark', { text: part }) : document.createTextNode(part));
    });
    return h('div', { class: 'dato-preview-wrap' }, [h('h3', { text: 'What Redact and send will submit' }), pre]);
  }

  /* reviewDialog({ siteName, decision, text, message }) -> backdrop element.
   * Buttons carry data-dato="cancel|override|redact" for the caller to wire. */
  function reviewDialog(o) {
    var d = o.decision, copy = verdictCopy(d);
    var shown = d.items.filter(function (it) { return it.effective !== 'allow'; });
    var primaryRedact = d.canRedact;
    var buttons = [];
    if (d.overrideAllowed) buttons.push(h('button', { type: 'button', class: 'dato-btn dato-btn-quiet', 'data-dato': 'override', text: 'Send anyway' }));
    buttons.push(h('button', { type: 'button', class: 'dato-btn' + (primaryRedact ? '' : ' dato-btn-primary'), 'data-dato': 'cancel', text: 'Go back and edit' }));
    if (primaryRedact) buttons.push(h('button', { type: 'button', class: 'dato-btn dato-btn-primary', 'data-dato': 'redact', text: 'Redact and send' }));
    var dialog = h('section', { class: 'dato-dialog dato-' + d.action, role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'dato-title', 'aria-describedby': 'dato-verdict-text' }, [
      h('header', { class: 'dato-head' }, [
        h('div', { class: 'dato-logo', 'aria-hidden': 'true', text: 'D' }),
        h('div', {}, [h('h2', { id: 'dato-title', text: 'Dato is holding this prompt' }), h('span', { text: 'Not sent yet · ' + o.siteName })])
      ]),
      h('div', { class: 'dato-verdict' }, [h('b', { text: copy[0] }), h('p', { id: 'dato-verdict-text', text: copy[1] })]),
      h('ul', { class: 'dato-findings', 'aria-label': 'Findings' }, shown.slice(0, 8).map(findingRow)),
      shown.length > 8 ? h('p', { class: 'dato-more', text: '+' + (shown.length - 8) + ' more' }) : null,
      d.canRedact ? previewBlock(o.text, d) : null,
      h('p', { class: 'dato-msg', role: 'status', 'aria-live': 'polite', text: o.message || '' }),
      h('p', { class: 'dato-local', text: 'Checked on this device. Dato logs counts, never your prompt. Browser checks are best-effort and can miss data.' }),
      h('div', { class: 'dato-actions' }, buttons)
    ]);
    return h('div', { class: 'dato-backdrop', id: 'dato-modal' }, [dialog]);
  }

  /* ---------- popup ---------- */

  function policyRow(key, value, onPolicy) {
    var id = 'policy-' + key;
    var select = h('select', { id: id, 'data-action': value });
    ['allow', 'warn', 'redact', 'block'].forEach(function (a) { select.appendChild(h('option', { value: a, text: ACTION_LABEL[a] })); });
    select.value = value;
    select.addEventListener('change', function () { select.dataset.action = select.value; if (onPolicy) onPolicy(key, select.value); });
    return h('div', { class: 'policy' }, [
      h('label', { for: id }, [h('strong', { text: CATEGORY_NAMES[key] }), h('span', { text: CATEGORY_HINTS[key] })]),
      select
    ]);
  }

  /* popupView({ status: {state, detail}, policies, strict, dashboardHref, handlers: {onPolicy, onStrict, onReset} }) */
  function popupView(o) {
    var hd = o.handlers || {};
    var st = STATUS[o.status.state] || STATUS.error;
    var strict = h('input', { type: 'checkbox', id: 'strict' });
    strict.checked = !!o.strict;
    strict.addEventListener('change', function () { if (hd.onStrict) hd.onStrict(strict.checked); });
    var list = h('div', { id: 'policies' }, Object.keys(CATEGORY_NAMES).map(function (k) { return policyRow(k, o.policies[k], hd.onPolicy); }));
    var reset = h('button', { type: 'button', id: 'reset', text: 'Reset policies' });
    reset.addEventListener('click', function () { if (hd.onReset) hd.onReset(); });
    var details = h('details', { class: 'policies-box' }, [
      h('summary', { text: 'Policies by data type' }),
      h('p', { class: 'hint', text: 'When a prompt matches several, the strictest action wins.' }),
      list,
      h('label', { class: 'switch' }, [strict, h('span', {}, [h('strong', { text: 'Strict mode' }), h('small', { text: 'Removes Send anyway. Anyone using this browser can switch it off, so it is a guard rail, not a lock.' })])]),
      reset
    ]);
    if (o.openPolicies) details.open = true;
    var foot = [h('p', { text: 'Best-effort check. It can miss data and can be bypassed. Nothing you type leaves this browser.' })];
    if (o.dashboardHref) foot.unshift(h('a', { class: 'link', href: o.dashboardHref, target: '_blank', rel: 'noreferrer', text: 'View activity' }));
    return h('div', { class: 'popup' }, [
      h('header', { class: 'top' }, [h('div', { class: 'mark', 'aria-hidden': 'true', text: 'D' }), h('div', {}, [h('h1', { text: 'dato' }), h('p', { text: 'Checks prompts before they send' })])]),
      h('section', { class: 'status', id: 'status', 'data-state': o.status.state, 'aria-live': 'polite' }, [
        h('span', { class: 'status-icon', 'aria-hidden': 'true', text: st.icon }),
        h('div', {}, [h('strong', { id: 'status-title', text: st.title }), h('span', { id: 'status-detail', text: o.status.detail })])
      ]),
      details,
      h('footer', {}, foot)
    ]);
  }

  /* Update the status card in place when the tab check comes back. */
  function setStatus(root, status) {
    var st = STATUS[status.state] || STATUS.error;
    var card = root.querySelector('#status');
    card.dataset.state = status.state;
    card.querySelector('.status-icon').textContent = st.icon;
    card.querySelector('#status-title').textContent = st.title;
    card.querySelector('#status-detail').textContent = status.detail;
  }

  global.DatoUI = { h: h, setStatus: setStatus, reviewDialog: reviewDialog, popupView: popupView, CATEGORY_NAMES: CATEGORY_NAMES };
})(typeof window !== 'undefined' ? window : globalThis);
