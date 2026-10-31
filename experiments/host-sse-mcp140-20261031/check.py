#!/usr/bin/env python3
"""Exercise the exact selected dependency tree offline with faux/local services only."""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

os.umask(0o077)
if len(sys.argv) != 3 or sys.argv[2] not in ['sse', 'all']:
    raise SystemExit('Usage: check.py RELEASE_OR_STAGE sse|all')
release = Path(sys.argv[1]).resolve()
source = Path(__file__).resolve().parent
original = source.parent / 'sdk-host-cutover'
evidence = Path(tempfile.mkdtemp(prefix='sse-mcp140-check-', dir='/var/tmp'))
bindings = evidence / 'bindings'
bindings.mkdir()
for file in release.glob('*.mjs'):
    shutil.copy2(file, bindings / file.name)
for directory in ['compiled', 'delm-engine']:
    if (release / directory).exists():
        shutil.copytree(release / directory, bindings / directory)
for file in bindings.rglob('*'):
    if not file.is_symlink():
        file.chmod(0o700 if file.is_dir() else 0o600)
regression_source = source.parent.parent / 'apps/dpi-backend/tests/streams-backpressure.test.mjs'
sse_test = regression_source.read_text()
for old, new in {
    '../src/store.js': 'dpi-backend/store',
    '../src/http-server.js': 'dpi-backend/server',
    '../src/native-profile/profile.js': 'dpi-backend/native-profile',
    '../../dpi-sdk/src/client.js': 'dpi-sdk',
    '../src/streams.js': '../node_modules/dpi-backend/dist/dpi-backend/src/streams.js',
}.items():
    sse_test = sse_test.replace(old, new)
(bindings / 'large-snapshot.test.mjs').write_text(sse_test)
tests = ['large-snapshot.test.mjs']
if sys.argv[2] == 'all':
    for name in ['nico-session-mcp.test.mjs', 'operational-profile.test.mjs', 'native-mcp-comparison.test.mjs',
                 'legacy-session-mcp.mjs', 'legacy-operational-profile.mjs', 'operational-host.mjs', 'native-extensions.mjs']:
        shutil.copy2(original / name, bindings / name)
    regression = source.parent.parent / 'apps/dpi-backend/tests/native-mcp-structured-results.test.mjs'
    text = regression.read_text()
    old = '../src/native-profile/guards/mcp-codemode.js'
    assert text.count(old) == 1
    (bindings / regression.name).write_text(text.replace(old, '../node_modules/dpi-backend/dist/dpi-backend/src/native-profile/guards/mcp-codemode.js'))
    tests += ['nico-session-mcp.test.mjs', 'operational-profile.test.mjs', 'native-mcp-comparison.test.mjs', regression.name]
    service_source = source.parent / 'host-activation-20261031-terra8/service.test.mjs'
    service_test = service_source.read_text().split("test('final terminal budget")[0]
    service_test = service_test.replace("'./host/node_modules/dpi-sdk/dist/client.js'", "'dpi-sdk'")
    service_test = service_test.replace("import { startHostService } from './terminal/host-bindings-v16/terminal-launcher.mjs';\n", '')
    service_test = service_test.replace("'./host/operational-service.mjs'", "'./operational-service.mjs'")
    (bindings / 'current-service.test.mjs').write_text(service_test)
    tests += ['current-service.test.mjs']
node = Path.home() / '.nvm/versions/node/v24.19.0/bin/node'
command = ['systemd-run', '--user', '--scope', '--quiet', '--collect', '-p', 'MemoryMax=1G',
           '-p', 'MemorySwapMax=0', '-p', 'CPUQuota=100%', 'timeout', '-k', '3s', '110s',
           'bwrap', '--unshare-all', '--die-with-parent', '--new-session', '--clearenv',
           '--ro-bind', '/usr', '/usr', '--ro-bind', '/lib', '/lib', '--ro-bind', '/lib64', '/lib64',
           '--symlink', 'usr/bin', '/bin', '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp',  # noqa: S108 -- namespace-private tmpfs, not a host temporary file
           '--tmpfs', '/home/probe', '--ro-bind', str(node), '/runtime/node',
           '--ro-bind', str(release / 'node_modules'), '/candidate/node_modules',
           '--ro-bind', str(bindings), '/candidate/bindings',
           '--ro-bind', str((Path.home() / '.local/bin/dcg').resolve()), '/home/probe/.local/bin/dcg',
           '--setenv', 'HOME', '/home/probe', '--setenv', 'PATH', '/runtime:/usr/bin:/bin',
           '--remount-ro', '/', '--chdir', '/candidate', '/runtime/node', '--test', '--test-reporter=tap', '--test-concurrency=1',
           *['/candidate/bindings/' + file for file in tests]]
with (evidence / 'check.log').open('x') as output:
    result = subprocess.run(command, stdout=output, stderr=subprocess.STDOUT, timeout=120)
lines = (evidence / 'check.log').read_text().splitlines()
counts = {line.split()[1]: int(line.split()[2]) for line in lines
          if line.startswith(('# tests ', '# pass ', '# fail ', '# skipped '))}
report = {'release': str(release), 'exitCode': result.returncode, 'evidence': str(evidence),
          'networkIsolated': True, 'realCredentialsMounted': False, 'realDataMounted': False,
          'tests': counts, 'manifestSha256': hashlib.sha256((release / 'DELM-RELEASE.json').read_bytes()).hexdigest()}
(evidence / 'RESULT.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
for line in lines:
    if any(word in line for word in ['not ok', 'error:', 'Error:', '# pass', '# fail', '# tests', 'actual:', 'expected:']):
        print(line[:700])
raise SystemExit(result.returncode)
