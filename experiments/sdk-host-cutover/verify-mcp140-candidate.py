#!/usr/bin/env python3
"""Read-only gate for activating the tested pi-mcp package/bridge candidate."""
import hashlib, json, sys
from pathlib import Path
if len(sys.argv) != 2:
 raise SystemExit('Usage: verify-mcp140-candidate.py SEALED_RELEASE')
release = Path(sys.argv[1]).resolve()
receipt = json.loads((release/'MCP140-CANDIDATE.json').read_text())
assert receipt['release'] == str(release)
assert receipt['piMcpVersion'] == '1.4.0' and receipt['nicoRetained'] is True
assert receipt['checks']['pass'] == 14 and receipt['checks']['fail'] == 0
assert receipt['checks']['networkIsolated'] and not receipt['checks']['realCredentialsMounted'] and not receipt['checks']['realDataMounted']
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
package = release/'node_modules/@earendil-works/pi-mcp'
assert json.loads((package/'package.json').read_text())['version'] == '1.4.0'
assert json.loads((release/'package.json').read_text())['overrides']['@earendil-works/pi-mcp'] == '1.4.0'
expected = receipt['packageSha256']
actual = {str(path.relative_to(package)):sha(path) for path in package.rglob('*') if path.is_file()}
assert actual == expected, 'Package differs from tested archive'
bridge = receipt['bridgePatch']
assert sha(release/bridge['file']) == bridge['sha256'], 'Native bridge differs from tested file'
for filename in ['package-lock.json','node_modules/.package-lock.json']:
 lock = json.loads((release/filename).read_text())
 assert lock['packages']['node_modules/@earendil-works/pi-mcp']['version'] == '1.4.0'
for path in [release,*release.rglob('*')]:
 if path.is_symlink():
  assert path.resolve().is_relative_to(release), 'External candidate symlink refused'
 else:
  assert not path.stat().st_mode & 0o222, 'Candidate must remain sealed'
print(json.dumps({'passed':True,'piMcpVersion':'1.4.0','nicoRetained':True,'packageFiles':len(actual),'bridgeHashVerified':True,'sealed':True,'activated':False}))
