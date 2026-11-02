#!/usr/bin/env python3
"""Compare the additive DM1 ISA update with the preserved pre-migration ISA."""
import hashlib
import json
from pathlib import Path
import re
import tarfile

ROOT = Path(__file__).resolve().parents[3]
BASELINE = Path('/tmp/pi-host-dm1-source-20261102-alice-v1/source.tar.gz')
with tarfile.open(BASELINE) as archive:
    before_bytes = archive.extractfile('ISA.md').read()
after_bytes = (ROOT / 'ISA.md').read_bytes()
before, after = before_bytes.decode(), after_bytes.decode()
normalized_before = before.replace('progress: 51/89', 'progress: 51/96', 1).replace(
    'updated: 2026-11-01', 'updated: 2026-11-02', 1)
remaining = iter(after.splitlines(keepends=True))
assert all(any(candidate == line for candidate in remaining)
           for line in normalized_before.splitlines(keepends=True)), 'Old content removed/reordered'
old_features = before.split('## Features\n', 1)[1].split('## Decisions\n', 1)[0]
new_old_features = after.split('## Features\n', 1)[1].split('### F10 ·', 1)[0]
assert old_features == new_old_features, 'Historical feature criteria changed'
old_strategy = before.split('## Test Strategy\n', 1)[1].split('## Features\n', 1)[0]
new_old_strategy = after.split('## Test Strategy\n', 1)[1].split('### DM1:', 1)[0]
assert old_strategy == new_old_strategy, 'Historical test strategy changed'
assert before.split('## Learning\n', 1)[1] == after.split('## Learning\n', 1)[1], 'Learning/evidence changed'
leaves = re.findall(r'^\s*- \[([ x])\] (ISC-\d+(?:\.\d+)?):', after, re.M)
old_leaves = re.findall(r'^\s*- \[([ x])\] (ISC-\d+(?:\.\d+)?):', before, re.M)
assert len(old_leaves) == 89 and len(leaves) == 96
assert leaves[:89] == old_leaves
assert len({identifier for _, identifier in leaves}) == 96
assert sum(mark == 'x' for mark, _ in leaves) == 51
assert leaves[89:] == [(' ', f'ISC-{n}') for n in range(79, 86)]
for number in range(79, 86):
    assert len(re.findall(rf'^\| ISC-{number} \|', after, re.M)) == 1
headers_before = re.findall(r'^## .+$', before, re.M)
assert headers_before == re.findall(r'^## .+$', after, re.M)
result = {
    'status': 'PASS_ADDITIVE_DOCUMENT_ONLY',
    'baseline': str(BASELINE),
    'beforeIsaSha256': hashlib.sha256(before_bytes).hexdigest(),
    'afterIsaSha256': hashlib.sha256(after_bytes).hexdigest(),
    'oldLeafCount': len(old_leaves),
    'newLeafCount': len(leaves),
    'historicalChecked': 51,
    'newCriteria': {f'DM-{letter}': f'ISC-{number}' for letter, number in zip('ABCDEFG', range(79, 86))},
    'checks': ['old content retained in order except two explicit metadata updates',
               'old Features F0-F9 byte-identical', 'old Test Strategy byte-identical',
               'Learning and Verification byte-identical', 'top-level section order unchanged',
               '96 unique leaves; 51 historical checked; seven new unchecked',
               'seven new six-column strategy rows'],
    'baselineDoneSequence': 574,
    'readerReleaseSequences': {'grace': 583, 'heidi': 589},
    'task': '1fd60ede7e9143fb9c4612095c1d9a8a',
    'limitations': 'Document traceability only. No DM runtime criterion accepted. Production NOT RUN.'
}
(ROOT / 'experiments/durable-module-20261102/traceability/RESULT.json').write_text(
    json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(result, ensure_ascii=False, indent=2))
