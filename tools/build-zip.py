"""Rebuild ai-firewall-extension.zip from extension/. Run from the repo root: python tools/build-zip.py

Entries are stored at the zip root (manifest.json, not extension/manifest.json)
with forward slashes, so "Load unpacked" works on the extracted folder in
Chrome and Edge.
"""
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'extension')
OUT = os.path.join(ROOT, 'ai-firewall-extension.zip')

with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    for base, _dirs, files in os.walk(SRC):
        for name in sorted(files):
            if name.endswith('.md'):
                continue
            full = os.path.join(base, name)
            rel = os.path.relpath(full, SRC).replace(os.sep, '/')
            z.write(full, rel)
print('wrote', OUT)
