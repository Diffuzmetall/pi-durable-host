#!/usr/bin/env python3
"""Record installed dependency provenance and the physical sandbox import result."""
import hashlib
import json
from pathlib import Path
import shutil

REPO = Path(__file__).resolve().parents[3]
PACKAGING = REPO / 'experiments/durable-module-20261102/packaging'
ROOT = Path('/tmp/pi-host-dm1-build-20261102-alice-v1')
SANDBOX = Path('/tmp/hot-update-sandbox-525_6qjw')
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
probe = json.loads((SANDBOX / 'work/closure-imports.json').read_text())
assert probe['status'] == 'PASS_DEPENDENCY_IMPORTS_ONLY'
assert len(probe['resolutions']) == 15
assert 'SANDBOX_NEGATIVE_SELF_CHECK_PASS' in (SANDBOX / 'run.log').read_text()
shutil.copyfile(ROOT / 'package-lock.json', PACKAGING / 'target-manifests/package-lock.json')
lock = json.loads((ROOT / 'package-lock.json').read_text())
locked = [{'path': path, 'version': metadata.get('version'), 'resolved': metadata.get('resolved'), 'integrity': metadata.get('integrity')} for path, metadata in lock['packages'].items() if not metadata.get('link')]
summary = {
    'status': 'COMPONENT_VERIFIED_DEPENDENCY_CLOSURE_NOT_ACCEPTED',
    'root': str(ROOT), 'lockSha256': sha(ROOT / 'package-lock.json'),
    'install': {'exitCode': 0, 'log': str(ROOT / 'logs/npm-install-config-fixed.log'), 'logSha256': sha(ROOT / 'logs/npm-install-config-fixed.log'), 'scripts': 'disabled'},
    'sandbox': {'root': str(SANDBOX), 'exitCode': 0, 'negativeIsolation': 'PASS', 'imports': probe, 'resultSha256': sha(SANDBOX / 'work/closure-imports.json')},
    'targetManifestHashes': {str(path.relative_to(PACKAGING / 'target-manifests')): sha(path) for path in sorted((PACKAGING / 'target-manifests').rglob('package.json'))},
    'lockedPackages': locked,
    'preliminaryFailures': [
        {'log': str(ROOT / 'logs/npm-install.log'), 'cause': 'npm refuses same /dev/null as user/global config; corrected to two distinct empty isolated files'},
        {'sandbox': '/tmp/hot-update-sandbox-visqe_qr', 'cause': 'Probe incorrectly expected Harness function; actual upstream declaration exposes Harness.open; probe corrected, no product changes'},
    ],
    'notRun': ['backend/reload1.5 build', 'D1 roundtrip', 'full native profile', 'third-party compatibility', 'migration/release-return', 'DM-A–G final acceptance'],
    'productionActivation': 'NOT RUN',
}
(PACKAGING / 'QUALIFICATION.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k: v for k, v in summary.items() if k not in {'lockedPackages', 'sandbox'}}, ensure_ascii=False, indent=2))
print('Resolved imports:', len(probe['resolutions']), 'locked packages:', len(locked))
print('QUALIFICATION SHA256', sha(PACKAGING / 'QUALIFICATION.json'))
