// The site's download button hands out dato-extension.zip. The first version of that
// file was really a tar archive with a .zip name, which Windows could not extract.
// Run from the repo root:  node --test tests/zip.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const zip = fs.readFileSync(path.join(root, 'dato-extension.zip'));

test('dato-extension.zip is a real ZIP file', () => {
  assert.strictEqual(zip.subarray(0, 4).toString('latin1'), 'PK\x03\x04');
});

test('it contains every extension file under an extension/ folder', () => {
  const expected = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (!entry.name.endsWith('.md')) expected.push(path.relative(root, full).split(path.sep).join('/'));
    }
  })(path.join(root, 'extension'));
  assert.ok(expected.includes('extension/manifest.json'));
  for (const name of expected) {
    assert.ok(zip.includes(Buffer.from(name)), name + ' is missing. Rebuild with: python tools/build-zip.py');
  }
});

test('file names inside use forward slashes', () => {
  assert.ok(!zip.includes(Buffer.from('extension' + String.fromCharCode(92))));
});
