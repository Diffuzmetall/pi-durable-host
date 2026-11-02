#!/usr/bin/env python3
"""Replay frozen author regressions against installed products, with no source alias.
Supplementary regressions only: their PASS never substitutes for independent U/ISC observations.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

FIXTURES = [
    'hot-update-core.test.mjs', 'hot-update-compatibility.test.mjs', 'hot-update-trusted.test.mjs',
    'profile-reload.test.mjs', 'provider-hot-reload.test.mjs', 'native-skills-reload.test.ts',
    'native-skills.test.ts', 'native-goal-operator.test.mjs', 'native-memory-reload.test.mjs',
    'hot-update-mcp-profile.test.mjs', 'hot-update-memory-profile.test.mjs',
    'hot-update-resource-lifecycle.test.mjs', 'hot-update-shared-modules.test.mjs',
]

BACKEND_SUPPORT = ['apps/dpi-backend/tests/helpers.ts']

ROLLBACK_FIXTURES = ['experiments/hot-update-20261101/packaging/artifact-selection.test.mjs',
                     'experiments/hot-update-20261101/packaging/artifact-native.test.mjs']


def adapt(source, candidate):
    """Change literal product module locations only, never assertions or test behavior."""
    roots = {
        '../src/': candidate / 'node_modules/dpi-backend/dist/dpi-backend/src',
        '../../dpi-sdk/src/': candidate / 'node_modules/dpi-sdk/dist',
        '../../terminal-adapter/src/': candidate / 'node_modules/dpi-terminal-adapter/dist',
        '../../sdk-host-cutover/': candidate,
        '../../../experiments/sdk-host-cutover/': candidate,
        '../../../experiments/hot-update-20261101/mcp-source/build-observer/': candidate / 'compiled',
        '../../../packages/durable-reload/src/': candidate / 'node_modules/dpi-backend/node_modules/@local/pi-durable-reload/dist',
    }
    def replace(match):
        quote, relative = match.groups()
        for prefix, target in roots.items():
            if relative.startswith(prefix):
                suffix = re.sub(r'\.ts$', '.js', relative[len(prefix):])
                return quote + (target / suffix).as_uri() + quote
        return match.group(0)
    result = re.sub(r'''(['"])(\.\./[^'"\n]+)\1''', replace, source)
    reload_entry = (candidate / 'node_modules/dpi-backend/node_modules/@local/pi-durable-reload/dist/index.js').as_uri()
    result = re.sub(r'''(['"])@local/pi-durable-reload\1''', lambda match: match[1] + reload_entry + match[1], result)
    # Node executes the frozen TypeScript helper directly, not an absent build output.
    result = re.sub(r'''(['"])\./helpers\.js\1''', lambda match: match[1] + './helpers.ts' + match[1], result)
    # The rollback fixture copies the real CLI, not a moving-checkout implementation.
    result = result.replace('/repo/experiments/sdk-host-cutover/', '/candidate/')
    # Inspect real imports, not import-like text inside generated fixture modules.
    # Use the existing build compiler as a parser only; never execute fixture code.
    compiler = Path(__file__).resolve().parents[3] / 'apps/dpi-backend/node_modules/typescript'
    parsed = subprocess.run(['node', '-e', r'''
const ts = require(process.argv[1]);
const source = ts.createSourceFile('fixture.ts', require('node:fs').readFileSync(0, 'utf8'), ts.ScriptTarget.Latest, true);
if (source.parseDiagnostics.length) throw new Error('QA_ADAPTER_PARSE_FAILED');
const imports = [];
function visit(node) {
  if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) imports.push(node.arguments[0].text);
  ts.forEachChild(node, visit);
}
visit(source);
console.log(JSON.stringify(imports));
''', str(compiler)], input=result, capture_output=True, text=True, timeout=10, check=True)
    unresolved = [path for path in json.loads(parsed.stdout) if path.startswith('../')]
    assert not unresolved, f'Unmapped relative test dependency: {unresolved}'
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True, type=Path)
    parser.add_argument('--digest', required=True)
    parser.add_argument('--suite', choices=['backend', 'rollback'], default='backend')
    args = parser.parse_args()
    assert os.environ.get('HOME') == '/scratch/home', 'Sandbox only; no live fallback'
    check = json.loads(Path('/scratch/sandbox-check.json').read_text())
    assert check['status'] == check['child'] == 'PASS'
    assert os.environ.get('ARTIFACT_SOURCE') != '1', 'Source alias mode forbidden for installed QA'
    candidate, repo = Path('/candidate'), Path('/repo')
    assert args.manifest.resolve(strict=True).parent == candidate
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location('manifest', Path(__file__).with_name('candidate-manifest.py'))
    manifest = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(manifest)
    integrity_before = manifest.verify(candidate, args.manifest, args.digest)
    frozen = json.loads(args.manifest.read_text())['sourceFiles']
    root = Path(tempfile.mkdtemp(prefix='heidi-installed-regressions-', dir='/scratch/tmp'))
    (root / 'node_modules').symlink_to(candidate / 'node_modules', target_is_directory=True)
    report = {'status': 'FAIL', 'candidateDigest': args.digest, 'scope': 'supplementary frozen author regressions; not independent product acceptance',
              'fixtures': {}, 'qaRunnerSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'integrityBefore': integrity_before, 'productionActivation': 'NOT RUN'}
    try:
        fixtures = ROLLBACK_FIXTURES if args.suite == 'rollback' else ['apps/dpi-backend/tests/' + name for name in FIXTURES]
        report['suite'] = args.suite
        for relative in [*fixtures, *(BACKEND_SUPPORT if args.suite == 'backend' else [])]:
            name = Path(relative).name
            original = (repo / relative).read_bytes()
            digest = hashlib.sha256(original).hexdigest()
            assert frozen.get(relative) == digest, f'Test source differs from final source freeze: {relative}'
            adapted = adapt(original.decode(), candidate)
            (root / name).write_text(adapted)
            report['fixtures'][relative] = {'originalSha256': digest, 'adaptedSha256': hashlib.sha256(adapted.encode()).hexdigest()}
        entries = fixtures[-1:] if args.suite == 'rollback' else fixtures
        command = ['node', '--experimental-transform-types', '--experimental-import-meta-resolve', '--test', '--test-concurrency=1', '--test-reporter=tap',
                   *[str(root / Path(relative).name) for relative in entries]]
        report['command'] = command
        with (root / 'test.log').open('wb') as log:
            # Generated provider fixtures inherit a parent with installed node_modules.
            # Leaving TMPDIR at /scratch/tmp strands their bare package imports.
            report['fixtureTmpdir'] = str(root)
            result = subprocess.run(command, cwd=root, env=dict(os.environ, TMPDIR=str(root)),
                                    stdout=log, stderr=subprocess.STDOUT, timeout=240)
        report['exitCode'] = result.returncode
        summary = [line for line in (root / 'test.log').read_text().splitlines() if re.match(r'^(?:not ok|ok |# (?:tests|pass|fail|skipped|duration_ms))', line)]
        report['summary'] = summary
        report['status'] = 'PASS' if result.returncode == 0 else 'FAIL'
    except Exception as error:
        report['error'] = str(error)
    finally:
        try:
            report['integrityAfter'] = manifest.verify(candidate, args.manifest, args.digest)
        except Exception as error:
            report.update(status='FAIL', integrityError=str(error))
        (root / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps({'status': report['status'], 'evidence': str(root), 'exitCode': report.get('exitCode'), 'error': report.get('error'), 'productionActivation': 'NOT RUN'}))
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
