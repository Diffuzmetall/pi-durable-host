#!/usr/bin/env python3
"""Build frozen bindings, then test with no original runtime, credentials or network."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

os.umask(0o077)
release = Path('/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-dadd5534')
repo = Path('/home/ubuntu/Projects/pi-durable-host')
node = Path('/home/ubuntu/.nvm/versions/node/v24.19.0/bin/node')
source = Path(__file__).resolve().parent
version = sys.argv[1]
assert __import__('re').fullmatch(r'host-bindings-v[1-9][0-9]*', version)
stage = release / version
assert not stage.exists(), 'Preserve earlier candidate and evidence; use a new version'
assert hashlib.sha256(node.read_bytes()).hexdigest() == 'bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12'
stage.mkdir(mode=0o700)
evidence = stage / 'evidence'
evidence.mkdir(mode=0o700)
hashes = {}
for name in ('host-bindings-entry.mjs', 'build-host-bindings.mjs', 'host-bindings.test.mjs',
             'session-tracing.mjs', 'session-mcp.mjs', 'session-mcp.test.mjs',
             'operational-profile.mjs', 'operational-profile.test.mjs', 'operational-host.mjs',
             'terminal-launcher.mjs', 'terminal-launcher.test.mjs',
             'provision-session-mail.mjs', 'provision-session-mail.test.mjs'):
    shutil.copyfile(source / name, stage / name)
    hashes[name] = hashlib.sha256((stage / name).read_bytes()).hexdigest()
base = [
    '/usr/bin/systemd-run', '--user', '--scope', '--quiet', '--collect',
    '-p', 'MemoryMax=1G', '-p', 'MemorySwapMax=0', '-p', 'TasksMax=64', '-p', 'CPUQuota=100%',
    '/usr/bin/timeout', '-k', '3s', '60s', '/usr/bin/prlimit', '--cpu=45', '--nofile=512',
    '/usr/bin/bwrap', '--unshare-all', '--die-with-parent', '--new-session', '--clearenv',
    '--ro-bind', '/usr', '/usr', '--ro-bind', '/lib', '/lib', '--ro-bind', '/lib64', '/lib64',
    '--symlink', 'usr/bin', '/bin', '--proc', '/proc', '--dev', '/dev',
    '--ro-bind', str(node), '/runtime/node', '--ro-bind', str(release), str(release),
    '--tmpfs', '/tmp', '--tmpfs', '/home/probe', '--setenv', 'HOME', '/home/probe',
    '--setenv', 'PATH', '/runtime:/usr/bin:/bin', '--setenv', 'NO_COLOR', '1',
    '--setenv', 'NODE_OPTIONS', '--max-old-space-size=384',
]
frozen = Path('/home/ubuntu/.local/share/pi-durable/tui-releases/20261030-headless-48a55067')
packages = Path('/home/ubuntu/.pi/agent/npm/node_modules')
build_mounts = ['--bind', str(stage), str(stage)]
tracing_packages = Path('/home/ubuntu/Projects/master/experiments/pi-durable-1.4-upgrade/extensions-lane/node_modules')
for path in (repo, frozen, packages, tracing_packages):
    build_mounts += ['--ro-bind', str(path), str(path)]

def run(name, mounts, args):
    command = base + mounts + ['--remount-ro', '/', '--chdir', str(stage), '/runtime/node'] + args
    with (evidence / name).open('x') as log:
        result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, timeout=70)
    return result.returncode

reuse = sys.argv[2] if len(sys.argv) == 3 else None
if reuse:
    assert __import__('re').fullmatch(r'host-bindings-v[1-9][0-9]*', reuse)
    previous = release / reuse
    prior = json.loads((previous / 'evidence/RESULT.json').read_text())
    for name, digest in hashes.items():
        if name in ('host-bindings-entry.mjs', 'build-host-bindings.mjs', 'session-tracing.mjs'):
            assert prior['scriptHashes'].get(name) == digest, f'Changed compiled boundary cannot reuse evidence: {name}'
    provenance = json.loads((previous / 'compiled/PROVENANCE.json').read_text())
    assert hashlib.sha256((previous / 'compiled/bindings.mjs').read_bytes()).hexdigest() == provenance['bundle']['sha256']
    shutil.copytree(previous / 'compiled', stage / 'compiled')
    build_code = 0
    (evidence / 'build.log').write_text(f'Unchanged compiled bindings reused from {reuse}; compiled-boundary script hashes match. Session/profile tests rerun.\n')
else:
    build_code = run('build.log', build_mounts, [str(stage / 'build-host-bindings.mjs'), version])
# Runtime tests cannot read the old host, mutable npm installation or project source.
dcg = Path('/home/ubuntu/.local/bin/dcg').resolve()
test_code = run('tests.log', ['--bind', str(evidence), str(evidence),
                '--ro-bind', str(dcg), '/home/probe/.local/bin/dcg'],
                ['--test'] + ([] if reuse else [str(stage / 'host-bindings.test.mjs')]) +
                [str(stage / 'session-mcp.test.mjs'), str(stage / 'operational-profile.test.mjs'), str(stage / 'terminal-launcher.test.mjs'), str(stage / 'provision-session-mail.test.mjs')]) if build_code == 0 else None
result = dict(version=version, scriptHashes=hashes, dcgSha256=hashlib.sha256(dcg.read_bytes()).hexdigest(),
              buildExitCode=build_code, testsExitCode=test_code, reusedUnchangedBindingsFrom=reuse,
              runtimeOriginalInstallationsMounted=False, credentialsMounted=False,
              sessionDataMounted=False, networkNamespaceIsolated=True, providerAttempts=0, cutoverGo=False)
(evidence / 'RESULT.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({k: v for k, v in result.items() if k != 'scriptHashes'}))
assert build_code == 0 and test_code == 0, f'Bindings failed: {evidence}'
