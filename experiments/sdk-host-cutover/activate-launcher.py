#!/usr/bin/env python3
import os,json,hashlib,stat,shutil,subprocess,tempfile
from pathlib import Path
from launcher_control import replace_launcher
os.umask(0o077)
home=Path.home();base=home/'.local/share/pi-durable-host/releases';old=base/'c0019d7-dadd5534';release=base/'c0019d7-sse1';config=home/'.config/pi-durable-host';source=Path(__file__).resolve().parent
node=home/'.nvm/versions/node/v24.19.0/bin/node';launcher=home/'.local/bin/pi-durable'
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def save(path,value):
 with path.open('x') as out:json.dump(value,out,indent=2);out.write('\n');out.flush();os.fsync(out.fileno())
original=(old/'legacy-launcher.preimage').read_bytes()
assert hashlib.sha256(original).hexdigest()=='5e322397b639987dc6e2fc39af472de90c515883e0112424f05d2c99bd0d6034'
assert launcher.read_bytes()==original and stat.S_IMODE(launcher.stat().st_mode)==0o775
assert json.loads((config/'OPERATIONAL-VERIFY.json').read_text())['passed']
assert 'pass 5' in (release/'operational-service-check.log').read_text() and 'fail 0' in (release/'operational-service-check.log').read_text()
assert 'pass 1' in (old/'live-control/sse-patched.log').read_text() and 'fail 0' in (old/'live-control/sse-patched.log').read_text()
for name in ['operational-service.mjs']:
 assert sha(source/name)==sha(release/name)
assert sha(source/'terminal-launcher.mjs')==sha(release/'host-bindings-v16/terminal-launcher.mjs')
replacement=f'#!/usr/bin/env bash\nset -euo pipefail\nexec {node} {release}/host-bindings-v16/terminal-launcher.mjs "$@"\n'.encode()
# Exercise the real replacement and rollback bytes on a disposable launcher first.
with tempfile.TemporaryDirectory(prefix='pi-durable-launcher-cas-') as directory:
 path=Path(directory)/'launcher';path.write_bytes(original);path.chmod(0o775)
 replace_launcher(path,original,replacement);assert path.read_bytes()==replacement
 replace_launcher(path,replacement,original);assert path.read_bytes()==original and stat.S_IMODE(path.stat().st_mode)==0o775
 path.write_bytes(b'concurrent edit')
 try:replace_launcher(path,original,replacement)
 except RuntimeError:pass
 else:raise AssertionError('Concurrent edit was not refused')
 assert path.read_bytes()==b'concurrent edit'
 link=Path(directory)/'symlink';link.symlink_to(path)
 try:replace_launcher(link,b'concurrent edit',replacement)
 except RuntimeError:pass
 else:raise AssertionError('Symlink was not refused')
def inventory(root):
 result={}
 for p in root.rglob('*'):
  if p.is_symlink():
   assert p.resolve().is_relative_to(root.resolve()),'Package symlink escapes immutable installation'
   result[str(p.relative_to(root))]='link:'+os.readlink(p)
  elif p.is_file():result[str(p.relative_to(root))]=sha(p)
 return result
before=inventory(old/'node_modules');after=inventory(release/'node_modules')
assert before.keys()==after.keys();changed=[key for key in before if before[key]!=after[key]]
assert changed==['dpi-backend/dist/dpi-backend/src/streams.js'],changed
for name in ['launcher_control.py','rollback-launcher.py','backend-sse.patch']:
 target=release/name;assert not target.exists();shutil.copyfile(source/name,target);target.chmod(0o600)
with (config/'launcher.new').open('xb') as out:out.write(replacement);out.flush();os.fsync(out.fileno())
code={name:sha(release/name) for name in ['operational-service.mjs','host-bindings-v16/operational-profile.mjs','host-bindings-v16/terminal-launcher.mjs','host-bindings-v16/compiled/bindings.mjs','host-bindings-v16/session-mcp.mjs','host-bindings-v16/provision-session-mail.mjs','launcher_control.py','rollback-launcher.py']}
manifest={'baseSource':'c0019d73152b58783d1b74fabe95f6982206aa55','release':str(release),'profile':'native@1','node':str(node),'nodeSha256':sha(node),
 'packages':after,'packageDelta':{key:{'before':before[key],'after':after[key]} for key in changed},'code':code,
 'hostConfigurationSha256':sha(config/'host.json'),'launcherBeforeSha256':hashlib.sha256(original).hexdigest(),'launcherAfterSha256':hashlib.sha256(replacement).hexdigest(),
 'launcherMode':'0775','exactLauncherRollbackCanary':True,'concurrentEditAndSymlinkRefused':True,
 'providerChecks':{'terminal':True,'selectedCopy':True,'iii':True,'reservedDispatches':3,'additionalCalls':0},
 'largeSnapshotRegression':'red old / green patched; real 3 MB selected history streams all four optional documents',
 'operationalChecks':5,'originalRuntimeRestoreEvidence':'/var/tmp/dave-no-bb-restore.0kq1rR/RESULT.json',
 'launcherRollbackTarget':'20261030-headless-48a55067','originalRuntimeRestoreIsDistinctFromLauncherRollback':True,
 'memory':'existing banks enabled; packaged native lifecycle helpers present','tracing':'native metadata bridge, not legacy full-payload parity',
 'bb':'deferred','nico':'not activated','postSwitchVerification':'pending'}
save(config/'ACTIVATION-PREFLIGHT.json',manifest)
# Freeze code, dependencies and client binding. Writable data and control records are outside this root.
for path in sorted(release.rglob('*'),key=lambda p:len(p.parts),reverse=True):
 if not path.is_symlink():path.chmod(stat.S_IMODE(path.stat().st_mode)&~0o222)
release.chmod(0o500)
subprocess.run(['systemctl','--user','enable','pi-durable-host.service','pi-durable-iii-engine.service','pi-durable-iii-worker.service'],check=True,capture_output=True)
# Final exact-preimage comparison is inside the atomic replacement, after all preparatory work.
replace_launcher(launcher,original,replacement)
assert launcher.read_bytes()==replacement and stat.S_IMODE(launcher.stat().st_mode)==0o775
save(config/'ACTIVATED.json',{'launcherSha256':sha(launcher),'launcherMode':'0775','runtimeSealed':True,'servicesEnabled':True,'originalProcessesStopped':False,'postSwitchVerification':'pending'})
print('LAUNCHER_ACTIVATED: exact preimage matched; immutable SDK release; original runtime kept as pi-durable-legacy; rollback canary and concurrent-edit refusal passed')
