#!/usr/bin/env python3
"""Stage only the SSE/package delta on the current sealed Host; never activate it."""
import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path

os.umask(0o077)
here = Path(__file__).resolve().parent
releases = Path.home() / '.local/share/pi-durable-host/releases'
base = releases / 'c0019d7-unified-catalog-20261031-v1'
package_source = releases / 'c0019d7-nico-mcp140-v3'
stage = here / 'candidate'
if stage.exists():
    raise RuntimeError('Existing candidate refused; retain its evidence')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_json(path):
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError('Invalid candidate metadata: ' + str(path)) from error


manifest = read_json(base / 'DELM-RELEASE.json')
for file, digest in manifest['files'].items():
    if sha(base / file) != digest:
        raise RuntimeError('Current base differs from sealed manifest: ' + file)
for file, digest in manifest.get('externalFiles', {}).items():
    if sha(Path(file)) != digest:
        raise RuntimeError('Pinned dependency changed: ' + file)
receipt = read_json(package_source / 'MCP140-CANDIDATE.json')
package = package_source / 'node_modules/@earendil-works/pi-mcp'
for file, digest in receipt['packageSha256'].items():
    if sha(package / file) != digest:
        raise RuntimeError('Package source hash differs: ' + file)
size = sum(path.stat().st_size for path in base.rglob('*') if path.is_file())
if shutil.disk_usage(here).free < size * 2 + 536_870_912:
    raise RuntimeError('Insufficient space for stage plus sealed release')
subprocess.run(['cp', '-a', '--reflink=auto', str(base), str(stage)], check=True)
for path in [stage, *stage.rglob('*')]:
    if path.is_symlink():
        if not path.resolve().is_relative_to(stage):
            raise RuntimeError('External stage symlink refused')
    else:
        path.chmod(path.stat().st_mode | 0o700)
subprocess.run(['patch', '--batch', '--forward', '-p1', '-i', str(here.parent / 'sdk-host-cutover/backend-sse.patch')], cwd=stage, check=True)
# Establish the SSE fix independently, before changing the MCP dependency.
subprocess.run(['python3', str(here / 'check.py'), str(stage), 'sse'], check=True, timeout=125)
# The current base already has the accepted null-preserving native bridge.
bridge = 'node_modules/dpi-backend/dist/dpi-backend/src/native-profile/guards/mcp-codemode.js'
if sha(stage / bridge) != receipt['bridgePatch']['sha256']:
    raise RuntimeError('Current bridge differs from the accepted pi-mcp bridge')
installed = stage / 'node_modules/@earendil-works/pi-mcp'
installed.rename(stage / 'pi-mcp-1.0.2-preimage')
shutil.copytree(package, installed)
root = read_json(stage / 'package.json')
root.setdefault('overrides', {})['@earendil-works/pi-mcp'] = '1.4.0'
(stage / 'package.json').write_text(json.dumps(root, indent=2) + '\n')
new_record = read_json(package_source / 'package-lock.json')['packages']['node_modules/@earendil-works/pi-mcp']
for file in ['package-lock.json', 'node_modules/.package-lock.json']:
    path = stage / file
    lock = read_json(path)
    lock['packages']['node_modules/@earendil-works/pi-mcp'] = new_record
    path.write_text(json.dumps(lock, indent=2) + '\n')
subprocess.run(['python3', str(here / 'finalize.py'), str(stage)], check=True, timeout=30)
changed = []
for file, digest in manifest['files'].items():
    if sha(stage / file) != digest:
        changed.append(file)
allowed = {'package.json', 'package-lock.json', 'node_modules/.package-lock.json',
           'node_modules/dpi-backend/dist/dpi-backend/src/streams.js',
           'node_modules/dpi-backend/package.json', 'artifacts/dpi-backend-0.1.0.tgz'}
if any(file not in allowed and not file.startswith('node_modules/@earendil-works/pi-mcp/') for file in changed):
    raise RuntimeError('Unexpected delta in current Host base')
result = {'base': str(base), 'stage': str(stage), 'activated': False,
          'sseDrain': True, 'piMcpVersion': '1.4.0', 'changedFiles': changed,
          'baseManifestSha256': sha(base / 'DELM-RELEASE.json'),
          'packageSha256': receipt['packageSha256'], 'bridgeSha256': sha(stage / bridge)}
(stage / 'SSE-MCP140-STAGE.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'stage': str(stage), 'changedFiles': len(changed), 'activated': False, 'piMcpVersion': '1.4.0'}))
