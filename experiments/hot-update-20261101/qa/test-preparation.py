"""Tests of QA bookkeeping only. These fixtures are NOT product PASS evidence."""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(file))
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


gate = module('gate', 'evidence-gate.py')
manifest = module('manifest', 'candidate-manifest.py')
regressions = module('regressions', 'installed-regressions.py')


class Preparation(unittest.TestCase):
    def test_installed_probes_refuse_non_sandbox_before_product_import(self):
        qa = Path(__file__).resolve().parent
        with tempfile.TemporaryDirectory(prefix='heidi-qa-guard-selftest-') as home:
            env = {'PATH': os.environ['PATH'], 'HOME': home, 'LANG': 'C.UTF-8'}
            commands = [
                ['node', str(qa / 'installed-core.mjs')],
                ['node', str(qa / 'installed-delm.mjs')],
                ['node', str(qa / 'installed-resources.mjs')],
                ['node', str(qa / 'installed-pty-host.mjs'), str(Path(home) / 'info.json')],
                ['python3', str(qa / 'installed-pty.py'), '--manifest', '/candidate/RESTART-CANDIDATE.json', '--digest', 'a' * 64],
                ['python3', str(qa / 'installed-regressions.py'), '--manifest', '/candidate/RESTART-CANDIDATE.json', '--digest', 'a' * 64],
            ]
            for command in commands:
                with self.subTest(command=command):
                    result = subprocess.run(command, env=env, capture_output=True, text=True, timeout=10)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn('Sandbox only', result.stderr)
            self.assertEqual(list(Path(home).iterdir()), [], 'guard must fail before any private fixture mutation')

    def test_regression_adapter_maps_all_frozen_test_product_imports(self):
        repo = Path(__file__).resolve().parents[3]
        for name in regressions.FIXTURES:
            original = (repo / 'apps/dpi-backend/tests' / name).read_text()
            adapted = regressions.adapt(original, Path('/candidate'))
            self.assertIn('file:///candidate/node_modules/', adapted, name)
            self.assertNotIn('file:///repo/', adapted, name)
            if '../../../packages/durable-reload/src/' in original:
                self.assertIn((Path('/candidate/node_modules/dpi-backend/node_modules/@local/pi-durable-reload/dist').as_uri() + '/'), adapted, name)
                self.assertNotIn(Path('/candidate/node_modules/@local/pi-durable-reload').as_uri(), adapted, name)
            self.assertNotIn("from '@local/pi-durable-reload'", adapted, name)
            # Imports are rebound, but test cases/assertions are not removed.
            self.assertEqual(original.count('assert.'), adapted.count('assert.'))
            self.assertEqual(original.count('test('), adapted.count('test('))

    def test_frozen_typescript_helper_keeps_assertions_and_uses_installed_store(self):
        self.assertIn('apps/dpi-backend/tests/helpers.ts', regressions.BACKEND_SUPPORT)
        original = "import { until } from './helpers.js';\nassert.equal(1, 1);"
        self.assertEqual(regressions.adapt(original, Path('/candidate')),
                         "import { until } from './helpers.ts';\nassert.equal(1, 1);")
        repo = Path(__file__).resolve().parents[3]
        helper = regressions.adapt((repo / 'apps/dpi-backend/tests/helpers.ts').read_text(), Path('/candidate'))
        self.assertIn('file:///candidate/node_modules/dpi-backend/dist/dpi-backend/src/store.js', helper)

    def test_mcp_profile_uses_packaged_owner_and_corrected_nico(self):
        repo = Path(__file__).resolve().parents[3]
        original = (repo / 'apps/dpi-backend/tests/hot-update-mcp-profile.test.mjs').read_text()
        adapted = regressions.adapt(original, Path('/candidate'))
        self.assertIn("from 'file:///candidate/session-mcp.mjs'", adapted)
        self.assertIn("from 'file:///candidate/compiled/nico.mjs'", adapted)
        self.assertNotIn('mcp-source/', adapted)
        self.assertNotIn('experiments/sdk-host-cutover/', adapted)
        with self.assertRaisesRegex(AssertionError, 'Unmapped relative'):
            regressions.adapt("import {createMcpManager} from '../../../experiments/hot-update-20261101/mcp-source/build/nico.mjs';", Path('/candidate'))

    def test_installed_rollback_fixture_rebinds_all_product_helpers(self):
        repo = Path(__file__).resolve().parents[3]
        for relative in regressions.ROLLBACK_FIXTURES:
            original = (repo / relative).read_text()
            adapted = regressions.adapt(original, Path('/candidate'))
            self.assertNotIn('../../sdk-host-cutover/', adapted)
            self.assertNotIn('/repo/experiments/sdk-host-cutover/', adapted)
            self.assertIn('file:///candidate/native-artifact.mjs', adapted)
            self.assertEqual(original.count('assert.'), adapted.count('assert.'))
            self.assertEqual(original.count('test('), adapted.count('test('))

    def test_regression_adapter_rejects_unmapped_dependency(self):
        self.assertEqual(regressions.adapt("import { reloadDurable } from '@local/pi-durable-reload';", Path('/candidate')),
                         "import { reloadDurable } from '" + Path('/candidate/node_modules/dpi-backend/node_modules/@local/pi-durable-reload/dist/index.js').as_uri() + "';")
        with self.assertRaisesRegex(AssertionError, 'Unmapped relative'):
            regressions.adapt("import { surprise } from '../unreviewed/source.ts';", Path('/candidate'))

    def test_regression_import_check_distinguishes_generated_modules(self):
        generated = "writeFile('compiled/adapter.mjs', `import {version} from '../version.mjs';`);"
        self.assertEqual(regressions.adapt(generated, Path('/candidate')), generated)
        for source in ["import {version} from '../version.mjs';",
                       "export {version} from '../version.mjs';",
                       "async function load() { return import('../version.mjs'); }"]:
            with self.subTest(source=source), self.assertRaisesRegex(AssertionError, 'Unmapped relative'):
                regressions.adapt(source, Path('/candidate'))

    def test_fixed_corpus_covers_exactly_36_leaves(self):
        corpus = gate.corpus_check()
        self.assertEqual(len(corpus['cases']), 26)
        self.assertEqual(len(gate.LEAVES), 36)

    def test_missing_runtime_is_not_pass(self):
        digest = 'a' * 64
        evidence = {'candidateDigestBefore': digest, 'candidateDigestAfter': digest,
                    'productionActivation': 'NOT RUN', 'productionBaseline': {'pid': 1},
                    'productionFinal': {'pid': 1}, 'cases': []}
        result = gate.audit(evidence, digest, Path('/tmp'))
        self.assertEqual(result['status'], 'BLOCKED')
        self.assertEqual(len(result['open']), 26)

    def test_changed_artifact_is_rejected(self):
        with self.assertRaises(AssertionError):
            gate.audit({'candidateDigestBefore': 'a' * 64, 'candidateDigestAfter': 'b' * 64}, 'a' * 64, Path('/tmp'))

    def test_production_identity_mismatch_is_rejected(self):
        evidence = {'candidateDigestBefore': 'a' * 64, 'candidateDigestAfter': 'a' * 64,
                    'productionActivation': 'NOT RUN', 'productionBaseline': {'pid': 1},
                    'productionFinal': {'pid': 2}, 'cases': []}
        with self.assertRaises(AssertionError):
            gate.audit(evidence, 'a' * 64, Path('/tmp'))

    def test_real_file_integrity_membership_and_escape_checks(self):
        with tempfile.TemporaryDirectory(prefix='heidi-qa-manifest-selftest-') as directory:
            root = Path(directory) / 'artifact'
            root.mkdir()
            payload = root / 'module.mjs'
            payload.write_text('export const fixture = 1;\n')
            info = payload.stat()
            body = {'activated': False, 'files': {'module.mjs': {
                'sha256': manifest.sha256(payload), 'mode': oct(stat.S_IMODE(info.st_mode)), 'uid': info.st_uid}}}
            record = root / 'MANIFEST.json'
            record.write_text(json.dumps(body))
            digest = manifest.sha256(record)
            self.assertEqual(manifest.verify(root, record, digest)['files'], 1)
            payload.write_text('export const fixture = 2;\n')
            with self.assertRaisesRegex(AssertionError, 'Changed candidate file'):
                manifest.verify(root, record, digest)
            payload.write_text('export const fixture = 1;\n')
            extra = root / 'unlisted.mjs'
            extra.write_text('export default 3;')
            with self.assertRaisesRegex(AssertionError, 'membership mismatch'):
                manifest.verify(root, record, digest)
            extra.unlink()
            (root / 'escape').symlink_to(Path(directory))
            with self.assertRaisesRegex(AssertionError, 'External symlink'):
                manifest.verify(root, record, digest)

    def test_author_exit_zero_does_not_replace_observations(self):
        digest = 'a' * 64
        evidence = {'candidateDigestBefore': digest, 'candidateDigestAfter': digest,
                    'productionActivation': 'NOT RUN', 'productionBaseline': {'pid': 1},
                    'productionFinal': {'pid': 1}, 'cases': [{
                        'id': 'U01', 'status': 'PASS', 'candidateDigest': digest,
                        'reviewer': 'author', 'command': ['node', 'fixture.mjs'], 'exitCode': 0}]}
        with self.assertRaisesRegex(AssertionError, 'not independent QA'):
            gate.audit(evidence, digest, Path('/tmp'))

    def test_shrinking_assertions_is_rejected(self):
        digest = 'a' * 64
        evidence = {'candidateDigestBefore': digest, 'candidateDigestAfter': digest,
                    'productionActivation': 'NOT RUN', 'productionBaseline': {'pid': 1},
                    'productionFinal': {'pid': 1}, 'cases': [{
                        'id': 'U01', 'status': 'PASS', 'candidateDigest': digest,
                        'reviewer': 'heidi', 'command': ['node', 'fixture.mjs'], 'exitCode': 0,
                        'observations': []}]}
        with self.assertRaisesRegex(AssertionError, 'Shrunk assertion'):
            gate.audit(evidence, digest, Path('/tmp'))


if __name__ == '__main__':
    unittest.main()
