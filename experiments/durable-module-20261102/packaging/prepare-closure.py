#!/usr/bin/env python3
"""Prepare only an isolated npm workspace; never install into the live checkout."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile

REPO = Path(__file__).resolve().parents[3]
ROOT = Path('/tmp/pi-host-dm1-build-20261102-alice-v1')
BASELINE = Path('/tmp/pi-host-dm1-source-20261102-alice-v1')
PACKAGING = REPO / 'experiments/durable-module-20261102/packaging'
WORKSPACES = ['apps/dpi-backend', 'apps/dpi-sdk', 'apps/terminal-adapter', 'apps/iii-adapter', 'packages/durable-reload']
TARGET = {'@earendil-works/chord', '@earendil-works/pi-ai', '@earendil-works/pi-codemode', '@earendil-works/pi-durable', '@earendil-works/pi-mcp'}
ROOT.mkdir(exist_ok=False)
(ROOT / 'home').mkdir()
(ROOT / 'tmp').mkdir()
(ROOT / 'logs').mkdir()
with tarfile.open(BASELINE / 'source.tar.gz') as archive:
    archive.extractall(ROOT, filter='data')
manifest_changes = []
for workspace in WORKSPACES:
    path = ROOT / workspace / 'package.json'
    package = json.loads(path.read_text())
    for group in ['dependencies', 'devDependencies', 'peerDependencies']:
        for name, old in list(package.get(group, {}).items()):
            if name in TARGET:
                package[group][name] = '1.5.0'
                manifest_changes.append({'path': str(path.relative_to(ROOT)), 'group': group, 'name': name, 'from': old, 'to': '1.5.0'})
    path.write_text(json.dumps(package, indent=2) + '\n')
    dest = PACKAGING / 'target-manifests' / workspace / 'package.json'
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(path, dest)
root_package = {'name': 'pi-host-dm1-isolated-build', 'private': True, 'version': '0.0.0', 'type': 'module', 'workspaces': WORKSPACES}
(ROOT / 'package.json').write_text(json.dumps(root_package, indent=2) + '\n')
(PACKAGING / 'target-manifests/package.json').write_text(json.dumps(root_package, indent=2) + '\n')
# No inherited provider/auth environment or npm user/global config. No package lifecycle scripts.
for name in ['npm-user.conf', 'npm-global.conf']:
    (ROOT / name).write_text('')
env = {'PATH': os.environ['PATH'], 'HOME': str(ROOT / 'home'), 'TMPDIR': str(ROOT / 'tmp'), 'LANG': 'C.UTF-8', 'npm_config_userconfig': str(ROOT / 'npm-user.conf'), 'npm_config_globalconfig': str(ROOT / 'npm-global.conf'), 'npm_config_cache': str(ROOT / 'npm-cache'), 'npm_config_registry': 'https://registry.npmjs.org/'}
command = ['npm', 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--fetch-retries=0']
with (ROOT / 'logs/npm-install.log').open('wb') as output:
    result = subprocess.run(command, cwd=ROOT, env=env, stdout=output, stderr=subprocess.STDOUT, timeout=240)
record = {'root': str(ROOT), 'sourceBaseline': str(BASELINE), 'workspaces': WORKSPACES, 'manifestChanges': manifest_changes, 'install': {'argv': command, 'exitCode': result.returncode, 'log': str(ROOT / 'logs/npm-install.log')}, 'scope': 'D0 dependency closure only; no product build or acceptance; terminal pi-tui stays independently pinned1.4.0', 'productionActivation': 'NOT RUN'}
if result.returncode == 0:
    lock = ROOT / 'package-lock.json'
    shutil.copyfile(lock, PACKAGING / 'target-manifests/package-lock.json')
    record['lockSha256'] = hashlib.sha256(lock.read_bytes()).hexdigest()
(PACKAGING / 'CLOSURE.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(record, indent=2))
raise SystemExit(result.returncode)
