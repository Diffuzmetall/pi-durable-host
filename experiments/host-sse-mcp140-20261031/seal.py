#!/usr/bin/env python3
"""Seal a new release, checking exact deltas against the current Host, without activation."""
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

os.umask(0o077)
if len(sys.argv) != 2:
    raise SystemExit('Usage: seal.py PASS_EVIDENCE_DIRECTORY')
here = Path(__file__).resolve().parent
stage = here / 'candidate'
releases = Path.home() / '.local/share/pi-durable-host/releases'
base = releases / 'c0019d7-unified-catalog-20261031-v1'
target = releases / 'c0019d7-unified-sse-mcp140-20261031-v1'


def read_json(path):
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError('Invalid candidate metadata: ' + str(path)) from error


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


check = read_json(Path(sys.argv[1]) / 'RESULT.json')
if check['exitCode'] != 0 or Path(check['release']) != stage:
    raise RuntimeError('Passing evidence must refer to this exact candidate')
if not check['networkIsolated'] or check['realDataMounted'] or check['realCredentialsMounted']:
    raise RuntimeError('Isolated verification required')
if target.exists():
    raise RuntimeError('Existing release refused')
manifest = read_json(base / 'DELM-RELEASE.json')
allowed = {'package.json', 'package-lock.json', 'node_modules/.package-lock.json',
           'node_modules/dpi-backend/package.json', 'artifacts/dpi-backend-0.1.0.tgz',
           'node_modules/dpi-backend/dist/dpi-backend/src/streams.js'}
changed = []
for file, digest in manifest['files'].items():
    if sha(base / file) != digest:
        raise RuntimeError('Current base changed: ' + file)
    if sha(stage / file) != digest:
        if file not in allowed and not file.startswith('node_modules/@earendil-works/pi-mcp/'):
            raise RuntimeError('Unexpected delta: ' + file)
        changed.append(file)
package = read_json(stage / 'SSE-MCP140-STAGE.json')['packageSha256']
for file, digest in package.items():
    if sha(stage / 'node_modules/@earendil-works/pi-mcp' / file) != digest:
        raise RuntimeError('Tested package hash changed')
if shutil.disk_usage(releases).free < 536_870_912 + sum(p.stat().st_size for p in stage.rglob('*') if p.is_file()):
    raise RuntimeError('Insufficient sealing space')
subprocess.run(['cp', '-a', '--reflink=auto', str(stage), str(target)], check=True)
(target / 'DELM-RELEASE.json').rename(target / 'CATALOG-BASE-DELM-RELEASE.json')
receipt = {'base': str(base), 'release': str(target), 'activated': False, 'piMcpVersion': '1.4.0',
           'sseDrain': True, 'changedBaseFiles': changed, 'nicoRetained': True, 'modelCatalogRetained': True,
           'preSealEvidence': str(Path(sys.argv[1]).resolve()), 'sourceRegression': 'apps/dpi-backend/tests/streams-backpressure.test.mjs'}
(target / 'SSE-MCP140-RELEASE.json').write_text(json.dumps(receipt, indent=2) + '\n')
files = {str(path.relative_to(target)): sha(path) for path in target.rglob('*') if path.is_file() and not path.is_symlink()}
new_manifest = {'schema': 1, 'base': str(base), 'release': str(target),
                'scope': 'SSE initial-snapshot drain and pi-mcp 1.4.0 only; preserve cached catalogues, Nico, models and reload',
                'files': files, 'externalFiles': manifest.get('externalFiles', {})}
(target / 'DELM-RELEASE.json').write_text(json.dumps(new_manifest, indent=2) + '\n')
for path in [target, *target.rglob('*')]:
    if path.is_symlink():
        if not path.resolve().is_relative_to(target):
            raise RuntimeError('External release symlink refused')
    else:
        path.chmod(path.stat().st_mode & ~0o222)
for file, digest in files.items():
    if sha(target / file) != digest:
        raise RuntimeError('Sealed file verification failed: ' + file)
print(json.dumps({'release': str(target), 'sealed': True, 'activated': False,
                  'changedBaseFiles': len(changed), 'files': len(files), 'manifestSha256': sha(target / 'DELM-RELEASE.json')}))
