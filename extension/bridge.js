/* AI Firewall: dashboard bridge (content script on the AI Firewall website only).
 *
 * The extension keeps its flag log in chrome.storage.local (dato_events). The
 * website's Dashboard cannot read that, so this script hands the page a summary
 * of counts and a short recent-catch list: LABEL, OUTCOME, SITE AND TIME ONLY.
 * Never prompt text, matched values, masked excerpts, paths, query strings,
 * rule ids or event ids. The events themselves already hold nothing more
 * (store.js).
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
  var RECENT_MAX = 40;

  var CATEGORIES = ['secrets', 'pii', 'financial', 'source', 'contract', 'sensitive'];
  var SITES = ['chatgpt', 'claude', 'gemini'];
  var ACTIONS = ['allow', 'warn', 'redact', 'block'];
  var OUTCOMES = ['allowed', 'cancelled', 'override', 'redacted'];
  var SEVERITIES = ['critical', 'high', 'medium', 'low'];

  /* Stored events use a short site slug. The page only ever sees a hostname:
   * a path or query could carry prompt text, so those are stripped. */
  var SITE_HOST = { chatgpt: 'chatgpt.com', claude: 'claude.ai', gemini: 'gemini.google.com' };
  var HOST_SLUG = { 'chatgpt.com': 'chatgpt', 'chat.openai.com': 'chatgpt', 'claude.ai': 'claude', 'gemini.google.com': 'gemini' };

  var CATEGORY_LABEL = {
    secrets: 'Passwords & keys', pii: 'Personal details', financial: 'Financial data',
    source: 'Source code', contract: 'Contracts & legal', sensitive: 'Confidential context'
  };
  /* Allowlisted finding labels, keyed by the rule id stored on the event.
   * Unknown ids fall back to the category, never to a string on the event. */
  var RULE_LABEL = {
    'aws-access-key': 'AWS access key',
    'github-token': 'GitHub token',
    'openai-key': 'OpenAI API key',
    'anthropic-key': 'Anthropic API key',
    'slack-token': 'Slack token',
    'stripe-live-key': 'Stripe live key',
    'google-api-key': 'Google API key',
    jwt: 'JSON Web Token',
    'private-key-block': 'Private key block',
    'db-connection-string': 'Database connection string',
    'hardcoded-password': 'Hardcoded password',
    'basic-auth-url': 'Credentials in a URL',
    'partial-aws-key': 'Partial AWS key',
    'partial-openai-key': 'Partial OpenAI key',
    'credential-named': 'Named credential',
    'implied-secret': 'Named credential',
    'unknown-token': 'Possible key or token',
    'personal-fact-named': 'Personal detail',
    ssn: 'US Social Security number',
    'email-address': 'Email address',
    'us-phone': 'US phone number',
    'date-of-birth': 'Date of birth',
    'passport-number': 'Passport number',
    'drivers-license': "Driver's license",
    'street-address': 'Street address',
    'credit-card': 'Payment card number',
    iban: 'IBAN',
    'routing-number': 'Bank routing / account detail',
    'financial-figures': 'Confidential financial figure',
    'invoice-reference': 'Invoice / billing reference',
    'source-code': 'Source code',
    contract: 'Contract or legal language',
    'sensitive-context': 'Confidential context'
  };
  var OUTCOME_WORD = { cancelled: 'stopped', override: 'sent anyway', allowed: 'allowed', redacted: 'redacted' };

  function zeros(keys) { var o = {}; keys.forEach(function (k) { o[k] = 0; }); return o; }
  function count(n) { n = Math.floor(Number(n)); return n > 0 && n < 1e6 ? n : 0; }

  /* siteHost(value) -> a hostname with no path or query, or ''. */
  function siteHost(value) {
    if (typeof value !== 'string' || !value) return '';
    if (SITE_HOST[value]) return SITE_HOST[value];
    var host = '';
    try {
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || /[/?#]/.test(value) || value.indexOf('://') !== -1) {
        var url = value.indexOf('://') === -1 ? 'https://' + value : value;
        host = new URL(url).hostname || '';
      } else if (/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/i.test(value) && value.indexOf('..') === -1) {
        host = value;
      }
    } catch (e) { return ''; }
    host = String(host).toLowerCase();
    if (!host || /[/?#@:\s]/.test(host)) return '';
    if (HOST_SLUG[host]) return SITE_HOST[HOST_SLUG[host]];
    if (SITE_HOST[host]) return SITE_HOST[host];
    return '';
  }

  function eventLabel(e) {
    var rules = (e && e.rules) || {};
    var best = '', bestN = 0;
    Object.keys(rules).forEach(function (id) {
      if (!RULE_LABEL[id]) return;
      var n = count(rules[id]);
      if (n > bestN) { bestN = n; best = RULE_LABEL[id]; }
    });
    if (best) return best;
    var cats = (e && e.categories) || {};
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (count(cats[CATEGORIES[i]])) return CATEGORY_LABEL[CATEGORIES[i]];
    }
    return 'Confidential data';
  }

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

  /* recent(events) -> up to RECENT_MAX items, newest first: {label, outcome, site, time} only. */
  function recent(events) {
    var list = [];
    (Array.isArray(events) ? events : []).forEach(function (e) {
      if (!e || typeof e !== 'object') return;
      var site = siteHost(e.site);
      var outcome = OUTCOME_WORD[e.outcome];
      var time = Number(e.t);
      if (!site || !outcome || !isFinite(time) || time <= 0) return;
      list.push({ label: eventLabel(e), outcome: outcome, site: site, time: time });
    });
    list.sort(function (a, b) { return b.time - a.time; });
    return list.slice(0, RECENT_MAX);
  }

  function message(events) {
    return { type: MESSAGE_TYPE, v: VERSION, summary: summarize(events), recent: recent(events) };
  }

  var api = {
    MESSAGE_TYPE: MESSAGE_TYPE, REQUEST_TYPE: REQUEST_TYPE, VERSION: VERSION, SITE_ORIGIN: SITE_ORIGIN,
    RECENT_MAX: RECENT_MAX, RULE_LABEL: RULE_LABEL, SITE_HOST: SITE_HOST, OUTCOME_WORD: OUTCOME_WORD,
    summarize: summarize, recent: recent, siteHost: siteHost, message: message
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
