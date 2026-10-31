#!/usr/bin/env python3
"""Keep the backend archive and both npm lock records coherent with the tested runtime."""
import base64
import gzip
import hashlib
import json
import os
import sys
import tarfile
from pathlib import Path

os.umask(0o077)
if len(sys.argv) != 2:
    raise SystemExit('Usage: finalize.py CANDIDATE_DIRECTORY')
stage = Path(sys.argv[1]).resolve()
backend = stage / 'node_modules/dpi-backend'


def read_json(path):
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError('Invalid candidate metadata: ' + str(path)) from error


metadata = backend / 'package.json'
package = read_json(metadata)
package['dependencies']['@earendil-works/pi-mcp'] = '1.4.0'
metadata.write_text(json.dumps(package, indent=2) + '\n')
archive_path = stage / 'artifacts/dpi-backend-0.1.0.tgz'
# Deterministic tar metadata; no npm lifecycle scripts or dependency solving.
with (
    archive_path.open('wb') as raw,
    gzip.GzipFile(fileobj=raw, mode='wb', mtime=0, filename='') as compressed,
    tarfile.open(fileobj=compressed, mode='w|') as archive,
):
    for path in sorted(backend.rglob('*')):
        if path.is_symlink() and not path.resolve().is_relative_to(backend):
            raise RuntimeError('External backend symlink refused')
        info = archive.gettarinfo(str(path), arcname='package/' + str(path.relative_to(backend)))
        info.uid = info.gid = info.mtime = 0
        info.uname = info.gname = ''
        if info.isfile():
            with path.open('rb') as content:
                archive.addfile(info, content)
        else:
            archive.addfile(info)
integrity = 'sha512-' + base64.b64encode(hashlib.sha512(archive_path.read_bytes()).digest()).decode()
for filename in ['package-lock.json', 'node_modules/.package-lock.json']:
    path = stage / filename
    lock = read_json(path)
    entry = lock['packages']['node_modules/dpi-backend']
    entry['dependencies']['@earendil-works/pi-mcp'] = '1.4.0'
    entry['integrity'] = integrity
    path.write_text(json.dumps(lock, indent=2) + '\n')
with tarfile.open(archive_path) as archive:
    for name in ['package.json', 'dist/dpi-backend/src/streams.js', 'dist/dpi-backend/src/native-profile/guards/mcp-codemode.js']:
        content = archive.extractfile('package/' + name)
        if content is None or content.read() != (backend / name).read_bytes():
            raise RuntimeError('Packaged backend differs from tested runtime: ' + name)
print(json.dumps({'backendArchiveCoherent': True, 'backendDependency': '1.4.0', 'scriptsRun': False}))
