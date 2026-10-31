#!/usr/bin/env python3
"""Transfer only the already accepted candidate; never import or copy session databases."""
import os,json,hashlib,sqlite3,signal,select,stat,shutil,time
from pathlib import Path
os.umask(0o077)
home=Path.home();base=home/'.local/share/pi-durable-host';old=base/'releases/c0019d7-dadd5534';release=base/'releases/c0019d7-sse1';control=old/'live-control';config=home/'.config/pi-durable-host'
node=home/'.nvm/versions/node/v24.19.0/bin/node'
def save(path,value):
 data=(json.dumps(value,indent=2)+'\n').encode() if not isinstance(value,bytes) else value
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 try: os.write(fd,data);os.fsync(fd)
 finally: os.close(fd)
 fd=os.open(path.parent,os.O_RDONLY);os.fsync(fd);os.close(fd)
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def stop(pid,args):
 assert Path(f'/proc/{pid}/cmdline').read_bytes().split(b'\0')[:-1]==[str(x).encode() for x in args], 'Own process command changed'
 fd=os.pidfd_open(pid);os.kill(pid,signal.SIGTERM);assert select.select([fd],[],[],30)[0], 'Own process did not close';os.close(fd)
state=json.loads((control/'host-state.json').read_text());binding=json.loads((old/'CANDIDATE-PATH-BINDING.json').read_text())
launcher=home/'.local/bin/pi-durable';preimage=old/'legacy-launcher.preimage'
assert not launcher.is_symlink() and launcher.read_bytes()==preimage.read_bytes() and stat.S_IMODE(launcher.stat().st_mode)==0o775
assert sha(launcher)=='5e322397b639987dc6e2fc39af472de90c515883e0112424f05d2c99bd0d6034'
assert sorted(p.stem for p in (old/'live-acceptance-ledger').glob('*.json'))==['iii','selected-copy','terminal']
for stage in ['terminal','selected-copy','iii']:assert json.loads((control/f'{stage}-RESULT.json').read_text())['passed']
assert json.loads((control/'iii-transport-RESULT.json').read_text())['passed']
readiness=json.loads((control/'OWNER-TRANSFER-READINESS.json').read_text());assert all(not a['busy'] for a in readiness['agents'])
source=Path(binding['dataDir']);destination=base/'data/main';destination.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
assert not destination.exists() and source.stat().st_dev==destination.parent.stat().st_dev
assert not config.exists();config.mkdir(mode=0o700)
units=home/'.config/systemd/user';units.mkdir(parents=True,exist_ok=True)
for name in ['pi-durable-host.service','pi-durable-iii-engine.service','pi-durable-iii-worker.service']:assert not (units/name).exists()
assert not (home/'.local/bin/pi-durable-legacy').exists()
# These exact PIDs were confirmed through our three Tern blocks, not a broad process match.
stop(3564725,[node,old/'node_modules/dpi-iii-adapter/dist/main.js','--config',control/'iii-worker.json'])
stop(3563947,[home/'.local/bin/iii','--config',control/'iii-engine.yaml','--no-update-check'])
connection=json.loads((control/'connection.json').read_text());stop(connection['pid'],[node,release/'live-control/live-host-sse.mjs'])
assert not list(source.rglob('*.lock')), 'Existing owner lock; never steal it'
# All native tasks must have reached terminal state, including memory deliveries.
rows=[]
catalog=sqlite3.connect(source/'catalog.sqlite');catalog.row_factory=sqlite3.Row
rows=[dict(row) for row in catalog.execute('SELECT * FROM sessions')];catalog.close()
assert len(rows)==2
for row in rows:
 native=Path(row['dbPath']);assert native.is_relative_to(source) and native.is_file()
 wal=Path(str(native)+'-wal');assert not wal.exists() or wal.stat().st_size==0,'Native WAL remains; do not inspect an incomplete snapshot'
 db=sqlite3.connect(native.as_uri()+'?immutable=1',uri=True)
 assert all(json.loads(r[0])['state']['status']=='terminal' for r in db.execute('SELECT record FROM tasks')), 'Pending native work; do not transfer owner'
 db.close()
files={str(p.relative_to(source)):sha(p) for p in source.rglob('*') if p.is_file() and not p.name.startswith('catalog.sqlite')}
assert all(not p.is_symlink() for p in source.rglob('*'))
locks=[source/'catalog.sqlite.lock']+[Path(row['dbPath']+'.lock') for row in rows]
for path in locks:
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600);os.write(fd,str(os.getpid()).encode());os.close(fd)
save(config/'relocation.json',{'source':str(source),'destination':str(destination),'rowsBefore':rows,'nativeFilesBefore':files,'copied':False,'importedAgain':False})
renamed=False;db=None
try:
 db=sqlite3.connect(source/'catalog.sqlite')
 pre=json.loads((control/'compaction-preimage.json').read_text())['settings']
 actual=db.execute('SELECT settings FROM session_compaction WHERE sessionId=?',(binding['before']['id'],)).fetchone()
 assert actual==((pre,) if pre is not None else None),'Compaction preimage not restored'
 for row in rows:
  path=str(destination/Path(row['dbPath']).relative_to(source))
  assert db.execute('UPDATE sessions SET dbPath=? WHERE id=? AND dbPath=?',(path,row['id'],row['dbPath'])).rowcount==1
 db.commit();db.close()
 os.rename(source,destination);renamed=True
 assert files=={str(p.relative_to(destination)):sha(p) for p in destination.rglob('*') if p.is_file() and not p.name.startswith('catalog.sqlite') and not p.name.endswith('.lock')}
except Exception:
 if not renamed:
  if db is not None:db.close()
  restore=sqlite3.connect(source/'catalog.sqlite')
  for row in rows:
   new_path=str(destination/Path(row['dbPath']).relative_to(source))
   restore.execute('UPDATE sessions SET dbPath=? WHERE id=? AND dbPath=?',(row['dbPath'],row['id'],new_path))
  restore.commit();restore.close()
 raise
finally:
 for path in locks:
  current=destination/path.relative_to(source) if renamed else path
  assert current.read_text()==str(os.getpid());current.unlink()
assert renamed
owner={'id':'cutover-operator','actor':'cutover-operator','token':state['ownerToken'],'source':'terminal','authority':'human','permissions':['read','write','control','filesystem','human-accept'],'binding':{}}
workspaces=[binding['cwd'],state['createBody']['cwd']]
save(config/'host.json',{'dataDir':str(destination),'startDirs':workspaces,'trustedWorkspaces':workspaces,'port':state['port'],'ownerGrantId':owner['id'],'grants':[owner,state['iiiGrant']]})
save(release/'terminal-client.json',{'url':f"http://127.0.0.1:{state['port']}",'token':state['ownerToken']})
for filename in ['iii-engine.yaml','iii-worker.json','iii-private.pem']:
 save(config/filename,(control/filename).read_bytes())
(config/'iii-home').mkdir(mode=0o700)
# No model credentials copied: the Host reads existing private AuthStorage and native config.
path=str(node.parent)+':'+os.environ['PATH']
save(config/'runtime.env',('HOME='+str(home)+'\nPATH='+path+'\nPI_CODING_AGENT_DIR='+str(home/'.pi/agent')+'\nLANG=C.UTF-8\n').encode())
save(config/'iii-worker.env',('PI_DURABLE_III_TOKEN='+state['iiiGrant']['token']+'\nOTEL_ENABLED=false\n').encode())
common='\n[Install]\nWantedBy=default.target\n'
save(units/'pi-durable-host.service',f'''[Unit]
Description=Pi Durable native Host (SDK terminal and iii)
[Service]
Type=notify
NotifyAccess=all
EnvironmentFile={config}/runtime.env
WorkingDirectory={config}
ExecStart={node} {release}/operational-service.mjs {config}/host.json
UMask=0077
Restart=no
TimeoutStartSec=30
TimeoutStopSec=60
KillMode=process
'''.encode()+common.encode())
save(units/'pi-durable-iii-engine.service',f'''[Unit]
Description=Private loopback iii engine for Pi Durable
[Service]
Type=exec
Environment=HOME={config}/iii-home
Environment=OTEL_ENABLED=false
WorkingDirectory={config}/iii-home
ExecStart={home}/.local/bin/iii --config {config}/iii-engine.yaml --no-update-check
UMask=0077
Restart=no
TimeoutStopSec=30
'''.encode()+common.encode())
save(units/'pi-durable-iii-worker.service',f'''[Unit]
Description=Signed delegated iii SDK adapter for Pi Durable
Requires=pi-durable-host.service pi-durable-iii-engine.service
After=pi-durable-host.service pi-durable-iii-engine.service
[Service]
Type=exec
EnvironmentFile={config}/runtime.env
EnvironmentFile={config}/iii-worker.env
WorkingDirectory={config}/iii-home
ExecStart={node} {release}/node_modules/dpi-iii-adapter/dist/main.js --config {config}/iii-worker.json
UMask=0077
Restart=no
TimeoutStopSec=30
'''.encode()+common.encode())
# Preserve an explicit old-runtime route; do not change the default yet.
save(home/'.local/bin/pi-durable-legacy',preimage.read_bytes());(home/'.local/bin/pi-durable-legacy').chmod(0o775)
save(config/'TRANSFER-RESULT.json',{'relocated':True,'nativeFilesPreserved':len(files),'nativeTasksTerminal':True,'compactionPreimageRestored':True,'originalsOpened':False,'reimported':False,'launcherChanged':False,'providerAttempts':3})
print('ACCEPTED_CANDIDATE_RELOCATED: native bytes preserved, original databases untouched, no reimport; private units prepared, launcher unchanged')
