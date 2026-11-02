#!/usr/bin/env python3
"""Reassemble and qualify Carol's pinned patch without touching the shared seed."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

REPO = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent
SEED = Path('/tmp/pi-host-dm1-build-20261102-alice-v1')
ROOT = Path('/tmp/pi-host-dm1-commit-20261102-alice-v2')
RUNTIME = Path('experiments/durable-module-20261102/runtime')
NATIVE = Path('node_modules/@earendil-works/pi-durable/dist')
LOCK = '46482cfa4ca28e91d4a43de4b799ecc22be5b64e5949fc7af3cfa23f894f77eb'
INPUTS = {
    'patch-commit-authorization.mjs': '5822850cc788311d09e43dbb11ae297b40036683b5f85c374518c515642e1b5d',
    'native-commit-authorization.json': '7daa7b1074594c4966471647173b64cac7788c626278335be5245514218b1c60',
    'native-commit-authorization.test.ts': '6f2a83edf501c47f02c4c410d038e342403e6e060446879e24b666c302e4001c',
    'COMMIT-AUTHORIZATION.md': '4e53cb9980a689e0a3c13e3b163f406487a5b3ca4ad6704fa2dff451944b4cf3',
}

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

assert sha(SEED / 'package-lock.json') == LOCK
assert not ROOT.exists(), 'Refuse to overwrite an earlier candidate'
inputs = {}
for name, expected in INPUTS.items():
    source = REPO / RUNTIME / name
    assert source.is_file() and not source.is_symlink()
    data = source.read_bytes()
    assert hashlib.sha256(data).hexdigest() == expected, f'Producer input changed: {name}'
    inputs[name] = data
metadata = json.loads(inputs['native-commit-authorization.json'])
assert metadata['version'] == '1.5.0' and len(metadata['files']) == 6
assert metadata['revision'] == 'host-commit-authorization-v1'
files = [NATIVE / item['file'] for item in metadata['files']]
for item, file in zip(metadata['files'], files):
    assert sha(SEED / file) == item['before']

# Physical copy; no hardlinks/reflinks or mutation of the seed. Workspace symlinks stay internal.
shutil.copytree(SEED, ROOT, symlinks=True, ignore=shutil.ignore_patterns('npm-cache'))
for directory, names, filenames in os.walk(ROOT, followlinks=False):
    path = Path(directory)
    path.chmod(path.stat().st_mode | 0o200)
    for name in names + filenames:
        entry = path / name
        if entry.is_symlink():
            assert entry.resolve(strict=True).is_relative_to(ROOT), f'External alias: {entry}'
for file in files:
    assert (ROOT / file).resolve() == ROOT / file
    assert (ROOT / file).stat().st_ino != (SEED / file).stat().st_ino
    (ROOT / file).chmod((ROOT / file).stat().st_mode | 0o200)
for name, data in inputs.items():
    target = ROOT / RUNTIME / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    (OUT / 'inputs').mkdir(exist_ok=True)
    (OUT / 'inputs' / name).write_bytes(data)
(ROOT / 'qualification-logs').mkdir()
env = {'PATH': os.environ['PATH'], 'HOME': str(ROOT / 'home'),
       'TMPDIR': '/tmp', 'LANG': 'C.UTF-8'}
steps = []

def run(label, argv, expected=0):
    log = ROOT / 'qualification-logs' / (label + '.log')
    with log.open('wb') as output:
        process = subprocess.run(argv, cwd=ROOT, env=env, stdin=subprocess.DEVNULL,
                                 stdout=output, stderr=subprocess.STDOUT, timeout=180)
    record = {'label': label, 'argv': argv, 'exitCode': process.returncode,
              'expectedExitCode': expected, 'log': str(log), 'logSha256': sha(log)}
    steps.append(record)
    print(json.dumps(record), flush=True)
    assert process.returncode == expected, f'{label} failed: see {log}'
    return log.read_text()

patch = ['node', str(ROOT / RUNTIME / 'patch-commit-authorization.mjs'), str(ROOT)]
run('patch-for-types', patch)
for item, file in zip(metadata['files'], files):
    assert sha(ROOT / file) == item['after']
run('strict-compile', ['node', str(ROOT / 'node_modules/typescript/bin/tsc'),
    '--strict', '--module', 'NodeNext', '--moduleResolution', 'NodeNext',
    '--target', 'ES2023', '--skipLibCheck', '--types', 'node',
    '--typeRoots', 'node_modules/@types', '--rootDir', '.', '--outDir', 'qualification-tests',
    str(RUNTIME / 'native-commit-authorization.test.ts')])
compiled = ROOT / 'qualification-tests' / RUNTIME / 'native-commit-authorization.test.js'
compiled_sha = sha(compiled)

def stock():
    for file in files:
        (ROOT / file).write_bytes((SEED / file).read_bytes())

def snapshot():
    return {str(file): sha(ROOT / file) for file in files}

stock()
fixture_command = ['python3', str(REPO / 'experiments/hot-update-20261101/sandbox/run.py'),
    '--candidate', str(ROOT), '--timeout', '120', '--', 'node', '--test', '--test-reporter=tap', '--test-concurrency=1',
    '/candidate/' + str(compiled.relative_to(ROOT))]

def sandbox(label, argv, expected, passes=None, failures=None):
    text = run(label, argv, expected)
    rows = [json.loads(line) for line in text.splitlines() if line.startswith('{')]
    root = Path(rows[0]['sandboxRoot'])
    assert not root.is_relative_to(ROOT), 'Launcher scratch must be outside mounted candidate'
    evidence = json.loads((root / 'work/sandbox-check.json').read_text())
    assert evidence.get('status') == 'PASS', f'Isolation failed: {evidence}'
    log = (root / 'run.log').read_text()
    if passes is not None:
        assert re.search(rf'^# pass {passes}$', log, re.M), log[-2000:]
    if failures is not None:
        assert re.search(rf'^# fail {failures}$', log, re.M), log[-2000:]
    # Preserve small, exact evidence alongside the packaging recipe, not only /tmp references.
    for source, suffix in [(root / 'run.log', '.runtime.log'),
                           (root / 'command.json', '.command.json'),
                           (root / 'work/sandbox-check.json', '.isolation.json')]:
        shutil.copyfile(source, OUT / (label + suffix))
    steps[-1].update({'sandboxRoot': str(root), 'isolation': evidence,
                      'runtimeLogSha256': sha(root / 'run.log')})
    print(json.dumps({'label': label, 'sandboxRoot': str(root), 'isolation': 'PASS',
                      'passes': passes, 'failures': failures}), flush=True)

sandbox('stock-red', fixture_command, 1, 0, 2)
assert sha(compiled) == compiled_sha

# Every rejected preimage must leave all six native files byte-identical to its input.
package = ROOT / NATIVE.parent / 'package.json'
package_bytes = package.read_bytes()
package.chmod(package.stat().st_mode | 0o200)
unknown_version = json.loads(package_bytes)
unknown_version['version'] = '1.5.999-unknown'
package.write_text(json.dumps(unknown_version) + '\n')
before = snapshot()
text = run('reject-version', patch, 1)
assert 'Patch requires exact Durable 1.5.0' in text and snapshot() == before
assert json.loads(package.read_text()) == unknown_version
package.write_bytes(package_bytes)
last = ROOT / files[-1]
last.write_bytes(last.read_bytes() + b'\n// UNKNOWN PREIMAGE\n')
before = snapshot()
text = run('reject-preimage', patch, 1)
assert 'Native preimage mismatch' in text and snapshot() == before
stock()
# A partially patched closure is not silently repaired; validate every input before writes.
run('prepare-partial', patch)
patched_index = (ROOT / NATIVE / 'index.js').read_bytes()
stock()
(ROOT / NATIVE / 'index.js').write_bytes(patched_index)
before = snapshot()
text = run('reject-partial', patch, 1)
assert 'Native preimage mismatch' in text and snapshot() == before
stock()
run('final-patch', patch)
for item, file in zip(metadata['files'], files):
    assert sha(ROOT / file) == item['after']
assert sha(compiled) == compiled_sha
sandbox('patched-green', fixture_command, 0, 2, 0)
# Reuse the existing 15-resolution smoke, from a frozen copy inside this candidate.
probe = ROOT / 'qualification-probe.mjs'
probe.write_bytes((REPO / 'experiments/durable-module-20261102/packaging/probe-closure.mjs').read_bytes())
probe_command = ['python3', str(REPO / 'experiments/hot-update-20261101/sandbox/run.py'),
    '--candidate', str(ROOT), '--timeout', '120', '--', 'node', '--experimental-import-meta-resolve',
    '/candidate/qualification-probe.mjs']
sandbox('patched-imports', probe_command, 0)
marker = ROOT / 'qualification-marker.mjs'
marker.write_text('import { COMMIT_AUTHORIZATION_REVISION } from "@earendil-works/pi-durable";\n'
                  'if (COMMIT_AUTHORIZATION_REVISION !== "host-commit-authorization-v1") throw Error("wrong patch marker");\n'
                  'console.log(JSON.stringify({revision:COMMIT_AUTHORIZATION_REVISION}));\n')
sandbox('patched-marker', probe_command[:-1] + ['/candidate/qualification-marker.mjs'], 0)
before = snapshot()
text = run('reject-reapplication', patch, 1)
assert 'Native preimage mismatch' in text and snapshot() == before
for item, file in zip(metadata['files'], files):
    assert sha(SEED / file) == item['before'], 'Seed changed'
    assert sha(ROOT / file) == item['after']
assert sha(SEED / 'package-lock.json') == LOCK == sha(ROOT / 'package-lock.json')
result = {'status': 'PASS_PINNED_COMPONENT_CLOSURE', 'root': str(ROOT), 'seed': str(SEED),
    'seedLockSha256': LOCK, 'producerOutput': 'acfe12b567d8495281b2226fa8565a97',
    'patch': metadata, 'inputHashes': INPUTS, 'compiledFixtureSha256': compiled_sha,
    'initialAttempt': json.loads((OUT / 'INITIAL-ATTEMPT.json').read_text()),
    'fauxSourceSha256': sha(ROOT / 'apps/dpi-backend/src/faux.ts'), 'steps': steps,
    'scope': 'Independent packaging reassembly; RED2/GREEN2 real Harness/SQLite, rollback and healthy operation. Not full Host or full-profile qualification.',
    'productionActivation': 'NOT RUN'}
(OUT / 'RESULT.json').write_text(json.dumps(result, indent=2) + '\n')
(ROOT / 'NATIVE-COMMIT-QUALIFICATION.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'status': result['status'], 'resultSha256': sha(OUT / 'RESULT.json'),
                  'root': str(ROOT), 'steps': len(steps)}), flush=True)
