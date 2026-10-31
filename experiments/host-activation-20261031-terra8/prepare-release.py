#!/usr/bin/env python3
"""Copy only this verified candidate into new sealed releases; never modify old releases."""
import hashlib
import json
import os
import subprocess
from pathlib import Path

os.umask(0o077)
here = Path(__file__).resolve().parent
releases = Path.home() / '.local/share/pi-durable-host/releases'
targets = {'host': releases / 'c0019d7-unified-catalog-20261031-v1',
           'terminal': releases / 'terminal-catalog-20261031-v1'}
for name, target in targets.items():
    source = here / name
    if target.exists():
        try:
            manifest = json.loads((target / 'DELM-RELEASE.json').read_text())
        except (OSError, json.JSONDecodeError):
            raise RuntimeError('Sealed release manifest unavailable or invalid') from None
        assert manifest['release'] == str(target) and not target.stat().st_mode & 0o222
        for filename, digest in manifest['files'].items():
            assert hashlib.sha256((target / filename).read_bytes()).hexdigest() == digest
        print(json.dumps({'sealed': True, 'component': name, 'reusedVerifiedRelease': str(target)}))
        continue
    external = {}
    for path in source.rglob('*'):
        if path.is_symlink() and not path.resolve().is_relative_to(source):
            dependency = path.resolve()
            assert dependency.is_relative_to(releases / 'c0019d7-sse1') and not dependency.stat().st_mode & 0o222, 'Unsealed external dependency refused'
            for item in ([dependency] if dependency.is_file() else dependency.rglob('*')):
                if item.is_file():
                    external[str(item)] = hashlib.sha256(item.read_bytes()).hexdigest()
    subprocess.run(['cp', '-a', '--reflink=auto', str(source), str(target)], check=True)
    target.chmod(0o700)
    for filename in ['DELM-RELEASE.json', 'UNIFIED-RELEASE.json']:
        path = target / filename
        if path.exists():
            path.rename(target / ('BASE-' + filename))
    files = {str(path.relative_to(target)): hashlib.sha256(path.read_bytes()).hexdigest()
             for path in target.rglob('*') if path.is_file() and not path.is_symlink()}
    manifest = {'schema': 1, 'base': str(releases / 'c0019d7-delm2'), 'release': str(target),
                'scope': 'Verified startup cleanup, upstream cached model catalogues and session-local runtime refresh; no model aliases or saved model rewrites',
                'files': files, 'externalFiles': external}
    (target / 'DELM-RELEASE.json').write_text(json.dumps(manifest, indent=2) + '\n')
    for path in target.rglob('*'):
        if not path.is_symlink():
            path.chmod(path.stat().st_mode & ~0o222)
    target.chmod(0o500)
    print(json.dumps({'sealed': True, 'component': name, 'release': str(target), 'files': len(files)}))
