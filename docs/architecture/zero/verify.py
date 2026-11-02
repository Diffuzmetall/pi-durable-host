#!/usr/bin/env python3
"""Read-only checks of this research packet and its pinned source claims.
Not a runtime/package acceptance test. Does not import project or Zero code.
"""
from pathlib import Path
import re
import subprocess
import sys

packet = Path(__file__).resolve().parent
repo = packet.parents[2]
zero = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('/var/tmp/durable-zero-research-20261102-v070')
expected = 'b2e21df882a6a4426d0f469d2305b842522d37bd'
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=zero, text=True).strip() == expected
assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=zero, text=True).strip()

src = zero / 'packages/core/src'
index = (src / 'index.ts').read_text()
for module in ['runtime.ts', 'runtime-types.ts', 'extension-mount.ts', 'builtin-extensions/index.ts']:
    assert f'"./{module}"' in index, module
bundle = (zero / 'packages/core/dist/index.js').read_text()
exports = bundle[bundle.rfind('export {'):]
for name in ['openDurable', 'BuiltinExtensionRegistry', 'mountExtensionBridge', 'adaptExtensionTool']:
    assert re.search(r'\b' + name + r'\b', exports), name
print('SOURCE: pinned clean Zero; selected public exports present in source and shipped bundle.')

types = (src / 'runtime-types.ts').read_text()
options = types.split('export interface OpenDurableOptions {', 1)[1].split('\n}', 1)[0]
assert 'readonly builtins?' in options and 'readonly plugins?' in options
for absent in ['beforeCommit', 'beforeResume', 'env?:', 'storage?:', 'modelRuntime?:']:
    assert absent not in options, absent
engine_options = (src / 'engine.ts').read_text().split('export interface DurableEngineOptions {', 1)[1].split('\n}', 1)[0]
assert 'builtins' not in engine_options
runtime = (src / 'runtime.ts').read_text()
resume = runtime.index('harness.resume();')
assert runtime.index('return {', resume) > resume
loader = (src / 'runtime-loader.ts').read_text()
assert 'options.builtins ?? options.plugins' in loader
open_call = loader.split('harness = await Harness.open(', 1)[1].split('runtimeContext,', 1)[0]
assert 'beforeCommit' not in open_call
assert 'env: envs.env' in open_call
print('SOURCE: additive native seam exists; required injection options absent; resume occurs before return.')

native = (repo / 'apps/dpi-backend/src/durable/native-session.ts').read_text()
assert native.index('await configuration.lifecycle?.bind?.') < native.index('harness.resume();')
assert 'COMMIT_AUTHORIZATION_REVISION' in native and 'beforeCommit(context)' in native
profile = (repo / 'apps/dpi-backend/src/native-profile/profile.ts').read_text()
assert 'NATIVE_PROFILE_ORIGINAL_STORAGE_REQUIRED' in profile
assert 'await memory.bind({ session: value, storage, context: ctx })' in profile
print('SOURCE: Host requires bind-before-resume, original storage and native commit authorization.')

required = ['README.md', 'OBSERVE.md', 'THINK.md', 'ARCHITECTURE.md', 'EXTENSIONS.md', 'EVIDENCE.md']
links = 0
for name in required:
    text = (packet / name).read_text()
    assert text.startswith('# '), name
    assert len(re.findall(r'^```', text, re.M)) % 2 == 0, name
    for target in re.findall(r'\]\(([^)]+)\)', text):
        if target.startswith(('http://', 'https://', 'mailto:', '#')):
            continue
        path = target.split('#', 1)[0]
        assert (packet / path).exists(), (name, target)
        links += 1
print(f'DOCS: {len(required)} documents, balanced fences, {links} existing local links.')
print('PASS: research/source checks only; full Zero/Host/extension runtime acceptance NOT RUN.')
