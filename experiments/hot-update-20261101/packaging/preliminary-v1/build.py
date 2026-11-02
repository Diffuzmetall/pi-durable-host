#!/usr/bin/env python3
"""Bounded offline build of a preliminary artifact; never activates a release."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile

REPO = Path(__file__).resolve().parents[4]
OUTPUT = Path(__file__).resolve().parent
BASE = Path('/tmp/pi-host-restart-candidate-20261101-alice-v2')
DEST = Path('/tmp/pi-host-hot-update-preliminary-20261101-alice-v1')
BASE_MANIFEST = '672b7e5e746dcabfbf5ca82a571cd35f328e457f717b64e2b852b3afa3931665'


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    if DEST.exists() or DEST.is_symlink():
        raise SystemExit('NEW_PRELIMINARY_PATH_REQUIRED')
    if sha(BASE / 'RESTART-CANDIDATE.json') != BASE_MANIFEST:
        raise SystemExit('PREVIOUS_MANIFEST_CHANGED')
    evidence = Path(tempfile.mkdtemp(prefix='alice-preliminary-build-'))
    (evidence / 'home').mkdir()
    env = {'PATH': os.environ['PATH'], 'HOME': str(evidence / 'home'),
           'LANG': 'C.UTF-8', 'npm_config_offline': 'true',
           'npm_config_cache': str(evidence / 'npm-cache')}
    # Retain previous generated outputs; never reset source or installed dependencies.
    with tarfile.open(evidence / 'dist-before.tar.gz', 'w:gz') as archive:
        for name in ['packages/durable-reload', 'apps/dpi-sdk', 'apps/dpi-backend', 'apps/terminal-adapter']:
            archive.add(REPO / name / 'dist', arcname=name + '/dist')
    backend = OUTPUT / 'backend.tsconfig.json'
    terminal = OUTPUT / 'terminal.tsconfig.json'
    backend.write_text(json.dumps({
        'extends': str(REPO / 'apps/dpi-backend/tsconfig.build.json'),
        'compilerOptions': {
            'typeRoots': [str(REPO / 'apps/dpi-backend/node_modules/@types')],
            'paths': {'@local/pi-durable-reload': [
                str(REPO / 'packages/durable-reload/dist/index.d.ts')]}}
    }, indent=2) + '\n')
    terminal.write_text(json.dumps({
        'extends': str(REPO / 'apps/terminal-adapter/tsconfig.build.json'),
        'compilerOptions': {
            'typeRoots': [str(REPO / 'apps/terminal-adapter/node_modules/@types')],
            'paths': {
            'dpi-sdk': [str(REPO / 'apps/dpi-sdk/dist/client.d.ts')],
            'dpi-sdk/*': [str(REPO / 'apps/dpi-sdk/dist/*.d.ts')]}}
    }, indent=2) + '\n')
    # Asset copying uses the package's existing build script, not a parallel recipe.
    terminal_assets = json.loads((REPO / 'apps/terminal-adapter/package.json').read_text())['scripts']['build'].split(' && ', 1)[1]
    commands = [
        ('reload', ['npm', '--prefix', 'packages/durable-reload', 'run', 'build'], REPO),
        ('sdk', ['npm', '--prefix', 'apps/dpi-sdk', 'run', 'build'], REPO),
        ('backend-types', ['node', 'node_modules/typescript/bin/tsc', '-p', str(backend)], REPO / 'apps/dpi-backend'),
        ('backend-assets', ['node', 'scripts/build.mjs'], REPO / 'apps/dpi-backend'),
        ('terminal-types', ['node', 'node_modules/typescript/bin/tsc', '-p', str(terminal)], REPO / 'apps/terminal-adapter'),
        ('terminal-assets', ['bash', '-c', terminal_assets], REPO / 'apps/terminal-adapter'),
    ]
    results = []
    for name, argv, cwd in commands:
        logfile = evidence / (name + '.log')
        with logfile.open('wb') as log:
            result = subprocess.run(argv, cwd=cwd, env=env, stdout=log,
                                    stderr=subprocess.STDOUT, timeout=180, check=False)
        results.append({'name': name, 'argv': argv, 'cwd': str(cwd),
                        'exitCode': result.returncode, 'log': str(logfile)})
        (OUTPUT / 'build-results.json').write_text(json.dumps(results, indent=2) + '\n')
        print(json.dumps(results[-1]), flush=True)
        if result.returncode:
            print(logfile.read_text()[-10000:], flush=True)
            raise SystemExit(result.returncode)
    recipe = REPO / 'experiments/sdk-host-cutover/prepare-restart-candidate.py'
    spec = importlib.util.spec_from_file_location('restart_packaging', recipe)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    manifest = module.stage(BASE, DEST, REPO)
    # Finalize unpublished metadata once, before publishing this immutable snapshot.
    manifest['status'] = 'PRELIMINARY_NOT_ACCEPTED'
    manifest['purpose'] = 'Early isolated QA input; not PDH-21 final candidate'
    manifest['previousManifestSha256'] = BASE_MANIFEST
    manifest['checksNotRun'] = [
        'Positive full Host release-return / previous complete profile compatibility',
        'Final same-manifest independent source review',
        'Final installed U01-U20 / ISC-46-78 acceptance',
        'Combined 100 code swaps / 20 resources and full ISC-70 OS/heap census',
        'Independent hot rollback and release rollback against this manifest',
        'Production activation and operator-only auth incident check',
    ]
    manifest['buildCommands'] = results
    for path in [Path(__file__).resolve(), backend, terminal, recipe, OUTPUT / 'build-results.json']:
        manifest['sourceFiles'][str(path.relative_to(REPO))] = sha(path)
    target = DEST / 'RESTART-CANDIDATE.json'
    target.chmod(0o600)
    target.write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n')
    target.chmod(0o400)
    if sha(BASE / 'RESTART-CANDIDATE.json') != BASE_MANIFEST:
        raise SystemExit('PREVIOUS_MANIFEST_CHANGED')
    summary = {'candidate': str(DEST), 'status': manifest['status'],
               'manifestSha256': sha(target), 'files': len(manifest['files']),
               'sourceFiles': len(manifest['sourceFiles']), 'buildEvidence': str(evidence),
               'previousManifestSha256': BASE_MANIFEST, 'productionActivation': 'NOT RUN'}
    (OUTPUT / 'artifact.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps(summary), flush=True)


if __name__ == '__main__':
    os.umask(0o077)
    main()
