// Static checks on the shipped extension: no network APIs, no remote code,
// minimal permissions.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const EXT = path.join(__dirname, '../../extension');
const js = fs.readdirSync(EXT).filter((f) => f.endsWith('.js'));
const html = fs.readdirSync(EXT).filter((f) => f.endsWith('.html'));

test('extension code has no network APIs', () => {
  for (const f of js) {
    const src = fs.readFileSync(path.join(EXT, f), 'utf8');
    for (const api of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /new WebSocket/, /EventSource/, /importScripts\(\s*['"]https?:/]) {
      assert.ok(!api.test(src), `${f} uses ${api}`);
    }
  }
});

test('extension pages load no remote scripts or styles', () => {
  for (const f of html) {
    const src = fs.readFileSync(path.join(EXT, f), 'utf8');
    assert.ok(!/(src|href)=["']https?:/.test(src.replace(/href="https:\/\/github\.com[^"]*"/g, '')), `${f} loads a remote resource`);
  }
});

test('manifest asks only for storage and the supported chat hosts', () => {
  const m = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  assert.deepStrictEqual(m.permissions, ['storage']);
  for (const h of m.host_permissions) assert.match(h, /^https:\/\/(chatgpt\.com|chat\.openai\.com|claude\.ai|gemini\.google\.com)\/\*$/);
  assert.deepStrictEqual(m.content_scripts[0].matches, m.host_permissions);
});
