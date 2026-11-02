"""Read-only verification of the handed-off candidate and its recorded sources."""
import argparse
import hashlib
import json
from pathlib import Path
import stat

parser = argparse.ArgumentParser()
parser.add_argument('--candidate', required=True, type=Path)
parser.add_argument('--repo', required=True, type=Path)
args = parser.parse_args()
root = args.candidate.resolve(strict=True)
repo = args.repo.resolve(strict=True)
manifest = root / 'RESTART-CANDIDATE.json'
expected = '672b7e5e746dcabfbf5ca82a571cd35f328e457f717b64e2b852b3afa3931665'
assert hashlib.sha256(manifest.read_bytes()).hexdigest() == expected, 'not the handed-off alice-v2 manifest'
data = json.loads(manifest.read_text())
for relative, record in data['files'].items():
    path = root / relative
    assert path.resolve().is_relative_to(root), f'external candidate path: {relative}'
    assert hashlib.sha256(path.read_bytes()).hexdigest() == record['sha256'], relative
    info = path.stat()
    assert oct(stat.S_IMODE(info.st_mode)) == record['mode'], relative
    assert info.st_uid == record['uid'], relative
for relative, expected_hash in data['sourceFiles'].items():
    path = repo / relative
    assert path.resolve().is_relative_to(repo), f'external source path: {relative}'
    assert hashlib.sha256(path.read_bytes()).hexdigest() == expected_hash, relative
assert data['activated'] is False
print(json.dumps({'result': 'PASS', 'manifestSha256': expected, 'files': len(data['files']),
                  'sources': len(data['sourceFiles']), 'candidate': str(root),
                  'productionActivation': 'NOT RUN'}, indent=2))
