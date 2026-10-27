/* Dato activity store rules: what an event may contain, retention, and the
 * numbers the dashboard shows. Pure functions, shared by background.js,
 * dashboard.js and the Node tests.
 *
 * An event holds counts and labels only. It never holds prompt text, file
 * contents, matched values, masked excerpts or anything that could rebuild them.
 */
(function (global) {
  'use strict';

  var ACTIONS = ['allow', 'warn', 'redact', 'block'];
  var OUTCOMES = ['allowed', 'cancelled', 'override', 'redacted', 'redaction_failed', 'stale_review'];
  var TRIGGERS = ['enter', 'click', 'submit', 'recheck', 'unknown'];
  var CATEGORIES = ['secrets', 'pii', 'financial', 'source', 'contract', 'sensitive'];
  var ADAPTERS = ['chatgpt', 'claude', 'gemini', 'fixture'];
  var HEALTH_STATES = ['active', 'degraded', 'error', 'checking'];
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
      adapter: pick(r.adapter, ADAPTERS, 'fixture'),
      action: pick(r.action, ACTIONS, 'warn'),
      outcome: pick(r.outcome, OUTCOMES, 'cancelled'),
      trigger: pick(r.trigger, TRIGGERS, 'unknown'),
      strict: r.strict === true,
      categories: counts(r.categories, function (k) { return CATEGORIES.indexOf(k) !== -1; }),
      rules: counts(r.rules, function (k) { return /^[a-z0-9-]{1,40}$/.test(k); })
    };
  }

  var HEALTH_CODES = ['ok', 'starting', 'orphaned', 'listeners', 'storage', 'no-editor', 'fallback-editor', 'no-send-button'];

  function sanitizeHealth(raw, now) {
    var r = raw || {};
    return {
      adapter: pick(r.adapter, ADAPTERS, 'fixture'),
      state: pick(r.state, HEALTH_STATES, 'error'),
      code: pick(r.code, HEALTH_CODES, 'starting'),
      detail: String(r.detail || '').slice(0, 200),
      t: now
    };
  }

  /* Events newer than the retention window, newest last, capped. */
  function prune(events, retentionDays, now) {
    var cutoff = now - retentionDays * DAY;
    var kept = (events || []).filter(function (e) { return e && e.t >= cutoff && e.t <= now + DAY; });
    return kept.slice(-MAX_EVENTS);
  }

  function startOfDay(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }

  /* Dashboard numbers for the last `days` days. Empty input gives zeros. */
  function metrics(events, days, now) {
    var from = startOfDay(now) - (days - 1) * DAY;
    var inRange = (events || []).filter(function (e) { return e.t >= from && e.t <= now; });
    var m = {
      total: inRange.length, blocked: 0, redacted: 0, overrides: 0, cancelled: 0, allowed: 0, failed: 0, stale: 0,
      byCategory: {}, bySite: {}, perDay: []
    };
    CATEGORIES.forEach(function (c) { m.byCategory[c] = 0; });
    for (var i = 0; i < days; i++) m.perDay.push({ day: from + i * DAY, total: 0, blocked: 0, redacted: 0, overrides: 0 });
    inRange.forEach(function (e) {
      if (e.outcome === 'override') m.overrides++;
      else if (e.outcome === 'redacted') m.redacted++;
      else if (e.outcome === 'allowed') m.allowed++;
      else if (e.outcome === 'redaction_failed') m.failed++;
      else if (e.outcome === 'stale_review') m.stale++;
      else m.cancelled++;
      // A block is a prompt the policy blocked that did not go out anyway.
      var blocked = e.action === 'block' && e.outcome !== 'override' && e.outcome !== 'redacted';
      if (blocked) m.blocked++;
      Object.keys(e.categories || {}).forEach(function (c) { if (c in m.byCategory) m.byCategory[c] += e.categories[c]; });
      m.bySite[e.adapter] = (m.bySite[e.adapter] || 0) + 1;
      var slot = m.perDay[Math.floor((startOfDay(e.t) - from) / DAY)];
      if (slot) {
        slot.total++;
        if (blocked) slot.blocked++;
        if (e.outcome === 'redacted') slot.redacted++;
        if (e.outcome === 'override') slot.overrides++;
      }
    });
    return m;
  }

  var api = {
    ACTIONS: ACTIONS, OUTCOMES: OUTCOMES, CATEGORIES: CATEGORIES, ADAPTERS: ADAPTERS, HEALTH_STATES: HEALTH_STATES,
    MAX_EVENTS: MAX_EVENTS, DAY: DAY,
    sanitizeEvent: sanitizeEvent, sanitizeHealth: sanitizeHealth, prune: prune, metrics: metrics, startOfDay: startOfDay
  };
  global.DatoStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
