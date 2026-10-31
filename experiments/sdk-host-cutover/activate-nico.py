#!/usr/bin/env python3
"""Exact-preimage, idle-only Host service cutover. Never changes clients, MCP config or databases."""
import hashlib, json, os, subprocess, sys, tempfile
from pathlib import Path
os.umask(0o077)
if len(sys.argv)!=3: raise SystemExit('Usage: activate-nico.py SEALED_RELEASE PRIVATE_EVIDENCE_DIRECTORY')
release,evidence = map(lambda value:Path(value).resolve(),sys.argv[1:])
source=Path(__file__).resolve().parent
home=Path.home(); configDir=home/'.config/pi-durable-host'; unit=home/'.config/systemd/user/pi-durable-host.service'
node=home/'.nvm/versions/node/v24.19.0/bin/node'
run=lambda args,**kw: subprocess.run([str(x) for x in args],check=True,**kw)
def pid(): return int(subprocess.check_output(['systemctl','--user','show','pi-durable-host.service','-p','MainPID','--value'],text=True).strip())
config=json.loads((configDir/'host.json').read_text()); data=Path(config['dataDir'])
def unlocked():
 assert not (data/'catalog.sqlite.lock').exists(), 'Existing catalog owner lock: never steal'
 assert not list((data/'sessions').glob('*/agent.sqlite.lock')), 'Existing session owner lock: never steal'
def atomic(path,expected,replacement):
 assert not path.is_symlink() and path.read_bytes()==expected,'Exact preimage required'
 fd,name=tempfile.mkstemp(prefix='.nico-unit-',dir=path.parent)
 with os.fdopen(fd,'wb') as f: f.write(replacement); f.flush(); os.fsync(f.fileno())
 os.chmod(name,path.stat().st_mode & 0o777)
 assert path.read_bytes()==expected,'Concurrent unit edit refused'
 os.replace(name,path)
upgradeReceipt = release/'MCP140-CANDIDATE.json'
if upgradeReceipt.exists():
 run([sys.executable,source/'verify-mcp140-candidate.py',release],timeout=30)
with (evidence/'activation-intent.json').open('x') as f:
 json.dump({'release':str(release),'unit':str(unit),'started':True},f);f.flush();os.fsync(f.fileno())
assert not (release.stat().st_mode & 0o222),'Release must be sealed'
manifest=json.loads((release/'NICO-RELEASE.json').read_text())
hashfile=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
assert hashfile(release/'host-bindings-v16/session-mcp.mjs')==manifest['sessionMcpSha256']
assert hashfile(release/'host-bindings-v16/compiled/nico.mjs')==manifest['bundleSha256']
preimage=unit.read_bytes(); before=json.loads((evidence/'before.json').read_text())
previousService=Path(before['command'][1]); old=previousService.parent
assert old.parent==home/'.local/share/pi-durable-host/releases' and previousService.name=='operational-service.mjs'
assert str(previousService).encode() in preimage
replacement=preimage.replace(str(old/'operational-service.mjs').encode(),str(release/'operational-service.mjs').encode())
assert preimage!=replacement
(evidence/'host.service.preimage').write_bytes(preimage)
(evidence/'host.service.candidate').write_bytes(replacement)
dependent='pi-durable-iii-worker.service'
dependentWasActive=subprocess.run(['systemctl','--user','is-active','--quiet',dependent]).returncode==0
configPaths=[configDir/'host.json',configDir/'runtime.env',home/'.pi/agent/mcp.json',home/'.pi/agent/mcp-adapter.json',
 home/'.config/systemd/user/pi-durable-iii-worker.service',configDir/'iii-worker.json',configDir/'iii-worker.env']
configPaths += [Path(cwd)/'.pi/mcp.json' for cwd in config['trustedWorkspaces']]
configHashes={str(path):hashfile(path) if path.exists() else None for path in configPaths}
def configUnchanged():
 assert all((hashfile(Path(path)) if Path(path).exists() else None)==digest for path,digest in configHashes.items()),'Concurrent config edit refused'
def restoreDependent():
 # Requires= stops this SDK-only service when Host stops. Restore only its prior active state.
 if dependentWasActive:
  configUnchanged()
  run(['systemctl','--user','start',dependent],timeout=40)
  run(['systemctl','--user','is-active','--quiet',dependent],timeout=5)
assert pid()==before['pid'],'Host owner changed'
assert (Path('/proc')/str(pid())/'cmdline').read_bytes().split(b'\0')[:3]==[x.encode() for x in before['command'][:3]]
env=dict(part.decode().split('=',1) for part in (Path('/proc')/str(pid())/'environ').read_bytes().split(b'\0') if part)
# A fresh full native readiness check immediately precedes stopping this exact owned service.
run([node,source/'nico-state.mjs',evidence/'ready.json',evidence/'before.json'],timeout=60)
configUnchanged(); assert pid()==before['pid']
changed=False; stopped=False
try:
 run(['systemctl','--user','stop','pi-durable-host.service'],timeout=70); stopped=True
 assert pid()==0; unlocked()
 run([node,source/'nico-live-probe.mjs',release,evidence/'before.json',evidence/'live-mcp.json'],env=env,timeout=150)
 configUnchanged(); unlocked()
 atomic(unit,preimage,replacement); changed=True
 run(['systemctl','--user','daemon-reload'],timeout=15)
 run(['systemctl','--user','start','pi-durable-host.service'],timeout=45)
 run([node,source/'nico-state.mjs',evidence/'after.json',evidence/'before.json'],timeout=120)
 configUnchanged(); restoreDependent()
 result={'passed':True,'piMcpVersion':json.loads(upgradeReceipt.read_text())['piMcpVersion'] if upgradeReceipt.exists() else None,'iiiWorkerRestored':dependentWasActive,'release':str(release),'hostPid':pid(),'previousPid':before['pid'],'unitSha256':hashfile(unit),
 'configHashes':configHashes,'unchangedMcpConfiguration':True,'modelCalls':0,'clientsChanged':False,'BBChanged':False}
 (evidence/'ACTIVATED.json').write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps({'status':'NICO_ACTIVATED','hostPid':pid(),'modelCalls':0}))
except BaseException:
 # Refuse to stop a new owner or an active task even during rollback.
 if stopped:
  if pid():
   command=(Path('/proc')/str(pid())/'cmdline').read_bytes().split(b'\0')
   assert command[1]==str(release/'operational-service.mjs').encode(),'Different owner: rollback refused'
   run([node,source/'nico-state.mjs',evidence/'rollback-readiness.json'],timeout=60)
   run(['systemctl','--user','stop','pi-durable-host.service'],timeout=70)
  unlocked()
  if changed: atomic(unit,replacement,preimage)
  run(['systemctl','--user','daemon-reload'],timeout=15)
  run(['systemctl','--user','start','pi-durable-host.service'],timeout=45)
  run([node,source/'nico-state.mjs',evidence/'rollback.json',evidence/'before.json'],timeout=120)
  restoreDependent()
  print('NICO_NOT_ACTIVATED: original service restored; evidence retained')
 raise
