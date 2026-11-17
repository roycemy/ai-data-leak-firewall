// The site's download button hands out ai-firewall-extension.zip.
// manifest.json must sit at the zip root so Edge/Chrome "Load unpacked"
// works on the extracted folder. Run from the repo root:  node --test tests/zip.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const zipPath = path.join(root, 'ai-firewall-extension.zip');
assert.ok(fs.existsSync(zipPath), 'ai-firewall-extension.zip is missing. Rebuild with: python tools/build-zip.py');
assert.ok(!fs.existsSync(path.join(root, 'dato-extension.zip')), 'old dato-extension.zip should be removed');

const zip = fs.readFileSync(zipPath);

function zipEntryNames() {
  // Avoid adding a dependency: parse local-file headers for stored paths.
  const names = [];
  let i = 0;
  while (i + 30 < zip.length) {
    if (zip[i] === 0x50 && zip[i + 1] === 0x4b && zip[i + 2] === 0x03 && zip[i + 3] === 0x04) {
      const nameLen = zip.readUInt16LE(i + 26);
      const extraLen = zip.readUInt16LE(i + 28);
      const compSize = zip.readUInt32LE(i + 18);
      const name = zip.subarray(i + 30, i + 30 + nameLen).toString('utf8');
      names.push(name);
      i = i + 30 + nameLen + extraLen + compSize;
      continue;
    }
    if (zip[i] === 0x50 && zip[i + 1] === 0x4b && zip[i + 2] === 0x01 && zip[i + 3] === 0x02) break;
    i += 1;
  }
  return names;
}

test('ai-firewall-extension.zip is a real ZIP file', () => {
  assert.strictEqual(zip.subarray(0, 4).toString('latin1'), 'PK\x03\x04');
});

test('manifest.json is at the zip root, not inside an extension/ folder', () => {
  const names = zipEntryNames();
  assert.ok(names.includes('manifest.json'), 'manifest.json missing at zip root. Rebuild with: python tools/build-zip.py');
  assert.ok(!names.some((n) => n === 'extension/manifest.json' || n.startsWith('extension/')), names.join(', '));
});

test('it contains every extension file at the zip root', () => {
  const expected = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (!entry.name.endsWith('.md')) expected.push(path.relative(path.join(root, 'extension'), full).split(path.sep).join('/'));
    }
  })(path.join(root, 'extension'));
  const names = zipEntryNames();
  assert.ok(expected.includes('manifest.json'));
  for (const name of expected) {
    assert.ok(names.includes(name), name + ' is missing. Rebuild with: python tools/build-zip.py');
  }
});

test('file names inside use forward slashes', () => {
  assert.ok(!zip.includes(Buffer.from('extension' + String.fromCharCode(92))));
});

test('the site download link points at the new zip', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('href="ai-firewall-extension.zip"'));
  assert.ok(!html.includes('dato-extension.zip'));
});
