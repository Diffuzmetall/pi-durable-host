#!/usr/bin/env python3
import os,sys,subprocess
from pathlib import Path
os.umask(0o077)
base=Path('/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-dadd5534')
root=base if sys.argv[1].startswith('baseline') else Path('/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-sse1')
log=base/'live-control'/('sse-'+sys.argv[1]+'.log')
source=Path(__file__).resolve().parent/'large-snapshot.test.mjs'
command=['systemd-run','--user','--scope','--quiet','--collect','-p','MemoryMax=1G','-p','MemorySwapMax=0','-p','CPUQuota=100%',
 'timeout','-k','3s','35s','bwrap','--unshare-all','--die-with-parent','--new-session','--clearenv',
 '--ro-bind','/usr','/usr','--ro-bind','/lib','/lib','--ro-bind','/lib64','/lib64','--symlink','usr/bin','/bin',
 '--proc','/proc','--dev','/dev','--tmpfs','/tmp','--tmpfs','/home/probe',
 '--ro-bind','/home/ubuntu/.nvm/versions/node/v24.19.0/bin/node','/runtime/node',
 '--ro-bind',str(root/'node_modules'),'/candidate/node_modules','--ro-bind',str(source),'/candidate/checks/large-snapshot.test.mjs',
 '--setenv','HOME','/home/probe','--setenv','PATH','/runtime:/usr/bin:/bin','--setenv','NODE_OPTIONS','--max-old-space-size=512',
 '--remount-ro','/','--chdir','/candidate','/runtime/node','--test','/candidate/checks/large-snapshot.test.mjs']
with log.open('x') as output: result=subprocess.run(command,stdout=output,stderr=subprocess.STDOUT,timeout=40)
print('SSE',sys.argv[1],'exit',result.returncode,'credentialsMounted=false originalDataMounted=false networkIsolated=true')
sys.exit(result.returncode)
