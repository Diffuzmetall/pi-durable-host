#!/usr/bin/env python3
"""Disposable artifact tests; no installed releases, credentials, or model calls."""
import ast
import hashlib
import importlib.util
import json
import subprocess
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('prepare-restart-candidate.py')


class Packaging(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location('candidate', SCRIPT)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.temp = tempfile.TemporaryDirectory(prefix='alice-packaging-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.base, self.repo, self.out = (self.root / n for n in ['base', 'repo', 'candidate'])
        for directory in ['node_modules', 'compiled']:
            (self.base / directory).mkdir(parents=True)
        (self.base / 'compiled/bindings.mjs').write_text('export const fixture = true;\n')
        (self.base / 'package-lock.json').write_text('{}\n')
        # Reproduce delivery-recovery: an engine symlink into another release.
        engine = self.root / 'previous-engine'
        engine.mkdir()
        (engine / 'index.js').write_text('export const fixture = true;\n')
        (engine / 'protocol.js').write_text('export const protocol = 2;\n')
        (engine / 'package.json').write_text('{"type":"module"}\n')
        (self.base / 'delm-engine').symlink_to(engine, target_is_directory=True)
        packages = [(f'apps/{app}', package) for app, package in self.module.PACKAGES.items()]
        packages.append(('packages/durable-reload', '@local/pi-durable-reload'))
        for directory, package in packages:
            folder = self.repo / directory
            (folder / 'dist').mkdir(parents=True)
            (folder / 'src').mkdir()
            (folder / 'src/index.ts').write_text('export const fixture = true;\n')
            (folder / 'dist/index.js').write_text('export const fixture = true;\n')
            manifest = '{"name":' + json.dumps(package) + ',"type":"module","dependencies":{}}\n'
            if package == '@local/pi-durable-reload':
                manifest = json.dumps({'name': package, 'type': 'module', 'dependencies': {},
                                       'exports': {'.': './dist/index.js'}})
            (folder / 'package.json').write_text(manifest)
            (folder / 'package-lock.json').write_text('{}\n')
            installed = self.base / 'node_modules' / (
                'dpi-backend/node_modules/@local/pi-durable-reload'
                if package == '@local/pi-durable-reload' else package)
            installed.mkdir(parents=True)
            (installed / 'package.json').write_text(manifest)
            if package == '@local/pi-durable-reload':
                (installed / 'dist').mkdir()
                (installed / 'dist/old-only.js').write_text('throw Error("STALE");')
                (folder / 'dist/index.js').write_text('export const freshness = "R4";\n')
        wrappers = self.repo / 'experiments/sdk-host-cutover'
        wrappers.mkdir(parents=True)
        for name in self.module.WRAPPERS:
            (wrappers / name).write_text('// isolated fixture\n')
        (self.base / 'compiled/nico.mjs').write_text('export const generation="old";\n')
        self.nico = self.repo / 'experiments/hot-update-20261101/mcp-source/build-observer'
        (self.nico / 'licenses').mkdir(parents=True)
        (self.nico / 'licenses/fixture-LICENSE').write_text('synthetic license\n')
        (self.nico / 'nico.mjs').write_text('export const generation="corrected";\n')
        (self.nico / 'nico.mjs.LEGAL.txt').write_text('synthetic legal notice\n')
        (self.nico / 'PROVENANCE.json').write_text(json.dumps({
            'bundle': {'sha256': self.module.digest(self.nico / 'nico.mjs')}}))
        # Synthetic artifact pins are local to this imported recipe instance.
        self.module.NICO_SHA256 = self.module.digest(self.nico / 'nico.mjs')
        self.module.NICO_PROVENANCE_SHA256 = self.module.digest(self.nico / 'PROVENANCE.json')
        self.base.chmod(0o500)
        self.addCleanup(self.unseal)

    def unseal(self):
        for path in [self.root, *self.root.rglob('*')]:
            if not path.is_symlink():
                path.chmod(0o700 if path.is_dir() else 0o600)

    def test_physical_engine_manifest_and_sealed_files(self):
        self.module.stage(self.base, self.out, self.repo)
        self.assertNotEqual((self.base / 'delm-engine/index.js').resolve(), self.base / 'delm-engine/index.js')
        engine = self.out / 'delm-engine/index.js'
        self.assertEqual(engine.resolve(), engine)
        self.assertFalse((self.out / 'delm-engine').is_symlink())
        manifest = json.loads((self.out / 'RESTART-CANDIDATE.json').read_text())
        self.assertFalse(manifest['activated'])
        self.assertEqual(set(manifest['builds']), set(self.module.PACKAGES.values()) | {'@local/pi-durable-reload'})
        for name, item in manifest['files'].items():
            path = self.out / name
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), item['sha256'])
            self.assertEqual(path.stat().st_mode & 0o222, 0)
            self.assertEqual(path.stat().st_uid, item['uid'])
        self.assertIn('apps/dpi-backend/package-lock.json', manifest['sourceFiles'])

    def test_fresh_physical_local_package_replaces_stale_copy_without_touching_inputs(self):
        self.module.stage(self.base, self.out, self.repo)
        target = self.out / 'node_modules/dpi-backend/node_modules/@local/pi-durable-reload'
        self.assertFalse((self.out / 'node_modules/@local/pi-durable-reload').exists())
        self.assertFalse((target / 'dist/old-only.js').exists())
        self.assertEqual((target / 'dist/index.js').read_text(), 'export const freshness = "R4";\n')
        self.assertTrue((self.base / 'node_modules/dpi-backend/node_modules/@local/pi-durable-reload/dist/old-only.js').is_file())
        result = subprocess.run(['node', '--input-type=module', '-e',
                                 "const m=await import('@local/pi-durable-reload');console.log(m.freshness)"],
                                cwd=self.out / 'node_modules/dpi-backend',
                                capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), 'R4')
        manifest = json.loads((self.out / 'RESTART-CANDIDATE.json').read_text())
        for name in ['src/index.ts', 'dist/index.js', 'package.json', 'package-lock.json']:
            self.assertIn('packages/durable-reload/' + name, manifest['sourceFiles'])

    def test_installed_qa_fixture_hashes_are_frozen_without_runtime_state(self):
        runner = SCRIPT.parents[2] / 'experiments/hot-update-20261101/qa/installed-regressions.py'
        declarations = {node.targets[0].id: ast.literal_eval(node.value)
                        for node in ast.parse(runner.read_text()).body
                        if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name)
                        and node.targets[0].id in ['FIXTURES', 'ROLLBACK_FIXTURES']}
        names = ['apps/dpi-backend/tests/' + name for name in declarations['FIXTURES']]
        names.extend(declarations['ROLLBACK_FIXTURES'])
        for name in names:
            path = self.repo / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('// synthetic QA fixture: ' + name + '\n')
        private = self.repo / 'apps/dpi-backend/tests/private-state.json'
        private.write_text('{"synthetic":"not a code input"}')
        self.module.stage(self.base, self.out, self.repo)
        manifest = json.loads((self.out / 'RESTART-CANDIDATE.json').read_text())
        for name in names:
            self.assertEqual(manifest['sourceFiles'][name], self.module.digest(self.repo / name))
        self.assertNotIn('apps/dpi-backend/tests/private-state.json', manifest['sourceFiles'])

    def test_local_dependency_delta_is_refused_before_creating_candidate(self):
        path = self.repo / 'packages/durable-reload/package.json'
        value = json.loads(path.read_text())
        value['dependencies']['unapproved'] = '1.0.0'
        path.write_text(json.dumps(value))
        with self.assertRaises(ValueError):
            self.module.stage(self.base, self.out, self.repo)
        self.assertFalse(self.out.exists())

    def test_real_adapter_accepts_physical_module_and_rejects_alias(self):
        wrappers = self.repo / 'experiments/sdk-host-cutover'
        (wrappers / 'delm-profile.mjs').write_bytes(SCRIPT.with_name('delm-profile.mjs').read_bytes())
        # This test covers physical path admission only. Native/Jiti behavior has
        # its own real Host/SDK sandbox suite; this fixture deliberately substitutes it.
        backend = self.repo / 'apps/dpi-backend'
        descriptor = json.loads((backend / 'package.json').read_text())
        descriptor['exports'] = {'./native-profile': './dist/fixture-loader.js'}
        (backend / 'package.json').write_text(json.dumps(descriptor))
        (backend / 'dist/fixture-loader.js').write_text(
            "import {createRequire} from 'node:module';\n"
            "const require=createRequire(import.meta.url);\n"
            "export const loadFreshModule=path=>require(path);\n")
        (self.root / 'previous-engine/index.js').write_text(
            "export const DelmWaitDoc = {kind:'delm.waits',definition:{kind:'delm.waits'}};\n"
            "export function createDelmWait(){return {name:'fixture',tools:[]};}\n")
        self.module.stage(self.base, self.out, self.repo)
        probe = r'''
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,symlinkSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const [root,candidate] = process.argv.slice(1);
const {attachDelm} = await import(pathToFileURL(join(candidate,'delm-profile.mjs')));
const run=join(root,'run'), workspace=join(root,'workspace');
mkdirSync(run); mkdirSync(workspace); mkdirSync(join(run,'alice'));
writeFileSync(join(run,'config.json'),JSON.stringify({actors:{alice:'synthetic'},workspace}));
const bindingFile=join(root,'bindings.json');
writeFileSync(bindingFile,JSON.stringify({version:1,sessions:{s:{run,actor:'alice',workspace,enabled:true}}}),{mode:0o600});
const composition=()=>{const extensions=[];return {registry:{install(e){extensions.push(e);}},extensions,documentReaders:new Map(),admitInput:async()=>{},shutdown:async()=>{}};};
const context={sessionId:'s',cwd:workspace};
const modulePath=join(candidate,'delm-engine/index.js');
const good=composition(); await attachDelm(good,context,{bindingFile,modulePath});
assert.equal(good.extensions.length,1);
const alias=join(root,'alias.mjs'); symlinkSync(modulePath,alias);
await assert.rejects(()=>attachDelm(composition(),context,{bindingFile,modulePath:alias}),/DELM_BINDING_DENIED/);
console.log('PHYSICAL_PASS SYMLINK_DENIED');
'''
        result = subprocess.run(['node', '--input-type=module', '-e', probe, str(self.root), str(self.out)],
                                capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('PHYSICAL_PASS SYMLINK_DENIED', result.stdout)

    def test_existing_destination_and_alias_refused_without_mutation(self):
        self.out.mkdir()
        sentinel = self.out / 'sentinel'
        sentinel.write_text('unchanged')
        with self.assertRaises(ValueError):
            self.module.stage(self.base, self.out, self.repo)
        self.assertEqual(sentinel.read_text(), 'unchanged')
        alias = self.root / 'alias'
        alias.symlink_to(self.base, target_is_directory=True)
        with self.assertRaises(ValueError):
            self.module.stage(self.base, alias / 'new', self.repo)

    def test_external_dependency_symlink_refused(self):
        (self.base / 'node_modules/escape').symlink_to(self.root / 'previous-engine', target_is_directory=True)
        with self.assertRaises(ValueError):
            self.module.stage(self.base, self.out, self.repo)
        self.assertFalse(self.out.exists())

    def test_gippity_private_closure_keeps_one_shared_durable(self):
        voice = self.repo / 'experiments/gippity-voice'
        modules = voice / 'node_modules'
        (modules / 'voice-dependency').mkdir(parents=True)
        (modules / 'voice-dependency/index.js').write_text('export const fixture=true;')
        # The source's excluded shared alias can still point at the original
        # release while the selected dependency base is its sealed copy.
        shared = self.root / 'excluded-original-shared'
        shared.mkdir()
        (self.base / 'node_modules/@earendil-works').mkdir()
        (modules / '@earendil-works').symlink_to(shared, target_is_directory=True)
        (modules / '.bin').symlink_to(self.root / 'excluded-missing-bin', target_is_directory=True)
        for name in ['operational-profile.mjs', 'integration.mjs', 'audio-host.mjs']:
            (voice / name).write_text('// fixture')
        for name in ['package.json', 'package-lock.json']:
            (voice / name).write_text('{}')
        (voice / 'activate.mjs').write_text('throw Error("must not ship activation");')
        self.module.stage(self.base, self.out, self.repo)
        self.assertTrue((self.out / 'gippity/node_modules/voice-dependency/index.js').is_file())
        self.assertFalse((self.out / 'gippity/node_modules/@earendil-works').exists())
        self.assertFalse((self.out / 'gippity/activate.mjs').exists())
        self.assertEqual((self.out / 'gippity/audio-host.mjs').read_text(), '// fixture')
        manifest = json.loads((self.out / 'RESTART-CANDIDATE.json').read_text())
        self.assertIn('experiments/gippity-voice/audio-host.mjs', manifest['sourceFiles'])
        self.assertTrue((self.out / 'node_modules/@earendil-works').is_dir())

    def test_copied_gippity_external_dependency_is_still_refused(self):
        voice = self.repo / 'experiments/gippity-voice'
        modules = voice / 'node_modules'
        modules.mkdir(parents=True)
        (voice / 'integration.mjs').write_text('// synthetic fixture')
        (voice / 'package.json').write_text('{}')
        (voice / 'package-lock.json').write_text('{}')
        (modules / 'private-escape').symlink_to(self.root / 'previous-engine', target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'EXTERNAL_GIPPITY_LINK_REFUSED'):
            self.module.stage(self.base, self.out, self.repo)
        self.assertFalse(self.out.exists())

    def test_corrected_nico_overlay_keeps_base_and_records_provenance(self):
        original = (self.base / 'compiled/nico.mjs').read_bytes()
        self.module.stage(self.base, self.out, self.repo)
        self.assertEqual((self.out / 'compiled/nico.mjs').read_bytes(),
                         (self.nico / 'nico.mjs').read_bytes())
        self.assertEqual((self.base / 'compiled/nico.mjs').read_bytes(), original)
        self.assertEqual((self.out / 'compiled/NICO-PROVENANCE.json').read_bytes(),
                         (self.nico / 'PROVENANCE.json').read_bytes())
        self.assertTrue((self.out / 'compiled/nico-dependency/licenses/fixture-LICENSE').is_file())
        manifest = json.loads((self.out / 'RESTART-CANDIDATE.json').read_text())
        self.assertEqual(manifest['nicoBuild']['sha256'], self.module.NICO_SHA256)
        self.assertEqual(manifest['nicoBuild']['provenanceSha256'], self.module.NICO_PROVENANCE_SHA256)
        self.assertIn('build-observer', manifest['nicoBuild']['source'])
        for path in self.nico.rglob('*'):
            if path.is_file():
                self.assertEqual(manifest['sourceFiles'][str(path.relative_to(self.repo))],
                                 self.module.digest(path))

    def test_modified_or_missing_nico_refused_before_destination_creation(self):
        for name in ['nico.mjs', 'PROVENANCE.json', 'nico.mjs.LEGAL.txt']:
            path = self.nico / name
            original = path.read_bytes()
            path.unlink()
            with self.assertRaises((ValueError, FileNotFoundError)):
                self.module.stage(self.base, self.out, self.repo)
            self.assertFalse(self.out.exists())
            path.write_bytes(original)
        for name in ['nico.mjs', 'PROVENANCE.json']:
            path = self.nico / name
            original = path.read_bytes()
            path.write_bytes(original + b' ')
            with self.assertRaises(ValueError):
                self.module.stage(self.base, self.out, self.repo)
            self.assertFalse(self.out.exists())
            path.write_bytes(original)

    def test_dependency_change_requires_explicit_rebuild(self):
        path = self.repo / 'apps/dpi-sdk/package.json'
        value = json.loads(path.read_text())
        value['dependencies']['not-installed'] = '1.0.0'
        path.write_text(json.dumps(value))
        with self.assertRaises(ValueError):
            self.module.stage(self.base, self.out, self.repo)
        self.assertFalse(self.out.exists())


if __name__ == '__main__':
    unittest.main()
