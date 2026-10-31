#!/usr/bin/env python3
"""Changed-boundary checks: isolated network, synthetic HOME, no live databases or credentials."""
import os, sys, subprocess, tempfile, shutil, json, hashlib
from pathlib import Path
os.umask(0o077)
source = Path(__file__).resolve().parent
if len(sys.argv) != 2: raise SystemExit('Usage: check-nico.py BUNDLE_DIRECTORY')
bundle = Path(sys.argv[1]).resolve()
baseline = Path('/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-sse1')
stage = Path(tempfile.mkdtemp(prefix='nico-host-check-', dir='/var/tmp'))
shutil.copytree(baseline/'host-bindings-v16', stage/'bindings')
for path in [stage/'bindings', *(stage/'bindings').rglob('*')]:
 path.chmod(0o700 if path.is_dir() else 0o600)
shutil.copy2(bundle/'nico.mjs', stage/'bindings/compiled/nico.mjs')
shutil.copy2(baseline/'host-bindings-v16/session-mcp.mjs', stage/'bindings/legacy-session-mcp.mjs')
legacy = (baseline/'host-bindings-v16/operational-profile.mjs').read_text()
assert legacy.count("from './session-mcp.mjs'") == 1
(stage/'bindings/legacy-operational-profile.mjs').write_text(legacy.replace("from './session-mcp.mjs'", "from './legacy-session-mcp.mjs'"))
shutil.copy2(source/'nico-session-mcp.mjs', stage/'bindings/session-mcp.mjs')
shutil.copy2(source/'nico-session-mcp.test.mjs', stage/'bindings/nico-session-mcp.test.mjs')
command = ['systemd-run','--user','--scope','--quiet','--collect','-p','MemoryMax=1G','-p','MemorySwapMax=0',
 '-p','CPUQuota=100%','timeout','-k','3s','90s','bwrap','--unshare-all','--die-with-parent','--new-session','--clearenv',
 '--ro-bind','/usr','/usr','--ro-bind','/lib','/lib','--ro-bind','/lib64','/lib64','--symlink','usr/bin','/bin',
 '--proc','/proc','--dev','/dev','--tmpfs','/tmp','--tmpfs','/home/probe',
 '--ro-bind','/home/ubuntu/.nvm/versions/node/v24.19.0/bin/node','/runtime/node',
 '--ro-bind',str(baseline/'node_modules'),'/candidate/node_modules',
 '--ro-bind',str(stage/'bindings'),'/candidate/bindings',
 '--ro-bind',str(Path('/home/ubuntu/.local/bin/dcg').resolve()),'/home/probe/.local/bin/dcg',
 '--setenv','HOME','/home/probe','--setenv','PATH','/runtime:/usr/bin:/bin',
 '--remount-ro','/','--chdir','/candidate','/runtime/node','--test','--test-concurrency=1',
 '/candidate/bindings/nico-session-mcp.test.mjs','/candidate/bindings/operational-profile.test.mjs']
with (stage/'check.log').open('x') as log:
 result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, timeout=100)
report = {'exitCode':result.returncode,'stage':str(stage),'networkIsolated':True,'realCredentialsMounted':False,
 'realDataMounted':False,'sourceSha256':hashlib.sha256((source/'nico-session-mcp.mjs').read_bytes()).hexdigest()}
(stage/'RESULT.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
for line in (stage/'check.log').read_text().splitlines():
 if any(word in line for word in ['not ok','error:', 'Error:', 'pass ', 'fail ', 'duration_ms', 'MCP_', 'actual:', 'expected:']): print(line[:500])
raise SystemExit(result.returncode)
