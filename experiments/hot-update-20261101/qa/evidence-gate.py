#!/usr/bin/env python3
"""Fail-closed bookkeeping gate for independently reviewed installed evidence.

This validates coverage/provenance, not the truth of a product assertion. Heidi must
read each raw evidence file before supplying a reviewed assertion. No author PASS
or subprocess exit alone substitutes for those observations.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re

CORPUS = Path(__file__).with_name('corpus.json')
LEAVES = {str(i) for i in range(46, 79)} - {'58', '65'} | {'58.1', '58.2', '65.1', '65.2', '65.3'}


def corpus_check(isa=None, plan=None):
    corpus = json.loads(CORPUS.read_text())
    cases = corpus['cases']
    ids = [case['id'] for case in cases]
    assert len(ids) == len(set(ids)), 'Duplicate corpus case'
    assert {f'U{i:02}' for i in range(1, 21)} <= set(ids), 'Missing fixed U01-U20 case'
    assert {item for case in cases for item in case['isc']} == LEAVES, 'Missing/orphan hot-update leaf'
    assert len(LEAVES) == 36
    assert all(case['assertions'] and len(set(case['assertions'])) == len(case['assertions']) for case in cases)
    for path, key in [(isa, 'isaSha256'), (plan, 'planSha256')]:
        if path:
            assert hashlib.sha256(path.read_bytes()).hexdigest() == corpus[key], f'Changed canonical input: {path}'
    if isa:
        actual = set(re.findall(r'^- \[ \] ISC-(\d+(?:\.\d+)?):', isa.read_text(), re.M))
        actual |= set(re.findall(r'^  - \[ \] ISC-(\d+(?:\.\d+)?):', isa.read_text(), re.M))
        actual = {key for key in actual if int(key.split('.')[0]) >= 46}
        assert actual == LEAVES, 'Canonical ISA leaves differ from fixed corpus'
    return corpus


def audit(evidence, digest, root):
    corpus = corpus_check()
    assert re.fullmatch(r'[0-9a-f]{64}', digest), 'Exact final manifest digest required'
    assert evidence['candidateDigestBefore'] == evidence['candidateDigestAfter'] == digest
    assert evidence['productionActivation'] == 'NOT RUN'
    assert evidence['productionBaseline'] == evidence['productionFinal'], 'Production identity changed'
    assert evidence['productionBaseline'], 'No production read-only baseline'
    rows = evidence['cases']
    assert len(rows) == len({row['id'] for row in rows}), 'Duplicate reviewed case'
    by_id = {row['id']: row for row in rows}
    failures = []
    for case in corpus['cases']:
        row = by_id.get(case['id'])
        if row is None:
            failures.append({'id': case['id'], 'status': 'NOT RUN', 'reason': 'No independent installed evidence'})
            continue
        if row.get('status') != 'PASS':
            failures.append({'id': case['id'], 'status': row.get('status', 'NOT RUN'), 'reason': row.get('reason', '')})
            continue
        assert row['candidateDigest'] == digest, f"Wrong artifact: {case['id']}"
        assert row['reviewer'] == 'heidi', f"Author output is not independent QA: {case['id']}"
        assert row['command'] and isinstance(row['command'], list) and row['exitCode'] == 0
        observations = row['observations']
        assert [item['assertion'] for item in observations] == case['assertions'], f"Shrunk assertion set: {case['id']}"
        for observation in observations:
            assert observation['outcome'] == 'PASS' and observation['proof'], f"Unverified assertion: {case['id']}"
            raw = (root / observation['evidence']).resolve(strict=True)
            assert raw.is_relative_to(root.resolve()), 'Raw evidence outside result bundle'
            assert hashlib.sha256(raw.read_bytes()).hexdigest() == observation['sha256'], f'Changed raw evidence: {raw}'
    assert set(by_id) <= {case['id'] for case in corpus['cases']}, 'Unknown evidence case'
    return {'status': 'PASS' if not failures else 'BLOCKED', 'candidateDigest': digest,
            'reviewedCases': len(corpus['cases']) - len(failures), 'requiredCases': len(corpus['cases']),
            'requiredLeaves': len(LEAVES), 'open': failures, 'productionActivation': 'NOT RUN',
            'limitation': 'Coverage/provenance gate only; raw runtime observations require independent review'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--isa', type=Path)
    parser.add_argument('--plan', type=Path)
    parser.add_argument('--evidence', type=Path)
    parser.add_argument('--digest')
    args = parser.parse_args()
    corpus = corpus_check(args.isa, args.plan)
    if args.evidence:
        assert args.digest, 'Supply named final --digest'
        evidence = json.loads(args.evidence.read_text())
        result = audit(evidence, args.digest, args.evidence.parent)
    else:
        result = {'status': 'PREPARATION_CHECK_PASS', 'cases': len(corpus['cases']), 'leaves': len(LEAVES),
                  'productChecks': 'NOT RUN', 'productionActivation': 'NOT RUN'}
    print(json.dumps(result, ensure_ascii=False))
    return 1 if result['status'] == 'BLOCKED' else 0


if __name__ == '__main__':
    raise SystemExit(main())
