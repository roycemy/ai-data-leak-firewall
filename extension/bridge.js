/* AI Firewall: dashboard bridge (content script on the AI Firewall website only).
 *
 * The extension keeps its flag log in chrome.storage.local (dato_events). The
 * website's Dashboard cannot read that, so this script hands the page a summary:
 * COUNTS AND LABELS ONLY. Never prompt text, matched values, masked excerpts or
 * per-event detail. The events themselves already hold nothing more (store.js).
 *
 * Runs only on https://roycemy.github.io/ai-data-leak-firewall/* (manifest.json).
 * Messages go to that exact origin, and the only thing it accepts from the page
 * is a request to resend the summary.
 */
(function (global) {
  'use strict';

  var MESSAGE_TYPE = 'aifw:extension-summary';
  var REQUEST_TYPE = 'aifw:extension-summary-request';
  var VERSION = 1;
  var SITE_ORIGIN = 'https://roycemy.github.io';
  var SITE_PATH = '/ai-data-leak-firewall/';

  var CATEGORIES = ['secrets', 'pii', 'financial', 'source', 'contract', 'sensitive'];
  var SITES = ['chatgpt', 'claude', 'gemini'];
  var ACTIONS = ['allow', 'warn', 'redact', 'block'];
  var OUTCOMES = ['allowed', 'cancelled', 'override', 'redacted'];
  var SEVERITIES = ['critical', 'high', 'medium', 'low'];

  function zeros(keys) { var o = {}; keys.forEach(function (k) { o[k] = 0; }); return o; }
  function count(n) { n = Math.floor(Number(n)); return n > 0 && n < 1e6 ? n : 0; }

  /* summarize(events) -> counts only. Unknown labels are dropped, not passed on. */
  function summarize(events) {
    var s = {
      total: 0, high: 0, lastAt: null,
      byAction: zeros(ACTIONS), byOutcome: zeros(OUTCOMES), byCategory: zeros(CATEGORIES),
      bySite: zeros(SITES), bySeverity: zeros(SEVERITIES)
    };
    (Array.isArray(events) ? events : []).forEach(function (e) {
      if (!e || typeof e !== 'object') return;
      s.total++;
      if (e.severity === 'critical' || e.severity === 'high') s.high++;
      if (e.action in s.byAction) s.byAction[e.action]++;
      if (e.outcome in s.byOutcome) s.byOutcome[e.outcome]++;
      if (e.site in s.bySite) s.bySite[e.site]++;
      if (e.severity in s.bySeverity) s.bySeverity[e.severity]++;
      CATEGORIES.forEach(function (c) { s.byCategory[c] += count(e.categories && e.categories[c]); });
      var t = Number(e.t);
      if (isFinite(t) && t > 0 && (s.lastAt === null || t > s.lastAt)) s.lastAt = t;
    });
    return s;
  }

  function message(events) { return { type: MESSAGE_TYPE, v: VERSION, summary: summarize(events) }; }

  var api = {
    MESSAGE_TYPE: MESSAGE_TYPE, REQUEST_TYPE: REQUEST_TYPE, VERSION: VERSION, SITE_ORIGIN: SITE_ORIGIN,
    summarize: summarize, message: message
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

  // ---------- In the browser (content script) ----------
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
  if (global.location.origin !== SITE_ORIGIN || global.location.pathname.indexOf(SITE_PATH) !== 0) return;

  // Reads dato_events. Changes nothing; posts the summary to the page.
  function send() {
    chrome.storage.local.get('dato_events', function (all) {
      if (chrome.runtime.lastError) return;
      global.postMessage(message(all && all.dato_events), SITE_ORIGIN);
    });
  }
  global.addEventListener('message', function (e) {
    if (e.source !== global || e.origin !== SITE_ORIGIN) return;
    if (e.data && e.data.type === REQUEST_TYPE) send();
  });
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'local' && changes.dato_events) send();
  });
  send();
})(typeof window !== 'undefined' ? window : globalThis);
