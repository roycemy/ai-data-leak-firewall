const test = require('node:test');
const assert = require('node:assert');
const S = require('../../extension/store.js');

const NOW = new Date('2026-10-27T12:00:00').getTime();

test('sanitizeEvent keeps only allowlisted metadata', () => {
  const e = S.sanitizeEvent({
    adapter: 'claude', action: 'block', outcome: 'override', trigger: 'enter', strict: false,
    categories: { secrets: 2, evil: 5 }, rules: { 'aws-access-key': 1, 'AKIAIOSFODNN7EXAMPLE secret': 1 },
    text: 'AKIAIOSFODNN7EXAMPLE', masked: 'AKIA••••MPLE', prompt: 'hi'
  }, NOW, 'id1');
  assert.deepStrictEqual(Object.keys(e).sort(), ['action', 'adapter', 'categories', 'id', 'outcome', 'rules', 'strict', 't', 'trigger']);
  assert.deepStrictEqual(e.categories, { secrets: 2 });
  assert.deepStrictEqual(e.rules, { 'aws-access-key': 1 });
  assert.ok(!JSON.stringify(e).includes('AKIA'));
});

test('unknown enum values are replaced, not stored', () => {
  const e = S.sanitizeEvent({ adapter: 'evil.com', action: 'nuke', outcome: '<script>' }, NOW, 'x');
  assert.strictEqual(e.adapter, 'fixture');
  assert.strictEqual(e.action, 'warn');
  assert.strictEqual(e.outcome, 'cancelled');
});

test('prune drops events older than retention and caps the count', () => {
  const old = { t: NOW - 31 * S.DAY }, recent = { t: NOW - S.DAY };
  assert.deepStrictEqual(S.prune([old, recent], 30, NOW), [recent]);
  const many = Array.from({ length: S.MAX_EVENTS + 10 }, (_, i) => ({ t: NOW - 1000 + i / 100 }));
  assert.strictEqual(S.prune(many, 30, NOW).length, S.MAX_EVENTS);
});

test('empty input gives zero metrics, not made-up numbers', () => {
  const m = S.metrics([], 7, NOW);
  assert.strictEqual(m.total, 0);
  assert.strictEqual(m.perDay.length, 7);
  assert.ok(m.perDay.every((d) => d.total === 0));
  assert.ok(Object.values(m.byCategory).every((v) => v === 0));
});

test('metrics count blocks, redactions and overrides correctly', () => {
  const ev = (action, outcome, cats) => ({ t: NOW - 3600e3, adapter: 'chatgpt', action, outcome, categories: cats });
  const m = S.metrics([
    ev('block', 'cancelled', { secrets: 1 }),
    ev('block', 'override', { secrets: 2 }),
    ev('redact', 'redacted', { pii: 1 }),
    ev('warn', 'cancelled', { pii: 1 }),
    ev('block', 'redaction_failed', { secrets: 1 })
  ], 7, NOW);
  assert.strictEqual(m.total, 5);
  assert.strictEqual(m.blocked, 2);
  assert.strictEqual(m.overrides, 1);
  assert.strictEqual(m.redacted, 1);
  assert.strictEqual(m.failed, 1);
  assert.strictEqual(m.byCategory.secrets, 4);
  assert.strictEqual(m.perDay[6].total, 5);
});

test('health reports are sanitized', () => {
  const h = S.sanitizeHealth({ adapter: 'gemini', state: 'pwned', code: 'x', detail: 'a'.repeat(500) }, NOW);
  assert.strictEqual(h.state, 'error');
  assert.strictEqual(h.code, 'starting');
  assert.strictEqual(h.detail.length, 200);
});
