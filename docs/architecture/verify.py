#!/usr/bin/env python3
"""Read-only source/link checks. No Host, model, dependency import or private data.
Run from any directory: python3 docs/architecture/verify.py
Zero's separate source verifier additionally needs its pinned checkout.
"""
from pathlib import Path
import re

packet = Path(__file__).resolve().parent
repo = packet.parents[1]
links = 0
mermaid = 0
files = sorted(packet.rglob('*.md'))
for path in files:
    content = path.read_text()
    assert content.startswith('# '), path
    assert len(re.findall(r'^```', content, re.M)) % 2 == 0, path
    mermaid += len(re.findall(r'^```mermaid$', content, re.M))
    for target in re.findall(r'\]\(([^)]+)\)', content):
        if target.startswith(('https://', 'http://', 'mailto:', '#')):
            continue
        target = target.split('#', 1)[0]
        assert not target or (path.parent / target).exists(), (path, target)
        links += 1
print(f'DOCS PASS: {len(files)} Markdown files, {links} local links, balanced fences, {mermaid} Mermaid blocks.')

api = (repo / 'apps/dpi-sdk/src/api.ts').read_text()
send_body = api.split('export interface SendMessageBody {', 1)[1].split('}', 1)[0]
assert 'content: string;' in send_body
assert 'export interface WireImage {' in api
client = (repo / 'apps/dpi-sdk/src/client.ts').read_text()
assert 'async send(content: string' in client
store = (repo / 'apps/dpi-backend/src/store.ts').read_text()
assert 'typeof body.content !== "string"' in store
assert 'body.content.length > 100000' in store
assert 'await Harness.open(' in store
assert store.index('await profile.bind?.(harness, ctx, storage)') < store.index('harness.resume();')
server = (repo / 'apps/dpi-backend/src/http-server.ts').read_text()
assert 'express()' in server
assert "express.json({ limit: '256kb' })" in server
streams = (repo / 'apps/dpi-backend/src/streams.ts').read_text()
assert 'watchEvents' in streams
print('SOURCE PASS: string-only send, image observation type, Express/body limit, existing Store/native ownership and bind-before-resume.')
print('NOT TESTED: runtime, full build, image attachment E2E, HTTP performance, visual rendering, production state.')
