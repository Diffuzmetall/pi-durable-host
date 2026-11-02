#!/usr/bin/env python3
"""Verify a named immutable candidate using Alice's existing files/sourceFiles schema.

No hardcoded old manifest digest. This is artifact integrity, not product acceptance.
"""
import argparse
import hashlib
import json
from pathlib import Path
import stat


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify(candidate, manifest, digest, repo=None):
    root = candidate.resolve(strict=True)
    manifest = manifest.resolve(strict=True)
    assert manifest.is_relative_to(root), 'Manifest outside selected candidate'
    assert sha256(manifest) == digest, 'Not the named manifest digest'
    data = json.loads(manifest.read_text())
    assert data.get('activated') is False, 'Artifact must remain unactivated'
    assert isinstance(data.get('files'), dict) and data['files'], 'Missing complete file manifest'
    checked = set()
    for relative, record in data['files'].items():
        path = root / relative
        assert not Path(relative).is_absolute(), f'Absolute manifest member: {relative}'
        assert path.resolve(strict=True).is_relative_to(root), f'External candidate import: {relative}'
        assert sha256(path) == record['sha256'], f'Changed candidate file: {relative}'
        info = path.stat()
        assert oct(stat.S_IMODE(info.st_mode)) == record['mode'], f'Changed mode: {relative}'
        assert info.st_uid == record['uid'], f'Changed owner: {relative}'
        checked.add(path.relative_to(root).as_posix())
    actual = set()
    for path in root.rglob('*'):
        if path.is_symlink():
            assert path.resolve(strict=True).is_relative_to(root), f'External symlink: {path}'
        if path.is_file() and path != manifest:
            actual.add(path.relative_to(root).as_posix())
    assert actual == checked, f'Manifest membership mismatch: extra={sorted(actual-checked)[:5]}, absent={sorted(checked-actual)[:5]}'
    sources = 0
    if repo is not None:
        repo = repo.resolve(strict=True)
        assert data.get('sourceFiles'), 'Missing frozen source/build/lock identities'
        for relative, expected in data['sourceFiles'].items():
            path = repo / relative
            assert path.resolve(strict=True).is_relative_to(repo), f'External source: {relative}'
            assert sha256(path) == expected, f'Changed frozen source: {relative}'
            sources += 1
    return {'status': 'PASS', 'manifestSha256': digest, 'files': len(checked),
            'sources': sources, 'candidate': str(root), 'productionActivation': 'NOT RUN'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidate', type=Path, required=True)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--digest', required=True)
    parser.add_argument('--repo', type=Path)
    args = parser.parse_args()
    print(json.dumps(verify(args.candidate, args.manifest, args.digest, args.repo)))


if __name__ == '__main__':
    main()
