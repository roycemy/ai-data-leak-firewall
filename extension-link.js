/* AI Firewall: counts and recent-catch labels from the Chrome extension,
 * for the website Dashboard.
 *
 * The extension's bridge content script (extension/bridge.js) posts a summary
 * of its own flag log to this page with window.postMessage. This file checks
 * that message. Pure functions: they read only what they are given, so Node
 * can test them.
 *
 * The payload is counts and labels only. validate() rebuilds it from an
 * allowlist, so nothing else the message carries reaches the page. Each
 * recent item keeps only label, outcome, site and time. Site must be a
 * hostname with no path or query.
 */
(function (global) {
  'use strict';

  var MESSAGE_TYPE = 'aifw:extension-summary';
  var REQUEST_TYPE = 'aifw:extension-summary-request';
  var VERSION = 1;
  var MAX = 1000000;
  var RECENT_MAX = 40;

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
  var SITE_NAME = {
    'chatgpt.com': 'ChatGPT',
    'claude.ai': 'Claude',
    'gemini.google.com': 'Gemini'
  };
  var OUTCOMES = ['stopped', 'sent anyway', 'allowed', 'redacted'];
  var LABELS_OK = {
    'AWS access key': 1, 'GitHub token': 1, 'OpenAI API key': 1, 'Anthropic API key': 1,
    'Slack token': 1, 'Stripe live key': 1, 'Google API key': 1, 'JSON Web Token': 1,
    'Private key block': 1, 'Database connection string': 1, 'Hardcoded password': 1,
    'Credentials in a URL': 1, 'Partial AWS key': 1, 'Partial OpenAI key': 1,
    'Named credential': 1, 'Possible key or token': 1, 'Personal detail': 1,
    'US Social Security number': 1, 'Email address': 1, 'US phone number': 1,
    'Date of birth': 1, 'Passport number': 1, "Driver's license": 1, 'Street address': 1,
    'Payment card number': 1, IBAN: 1, 'Bank routing / account detail': 1,
    'Confidential financial figure': 1, 'Invoice / billing reference': 1,
    'Source code': 1, 'Contract or legal language': 1, 'Confidential context': 1,
    'Passwords & keys': 1, 'Personal details': 1, 'Financial data': 1,
    'Contracts & legal': 1, 'Confidential data': 1
  };

  function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function isCount(n) { return typeof n === 'number' && Math.floor(n) === n && n >= 0 && n <= MAX; }
  function isTime(n) { return typeof n === 'number' && isFinite(n) && n > 0; }

  /* A hostname only: no scheme, path, query, port or userinfo. */
  function isHostname(s) {
    return typeof s === 'string' && /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(s) &&
      s.indexOf('..') === -1 && !/[/?#@:\s]/.test(s) && s.length <= 253;
  }

  function cleanRecent(arr) {
    if (!Array.isArray(arr)) return [];
    var out = [];
    for (var i = 0; i < arr.length && out.length < RECENT_MAX; i++) {
      var e = arr[i];
      if (!isObject(e)) continue;
      if (!LABELS_OK[e.label] || OUTCOMES.indexOf(e.outcome) === -1 || !isHostname(e.site) || !isTime(e.time)) continue;
      out.push({ label: e.label, outcome: e.outcome, site: e.site, time: e.time });
    }
    return out;
  }

  /* validate(data) -> { summary, recent } or null if data is not a well-formed
   * extension message. Every count must be a whole number; unknown keys and
   * any field other than label, outcome, site and time on a recent item are dropped. */
  function validate(data) {
    if (!isObject(data) || data.type !== MESSAGE_TYPE || data.v !== VERSION || !isObject(data.summary)) return null;
    var s = data.summary;
    if (!isCount(s.total) || !isCount(s.high) || s.high > s.total) return null;
    /* Older 1.2.0 / 1.3.0 extensions omit these; treat a missing count as 0 so
     * they still show Connected. Reject the message when a value is present but
     * is not a whole number. */
    var stoppedToday = s.stoppedToday === undefined ? 0 : s.stoppedToday;
    var stoppedWeek = s.stoppedWeek === undefined ? 0 : s.stoppedWeek;
    if (!isCount(stoppedToday) || !isCount(stoppedWeek) || stoppedToday > stoppedWeek || stoppedWeek > s.total) return null;
    if (s.lastAt !== null && !(typeof s.lastAt === 'number' && isFinite(s.lastAt) && s.lastAt > 0)) return null;
    var out = { total: s.total, high: s.high, lastAt: s.lastAt, stoppedToday: stoppedToday, stoppedWeek: stoppedWeek };
    for (var group in KEYS) {
      if (!isObject(s[group])) return null;
      out[group] = {};
      for (var i = 0; i < KEYS[group].length; i++) {
        var k = KEYS[group][i], n = s[group][k] === undefined ? 0 : s[group][k];
        if (!isCount(n)) return null;
        out[group][k] = n;
      }
    }
    return { summary: out, recent: cleanRecent(data.recent) };
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

  function siteName(host) { return SITE_NAME[host] || host; }

  /* cardHTML(summary, timeAgoText) -> the inside of the extension card.
   * summary null means no extension answered: say where its flags live instead. */
  function cardHTML(s, timeAgoText) {
    if (!s) {
      return '<p class="card-caption">No extension connected to this page. Flags caught in ChatGPT, Claude or Gemini are kept by the extension in Chrome: open its toolbar popup and choose <b>View flagged activity</b>. With the latest extension installed (and reloaded in <code>chrome://extensions</code>), its counts also appear here.</p>' +
        '<p class="section-gap"><a href="#setup" class="btn btn-secondary" data-goto="setup">Get the extension</a></p>';
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
    MESSAGE_TYPE: MESSAGE_TYPE, REQUEST_TYPE: REQUEST_TYPE, VERSION: VERSION, KEYS: KEYS, RECENT_MAX: RECENT_MAX,
    validate: validate, cleanRecent: cleanRecent, isFromExtension: isFromExtension,
    statCaption: statCaption, cardHTML: cardHTML, siteName: siteName, isHostname: isHostname
  };
  global.DatoExtensionLink = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
