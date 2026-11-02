#!/usr/bin/env python3
"""Preserve the pre-DM1 source/evidence without opening private runtime files."""
import hashlib
import io
import json
import pathlib
import subprocess
import tarfile

REPO = pathlib.Path(__file__).resolve().parents[3]
OUT = pathlib.Path('/tmp/pi-host-dm1-source-20261102-alice-v1')
OUT.mkdir(exist_ok=False)
sha = lambda b: hashlib.sha256(b).hexdigest()
paths = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=REPO).decode().split('\0')
blocked_parts = {'node_modules', '.git', 'dist', '.cache', '__pycache__', 'data', 'logs', 'runtime'}
blocked_names = {'config.json', 'auth.json', '.env', '.env.local', 'credentials.json', 'tokens.json'}
suffixes = {'.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.py', '.md', '.json', '.jsonl', '.yaml', '.yml', '.toml', '.sh', '.html', '.css', '.svg', '.txt', '.patch', '.lock'}
records, excluded = [], []
with tarfile.open(OUT / 'source.tar.gz', 'w:gz') as archive:
    for name in sorted(set(filter(None, paths))):
        p = pathlib.Path(name)
        if (set(p.parts) & blocked_parts or p.name in blocked_names or p.name.startswith('.env') or p.suffix not in suffixes):
            excluded.append(name)
            continue
        src = REPO / p
        if not src.exists() or src.is_symlink() or not src.is_file():
            excluded.append(name)
            continue
        data = src.read_bytes()
        st = src.stat()
        info = tarfile.TarInfo(name)
        info.size, info.mode, info.mtime = len(data), st.st_mode & 0o777, int(st.st_mtime)
        archive.addfile(info, io.BytesIO(data))
        records.append({'path': name, 'sha256': sha(data), 'size': len(data)})

# Board receipt was already read. It is not an independent verification verdict.
receipt = json.loads(pathlib.Path('/tmp/alice-dm1-first-read.json').read_text())
heidi558 = next(e for e in receipt['view']['events'] if e['sequence'] == 558)
(OUT / 'heidi558.json').write_text(json.dumps(heidi558, ensure_ascii=False, indent=2) + '\n')
(OUT / 'source-status.txt').write_bytes(subprocess.check_output(['git', 'status', '--porcelain=v1'], cwd=REPO))
(OUT / 'board-receipt559.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
expected = {
    'experiments/hot-update-20261101/qa/PRELIMINARY-RESULTS.json': 'b34f92416b65148abc112fca7f154645042359e18af91ec0ee94bd43b7dffbc3',
    'docs/host-design/verification/hot-update-20261101/REPORT.md': '3f8a4dcd39a59754176ed337eba092e8381447014803a5f1a83a10ae540a3156',
    'docs/host-design/hot-update/DURABLE-MODULE-PLAN.md': '5c6d2cfbb7ee3619e1cf53e9955d9b0291294b140f5a16cc5de26e935dbe31dc',
}
by_path = {r['path']: r['sha256'] for r in records}
for name, digest in expected.items():
    assert by_path[name] == digest, (name, by_path.get(name))
artifacts = []
for root, digest in [('/tmp/pi-host-hot-update-preliminary-20261101-alice-v1', '18724c7afeffda96d63b10c57ca77e1c280598f6fd0c6f60e778e5402c78e73a'), ('/tmp/pi-host-restart-candidate-20261101-alice-v2', '672b7e5e746dcabfbf5ca82a571cd35f328e457f717b64e2b852b3afa3931665')]:
    manifest = pathlib.Path(root) / 'RESTART-CANDIDATE.json'
    actual = sha(manifest.read_bytes())
    assert actual == digest, (root, actual)
    artifacts.append({'root': root, 'manifestSha256': digest, 'mode': 'read-only retained in place; not duplicated'})
summary = {
    'status': 'PRESERVED_NOT_ACCEPTED_1_5', 'sourceArchive': str(OUT / 'source.tar.gz'),
    'sourceArchiveSha256': sha((OUT / 'source.tar.gz').read_bytes()),
    'sourceFiles': records, 'excludedPaths': excluded,
    'exclusionPolicy': 'Source/text assets only; no node_modules, dist, .git, runtime data/logs, config.json, auth.json, .env*, credentials or symlink targets.',
    'evidenceHashes': expected, 'artifacts': artifacts,
    'heidi558Sha256': sha((OUT / 'heidi558.json').read_bytes()),
    'limits': ['Heidi558 is preserved reported preliminary1.4 evidence, not rerun QA or1.5 acceptance.', 'Raw sandbox results remain at Heidi paths; no production reads or writes.', 'Historical R4 and PDH-33/20 FAIL remain unchanged.'],
}
(OUT / 'INVENTORY.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
# Verify the exact archived bytes, not current source that peers may later change.
with tarfile.open(OUT / 'source.tar.gz') as archive:
    for record in records:
        assert sha(archive.extractfile(record['path']).read()) == record['sha256'], record['path']
result = {'root': str(OUT), 'inventorySha256': sha((OUT / 'INVENTORY.json').read_bytes()), 'sourceArchiveSha256': summary['sourceArchiveSha256'], 'files': len(records), 'excluded': len(excluded), 'evidenceHashes': expected, 'artifacts': artifacts, 'archiveVerification': 'PASS'}
(REPO / 'experiments/durable-module-20261102/baseline/RESULT.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(result, ensure_ascii=False, indent=2))
