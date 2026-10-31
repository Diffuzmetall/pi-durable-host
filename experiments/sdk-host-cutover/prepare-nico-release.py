#!/usr/bin/env python3
"""Stage an immutable Host-only MCP update. Does not activate or open session databases."""
import hashlib, json, os, shutil, subprocess, sys
from pathlib import Path
os.umask(0o077)
if len(sys.argv) != 4: raise SystemExit('Usage: prepare-nico-release.py BUNDLE_DIRECTORY PASSED_CHECK_DIRECTORY NEW_RELEASE_NAME')
source = Path(__file__).resolve().parent
bundle, check = map(lambda value: Path(value).resolve(), sys.argv[1:3])
name = sys.argv[3]
assert __import__('re').fullmatch(r'c0019d7-nico[1-9][0-9]*', name)
releases = Path.home()/'.local/share/pi-durable-host/releases'
old, new = releases/'c0019d7-sse1', releases/name
hashfile = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
result = json.loads((check/'RESULT.json').read_text())
assert result['exitCode'] == 0 and result['networkIsolated'] and not result['realCredentialsMounted'] and not result['realDataMounted']
assert hashfile(source/'nico-session-mcp.mjs') == result['sourceSha256'] == hashfile(check/'bindings/session-mcp.mjs')
assert hashfile(bundle/'nico.mjs') == hashfile(check/'bindings/compiled/nico.mjs')
assert hashfile(source/'nico-session-mcp.test.mjs') == hashfile(check/'bindings/nico-session-mcp.test.mjs')
new.mkdir(mode=0o700)
subprocess.run(['cp','-a','--reflink=auto',str(old/'node_modules'),str(new/'node_modules')],check=True)
shutil.copytree(old/'host-bindings-v16',new/'host-bindings-v16')
for file in ['package.json','package-lock.json','operational-service.mjs','backend-sse.patch']:
 shutil.copy2(old/file,new/file)
bindings = new/'host-bindings-v16'
for path in [bindings,bindings/'compiled']: path.chmod(0o700)
(bindings/'session-mcp.mjs').chmod(0o600)
shutil.copyfile(source/'nico-session-mcp.mjs',bindings/'session-mcp.mjs')
shutil.copyfile(bundle/'nico.mjs',bindings/'compiled/nico.mjs')
shutil.copytree(bundle,bindings/'compiled/nico-dependency')
shutil.copy2(source/'nico-session-mcp.test.mjs',bindings/'nico-session-mcp.test.mjs')
shutil.copytree(check,new/'nico-check-evidence')
provenance = json.loads((bundle/'PROVENANCE.json').read_text())
report = {'base':str(old),'release':str(new),'profile':'native@1','scope':'Host MCP transport only; SDK clients unchanged',
 'dependency':provenance['artifact'],'additionalNicoPatches':provenance['additionalNicoPatches'], 'checks':result,
 'sessionMcpSha256':hashfile(bindings/'session-mcp.mjs'),'bundleSha256':hashfile(bindings/'compiled/nico.mjs'),
 'ordinaryPiChanged':False,'BBChanged':False,'modelCalls':0,'activated':False}
(new/'NICO-RELEASE.json').write_text(json.dumps(report,indent=2)+'\n')
for path in new.rglob('*'):
 if not path.is_symlink(): path.chmod(path.stat().st_mode & ~0o222)
new.chmod(0o500)
print(json.dumps({'release':str(new),'sealed':True,'dependency':provenance['artifact']['version'],'additionalNicoPatches':len(provenance['additionalNicoPatches'])}))
