// Node-level check for Remove and send on a mixed multi-line contenteditable prompt.
// The extension resumes with the editor text read back after redaction (now), not
// the string it tried to write (safe). Contenteditable composers such as Claude's
// ProseMirror can change line breaks, so a bypass that still used `safe` would miss
// and the warning dialog would reopen after a redacted event was already logged.
// Run from the repo root:  node --test tests/content-redact.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content.js'), 'utf8');

test('Remove and send reads the editor back and resumes with that text, not the written string', () => {
  assert.match(src, /var now=textOf\(ed\)\.trim\(\)/);
  assert.match(src, /resume\(ed,now\)/);
  assert.doesNotMatch(src, /resume\(ed,\s*safe\)/);
});

// Mirrors attempt(): the send is allowed through only while the composer text
// still equals the bypass token stored after redaction.
function bypassAllows(editorText, token, until, now) {
  return now < until && editorText === token;
}

test('mixed multi-line contenteditable: resume with read-back text sends once; resume with safe re-triggers', () => {
  const safe = 'Review this deploy script:\n[REDACTED KEY]\nfunction main() {\n  return 1;\n}';
  // ProseMirror / contenteditable often turns a newline into a paragraph break,
  // so innerText (textOf) is not the same string we wrote.
  const now = safe.replace(/\n/g, '\n\n').trim();
  assert.notStrictEqual(now, safe.trim(), 'the fixture must reproduce a line-break mismatch');
  const until = 1_000;
  assert.ok(!bypassAllows(now, safe.trim(), until, 10), 'old resume(ed, safe) misses and would scan again');
  assert.ok(bypassAllows(now, now, until, 10), 'resume(ed, now) matches and the send goes through once');
});
