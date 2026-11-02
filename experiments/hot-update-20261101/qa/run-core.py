#!/usr/bin/env python3
"""Stage the independent probe outside the sealed artifact, inside Frank's sandbox.

python3 /repo/experiments/hot-update-20261101/qa/run-core.py \
  --manifest /candidate/<actual-manifest>.json --digest <Alice-final-digest>
No product imports or subprocesses are permitted before the sandbox check.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--digest', required=True)
    parser.add_argument('--probe', choices=['core', 'delm', 'resources'], default='core')
    args = parser.parse_args()
    if os.environ.get('HOME') != '/scratch/home':
        parser.error('BLOCKED: run only through sandbox/run.py; no live fallback')
    check = json.loads(Path('/scratch/sandbox-check.json').read_text())
    if check.get('status') != 'PASS' or check.get('child') != 'PASS':
        parser.error('BLOCKED: sandbox negative self-check must pass first')
    manifest = args.manifest.resolve(strict=True)
    if not manifest.is_relative_to('/candidate'):
        parser.error('Manifest must belong to the explicit read-only candidate')
    before = hashlib.sha256(manifest.read_bytes()).hexdigest()
    if before != args.digest:
        parser.error('BLOCKED: candidate digest differs from named final artifact')
    integrity_command = ['python3', str(Path(__file__).with_name('candidate-manifest.py')),
                         '--candidate', '/candidate', '--manifest', str(manifest), '--digest', args.digest]
    integrity_before = subprocess.run(integrity_command, capture_output=True, text=True, check=True)
    root = Path(tempfile.mkdtemp(prefix='heidi-r4-stage-', dir='/scratch/tmp'))
    fixture = Path(__file__).with_name(f'installed-{args.probe}.mjs')
    original = fixture.read_bytes()
    (root / fixture.name).write_bytes(original)
    (root / 'node_modules').symlink_to('/candidate/node_modules', target_is_directory=True)
    command = ['node', '--expose-gc', str(root / fixture.name)]
    with (root / 'core.log').open('wb') as log:
        completed = subprocess.run(command, cwd=root, stdout=log, stderr=subprocess.STDOUT,
                                   timeout=300, check=False)
    after = hashlib.sha256(manifest.read_bytes()).hexdigest()
    integrity_after = subprocess.run(integrity_command, capture_output=True, text=True, check=True)
    result = {'status': 'PASS' if completed.returncode == 0 and after == before else 'FAIL',
              'candidateManifest': str(manifest), 'candidateDigestBefore': before,
              'candidateDigestAfter': after, 'command': command, 'exitCode': completed.returncode,
              'fixtureSha256': hashlib.sha256(original).hexdigest(), 'log': str(root / 'core.log'),
              'integrityCommand': integrity_command,
              'integrityBefore': json.loads(integrity_before.stdout), 'integrityAfter': json.loads(integrity_after.stdout),
              'scope': {'core': 'core SDK busy/phase/schema/discovery/dependency/recovery and 100 code dispatches; NOT full R4 acceptance',
                        'delm': 'installed DeLM via Store/HTTP/SDK/native ToolTask and isolated Python board; NOT full R4 acceptance',
                        'resources': '20 post-warmup installed MCP swaps, native calls and post-quiescence OS census; RSS/retention attribution and full ISC-70 remain separate'}[args.probe],
              'productionActivation': 'NOT RUN'}
    (root / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))
    return 0 if result['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
