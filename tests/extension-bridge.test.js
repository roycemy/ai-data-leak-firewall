// Tests for the extension -> website Dashboard bridge: extension/bridge.js (what the
// extension posts) and extension-link.js (what the website accepts and shows).
// Run from the repo root:  node --test tests/extension-bridge.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Bridge = require('../extension/bridge.js');
const Link = require('../extension-link.js');
const Store = require('../extension/store.js');

const NOW = new Date(2026, 10, 17, 12, 0, 0).getTime();
const SECRET = 'AKIA' + 'IOSFODNN7EXAMPLE';
function ev(i, over) {
  return Store.sanitizeEvent(Object.assign({ site: 'chatgpt', action: 'block', outcome: 'cancelled', trigger: 'enter', severity: 'critical', categories: { secrets: 1 }, rules: { 'aws-access-key': 1 } }, over), NOW - i * 1000, 'id' + i);
}
// Royce's case: five flagged prompts in the extension.
const EVENTS = [
  ev(0), ev(1, { outcome: 'override' }),
  ev(2, { action: 'warn', severity: 'medium', categories: { pii: 2 }, rules: { email: 2 }, site: 'claude' }),
  ev(3, { action: 'warn', severity: 'medium', outcome: 'override', categories: { pii: 1, financial: 1 } }),
  ev(4, { action: 'redact', outcome: 'redacted', severity: 'high', site: 'gemini' })
];

test('both sides agree on the message type, request type and version', () => {
  assert.strictEqual(Bridge.MESSAGE_TYPE, Link.MESSAGE_TYPE);
  assert.strictEqual(Bridge.REQUEST_TYPE, Link.REQUEST_TYPE);
  assert.strictEqual(Bridge.VERSION, Link.VERSION);
  assert.strictEqual(Bridge.SITE_ORIGIN, 'https://roycemy.github.io');
});

test('summarize counts five flags by action, outcome, site, severity and data type', () => {
  const s = Bridge.summarize(EVENTS);
  assert.strictEqual(s.total, 5);
  assert.strictEqual(s.high, 3);
  assert.deepStrictEqual(s.byAction, { allow: 0, warn: 2, redact: 1, block: 2 });
  assert.deepStrictEqual(s.byOutcome, { allowed: 0, cancelled: 2, override: 2, redacted: 1 });
  assert.deepStrictEqual(s.bySite, { chatgpt: 3, claude: 1, gemini: 1 });
  assert.deepStrictEqual(s.byCategory, { secrets: 3, pii: 3, financial: 1, source: 0, contract: 0, sensitive: 0 });
  assert.strictEqual(s.lastAt, NOW);
});

test('summarize of nothing is zeros, not an error', () => {
  for (const input of [undefined, null, [], 'x', [null, 7]]) {
    const s = Bridge.summarize(input);
    assert.strictEqual(s.total, 0);
    assert.strictEqual(s.lastAt, null);
  }
});

test('the posted message carries counts and labels only, never text, rules or ids', () => {
  const dirty = EVENTS.concat([Object.assign({}, ev(5), { prompt: 'deploy ' + SECRET, masked: 'AKIA••••MPLE', match: SECRET })]);
  const json = JSON.stringify(Bridge.message(dirty));
  assert.ok(!json.includes(SECRET));
  assert.ok(!json.includes('AKIA'));
  assert.ok(!json.includes('deploy'));
  assert.ok(!json.includes('aws-access-key'), 'rule ids are not sent');
  assert.ok(!/"id\d/.test(json), 'event ids are not sent');
  assert.deepStrictEqual(Object.keys(Bridge.message([]).summary).sort(),
    ['byAction', 'byCategory', 'byOutcome', 'bySeverity', 'bySite', 'high', 'lastAt', 'total']);
});

test('validate accepts exactly what the bridge posts', () => {
  const msg = Bridge.message(EVENTS);
  assert.deepStrictEqual(Link.validate(msg), msg.summary);
  assert.deepStrictEqual(Link.validate(JSON.parse(JSON.stringify(Bridge.message([])))).total, 0);
});

test('validate rejects the wrong type, version or shape', () => {
  const good = Bridge.message(EVENTS);
  const bad = [
    null, 'x', [], {}, { type: Link.REQUEST_TYPE }, Object.assign({}, good, { type: 'other' }),
    Object.assign({}, good, { v: 2 }), Object.assign({}, good, { summary: null }),
    Object.assign({}, good, { summary: Object.assign({}, good.summary, { total: -1 }) }),
    Object.assign({}, good, { summary: Object.assign({}, good.summary, { total: 1.5 }) }),
    Object.assign({}, good, { summary: Object.assign({}, good.summary, { total: '5' }) }),
    Object.assign({}, good, { summary: Object.assign({}, good.summary, { high: 99 }) }),
    Object.assign({}, good, { summary: Object.assign({}, good.summary, { lastAt: 'today' }) }),
    Object.assign({}, good, { summary: Object.assign({}, good.summary, { byAction: null }) }),
    Object.assign({}, good, { summary: Object.assign({}, good.summary, { bySite: { chatgpt: '<img>' } }) })
  ];
  bad.forEach((m, i) => assert.strictEqual(Link.validate(m), null, 'case ' + i));
});

test('validate drops anything outside the allowlist, so it never reaches the page', () => {
  const m = JSON.parse(JSON.stringify(Bridge.message(EVENTS)));
  m.summary.prompt = SECRET;
  m.summary.bySite['<script>'] = 3;
  m.summary.byCategory.secrets = 3;
  const s = Link.validate(m);
  assert.ok(!JSON.stringify(s).includes(SECRET));
  assert.ok(!JSON.stringify(s).includes('script'));
});

test('isFromExtension needs the same window and the same origin', () => {
  const win = { location: { origin: 'https://roycemy.github.io' } };
  assert.ok(Link.isFromExtension({ source: win, origin: 'https://roycemy.github.io' }, win));
  assert.ok(!Link.isFromExtension({ source: {}, origin: 'https://roycemy.github.io' }, win), 'another window (iframe, opener)');
  assert.ok(!Link.isFromExtension({ source: win, origin: 'https://evil.example' }, win));
  assert.ok(!Link.isFromExtension(null, win));
});

test('stat captions say how many came from the extension', () => {
  assert.strictEqual(Link.statCaption('Stopped before sending', 0), 'Stopped before sending');
  assert.strictEqual(Link.statCaption('Stopped before sending', 2), 'Stopped before sending · 2 from extension');
});

test('the card: no extension, connected with nothing, and five flags', () => {
  assert.match(Link.cardHTML(null, ''), /View flagged activity/);
  assert.match(Link.cardHTML(Bridge.summarize([]), ''), /Nothing flagged/);
  const html = Link.cardHTML(Link.validate(Bridge.message(EVENTS)), 'just now');
  assert.match(html, /Flagged prompts<\/span><span class="num">5</);
  assert.match(html, /Blocked by policy<\/span><span class="num">2</);
  assert.match(html, /Stopped, not sent<\/span><span class="num">2</);
  assert.match(html, /Sent anyway<\/span><span class="num">2</);
  assert.match(html, /Redacted, then sent<\/span><span class="num">1</);
  assert.match(html, /ChatGPT 3 · Claude 1 · Gemini 1/);
  assert.match(html, /prompt text never leaves the extension/);
});

test('the bridge runs only on the AI Firewall site', () => {
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, '../extension/manifest.json'), 'utf8'));
  const cs = m.content_scripts.find((c) => c.js.includes('bridge.js'));
  assert.deepStrictEqual(cs.matches, ['https://roycemy.github.io/ai-data-leak-firewall/*']);
  assert.deepStrictEqual(cs.js, ['bridge.js']);
  assert.ok(!m.content_scripts.some((c) => c !== cs && c.js.includes('bridge.js')));
  const src = fs.readFileSync(path.join(__dirname, '../extension/bridge.js'), 'utf8');
  assert.ok(!/postMessage\([^)]*['"]\*['"]/.test(src), 'never posts to "*"');
  assert.ok(/postMessage\(message\([^)]*\), SITE_ORIGIN\)/.test(src), 'posts to the exact site origin');
});

test('Inspections card is this website only: the bridge has no inspection count, only flagged totals', () => {
  const keys = Object.keys(Bridge.message([]).summary);
  assert.ok(!keys.includes('inspections') && !keys.includes('scans'));
  assert.ok(keys.includes('total'));
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /<p class="caption">Inspections on this website<\/p>/);
  assert.doesNotMatch(html, /<p class="caption">Inspections<\/p>/);
});
