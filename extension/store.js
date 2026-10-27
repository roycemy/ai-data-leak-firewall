/* Dato activity store rules: what a flag event may contain, retention, and the
 * numbers the dashboard shows. Pure functions, shared by background.js,
 * dashboard.js and the Node tests.
 *
 * An event holds counts and labels only. It never holds prompt text, file
 * contents, matched values, masked excerpts or anything that could rebuild them.
 */
(function (global) {
  'use strict';

  var ACTIONS = ['allow', 'warn', 'redact', 'block'];
  // allowed = policy let it through; cancelled = user went back, nothing sent;
  // override = user chose Send anyway; redacted = sent with values replaced.
  var OUTCOMES = ['allowed', 'cancelled', 'override', 'redacted'];
  var TRIGGERS = ['enter', 'click', 'submit', 'unknown'];
  var CATEGORIES = ['secrets', 'pii', 'financial', 'source', 'contract', 'sensitive'];
  var SEVERITIES = ['critical', 'high', 'medium', 'low'];
  var SITES = ['chatgpt', 'claude', 'gemini'];
  var RETENTION_CHOICES = [7, 30, 90];
  var MAX_EVENTS = 5000;
  var DAY = 86400000;

  function pick(v, allowed, fallback) { return allowed.indexOf(v) !== -1 ? v : fallback; }

  function counts(raw, keyOk) {
    var out = {};
    Object.keys(raw || {}).slice(0, 40).forEach(function (k) {
      var n = Math.floor(Number(raw[k]));
      if (keyOk(k) && n > 0) out[k] = Math.min(n, 1000);
    });
    return out;
  }

  /* Rebuild an event from an allowlist so nothing extra can be stored. */
  function sanitizeEvent(raw, now, id) {
    var r = raw || {};
    return {
      id: id,
      t: now,
      site: pick(r.site, SITES, 'chatgpt'),
      action: pick(r.action, ACTIONS, 'warn'),
      outcome: pick(r.outcome, OUTCOMES, 'cancelled'),
      trigger: pick(r.trigger, TRIGGERS, 'unknown'),
      severity: pick(r.severity, SEVERITIES, 'low'),
      categories: counts(r.categories, function (k) { return CATEGORIES.indexOf(k) !== -1; }),
      rules: counts(r.rules, function (k) { return /^[a-z0-9-]{1,40}$/.test(k); })
    };
  }

  function cleanRetention(days) { return RETENTION_CHOICES.indexOf(days) !== -1 ? days : 30; }

  /* Events newer than the retention window, capped. */
  function prune(events, retentionDays, now) {
    var cutoff = now - retentionDays * DAY;
    var kept = (events || []).filter(function (e) { return e && e.t >= cutoff && e.t <= now + DAY; });
    return kept.slice(-MAX_EVENTS);
  }

  function startOfDay(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }

  /* Dashboard numbers for the last `days` days. Empty input gives zeros.
   *   flagged     every event (a prompt Dato found something in)
   *   high        flagged prompts whose worst finding was critical or high
   *   stopped     the user went back, so nothing was sent
   *   sentThrough the user chose Send anyway (or policy allowed it)
   *   redacted    sent with the flagged values replaced */
  function metrics(events, days, now) {
    var from = startOfDay(now) - (days - 1) * DAY;
    var inRange = (events || []).filter(function (e) { return e.t >= from && e.t <= now; });
    var m = { flagged: inRange.length, high: 0, stopped: 0, sentThrough: 0, redacted: 0, byCategory: {}, bySite: {}, perDay: [] };
    CATEGORIES.forEach(function (c) { m.byCategory[c] = 0; });
    for (var i = 0; i < days; i++) m.perDay.push({ day: from + i * DAY, total: 0, high: 0 });
    inRange.forEach(function (e) {
      var isHigh = e.severity === 'critical' || e.severity === 'high';
      if (isHigh) m.high++;
      if (e.outcome === 'cancelled') m.stopped++;
      else if (e.outcome === 'redacted') m.redacted++;
      else m.sentThrough++; // override or allowed by policy
      Object.keys(e.categories || {}).forEach(function (c) { if (c in m.byCategory) m.byCategory[c] += e.categories[c]; });
      m.bySite[e.site] = (m.bySite[e.site] || 0) + 1;
      var slot = m.perDay[Math.floor((startOfDay(e.t) - from) / DAY)];
      if (slot) { slot.total++; if (isHigh) slot.high++; }
    });
    return m;
  }

  var api = {
    ACTIONS: ACTIONS, OUTCOMES: OUTCOMES, CATEGORIES: CATEGORIES, SEVERITIES: SEVERITIES, SITES: SITES,
    RETENTION_CHOICES: RETENTION_CHOICES, MAX_EVENTS: MAX_EVENTS, DAY: DAY,
    sanitizeEvent: sanitizeEvent, cleanRetention: cleanRetention, prune: prune, metrics: metrics, startOfDay: startOfDay
  };
  global.DatoStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
