"""Rebind reviewed test fixtures to Alice's sealed compiled candidate, never rebuild.
Run inside isolated bwrap with hidden host HOME and no network beyond loopback.
Only imports/child entry paths change; test bodies and assertions stay unchanged.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument('--candidate', required=True, type=Path)
parser.add_argument('--repo', required=True, type=Path)
args = parser.parse_args()
candidate = args.candidate.resolve(strict=True)
repo = args.repo.resolve(strict=True)
root = Path(tempfile.mkdtemp(prefix='heidi-candidate-regressions-'))
(root / 'node_modules').symlink_to(candidate / 'node_modules', target_is_directory=True)
backend = candidate / 'node_modules/dpi-backend/dist/dpi-backend/src'
terminal = candidate / 'node_modules/dpi-terminal-adapter/dist'
fixtures = {
    'native-automation.test.mjs': 'apps/dpi-backend/tests/native-automation.test.mjs',
    'submit-recovery.test.mts': 'apps/terminal-adapter/tests/submit-recovery.test.mts',
    'remote-controller.test.mts': 'apps/terminal-adapter/tests/remote-controller.test.mts',
    'helpers.ts': 'apps/dpi-backend/tests/helpers.ts',
}
hashes = {}
for name, relative in fixtures.items():
    original = (repo / relative).read_text()
    text = original
    target = backend if relative.startswith('apps/dpi-backend/') else terminal
    # Only literal fixture module specifiers become candidate file URLs.
    text = re.sub(r'([\'\"])\.\./src/([^\'\"]+)\1',
                  lambda m: m[1] + (target / re.sub(r'\.ts$', '.js', m[2])).as_uri() + m[1], text)
    text = text.replace('"../../dpi-backend/tests/helpers.js"', '"./helpers.ts"')
    if name == 'helpers.ts':
        old = '["--import", "tsx", resolve(import.meta.dirname, ' + json.dumps((backend / 'main.js').as_uri()) + '),'
        assert old in text
        text = text.replace(old, '[' + json.dumps(str(backend / 'main.js')) + ',')
        text = text.replace('opts.cwd ?? resolve(import.meta.dirname, "..")', 'opts.cwd ?? ' + json.dumps(str(candidate)))
    (root / name).write_text(text)
    hashes[relative] = {'originalSha256': hashlib.sha256(original.encode()).hexdigest(),
                        'adaptedSha256': hashlib.sha256(text.encode()).hexdigest()}
home = root / 'home'
home.mkdir()
env = {k: v for k, v in os.environ.items() if k in ('PATH', 'LANG')}
env.update(HOME=str(home), PI_CODING_AGENT_DIR=str(home / 'agent'), TERM='xterm-256color')
command = ['node', '--experimental-transform-types', '--test', '--test-reporter=tap',
           str(root / 'native-automation.test.mjs'), str(root / 'submit-recovery.test.mts'),
           str(root / 'remote-controller.test.mts')]
with (root / 'test.log').open('wb') as log:
    result = subprocess.run(command, cwd=root, env=env, stdout=log, stderr=log, timeout=90)
lines = (root / 'test.log').read_text().splitlines()
summary = [line for line in lines if re.match(r'^(?:not ok|ok |# (?:tests|pass|fail|duration_ms))', line)]
report = {'result': 'PASS' if result.returncode == 0 else 'FAIL', 'exitCode': result.returncode,
          'candidate': str(candidate), 'evidence': str(root), 'command': command,
          'fixtureHashes': hashes, 'summary': summary, 'productionActivation': 'NOT RUN'}
(root / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
raise SystemExit(result.returncode)
