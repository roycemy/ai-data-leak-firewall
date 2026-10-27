// Tests for detectors.js, using Node's built-in test runner (no installs).
// Run from the repo root:  node --test tests/detectors.test.js
// Every value below is a made-up example, not a real credential.
const test = require('node:test');
const assert = require('node:assert');
const D = require('../detectors.js');

const ruleIds = (text) => D.scan(text).findings.map((f) => f.ruleId);

// ---- Things Dato must catch ----
test('catches an AWS access key', () => {
  assert.ok(ruleIds('AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE').includes('aws-access-key'));
});

test('catches a card number that passes the Luhn check', () => {
  assert.ok(ruleIds('card 4111 1111 1111 1111').includes('credit-card'));
});

test('ignores a 16-digit number that fails the Luhn check', () => {
  assert.ok(!ruleIds('order number 4111 1111 1111 1112').includes('credit-card'));
});

test('catches an email address and an SSN', () => {
  const ids = ruleIds('Contact dana@example.com, SSN 123-45-6789');
  assert.ok(ids.includes('email-address'));
  assert.ok(ids.includes('ssn'));
});

test('catches a credential stated in plain words', () => {
  assert.ok(ruleIds('my password is hunter2').includes('credential-named'));
  assert.ok(ruleIds('PIN: 4821').includes('credential-named'));
});

test('catches real contract language', () => {
  const text = 'This NDA is governed by the governing law of Delaware and includes indemnification.';
  assert.ok(ruleIds(text).includes('contract-language'));
});

// ---- Things Dato must leave alone (false positives found while testing) ----
test('"Monday agenda" is not contract language', () => {
  // The old check looked for "nda" anywhere in the text, so it matched Mon-DA-y and a-GENDA.
  // It flags a sentence once two legal-sounding terms appear ("nda" plus "liability").
  assert.deepStrictEqual(ruleIds('Our Monday agenda covers liability insurance and the onboarding plan.'), []);
});

test('"the password is required" is not a leaked password', () => {
  assert.deepStrictEqual(ruleIds('The password is required to be at least 12 characters.'), []);
  assert.deepStrictEqual(ruleIds('My password is expired, how do I reset it?'), []);
});

test('ordinary questions produce no findings', () => {
  assert.deepStrictEqual(ruleIds('Can you explain how AWS IAM roles work?'), []);
  assert.deepStrictEqual(ruleIds('Hello, lunch at noon?'), []);
});

// ---- Masking and redaction ----
test('masked values never contain the full secret', () => {
  const finding = D.scan('AKIAIOSFODNN7EXAMPLE').findings[0];
  assert.ok(!finding.masked.includes('AKIAIOSFODNN7EXAMPLE'));
});

test('redact removes every flagged value and keeps the rest of the text', () => {
  const text = 'Deploy with AKIAIOSFODNN7EXAMPLE and email dana@example.com tonight.';
  const redacted = D.redact(text, D.scan(text).findings);
  assert.ok(!redacted.includes('AKIAIOSFODNN7EXAMPLE'));
  assert.ok(!redacted.includes('dana@example.com'));
  assert.ok(redacted.includes('Deploy with'));
  assert.ok(redacted.includes('tonight.'));
});

// ---- Known gap, written down on purpose ----
test('known gap: an SSN without dashes is not detected yet', { todo: 'only the 123-45-6789 form is matched' }, () => {
  assert.ok(ruleIds('ssn 123456789').length > 0);
});
