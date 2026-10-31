#!/usr/bin/env python3
"""Stage the session-local DeLM refresh delta over a sealed release. Never activate."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

os.umask(0o077)
if len(sys.argv) != 3:
    raise SystemExit('Usage: prepare-delm-hot-release.py BASE_RELEASE NEW_RELEASE')
base, release = (Path(arg).resolve() for arg in sys.argv[1:])
source = Path(__file__).resolve().parent
repo = source.parent.parent
assert base.is_dir() and base.parent == release.parent and not release.exists()
assert not (base.stat().st_mode & 0o222), 'Base must remain sealed'
sha = lambda data: hashlib.sha256(data).hexdigest()
previous = json.loads((base / 'DELM-RELEASE.json').read_text())
for name, digest in previous['files'].items():
    assert sha((base / name).read_bytes()) == digest, f'Base digest mismatch: {name}'
backend = 'node_modules/dpi-backend/dist/dpi-backend/src/'
sdk = 'node_modules/dpi-sdk/dist/'
compiled = repo / 'apps/dpi-backend/dist/dpi-backend/src'
compiled_sdk = repo / 'apps/dpi-sdk/dist'
changes = {}

# Reject unrelated compiled changes instead of silently shipping the dirty checkout.
store = (compiled / 'store.js').read_text()
start = store.index('    async refreshRuntime(row, body, identity) {\n')
end = store.index('    /** `spawnKey`', start)
without_refresh = store[:start] + store[end:]
without_refresh = without_refresh.replace('    runtimeRefreshes = new Map();\n', '', 1)
without_refresh = without_refresh.replace('"events", "docs", "runtime-refresh.v1",', '"events", "docs",', 1)
assert without_refresh == (base / backend / 'store.js').read_text(), 'Unrelated Store delta refused'
changes[backend + 'store.js'] = store.encode()
routes = (compiled / 'routes.js').read_text()
route = '    r.post("/sessions/:s/runtime/refresh", route(async (req, res) => res.json(await store.refreshRuntime(L(res).row, req.body === undefined ? {} : req.body, admission(res)))));\n'
assert routes.count(route) == 1
assert routes.replace(route, '', 1) == (base / backend / 'routes.js').read_text(), 'Unrelated route delta refused'
changes[backend + 'routes.js'] = routes.encode()

client = (compiled_sdk / 'client.js').read_text()
method = '    /** Refresh trusted services on the same idle session; never reopen the runtime. */\n    refreshRuntime() {\n        return this.client.request("POST", `${this.base}/runtime/refresh`, {}, { requiredCapabilities: [\'runtime-refresh.v1\'] });\n    }\n'
assert client.count(method) == 1
assert client.replace(method, '', 1) == (base / sdk / 'client.js').read_text(), 'Unrelated SDK delta refused'
changes[sdk + 'client.js'] = client.encode()
for prefix, directory, names in [(backend, compiled, ['store.d.ts', 'runtime-profile.d.ts']),
                                  (sdk, compiled_sdk, ['client.d.ts'])]:
    for name in names:
        changes[prefix + name] = (directory / name).read_bytes()
# Source api.d.ts also contains an unrelated in-flight type: preserve the installed
# declarations and add only this feature's exact result contract.
api = (base / sdk / 'api.d.ts').read_text()
result = 'export interface RuntimeRefreshResult {\n    sessionId: string;\n    refreshed: true;\n}\n'
assert result in (compiled_sdk / 'api.d.ts').read_text()
assert api.count('export interface CreateSessionBody {') == 1
changes[sdk + 'api.d.ts'] = api.replace('export interface CreateSessionBody {', result + 'export interface CreateSessionBody {', 1).encode()
changes['host-bindings-v16/delm-profile.mjs'] = (source / 'delm-profile.mjs').read_bytes()

subprocess.run(['cp', '-a', '--reflink=auto', str(base), str(release)], check=True)
release.chmod(0o700)
for name, data in changes.items():
    target = release / name
    for parent in target.parents:
        if parent == release:
            break
        parent.chmod(parent.stat().st_mode | 0o700)
    assert not target.is_symlink(), f'Unexpected release symlink: {name}'
    target.chmod(0o600)
    target.write_bytes(data)
files = dict(previous['files'])
files.update({name: sha(data) for name, data in changes.items()})
manifest = {**previous, 'base': str(base), 'release': str(release), 'activated': False,
            'scope': 'Session-local trusted runtime refresh and DeLM hot attach; no per-team Host restart',
            'files': files}
target = release / 'DELM-RELEASE.json'
target.chmod(0o600)
target.write_text(json.dumps(manifest, indent=2) + '\n')
for path in release.rglob('*'):
    if not path.is_symlink():
        path.chmod(path.stat().st_mode & ~0o222)
release.chmod(0o500)
for name, digest in files.items():
    assert sha((release / name).read_bytes()) == digest
print(json.dumps({'release': str(release), 'base': str(base), 'sealed': True, 'changedFiles': list(changes)}))
