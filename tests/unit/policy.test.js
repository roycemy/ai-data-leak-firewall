const test = require('node:test');
const assert = require('node:assert');
const D = require('../../extension/detectors.js');
const P = require('../../extension/policy.js');

const decide = (text, pol, set) => P.decide(D.scan(text).findings, Object.assign({}, P.DEFAULT_POLICIES, pol), set);
const KEY = 'AKIAIOSFODNN7EXAMPLE', EMAIL = 'dana@example.com';

test('clean text is allowed', () => assert.strictEqual(decide('hello there').action, 'allow'));

test('each policy action is applied', () => {
  for (const a of P.ACTIONS) assert.strictEqual(decide('key ' + KEY, { secrets: a }).action, a);
});

test('strictest action wins across categories', () => {
  const text = `key ${KEY} email ${EMAIL}`;
  assert.strictEqual(decide(text, { secrets: 'warn', pii: 'block' }).action, 'block');
  assert.strictEqual(decide(text, { secrets: 'redact', pii: 'warn' }).action, 'redact');
  assert.strictEqual(decide(text, { secrets: 'allow', pii: 'allow' }).action, 'allow');
});

test('tentative findings never exceed warn', () => {
  assert.strictEqual(decide('my password is hunter2', { secrets: 'block' }).action, 'warn');
});

test('redact on a whole-prompt heuristic escalates to block', () => {
  const d = decide('This memo is CONFIDENTIAL. Please summarise.', { sensitive: 'redact' });
  // sensitive-context is tentative, so it is capped at warn before redaction is considered.
  assert.strictEqual(d.action, 'warn');
  const code = 'import x from "y";\nconst a = 1;\nfunction f() {\n  if (a) { console.log(a); }\n}\nexport default f;';
  const c = decide(code, { source: 'redact' });
  assert.strictEqual(c.action, 'block');
  assert.strictEqual(c.canRedact, false);
});

test('override is offered for warn and block, not redact, and never in strict mode', () => {
  assert.strictEqual(decide('key ' + KEY).overrideAllowed, true);
  assert.strictEqual(decide('mail ' + EMAIL).overrideAllowed, true);
  assert.strictEqual(decide('key ' + KEY, { secrets: 'redact' }).overrideAllowed, false);
  assert.strictEqual(decide('key ' + KEY, {}, { strict: true }).overrideAllowed, false);
  assert.strictEqual(decide('mail ' + EMAIL, {}, { strict: true }).overrideAllowed, false);
});

test('redaction removes every flagged value and holds on rescan', () => {
  const text = `deploy with ${KEY} and mail ${EMAIL}, card 4111 1111 1111 1111`;
  const d = decide(text, { secrets: 'redact', pii: 'redact' });
  const out = P.redactText(text, d);
  assert.ok(!out.includes(KEY) && !out.includes(EMAIL) && !out.includes('4111'));
  assert.ok(out.startsWith('deploy with [REDACTED:'));
  assert.ok(P.redactionHolds(out, D.scan, Object.assign({}, P.DEFAULT_POLICIES, { secrets: 'redact', pii: 'redact' })).ok);
});

test('allowed categories are left alone by redaction', () => {
  const text = `key ${KEY} mail ${EMAIL}`;
  const d = decide(text, { secrets: 'redact', pii: 'allow' });
  const out = P.redactText(text, d);
  assert.ok(out.includes(EMAIL) && !out.includes(KEY));
});

test('overlapping spans merge so no fragment survives', () => {
  const d = { items: [
    { effective: 'redact', finding: { index: 0, length: 10, label: 'a' } },
    { effective: 'redact', finding: { index: 5, length: 10, label: 'b' } }
  ] };
  assert.strictEqual(P.redactText('0123456789ABCDEFxyz', d), '[REDACTED: A]Fxyz');
});

test('summary holds counts only, never text', () => {
  const text = `key ${KEY} mail ${EMAIL}`;
  const s = P.summarize(decide(text));
  const json = JSON.stringify(s);
  assert.ok(!json.includes(KEY) && !json.includes('AKIA') && !json.includes('dana'));
  assert.deepStrictEqual(s.categories, { secrets: 1, pii: 1 });
});

test('unknown stored policy values fall back to defaults', () => {
  assert.deepStrictEqual(P.cleanPolicies({ secrets: 'explode' }), P.DEFAULT_POLICIES);
  assert.deepStrictEqual(P.cleanSettings({ strict: 'yes', retentionDays: 3 }), P.DEFAULT_SETTINGS);
});
