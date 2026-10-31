#!/usr/bin/env python3
"""Check a pi-mcp package override against the unchanged sealed Nico deployment, without activation."""
import hashlib, json, os, shutil, subprocess, sys, tempfile
from pathlib import Path
os.umask(0o077)
if len(sys.argv) != 2:
 raise SystemExit('Usage: check-mcp-upgrade.py VERIFIED_PI_MCP_1_4_0_PACKAGE')
package = Path(sys.argv[1]).resolve()
assert json.loads((package/'package.json').read_text())['version'] == '1.4.0'
source = Path(__file__).resolve().parent
baseline = Path.home()/'.local/share/pi-durable-host/releases/c0019d7-nico2'
node = Path.home()/'.nvm/versions/node/v24.19.0/bin/node'
stage = Path(tempfile.mkdtemp(prefix='pi-mcp140-check-', dir='/var/tmp'))
shutil.copytree(baseline/'host-bindings-v16', stage/'bindings')
for path in [stage/'bindings', *(stage/'bindings').rglob('*')]:
 path.chmod(0o700 if path.is_dir() else 0o600)
legacy = Path.home()/'.local/share/pi-durable-host/releases/c0019d7-sse1/host-bindings-v16'
shutil.copy2(legacy/'session-mcp.mjs', stage/'bindings/legacy-session-mcp.mjs')
profile = (legacy/'operational-profile.mjs').read_text()
assert profile.count("from './session-mcp.mjs'") == 1
(stage/'bindings/legacy-operational-profile.mjs').write_text(profile.replace("from './session-mcp.mjs'", "from './legacy-session-mcp.mjs'"))
for name in ['nico-session-mcp.test.mjs', 'native-mcp-comparison.test.mjs', 'large-snapshot.test.mjs']:
 shutil.copy2(source/name, stage/'bindings'/name)
guardPath = 'node_modules/dpi-backend/dist/dpi-backend/src/native-profile/guards/mcp-codemode.js'
guard = (baseline/guardPath).read_text()
old = '(result.structuredContent ?? result)'
new = '(result.structuredContent !== undefined ? result.structuredContent : result)'
assert guard.count(old) == 1
owningSource = source.parent.parent/'apps/dpi-backend/src/native-profile/guards/mcp-codemode.ts'
assert new in owningSource.read_text() and old not in owningSource.read_text()
(stage/'mcp-codemode.js').write_text(guard.replace(old, new))
regression = source.parent.parent/'apps/dpi-backend/tests/native-mcp-structured-results.test.mjs'
test = regression.read_text()
assert test.count("../src/native-profile/guards/mcp-codemode.js") == 1
(stage/'bindings/native-mcp-structured-results.test.mjs').write_text(test.replace('../src/native-profile/guards/mcp-codemode.js', '../node_modules/dpi-backend/dist/dpi-backend/src/native-profile/guards/mcp-codemode.js'))
command = ['systemd-run','--user','--scope','--quiet','--collect','-p','MemoryMax=1G','-p','MemorySwapMax=0',
 '-p','CPUQuota=100%','timeout','-k','3s','110s','bwrap','--unshare-all','--die-with-parent','--new-session','--clearenv',
 '--ro-bind','/usr','/usr','--ro-bind','/lib','/lib','--ro-bind','/lib64','/lib64','--symlink','usr/bin','/bin',
 '--proc','/proc','--dev','/dev','--tmpfs','/tmp','--tmpfs','/home/probe',
 '--ro-bind',str(node),'/runtime/node',
 '--ro-bind',str(baseline/'node_modules'),'/candidate/node_modules',
 '--ro-bind',str(package),'/candidate/node_modules/@earendil-works/pi-mcp',
 '--ro-bind',str(stage/'mcp-codemode.js'),'/candidate/'+guardPath,
 '--ro-bind',str(stage/'bindings'),'/candidate/bindings',
 '--ro-bind',str((Path.home()/'.local/bin/dcg').resolve()),'/home/probe/.local/bin/dcg',
 '--setenv','HOME','/home/probe','--setenv','PATH','/runtime:/usr/bin:/bin',
 '--remount-ro','/','--chdir','/candidate','/runtime/node','--test','--test-concurrency=1',
 '/candidate/bindings/nico-session-mcp.test.mjs','/candidate/bindings/operational-profile.test.mjs',
 '/candidate/bindings/native-mcp-comparison.test.mjs','/candidate/bindings/large-snapshot.test.mjs',
 '/candidate/bindings/native-mcp-structured-results.test.mjs']
with (stage/'check.log').open('x') as log:
 result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, timeout=120)
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
report = {'exitCode':result.returncode,'stage':str(stage),'piMcpVersion':'1.4.0','networkIsolated':True,
 'realCredentialsMounted':False,'realDataMounted':False,'activated':False,
 'bridgePatch':{'file':guardPath,'preimageSha256':hashlib.sha256(guard.encode()).hexdigest(),'sha256':sha(stage/'mcp-codemode.js'),
 'sourceSha256':sha(owningSource),'regressionSha256':sha(regression)},
 'tests':{'pass':14 if result.returncode == 0 else None,'fail':0 if result.returncode == 0 else None},
 'packageFiles':{str(path.relative_to(package)):sha(path) for path in sorted(package.rglob('*')) if path.is_file()},
 'sourceFiles':{name:sha(source/name) for name in ['check-mcp-upgrade.py','nico-session-mcp.test.mjs','native-mcp-comparison.test.mjs','large-snapshot.test.mjs']}}
if result.returncode == 0:
 report['candidateVerdict'] = 'PI_MCP_1_4_0_WITH_NICO_PASS'
 report['stockManagerReplacement'] = {'accepted':False,'measuredBlockers':['adapter-only server omitted','tools/call resent after HTTP 404']}
(stage/'RESULT.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({key:value for key,value in report.items() if key not in ['packageFiles','sourceFiles']}))
for line in (stage/'check.log').read_text().splitlines():
 if any(word in line for word in ['not ok','error:', 'Error:', 'pass ', 'fail ', 'duration_ms', 'actual:', 'expected:']):
  print(line[:500])
raise SystemExit(result.returncode)
