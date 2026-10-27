// The ZIP the website offers must match extension/ exactly, or the install
// page would hand out a different build than the one tested.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '../..');

// Minimal ZIP reader (central directory, stored or deflate).
function readZip(file) {
  const buf = fs.readFileSync(file);
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  assert.ok(eocd >= 0, 'not a ZIP');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + csize);
    out[name] = method === 8 ? zlib.inflateRawSync(raw) : raw;
    p += 46 + nlen + elen + clen;
  }
  return out;
}

test('dato-extension.zip matches extension/ and unpacks to an extension folder', () => {
  const zip = readZip(path.join(ROOT, 'dato-extension.zip'));
  const dir = path.join(ROOT, 'extension');
  const expected = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (!e.name.endsWith('.md')) expected.push(path.relative(ROOT, full).split(path.sep).join('/'));
    }
  })(dir);
  assert.deepStrictEqual(Object.keys(zip).sort(), expected.sort());
  for (const name of expected) {
    assert.ok(zip[name].equals(fs.readFileSync(path.join(ROOT, name))), name + ' differs from extension/. Run: python tools/build-zip.py');
  }
  assert.ok(Object.keys(zip).every((n) => !n.includes('\\')), 'backslash paths in ZIP');
});
