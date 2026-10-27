// Tests for extension/store.js: what a flag event may contain, retention, and the
// dashboard numbers. Run from the repo root:  node --test tests/store.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const S = require('../extension/store.js');

const NOW = new Date('2026-10-27T12:00:00').getTime();
const FAKE_KEY = 'AKIA' + 'IOSFODNN7EXAMPLE';

test('an event keeps only allowed fields, and never text or values', () => {
  const e = S.sanitizeEvent({
    site: 'claude', action: 'block', outcome: 'override', trigger: 'enter', severity: 'critical',
    categories: { secrets: 2, evil: 5 }, rules: { 'aws-access-key': 1, ['bad rule ' + FAKE_KEY]: 1 },
    text: FAKE_KEY, masked: 'AKIA••••MPLE', prompt: 'hello'
  }, NOW, 'id1');
  assert.deepStrictEqual(Object.keys(e).sort(), ['action', 'categories', 'id', 'outcome', 'rules', 'severity', 'site', 't', 'trigger']);
  assert.deepStrictEqual(e.categories, { secrets: 2 });
  assert.deepStrictEqual(e.rules, { 'aws-access-key': 1 });
  assert.ok(!JSON.stringify(e).includes('AKIA'));
});

test('unknown values are replaced, not stored', () => {
  const e = S.sanitizeEvent({ site: 'evil.com', action: 'nuke', outcome: '<script>', severity: 'huge' }, NOW, 'x');
  assert.strictEqual(e.site, 'chatgpt');
  assert.strictEqual(e.action, 'warn');
  assert.strictEqual(e.outcome, 'cancelled');
  assert.strictEqual(e.severity, 'low');
});

test('prune drops flags older than the retention window and caps the count', () => {
  const old = { t: NOW - 31 * S.DAY }, recent = { t: NOW - S.DAY };
  assert.deepStrictEqual(S.prune([old, recent], 30, NOW), [recent]);
  const many = Array.from({ length: S.MAX_EVENTS + 10 }, (_, i) => ({ t: NOW - 1000 + i / 100 }));
  assert.strictEqual(S.prune(many, 30, NOW).length, S.MAX_EVENTS);
});

test('retention only accepts 7, 30 or 90 days', () => {
  assert.strictEqual(S.cleanRetention(7), 7);
  assert.strictEqual(S.cleanRetention(3650), 30);
  assert.strictEqual(S.cleanRetention('x'), 30);
});

test('no events gives all zeros, not made-up numbers', () => {
  const m = S.metrics([], 7, NOW);
  assert.strictEqual(m.flagged, 0);
  assert.strictEqual(m.perDay.length, 7);
  assert.ok(m.perDay.every((d) => d.total === 0));
  assert.ok(Object.values(m.byCategory).every((v) => v === 0));
});

test('metrics split flags into stopped, sent through, redacted and high severity', () => {
  const ev = (outcome, severity, cats) => ({ t: NOW - 3600e3, site: 'chatgpt', action: 'warn', outcome, severity, categories: cats });
  const m = S.metrics([
    ev('cancelled', 'critical', { secrets: 1 }),
    ev('cancelled', 'medium', { pii: 1 }),
    ev('override', 'high', { secrets: 2 }),
    ev('redacted', 'critical', { pii: 1 }),
    ev('allowed', 'low', { sensitive: 1 })
  ], 7, NOW);
  assert.strictEqual(m.flagged, 5);
  assert.strictEqual(m.stopped, 2);
  assert.strictEqual(m.sentThrough, 2); // the override and the policy-allowed one
  assert.strictEqual(m.redacted, 1);
  assert.strictEqual(m.high, 3);
  assert.strictEqual(m.byCategory.secrets, 3);
  assert.strictEqual(m.perDay[6].total, 5);
});

test('flags outside the chosen range are not counted', () => {
  const m = S.metrics([{ t: NOW - 20 * S.DAY, site: 'claude', outcome: 'cancelled', severity: 'high', categories: {} }], 7, NOW);
  assert.strictEqual(m.flagged, 0);
});

test('the extension code makes no network requests', () => {
  const dir = path.join(__dirname, '../extension');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const api of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /new WebSocket/]) assert.ok(!api.test(src), f + ' uses ' + api);
  }
});
