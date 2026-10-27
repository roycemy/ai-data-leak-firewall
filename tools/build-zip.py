"""Rebuild dato-extension.zip from extension/. Run from the repo root: python tools/build-zip.py

Entries are stored as extension/<file> with forward slashes, so the ZIP
extracts to a folder called "extension" on Windows, Mac and Linux.
"""
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'extension')
OUT = os.path.join(ROOT, 'dato-extension.zip')

with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    for base, _dirs, files in os.walk(SRC):
        for name in sorted(files):
            if name.endswith('.md'):
                continue
            full = os.path.join(base, name)
            rel = os.path.relpath(full, ROOT).replace(os.sep, '/')
            z.write(full, rel)
print('wrote', OUT)
