/* Dato policy engine.
 * Pure functions: turns detector findings + policies into one decision,
 * and builds the redacted copy. No DOM, no storage, so it runs in Node tests.
 */
(function (global) {
  'use strict';

  var RANK = { allow: 0, warn: 1, redact: 2, block: 3 };
  var ACTIONS = ['allow', 'warn', 'redact', 'block'];
  var CATEGORY_KEYS = ['secrets', 'pii', 'financial', 'source', 'contract', 'sensitive'];
  var DEFAULT_POLICIES = { secrets: 'block', pii: 'warn', financial: 'warn', source: 'warn', contract: 'warn', sensitive: 'warn' };
  var DEFAULT_SETTINGS = { strict: false, retentionDays: 30 };
  var RETENTION_CHOICES = [7, 30, 90];

  function cleanPolicies(raw) {
    var out = {};
    CATEGORY_KEYS.forEach(function (k) {
      var v = raw && raw[k];
      out[k] = ACTIONS.indexOf(v) !== -1 ? v : DEFAULT_POLICIES[k];
    });
    return out;
  }

  function cleanSettings(raw) {
    var r = raw || {};
    return {
      strict: r.strict === true,
      retentionDays: RETENTION_CHOICES.indexOf(r.retentionDays) !== -1 ? r.retentionDays : DEFAULT_SETTINGS.retentionDays
    };
  }

  /* Effective action for one finding.
   * - Tentative (lower-confidence) findings never go above Warn.
   * - A Redact policy on a finding with no exact span (code, contract or
   *   context heuristics) cannot be redacted, so it escalates to Block
   *   instead of pretending redaction happened. */
  function itemFor(finding, policies) {
    var policy = policies[finding.category] || 'warn';
    var effective = policy;
    var note = '';
    if (finding.tentative && RANK[effective] > RANK.warn) {
      effective = 'warn';
      note = 'Lower-confidence match, so Dato warns instead of ' + policy + 'ing.';
    }
    if (effective === 'redact' && !(finding.length > 0)) {
      effective = 'block';
      note = 'This is a whole-prompt pattern with no exact value to replace, so it cannot be redacted automatically.';
    }
    return { finding: finding, policy: policy, effective: effective, note: note };
  }

  /* decide(findings, policies, settings) -> decision
   * action: strictest effective action across findings (block > redact > warn > allow). */
  function decide(findings, policies, settings) {
    var pol = cleanPolicies(policies);
    var set = cleanSettings(settings);
    var items = (findings || []).map(function (f) { return itemFor(f, pol); });
    var action = 'allow';
    items.forEach(function (it) { if (RANK[it.effective] > RANK[action]) action = it.effective; });
    var toRedact = items.filter(function (it) { return it.effective !== 'allow'; });
    var canRedact = toRedact.length > 0 && toRedact.every(function (it) { return it.finding.length > 0; });
    return {
      action: action,
      items: items,
      strict: set.strict,
      canRedact: canRedact,
      overrideAllowed: !set.strict && (action === 'warn' || action === 'block')
    };
  }

  function placeholder(label) { return '[REDACTED: ' + String(label).toUpperCase() + ']'; }

  /* Replace every span that is not Allowed. Overlapping spans are merged so
   * no fragment of a value survives between two placeholders. */
  function redactText(text, decision) {
    var spans = decision.items
      .filter(function (it) { return it.effective !== 'allow' && it.finding.length > 0; })
      .map(function (it) { return { start: it.finding.index, end: it.finding.index + it.finding.length, label: it.finding.label }; })
      .sort(function (a, b) { return a.start - b.start || b.end - a.end; });
    var merged = [];
    spans.forEach(function (s) {
      var last = merged[merged.length - 1];
      if (last && s.start < last.end) { last.end = Math.max(last.end, s.end); return; }
      merged.push({ start: s.start, end: s.end, label: s.label });
    });
    var out = '', pos = 0;
    merged.forEach(function (s) { out += text.slice(pos, s.start) + placeholder(s.label); pos = s.end; });
    return out + text.slice(pos);
  }

  /* A redaction is only safe to send if a fresh scan of the redacted text
   * no longer demands Redact or Block. */
  function redactionHolds(redacted, scan, policies, settings) {
    var again = decide(scan(redacted).findings, policies, settings);
    return { ok: RANK[again.action] < RANK.redact, decision: again };
  }

  /* Minimal metadata for the activity log: counts only, never text or excerpts. */
  function summarize(decision) {
    var categories = {}, rules = {};
    decision.items.forEach(function (it) {
      if (it.effective === 'allow' && decision.action !== 'allow') return;
      var c = it.finding.category, r = it.finding.ruleId;
      categories[c] = (categories[c] || 0) + 1;
      rules[r] = (rules[r] || 0) + 1;
    });
    return { action: decision.action, strict: decision.strict, categories: categories, rules: rules };
  }

  var api = {
    RANK: RANK, ACTIONS: ACTIONS, CATEGORY_KEYS: CATEGORY_KEYS,
    DEFAULT_POLICIES: DEFAULT_POLICIES, DEFAULT_SETTINGS: DEFAULT_SETTINGS, RETENTION_CHOICES: RETENTION_CHOICES,
    cleanPolicies: cleanPolicies, cleanSettings: cleanSettings,
    decide: decide, redactText: redactText, redactionHolds: redactionHolds, summarize: summarize
  };
  global.DatoPolicy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
