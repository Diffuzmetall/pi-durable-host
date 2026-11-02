"""Read-only evidence check; does not import or execute product modules."""
import hashlib
import json
from pathlib import Path
import re
import tarfile

root = Path(__file__).resolve().parents[3]
evidence = json.loads(Path(__file__).with_name('INVENTORY.json').read_text())
archive = Path(evidence['baselineArchive'])
with archive.open('rb') as source:
    actual = hashlib.file_digest(source, 'sha256').hexdigest()
if actual != evidence['baselineArchiveSha256']:
    raise SystemExit('FAIL baseline archive hash')
excluded = set(evidence['excludedFromBaselineArchive'])
matched = 0
with tarfile.open(archive) as baseline:
    members = set(baseline.getnames())
    for name, expected in evidence['files'].items():
        current = (root / name).read_bytes()
        if hashlib.sha256(current).hexdigest() != expected:
            raise SystemExit(f'FAIL current hash: {name}')
        member = next((candidate for candidate in [name, './' + name] if candidate in members), None)
        if name in excluded:
            if member is not None:
                raise SystemExit(f'FAIL exclusion assertion: {name}')
            continue
        if member is None or baseline.extractfile(member).read() != current:
            raise SystemExit(f'FAIL baseline bytes: {name}')
        matched += 1
for name in evidence['noNativeImportStringControls']:
    if re.search(r'@earendil-works/(?:pi-durable|chord|pi-ai)', (root / name).read_text()):
        raise SystemExit(f'FAIL native string control: {name}')
metadata = json.loads((root / 'apps/dpi-backend/src/native-profile/memory/SOURCE.json').read_text())
stale = []
for name, expected in metadata['local'].items():
    path = root / 'apps/dpi-backend/src/native-profile/memory' / name
    if path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        stale.append(name)
print(f'PASS {len(evidence["files"])} current hashes; {matched} baseline byte matches; {len(excluded)} declared exclusions')
print(f'PASS {len(evidence["noNativeImportStringControls"])} native import-string controls (not a transitive compatibility proof)')
print('Historical SOURCE.json mismatches: ' + ', '.join(stale))
print('NOT TESTED: Durable 1.5 imports, runtime, integration, final acceptance')
