// Tests for breach-check.js (Mini Project 3), using Node's built-in runner.
// Run from the repo root:  node --test tests/breach-check.test.js
// No network: fetch is replaced with a fake so the tests are quick and repeatable.
// Password-looking values are built from pieces at run time (see AGENTS.md).
const test = require('node:test');
const assert = require('node:assert');
const D = require('../detectors.js');
const B = require('../breach-check.js');

// SHA-1 of the word "password" (a well-known value from the HIBP docs).
const PASSWORD_HASH = '5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8';
const WORD = 'pass' + 'word';
const FAKE_PW = 'Tr0ub4' + 'dor-x9';

test('sha1Hex gives the 40-character upper-case hash', async () => {
  assert.strictEqual(await B.sha1Hex(WORD), PASSWORD_HASH);
});

test('countForSuffix finds the matching line and reads its count', () => {
  const body = '0018A45C4D1DEF81644B54AB7F969B88D65:10\r\n' +
               PASSWORD_HASH.slice(5) + ':52373976\r\n' +
               '011053FD0102E94D6AE2F8B83D76FAF94F6:0';
  assert.strictEqual(B.countForSuffix(body, PASSWORD_HASH.slice(5)), 52373976);
});

test('countForSuffix returns 0 when the suffix is not listed', () => {
  assert.strictEqual(B.countForSuffix('ABC:5\nDEF:7', PASSWORD_HASH.slice(5)), 0);
  assert.strictEqual(B.countForSuffix('', PASSWORD_HASH.slice(5)), 0);
});

test('passwordsFrom pulls the password out of a "my password is ..." finding', () => {
  const text = 'Help me log in, my ' + WORD + ' is ' + FAKE_PW + '.';
  const found = B.passwordsFrom(text, D.scan(text).findings);
  assert.deepStrictEqual(found.map((f) => f.password), [FAKE_PW]);
});

test('passwordsFrom reads a quoted assignment and ignores other secrets', () => {
  const text = 'db_' + WORD + ' = "' + FAKE_PW + '"\napi_key = "' + 'abcd' + 'efgh1234' + '"';
  const found = B.passwordsFrom(text, D.scan(text).findings);
  assert.deepStrictEqual(found.map((f) => f.password), [FAKE_PW]);
});

test('passwordsFrom finds nothing in a harmless prompt', () => {
  const text = 'My ' + WORD + ' is not working on the school portal.';
  assert.deepStrictEqual(B.passwordsFrom(text, D.scan(text).findings), []);
});

// ---- checkPassword with a fake fetch ----
function withFetch(fake, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = fake;
  return fn().finally(() => { globalThis.fetch = real; });
}

test('checkPassword sends only the 5-character prefix and returns the count', () =>
  withFetch(async (url) => {
    // The URL ends in the 5-character prefix and nothing else: no password, no full hash.
    assert.strictEqual(url, B.RANGE_URL + PASSWORD_HASH.slice(0, 5));
    return { ok: true, status: 200, text: async () => PASSWORD_HASH.slice(5) + ':42\n' };
  }, async () => {
    assert.deepStrictEqual(await B.checkPassword(WORD), { ok: true, count: 42 });
  }));

test('checkPassword treats a non-OK status as an error, not a result', () =>
  withFetch(async () => ({ ok: false, status: 503, text: async () => '' }), async () => {
    const r = await B.checkPassword(WORD);
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /503/);
  }));

test('checkPassword turns a network failure into an error instead of throwing', () =>
  withFetch(async () => { throw new TypeError('Failed to fetch'); }, async () => {
    const r = await B.checkPassword(WORD);
    assert.strictEqual(r.ok, false);
  }));

test('checkAll works out how many passwords were breached', () =>
  withFetch(async (url) => ({
    ok: true, status: 200,
    // Pretend only the hash of "password" is in the breach list.
    text: async () => (url.endsWith(PASSWORD_HASH.slice(0, 5)) ? PASSWORD_HASH.slice(5) + ':7' : '')
  }), async () => {
    const r = await B.checkAll([{ findingIndex: 0, password: WORD }, { findingIndex: 3, password: FAKE_PW }]);
    assert.deepStrictEqual(r, { checked: 2, breached: 1, error: null,
      results: [{ findingIndex: 0, count: 7 }, { findingIndex: 3, count: 0 }] });
  }));
