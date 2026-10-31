#!/usr/bin/env python3
"""Stage a sealed pi-mcp 1.4.0 candidate; never activate or edit an installed release."""
import hashlib, io, json, os, shutil, subprocess, sys, tarfile, urllib.request
from pathlib import Path, PurePosixPath
os.umask(0o077)
if len(sys.argv) != 3: raise SystemExit('Usage: prepare-mcp140-release.py PASS_EVIDENCE_DIR NEW_RELEASE_NAME')
evidence = Path(sys.argv[1]).resolve()
name = sys.argv[2]
assert name and all(c.isalnum() or c in '-.' for c in name) and name not in ['.', '..']
base = Path.home()/'.local/share/pi-durable-host/releases/c0019d7-nico2'
destination = base.parent/name
assert not destination.exists()
source = Path(__file__).resolve().parent
sha = lambda data: hashlib.sha256(data).hexdigest()
report = json.loads((evidence/'RESULT.json').read_text())
assert report['exitCode'] == 0 and report['candidateVerdict'] == 'PI_MCP_1_4_0_WITH_NICO_PASS'
for file, digest in report['sourceFiles'].items(): assert sha((source/file).read_bytes()) == digest, file
bridge = report['bridgePatch']
assert sha((source.parent.parent/'apps/dpi-backend/src/native-profile/guards/mcp-codemode.ts').read_bytes()) == bridge['sourceSha256']
assert sha((source.parent.parent/'apps/dpi-backend/tests/native-mcp-structured-results.test.mjs').read_bytes()) == bridge['regressionSha256']
assert sha((evidence/'mcp-codemode.js').read_bytes()) == bridge['sha256']
# One pinned public archive, no install/lifecycle scripts and no dependency solving.
url = 'https://registry.npmjs.org/@earendil-works/pi-mcp/-/pi-mcp-1.4.0.tgz'
with urllib.request.urlopen(url, timeout=30) as response: archive = response.read(2_000_000)
assert sha(archive) == 'ce2633c482aed9733d6a863a156da2b504426f0056fd2c3495f9e744d7e56726'
files = {}
with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as package:
 for member in package.getmembers():
  path = PurePosixPath(member.name)
  assert path.parts[0] == 'package' and '..' not in path.parts and not member.issym() and not member.islnk()
  if member.isfile(): files[str(PurePosixPath(*path.parts[1:]))] = package.extractfile(member).read()
assert {file:sha(data) for file,data in files.items()} == report['packageFiles'], 'Tested package must match pinned archive'
subprocess.run(['cp','-a','--reflink=auto',str(base),str(destination)], check=True)
# Only the fresh candidate becomes writable. Existing packages/history are never opened or modified.
for path in [destination, destination/'node_modules', destination/'node_modules/@earendil-works']:
 path.chmod(path.stat().st_mode | 0o700)
installed = destination/'node_modules/@earendil-works/pi-mcp'
installed.chmod(installed.stat().st_mode | 0o700)  # moving a directory also updates its parent link
installed.rename(destination/'pi-mcp-1.0.2-preimage')
installed.mkdir(mode=0o700)
for file, data in files.items():
 path = installed/file
 path.parent.mkdir(parents=True, exist_ok=True)
 path.write_bytes(data)
manifest = destination/'package.json'
root = json.loads(manifest.read_text()); root.setdefault('overrides', {})['@earendil-works/pi-mcp'] = '1.4.0'
manifest.chmod(0o600); manifest.write_text(json.dumps(root,indent=2)+'\n')
for filename in ['package-lock.json', 'node_modules/.package-lock.json']:
 lock = destination/filename
 if not lock.exists(): continue
 value = json.loads(lock.read_text()); package = value['packages']['node_modules/@earendil-works/pi-mcp']
 package.update(version='1.4.0', resolved=url, integrity='sha512-92aZmmGsUpHHknYuKXZHRINQfahntw5hU9If0I0ZM49GojOaFHpkl5/GF3/aatqpt7v7GjZbBfpfSygGKW+pnw==')
 lock.chmod(0o600); lock.write_text(json.dumps(value,indent=2)+'\n')
installedGuard = destination/bridge['file']
assert sha(installedGuard.read_bytes()) == bridge['preimageSha256']
installedGuard.chmod(0o600)
installedGuard.write_bytes((evidence/'mcp-codemode.js').read_bytes())
shutil.copytree(evidence, destination/'mcp140-check-evidence')
for file, digest in report['packageFiles'].items(): assert sha((installed/file).read_bytes()) == digest
# All original execution files, except the deliberate package/lock/override delta, must remain identical.
unchanged = 0
for path in base.rglob('*'):
 relative = path.relative_to(base)
 if not path.is_file() or path.is_symlink(): continue
 if str(relative).startswith('node_modules/@earendil-works/pi-mcp/') or str(relative) in ['package.json','package-lock.json','node_modules/.package-lock.json',bridge['file']]: continue
 assert (destination/relative).read_bytes() == path.read_bytes(), str(relative)
 unchanged += 1
receipt = {'base':str(base),'release':str(destination),'piMcpVersion':'1.4.0','archiveSha256':sha(archive),
 'rootOverride':True,'unchangedOriginalFiles':unchanged,'activated':False,'nicoRetained':True,
 'bridgePatch':bridge,
 'checks':{**report['tests'],'networkIsolated':True,'realCredentialsMounted':False,'realDataMounted':False},
 'stockManagerReplacement':report['stockManagerReplacement'],
 'packageSha256':report['packageFiles']}
(destination/'MCP140-CANDIDATE.json').write_text(json.dumps(receipt,indent=2)+'\n')
for path in [*(destination.rglob('*')),destination]:
 if not path.is_symlink(): path.chmod(path.stat().st_mode & ~0o222)
print(json.dumps({'release':str(destination),'sealed':True,'activated':False,'piMcpVersion':'1.4.0','nicoRetained':True,'unchangedOriginalFiles':unchanged}))
