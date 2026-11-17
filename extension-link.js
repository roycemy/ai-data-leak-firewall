/* AI Firewall: counts from the Chrome extension, for the website Dashboard.
 *
 * The extension's bridge content script (extension/bridge.js) posts a summary
 * of its own flag log to this page with window.postMessage. This file checks
 * that message and turns it into the "From the Chrome extension" card.
 * Pure functions: they read only what they are given, so Node can test them.
 *
 * The summary is counts and labels only. validate() rebuilds it from an
 * allowlist, so nothing else the message carries reaches the page.
 */
(function (global) {
  'use strict';

  var MESSAGE_TYPE = 'aifw:extension-summary';
  var REQUEST_TYPE = 'aifw:extension-summary-request';
  var VERSION = 1;
  var MAX = 1000000;

  var KEYS = {
    byAction: ['allow', 'warn', 'redact', 'block'],
    byOutcome: ['allowed', 'cancelled', 'override', 'redacted'],
    byCategory: ['secrets', 'pii', 'financial', 'source', 'contract', 'sensitive'],
    bySite: ['chatgpt', 'claude', 'gemini'],
    bySeverity: ['critical', 'high', 'medium', 'low']
  };
  var LABELS = {
    secrets: 'Passwords & keys', pii: 'Personal details', financial: 'Financial data',
    source: 'Source code', contract: 'Contracts & legal', sensitive: 'Confidential context',
    chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini'
  };

  function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function isCount(n) { return typeof n === 'number' && Math.floor(n) === n && n >= 0 && n <= MAX; }

  /* validate(data) -> a clean summary, or null if data is not a well-formed
   * extension summary. Every count must be a whole number; unknown keys are dropped. */
  function validate(data) {
    if (!isObject(data) || data.type !== MESSAGE_TYPE || data.v !== VERSION || !isObject(data.summary)) return null;
    var s = data.summary;
    if (!isCount(s.total) || !isCount(s.high) || s.high > s.total) return null;
    if (s.lastAt !== null && !(typeof s.lastAt === 'number' && isFinite(s.lastAt) && s.lastAt > 0)) return null;
    var out = { total: s.total, high: s.high, lastAt: s.lastAt };
    for (var group in KEYS) {
      if (!isObject(s[group])) return null;
      out[group] = {};
      for (var i = 0; i < KEYS[group].length; i++) {
        var k = KEYS[group][i], n = s[group][k] === undefined ? 0 : s[group][k];
        if (!isCount(n)) return null;
        out[group][k] = n;
      }
    }
    return out;
  }

  /* isFromExtension(event, win) -> true only for a message this window posted to itself
   * (the content script shares the page's window) from the page's own origin. */
  function isFromExtension(event, win) {
    return !!event && event.source === win && event.origin === win.location.origin;
  }

  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  /* statCaption(siteText, fromExtension) -> one caption that says what came from where */
  function statCaption(siteText, fromExtension) {
    return fromExtension ? siteText + ' · ' + fromExtension + ' from extension' : siteText;
  }

  /* cardHTML(summary, timeAgoText) -> the inside of the extension card.
   * summary null means no extension answered: say where its flags live instead. */
  function cardHTML(s, timeAgoText) {
    if (!s) {
      return '<p class="card-caption">No extension connected to this page. Flags caught in ChatGPT, Claude or Gemini are kept by the extension in Chrome: open its toolbar popup and choose <b>View flagged activity</b>. With the latest extension installed (and reloaded in <code>chrome://extensions</code>), its counts also appear here.</p>' +
        '<p><a href="#install" class="link-quiet" data-goto="install">Get the extension</a></p>';
    }
    if (!s.total) {
      return '<p class="card-caption">Connected. Nothing flagged in ChatGPT, Claude or Gemini yet.</p>';
    }
    var o = s.byOutcome;
    var rows = [
      ['Flagged prompts', s.total],
      ['High severity', s.high],
      ['Blocked by policy', s.byAction.block],
      ['Stopped, not sent', o.cancelled],
      ['Sent anyway', o.override + o.allowed],
      ['Redacted, then sent', o.redacted]
    ];
    var sites = KEYS.bySite.filter(function (k) { return s.bySite[k]; })
      .map(function (k) { return LABELS[k] + ' ' + s.bySite[k]; }).join(' · ');
    var types = KEYS.byCategory.filter(function (k) { return s.byCategory[k]; })
      .map(function (k) { return '<li><span>' + LABELS[k] + '</span><span class="num">' + s.byCategory[k] + '</span></li>'; }).join('');
    return '<ul class="legend-list">' + rows.map(function (r) {
      return '<li><span>' + r[0] + '</span><span class="num">' + r[1] + '</span></li>';
    }).join('') + '</ul>' +
      (types ? '<p class="caption section-gap">Data types found</p><ul class="legend-list">' + types + '</ul>' : '') +
      '<p class="card-caption section-gap">' + plural(s.total, 'flag') + (sites ? ' on ' + sites : '') +
      (timeAgoText ? ' · last ' + timeAgoText : '') + '. Counts only: prompt text never leaves the extension.</p>';
  }

  var api = {
    MESSAGE_TYPE: MESSAGE_TYPE, REQUEST_TYPE: REQUEST_TYPE, VERSION: VERSION, KEYS: KEYS,
    validate: validate, isFromExtension: isFromExtension, statCaption: statCaption, cardHTML: cardHTML
  };
  global.DatoExtensionLink = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
