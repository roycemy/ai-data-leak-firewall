// Tests for dashboard.js: the numbers, words and chart behind the Dashboard and Audit log.
// Run from the repo root:  node --test tests/dashboard.test.js
const test = require('node:test');
const assert = require('node:assert');
const DB = require('../dashboard.js');

const CATS = { secrets: { label: 'Secrets & Credentials' }, pii: { label: 'Personal Data (PII)' } };
const KEYS = Object.keys(CATS);
const NOW = new Date(2026, 10, 16, 12, 0, 0).getTime();
const DAY = 86400000;

function scan(action, byCategory, extra) {
  const total = Object.values(byCategory).reduce((s, n) => s + n, 0);
  return Object.assign({ ts: NOW, source: 'prompt', action, total, byCategory, topSeverity: total ? 'high' : 'low' }, extra);
}
const EVENTS = [
  scan('allowed-clean', { secrets: 0, pii: 0 }, { ts: NOW - 2 * DAY }),
  scan('warn', { secrets: 0, pii: 2 }, { topSeverity: 'medium' }),
  scan('block', { secrets: 1, pii: 0 }, { topSeverity: 'critical', breachChecked: 1, breached: 1 }),
  scan('block', { secrets: 1, pii: 0 }, { topSeverity: 'critical', breachChecked: 1, breached: 1 }),
  { ts: NOW, source: 'simulated-send', action: 'sent-send', total: 0, byCategory: {}, topSeverity: 'low' },
  { ts: NOW, source: 'policy-change', action: 'policy:secrets=allow', total: 0, byCategory: {}, topSeverity: 'low' }
];

test('summarize counts inspections only (not sends or policy changes)', () => {
  const s = DB.summarize(EVENTS, KEYS);
  assert.strictEqual(s.inspections, 4);
  assert.strictEqual(s.flagged, 3);
  assert.strictEqual(s.findings, 4);
  assert.deepStrictEqual([s.blocked, s.warned, s.redacted, s.clean], [2, 1, 0, 1]);
  assert.deepStrictEqual(s.byCategory, { secrets: 2, pii: 2 });
  assert.deepStrictEqual(s.bySeverity, { critical: 2, high: 0, medium: 1, low: 0 });
});

test('summarize counts inspections with a breached password, not a sum of passwords', () => {
  assert.strictEqual(DB.summarize(EVENTS, KEYS).breachedInspections, 2);
});

test('summarize of an empty log is all zeros', () => {
  const s = DB.summarize([], KEYS);
  assert.deepStrictEqual([s.inspections, s.flagged, s.blocked, s.breachedInspections], [0, 0, 0, 0]);
});

test('dailyTrend puts each inspection on its day, oldest first', () => {
  const days = DB.dailyTrend(EVENTS, 14, NOW);
  assert.strictEqual(days.length, 14);
  assert.deepStrictEqual([days[13].inspections, days[13].flagged], [3, 3]); // today
  assert.deepStrictEqual([days[11].inspections, days[11].flagged], [1, 0]); // two days ago
  assert.strictEqual(days.slice(0, 11).reduce((s, d) => s + d.inspections, 0), 0);
});

test('trendChart draws one pair of bars per day with a text alternative', () => {
  const html = DB.trendChart(DB.dailyTrend(EVENTS, 14, NOW));
  assert.strictEqual((html.match(/class="bar-all"/g) || []).length, 14);
  assert.strictEqual((html.match(/class="bar-flag"/g) || []).length, 14);
  assert.match(html, /role="img" aria-label="4 inspections and 3 flagged in the last 14 days"/);
});

test('describe turns events into plain words', () => {
  assert.deepStrictEqual(DB.describe(EVENTS[2], CATS),
    { outcome: 'Blocked', outcomeCls: 'badge-critical', title: '1 finding: Secrets & Credentials', source: 'Prompt' });
  assert.strictEqual(DB.describe(EVENTS[0], CATS).title, 'No sensitive data');
  assert.strictEqual(DB.describe(EVENTS[5], CATS).title, 'Secrets & Credentials set to Allow');
  assert.strictEqual(DB.describe(EVENTS[4], CATS).outcome, 'Sent');
});

test('breachText covers off, no password, not found, found and failed', () => {
  assert.strictEqual(DB.breachText({}), '');
  assert.strictEqual(DB.breachText({ breachRan: true, breachChecked: 0 }), 'No password to check');
  assert.strictEqual(DB.breachText({ breachChecked: 1, breached: 0 }), 'Not found in breaches (1 password)');
  assert.strictEqual(DB.breachText({ breachChecked: 2, breached: 1 }), '1 of 2 passwords found in breaches');
  assert.strictEqual(DB.breachText({ breachError: true }), 'Breach check failed');
});

test('timeAgo is short and readable', () => {
  assert.strictEqual(DB.timeAgo(NOW - 5000, NOW), 'just now');
  assert.strictEqual(DB.timeAgo(NOW - 5 * 60000, NOW), '5 min ago');
  assert.strictEqual(DB.timeAgo(NOW - 3 * 3600000, NOW), '3 h ago');
  assert.strictEqual(DB.timeAgo(NOW - 1 * DAY, NOW), 'Yesterday');
  assert.strictEqual(DB.timeAgo(NOW - 2 * DAY, NOW), '2 days ago');
});

test('activeDays counts days with at least one inspection (the dashboard shows 7 days when it is under 3)', () => {
  assert.strictEqual(DB.activeDays(DB.dailyTrend(EVENTS, 14, NOW)), 2);
  assert.strictEqual(DB.activeDays(DB.dailyTrend([], 14, NOW)), 0);
});

test('trendChart labels the y axis with whole numbers and a 0 baseline', () => {
  const html = DB.trendChart(DB.dailyTrend(EVENTS, 14, NOW)); // 3 on the busiest day -> top 4, middle 2
  assert.deepStrictEqual([...html.matchAll(/class="tick"[^>]*>(\d+)</g)].map(m => m[1]), ['4', '2', '0']);
});

test('status: a breached password comes first; otherwise "Working" with blocks in the last 14 days', () => {
  assert.deepStrictEqual(DB.status(EVENTS, NOW),
    { kind: 'critical', text: '◆ 2 prompts had passwords found in known breaches. Change those passwords.' });
  const noBreach = EVENTS.map(e => Object.assign({}, e, { breached: 0 }));
  assert.deepStrictEqual(DB.status(noBreach, NOW), { kind: 'ok', text: '✓ Working. 2 risky prompts blocked in the last 14 days.' });
  const old = noBreach.map(e => Object.assign({}, e, { ts: NOW - 20 * DAY }));
  assert.strictEqual(DB.status(old, NOW).text, '✓ Working. No prompts checked in the last 14 days.');
});

test('hero: install CTA when the extension is not connected; Working when it is', () => {
  assert.deepStrictEqual(DB.hero({ connected: false, stopsToday: 3, stopsWeek: 3 }),
    { kind: 'install', text: 'Install the extension to start protecting your AI chats' });
  assert.deepStrictEqual(DB.hero({ connected: true, stopsToday: 2, stopsWeek: 2 }),
    { kind: 'ok', text: 'Working. 2 risky prompts stopped today' });
  assert.deepStrictEqual(DB.hero({ connected: true, stopsToday: 1, stopsWeek: 1 }),
    { kind: 'ok', text: 'Working. 1 risky prompt stopped today' });
  assert.deepStrictEqual(DB.hero({ connected: true, stopsToday: 0, stopsWeek: 4 }),
    { kind: 'ok', text: 'Working. 4 risky prompts stopped this week' });
  assert.deepStrictEqual(DB.hero({ connected: true, stopsToday: 0, stopsWeek: 0 }),
    { kind: 'ok', text: 'Working. Nothing risky yet' });
});

test('passwordAlert is a red line only when a breached password was found', () => {
  assert.strictEqual(DB.passwordAlert([]), null);
  assert.strictEqual(DB.passwordAlert(EVENTS.map(e => Object.assign({}, e, { breached: 0 }))), null);
  assert.deepStrictEqual(DB.passwordAlert(EVENTS),
    { kind: 'critical', text: '◆ 2 prompts had passwords found in known breaches. Change those passwords.' });
});

test('stops counts website blocks and extension "stopped" outcomes together', () => {
  const ext = [
    { label: 'AWS access key', outcome: 'stopped', site: 'chatgpt.com', time: NOW },
    { label: 'Email address', outcome: 'sent anyway', site: 'claude.ai', time: NOW }
  ];
  assert.strictEqual(DB.stops(EVENTS, ext, NOW - DAY, NOW + 1), 3); // 2 website blocks + 1 extension stop
  assert.strictEqual(DB.sentAnyway(EVENTS, { byOutcome: { override: 2, allowed: 1 } }), 1 + 3);
});

test('mergeCatches is newest first, capped, and uses labels not prompt text', () => {
  const ext = [{ label: 'AWS access key', outcome: 'stopped', site: 'chatgpt.com', time: NOW + 1000 }];
  const rows = DB.mergeCatches(EVENTS, ext, CATS, 8);
  assert.strictEqual(rows[0].label, 'AWS access key');
  assert.strictEqual(rows[0].site, 'chatgpt.com');
  assert.ok(rows.every(r => !('prompt' in r) && !('value' in r)));
  assert.ok(rows.length <= 8);
});
