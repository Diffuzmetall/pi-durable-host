#!/usr/bin/env python3
"""Copy a sealed dependency base and current builds into a NEW offline candidate."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys

PACKAGES = {'dpi-backend': 'dpi-backend', 'dpi-sdk': 'dpi-sdk',
            'terminal-adapter': 'dpi-terminal-adapter'}
WRAPPERS = ['operational-profile.mjs', 'operational-service.mjs', 'operational-models.mjs',
            'delm-profile.mjs', 'session-mcp.mjs', 'nico-session-mcp.mjs', 'provision-session-mail.mjs',
            'provider.mjs', 'native-artifact.mjs', 'select-native-artifact.mjs']
# Exact corrected dependency accepted by Grace DONE450 and Eve DONE452.
NICO_SHA256 = '4ac012202ca81685dd1e21fb1a7aa665cfe30a2b42cc08c37214118a89caca52'
NICO_PROVENANCE_SHA256 = 'e4f780e57e6f4a62d7860a26f21be89a7cab1a3336f3d4e137c6dcfc2255e10d'


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def stage(base, destination, repo):
    base, repo = Path(base).resolve(strict=True), Path(repo).resolve(strict=True)
    raw = Path(destination).absolute()
    destination = raw.resolve()
    if raw != destination or raw.exists() or raw.is_symlink() or destination.is_relative_to(base):
        raise ValueError('NEW_CANONICAL_CANDIDATE_REQUIRED')
    if base.stat().st_mode & 0o222:
        raise ValueError('SEALED_BASE_REQUIRED')
    # Only explicit code/dependency inputs are read. No config/auth/runtime directories.
    roots = [base / 'node_modules', base / 'compiled', base / 'delm-engine']
    for root in roots:
        if not root.is_dir():
            raise ValueError(f'MISSING_BASE_CODE: {root.name}')
    for root in roots[:2]:
        for directory, dirs, files in os.walk(root, followlinks=False):
            for name in dirs + files:
                path = Path(directory) / name
                if path.is_symlink() and not path.resolve(strict=True).is_relative_to(base):
                    raise ValueError('EXTERNAL_DEPENDENCY_LINK_REFUSED')
    engine = roots[2].resolve(strict=True)
    for name in ['index.js', 'protocol.js', 'package.json']:
        path = engine / name
        if not path.is_file() or path.is_symlink():
            raise ValueError('PHYSICAL_ENGINE_SOURCE_REQUIRED')
    source = repo / 'experiments/sdk-host-cutover'
    inputs = [source / name for name in WRAPPERS]
    inputs.append(base / 'package-lock.json')
    nico = repo / 'experiments/hot-update-20261101/mcp-source/build-observer'
    if nico.resolve(strict=True) != nico:
        raise ValueError('PHYSICAL_NICO_BUILD_REQUIRED')
    nico_files = [nico / name for name in ['nico.mjs', 'PROVENANCE.json', 'nico.mjs.LEGAL.txt']]
    for name in ['licenses', 'schema-compat']:
        directory = nico / name
        if name == 'licenses' and not directory.is_dir():
            raise ValueError('NICO_LICENSES_REQUIRED')
        if directory.is_symlink():
            raise ValueError('PHYSICAL_NICO_BUILD_REQUIRED')
        for path in directory.rglob('*'):
            if path.is_symlink():
                raise ValueError('PHYSICAL_NICO_BUILD_REQUIRED')
            if path.is_file():
                nico_files.append(path)
    for path in nico_files:
        if path.is_symlink() or not path.is_file():
            raise ValueError('PHYSICAL_NICO_BUILD_REQUIRED')
    if (digest(nico / 'nico.mjs') != NICO_SHA256
            or digest(nico / 'PROVENANCE.json') != NICO_PROVENANCE_SHA256):
        raise ValueError('CORRECTED_NICO_HASH_MISMATCH')
    provenance = json.loads((nico / 'PROVENANCE.json').read_text())
    if provenance['bundle']['sha256'] != NICO_SHA256:
        raise ValueError('NICO_PROVENANCE_BUNDLE_MISMATCH')
    inputs.extend(nico_files)
    package_sources = [(repo / 'apps' / app, package, package) for app, package in PACKAGES.items()]
    # Preserve the existing physical dependency location selected by backend Node resolution.
    package_sources.append((repo / 'packages/durable-reload', '@local/pi-durable-reload',
                            'dpi-backend/node_modules/@local/pi-durable-reload'))
    for directory, package, location in package_sources:
        current = json.loads((directory / 'package.json').read_text())
        installed = json.loads((base / 'node_modules' / location / 'package.json').read_text())
        for field in ['dependencies', 'optionalDependencies', 'peerDependencies']:
            if current.get(field, {}) != installed.get(field, {}):
                raise ValueError(f'DEPENDENCY_DELTA_REQUIRES_REBUILD: {package}/{field}')
        if not (directory / 'dist').is_dir():
            raise ValueError(f'BUILD_REQUIRED: {package}')
        inputs.extend([directory / 'package.json', directory / 'package-lock.json'])
        for name in ['src', 'dist', 'scripts', 'prompts']:
            if (directory / name).is_dir():
                inputs.extend(p for p in (directory / name).rglob('*') if p.is_file())
        inputs.extend(directory.glob('tsconfig*.json'))
        # Installed QA verifies these code fixtures against sourceFiles before replay.
        # Do not ingest test runtime/configuration JSON or other fixture state.
        inputs.extend(p for p in (directory / 'tests').rglob('*')
                      if p.is_file() and p.suffix in {'.ts', '.mts', '.js', '.mjs', '.py'})
    inputs.extend((repo / 'experiments/hot-update-20261101/packaging').glob('*.test.mjs'))
    gippity = repo / 'experiments/gippity-voice'
    # Include only source modules, not fixture state, bindings, reports or credentials.
    gippity_files = [gippity / name for name in ['operational-profile.mjs', 'integration.mjs', 'audio-host.mjs']
                     if (gippity / name).is_file()]
    inputs.extend(gippity_files)
    if gippity_files:
        inputs.extend([gippity / 'package.json', gippity / 'package-lock.json'])
        modules = gippity / 'node_modules'
        if not modules.is_dir():
            raise ValueError('GIPPITY_DEPENDENCIES_REQUIRED')
        for directory, dirs, names in os.walk(modules, followlinks=False):
            # Match copytree's existing exclusions: these aliases are not inputs.
            # Shared Durable resolves from the sealed base, never this old alias.
            if Path(directory) == modules:
                dirs[:] = [name for name in dirs if name not in {'@earendil-works', '.bin'}]
                names = [name for name in names if name not in {'@earendil-works', '.bin'}]
            for name in dirs + names:
                path = Path(directory) / name
                if path.is_symlink():
                    real = path.resolve(strict=True)
                    if not (real.is_relative_to(modules) or real.is_relative_to(base)):
                        raise ValueError('EXTERNAL_GIPPITY_LINK_REFUSED')
    before = {str(path): digest(path) for path in inputs}
    destination.mkdir(mode=0o700, parents=True)
    for root in roots:
        # Dereference the known engine alias INTO this new immutable artifact.
        # Dependencies use only base-internal aliases already validated above.
        shutil.copytree(root, destination / root.name, symlinks=False)
    # chmod only the fresh copy; never follow links back to an installed release.
    for path in destination.rglob('*'):
        path.chmod(0o700 if path.is_dir() else (0o700 if path.stat().st_mode & 0o111 else 0o600))
    builds = {}
    for directory, package, location in package_sources:
        target = destination / 'node_modules' / location
        # Remove only this fresh candidate's copied generated output.
        if (target / 'dist').exists():
            shutil.rmtree(target / 'dist')
        shutil.copytree(directory / 'dist', target / 'dist')
        shutil.copyfile(directory / 'package.json', target / 'package.json')
        builds[package] = {str(p.relative_to(directory / 'dist')): digest(p)
                           for p in sorted((directory / 'dist').rglob('*')) if p.is_file()}
    for name in WRAPPERS:
        shutil.copyfile(source / name, destination / name)
    compiled = destination / 'compiled'
    shutil.copyfile(nico / 'nico.mjs', compiled / 'nico.mjs')
    shutil.copyfile(nico / 'nico.mjs.LEGAL.txt', compiled / 'nico.mjs.LEGAL.txt')
    shutil.copyfile(nico / 'PROVENANCE.json', compiled / 'NICO-PROVENANCE.json')
    # Replace only the old Nico sidecars in the new writable copy.
    sidecars = compiled / 'nico-dependency'
    if sidecars.exists():
        shutil.rmtree(sidecars)
    sidecars.mkdir()
    for path in nico_files:
        if path.parent == nico:
            continue
        target = sidecars / path.relative_to(nico)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)
    if gippity_files:
        (destination / 'gippity').mkdir(mode=0o700)
        for path in [*gippity_files, gippity / 'package.json', gippity / 'package-lock.json']:
            shutil.copyfile(path, destination / 'gippity' / path.name)
        # Shared Durable/chord imports resolve to the root closure, not a second copy.
        shutil.copytree(gippity / 'node_modules', destination / 'gippity/node_modules',
                        symlinks=False, ignore=lambda directory, names:
                        ['@earendil-works', '.bin'] if Path(directory) == gippity / 'node_modules' else [])
    shutil.copyfile(base / 'package-lock.json', destination / 'package-lock.json')
    (destination / 'package.json').write_text('{"private":true,"type":"module"}\n')
    if before != {str(path): digest(path) for path in inputs}:
        raise ValueError('BUILD_INPUT_CHANGED_DURING_STAGE')
    source_files = {str(p.relative_to(repo)): before[str(p)] for p in inputs if p.is_relative_to(repo)}
    files = {}
    for path in sorted(destination.rglob('*')):
        if path.is_symlink():
            raise ValueError('CANDIDATE_SYMLINK_REFUSED')
        path.chmod(0o500 if path.is_dir() else (0o500 if path.stat().st_mode & 0o111 else 0o400))
        if path.is_file():
            info = path.stat()
            if info.st_uid != os.getuid():
                raise ValueError('CANDIDATE_OWNER_MISMATCH')
            files[str(path.relative_to(destination))] = {
                'sha256': digest(path), 'uid': info.st_uid, 'mode': oct(info.st_mode & 0o777)}
    module = destination / 'delm-engine/index.js'
    if module.resolve(strict=True) != module:
        raise ValueError('NONCANONICAL_ENGINE_REFUSED')
    manifest = {'activated': False, 'productionActivation': 'NOT RUN', 'base': str(base),
                'engineSource': str(engine), 'baseLockSha256': before[str(base / 'package-lock.json')],
                'sourceFiles': source_files, 'builds': builds, 'files': files,
                'dependencyProvenance': 'sealed base dependencies; current app/local reload overlays and pinned corrected Nico; no install or dependency resolution',
                'compiledBindingsProvenance': 'sealed base bindings/catalog/antigravity; Nico replaced by verified build-observer',
                'nicoBuild': {'source': str(nico.relative_to(repo)), 'sha256': NICO_SHA256,
                              'provenanceSha256': NICO_PROVENANCE_SHA256,
                              'provenance': 'compiled/NICO-PROVENANCE.json',
                              'sidecars': 'compiled/nico-dependency'},
                'gippityDependenciesProvenance': 'existing local closure; shared Durable from base; no install',
                'candidate': str(destination)}
    target = destination / 'RESTART-CANDIDATE.json'
    target.write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n')
    target.chmod(0o400)
    destination.chmod(0o500)
    return manifest


if __name__ == '__main__':
    os.umask(0o077)
    if len(sys.argv) != 3:
        raise SystemExit('Usage: prepare-restart-candidate.py BASE_RELEASE NEW_CANDIDATE')
    manifest = stage(sys.argv[1], sys.argv[2], Path(__file__).resolve().parents[2])
    print(json.dumps({'candidate': manifest['candidate'], 'activated': False,
                      'manifestSha256': digest(Path(manifest['candidate']) / 'RESTART-CANDIDATE.json')}))
