#!/usr/bin/env python3
"""Stage and inspect the native composition with read-only OAuth and no network/session DB."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

os.umask(0o077)
release = Path('/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-dadd5534')
node = Path('/home/ubuntu/.nvm/versions/node/v24.19.0/bin/node')
auth = Path('/home/ubuntu/.pi/agent/auth.json')
source = Path(__file__).resolve().parent
stage = release / 'acceptance-native-v4'
assert not stage.exists(), 'Existing inspection must be preserved; do not overwrite or repeat it'
assert auth.is_file() and not auth.is_symlink() and auth.stat().st_mode & 0o077 == 0
assert hashlib.sha256(node.read_bytes()).hexdigest() == 'bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12'
auth_before = hashlib.sha256(auth.read_bytes()).digest()
stage.mkdir(mode=0o700)
evidence = stage / 'evidence'
evidence.mkdir(mode=0o700)
hashes = {}
for name in ('subscription-probe.mjs', 'subscription-probe.test.mjs', 'probe-models.mjs', 'probe-models.test.mjs', 'inspect-native.mjs'):
    shutil.copyfile(source / name, stage / name)
    hashes[name] = hashlib.sha256((stage / name).read_bytes()).hexdigest()
command = [
    '/usr/bin/systemd-run', '--user', '--scope', '--quiet', '--collect',
    '-p', 'MemoryMax=1G', '-p', 'MemorySwapMax=0', '-p', 'TasksMax=64', '-p', 'CPUQuota=100%',
    '/usr/bin/timeout', '-k', '3s', '40s', '/usr/bin/prlimit', '--cpu=30', '--nofile=512',
    '/usr/bin/bwrap', '--unshare-all', '--die-with-parent', '--new-session', '--clearenv',
    '--ro-bind', '/usr', '/usr', '--ro-bind', '/lib', '/lib', '--ro-bind', '/lib64', '/lib64',
    '--symlink', 'usr/bin', '/bin', '--proc', '/proc', '--dev', '/dev',
    '--ro-bind', str(node), '/runtime/node', '--ro-bind', str(release), '/release',
    '--ro-bind', str(auth), '/credential/auth.json', '--bind', str(evidence), '/output',
    '--tmpfs', '/tmp', '--dir', '/home/probe', '--dir', '/work',
    '--setenv', 'HOME', '/home/probe', '--setenv', 'PATH', '/runtime:/usr/bin:/bin',
    '--setenv', 'NODE_OPTIONS', '--max-old-space-size=384', '--setenv', 'NO_COLOR', '1',
    '--remount-ro', '/', '--chdir', '/release',
    '/runtime/node', '/release/acceptance-native-v4/inspect-native.mjs',
]
with (evidence / 'tests.log').open('x') as log:
    tests = subprocess.run(command[:-2] + ['/runtime/node', '--test',
        '/release/acceptance-native-v4/subscription-probe.test.mjs',
        '/release/acceptance-native-v4/probe-models.test.mjs'], stdout=log, stderr=subprocess.STDOUT, timeout=50)
assert tests.returncode == 0, f'Bounded capability tests failed: {evidence / "tests.log"}'
with (evidence / 'inspection.log').open('x') as log:
    result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, timeout=50)
manifest = {
    'scriptHashes': hashes, 'release': str(release), 'testsExitCode': tests.returncode, 'exitCode': result.returncode,
    'networkNamespaceIsolated': True, 'authMountedReadOnly': True,
    'authFileUnchanged': hashlib.sha256(auth.read_bytes()).digest() == auth_before,
    'originalSessionDataMounted': False, 'pilotDataMounted': False,
    'cutoverGo': False,
}
(evidence / 'inspection-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
assert result.returncode == 0, f'Inspection failed; private log: {evidence / "inspection.log"}'
assert manifest['authFileUnchanged'], 'Credential changed concurrently; inspect before further use'
print(json.dumps({'status': 'NATIVE_INSPECTION_PASS', 'network': False, 'sessionOpened': False,
                  'providerAttempts': 0, 'cutoverGo': False, 'evidence': str(evidence)}))
