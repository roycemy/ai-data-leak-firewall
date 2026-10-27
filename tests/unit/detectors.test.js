// Synthetic detector fixtures. Every value here is a public example or made up.
const test = require('node:test');
const assert = require('node:assert');
const D = require('../../extension/detectors.js');

const rules = (text) => D.scan(text).findings.map((f) => f.ruleId);

const SHOULD_CATCH = [
  ['AWS key', 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE', 'aws-access-key'],
  ['GitHub token', 'token ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'github-token'],
  ['OpenAI-style key', 'key sk-proj-abcdefghijklmnopqrstuvwx12', 'openai-key'],
  ['Private key block', '-----BEGIN RSA PRIVATE KEY-----\nMIIEow...', 'private-key-block'],
  ['Connection string', 'postgres://admin:s3cretpass@db.internal:5432/app', 'db-connection-string'],
  ['Visa test card', 'card 4111 1111 1111 1111 exp 12/29', 'credit-card'],
  ['SSN', 'SSN 123-45-6789', 'ssn'],
  ['Email', 'reach dana@example.com', 'email-address'],
  ['US phone', 'call (555) 123-4567 today', 'us-phone'],
  ['IBAN', 'IBAN GB82 WEST 1234 5698 7654 32', 'iban'],
  ['Named password', 'my password is hunter2', 'credential-named'],
  ['Named password, long word', 'the wifi password is correcthorsebattery', 'credential-named'],
  ['Hardcoded secret', 'api_key = "Zx9fake0secret0value"', 'hardcoded-password'],
  ['Confidential marker', 'This memo is CONFIDENTIAL. Please summarise it.', 'sensitive-context'],
  ['Base64 secret (as unknown token, warn only)', 'QUtJQUlPU0ZPRE5ON0VYQU1QTEU=', 'unknown-token'],
  ['Contract language','This NDA is governed by the governing law of Delaware and includes indemnification.', 'contract-language']
];

for (const [name, text, rule] of SHOULD_CATCH) {
  test(`catches: ${name}`, () => assert.ok(rules(text).includes(rule), `${rule} not in ${rules(text)}`));
}

const SHOULD_PASS = [
  ['General question', 'Can you explain how AWS IAM roles work?'],
  ['Password policy talk', 'The password is required to be at least 12 characters.'],
  ['Password reset talk', 'My password is expired, how do I reset it?'],
  ['Monday agenda', 'Our Monday agenda covers liability insurance and the standard onboarding.'],
  ['Unrestricted', 'Members get unrestricted access to the gym.'],
  ['Classified ads', 'Where can I post classified ads for my bike?'],
  ['UUID', 'request id 550e8400-e29b-41d4-a716-446655440000'],
  ['Date', 'The launch is on 2024-01-15 at 10:30.'],
  ['Version', 'Upgrade from 1.2.3 to 2.0.0-beta.4'],
  ['Short order number', 'Order 48213 arrived late.'],
  ['Pin in prose', 'Can you pin this message?']
];

for (const [name, text] of SHOULD_PASS) {
  test(`no finding: ${name}`, () => assert.deepStrictEqual(rules(text), []));
}

// Known gaps, kept visible on purpose. These run and are reported as TODO, not failures.
const KNOWN_MISSES = [
  ['SSN without dashes', 'ssn 123456789'],
  ['Key split across lines', 'AKIAIOSFOD\nNN7EXAMPLE'],
  ['UK phone number', 'ring me on +44 20 7946 0958'],
  ['A name alone', 'Write a review of Jordan Avery from accounts']
];

for (const [name, text] of KNOWN_MISSES) {
  test(`known miss: ${name}`, { todo: 'not detected yet' }, () => assert.ok(rules(text).length > 0));
}

test('known false positive: revenue small talk warns', { todo: 'financial-figures has no context check' }, () => {
  assert.deepStrictEqual(rules('What revenue would a lemonade stand make, like $50?'), []);
});

test('masked values never include the full secret', () => {
  const f = D.scan('AKIAIOSFODNN7EXAMPLE').findings[0];
  assert.ok(!f.masked.includes('AKIAIOSFODNN7EXAMPLE'));
});
