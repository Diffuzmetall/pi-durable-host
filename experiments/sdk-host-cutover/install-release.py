#!/usr/bin/env python3
"""Install the accepted SDK-host tuple offline without activating any launcher."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import tarfile

os.umask(0o077)
ARCHIVES = Path('/var/tmp/alice-main-route-public.BydzLT/artifacts')
RELEASE = Path('/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-dadd5534')
NODE = Path('/home/ubuntu/.nvm/versions/node/v24.19.0/bin/node')
NPM = NODE.parent.parent / 'lib/node_modules/npm'
LAUNCHER = Path('/home/ubuntu/.local/bin/pi-durable')
PINS = {
    'dpi-backend': 'dadd5534e7642a2c14dc6c6fdcbb6eab572c773221473bf3a13bc92326392458',
    'dpi-sdk': '351054859022ae202fbdc429e73da441bc90295e4717342652079c3ea0906abd',
    'dpi-terminal-adapter': '1f1b74fa2b515b55bf280113d91116c267755973b5ed76ce9a6389174c235bde',
    'dpi-iii-adapter': '40b33e8aae70c37222fc212cfb3b83adb48dba25e73163468fefb6dae33eeefe',
}

def digest(path):
    return hashlib.file_digest(path.open('rb'), 'sha256').hexdigest()

# Attest all inputs before making a destination. No existing installation is reused.
assert not RELEASE.exists(), 'Destination already exists; inspect it, do not overwrite or reinstall'
assert not RELEASE.is_symlink(), 'Symlink destination refused'
expected = {}
for name, sha in PINS.items():
    archive = ARCHIVES / f'{name}-0.1.0.tgz'
    assert digest(archive) == sha, f'Archive mismatch: {name}'
    files = {}
    with tarfile.open(archive, 'r:gz') as tar:
        for member in tar.getmembers():
            parts = PurePosixPath(member.name).parts
            assert parts and parts[0] == 'package' and '..' not in parts, 'Unsafe archive path'
            assert member.isdir() or member.isfile(), 'Archive links/special files refused'
            if member.isfile():
                relative = str(PurePosixPath(*parts[1:]))
                assert relative not in files and relative != '.', 'Duplicate archive path'
                files[relative] = hashlib.sha256(tar.extractfile(member).read()).hexdigest()
    expected[name] = files
launcher_before = digest(LAUNCHER)
launcher_mode = LAUNCHER.stat().st_mode & 0o777
RELEASE.mkdir(parents=True, mode=0o700)
(RELEASE / 'artifacts').mkdir(mode=0o700)
for name in PINS:
    shutil.copyfile(ARCHIVES / f'{name}-0.1.0.tgz', RELEASE / 'artifacts' / f'{name}-0.1.0.tgz')
shutil.copyfile(LAUNCHER, RELEASE / 'legacy-launcher.preimage')
os.chmod(RELEASE / 'legacy-launcher.preimage', 0o600)
(RELEASE / 'package.json').write_text(json.dumps({
    'name': 'pi-durable-host-local-release', 'private': True, 'version': '0.1.0', 'type': 'module'
}) + '\n')

# The cache is a read-only lower layer with disposable writes. No auth/HOME/source DB
# or network is visible; npm lifecycle scripts cannot execute.
sandbox = [
    '/usr/bin/systemd-run', '--user', '--scope', '--quiet', '--collect',
    '-p', 'MemoryMax=3G', '-p', 'MemorySwapMax=0', '-p', 'TasksMax=256', '-p', 'CPUQuota=200%',
    '/usr/bin/timeout', '-k', '3s', '180s', '/usr/bin/prlimit', '--cpu=120', '--nofile=1024',
    '/usr/bin/bwrap', '--unshare-all', '--die-with-parent', '--new-session', '--clearenv',
    '--ro-bind', '/usr', '/usr', '--ro-bind', '/lib', '/lib', '--ro-bind', '/lib64', '/lib64',
    '--symlink', 'usr/bin', '/bin', '--proc', '/proc', '--dev', '/dev', '--dir', '/runtime',
    '--ro-bind', str(NODE), '/runtime/node', '--ro-bind', str(NPM), '/npm',
    '--overlay-src', '/home/ubuntu/.npm/_cacache', '--tmp-overlay', '/npm-cache/_cacache',
    '--bind', str(RELEASE), '/release', '--tmpfs', '/tmp', '--dir', '/tmp/home',
    '--setenv', 'HOME', '/tmp/home', '--setenv', 'PATH', '/runtime:/usr/bin:/bin',
    '--setenv', 'NODE_OPTIONS', '--max-old-space-size=768', '--setenv', 'NO_COLOR', '1',
    '--remount-ro', '/', '--chdir', '/release',
]
command = sandbox + ['/runtime/node', '/npm/bin/npm-cli.js', 'install', '--ignore-scripts',
    '--offline', '--no-audit', '--no-fund', '--cache=/npm-cache',
    *[f'./artifacts/{name}-0.1.0.tgz' for name in PINS]]
with (RELEASE / 'install.log').open('w') as log:
    installed = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, timeout=200)
assert installed.returncode == 0, f'Offline install failed: {RELEASE / "install.log"}; partial tree retained'
checked = 0
for name, files in expected.items():
    for relative, sha in files.items():
        assert digest(RELEASE / 'node_modules' / name / relative) == sha, f'Installed mismatch: {name}/{relative}'
        checked += 1
# Installed executables may be relative symlinks; none may escape this release.
for root, dirs, names in os.walk(RELEASE / 'node_modules'):
    for name in dirs + names:
        path = Path(root) / name
        if path.is_symlink():
            assert path.resolve(strict=True).is_relative_to(RELEASE), f'External dependency link: {path}'
probe = """
import assert from 'node:assert/strict';
import { Store } from 'dpi-backend/store';
import { createNativeProfile } from 'dpi-backend/native-profile';
import { adoptNativeCopy } from 'dpi-backend/native-import';
import { createHttpServer, GrantPolicy } from 'dpi-backend/server';
import { DpiClient } from 'dpi-sdk';
for (const value of [Store.open, createNativeProfile, adoptNativeCopy, createHttpServer, GrantPolicy, DpiClient])
  assert.equal(typeof value, 'function');
console.log('PUBLIC_EXPORTS_PASS');
"""
with (RELEASE / 'exports.log').open('w') as log:
    exported = subprocess.run(sandbox + ['/runtime/node', '--input-type=module', '-e', probe],
                              stdout=log, stderr=subprocess.STDOUT, timeout=200)
assert exported.returncode == 0, f'Public export check failed: {RELEASE / "exports.log"}'
assert digest(LAUNCHER) == launcher_before, 'Launcher changed concurrently; activation refused'
manifest = {
    'sourceCommit': 'c0019d73152b58783d1b74fabe95f6982206aa55',
    'releaseRoot': str(RELEASE), 'archives': PINS, 'installedPackageFilesExact': checked,
    'node': {'path': str(NODE), 'sha256': digest(NODE)},
    'lockSha256': digest(RELEASE / 'package-lock.json'),
    'legacyLauncher': {'path': str(LAUNCHER), 'sha256': launcher_before, 'mode': oct(launcher_mode),
                       'backup': 'legacy-launcher.preimage'},
    'offlineInstallExit': installed.returncode, 'publicExportsExit': exported.returncode,
    'lifecycleScripts': False, 'externalDependencyLinks': False,
    'originalDataMounted': False, 'credentialsMounted': False,
    'nativeSessionOpened': False, 'launcherChanged': False, 'cutoverGo': False,
}
(RELEASE / 'INSTALLATION.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'status': 'OFFLINE_RELEASE_INSTALLED', 'release': str(RELEASE),
                  'packageFilesExact': checked, 'launcherChanged': False, 'cutoverGo': False}))
