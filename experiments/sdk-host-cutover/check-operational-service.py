#!/usr/bin/env python3
import os,subprocess
from pathlib import Path
os.umask(0o077)
root=Path('/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-sse1');source=Path(__file__).resolve().parent
command=['systemd-run','--user','--scope','--quiet','--collect','-p','MemoryMax=1G','-p','MemorySwapMax=0','-p','CPUQuota=100%',
 'timeout','-k','3s','40s','bwrap','--unshare-all','--die-with-parent','--new-session','--clearenv',
 '--ro-bind','/usr','/usr','--ro-bind','/lib','/lib','--ro-bind','/lib64','/lib64','--symlink','usr/bin','/bin',
 '--proc','/proc','--dev','/dev','--tmpfs','/tmp','--tmpfs','/home/probe',
 '--ro-bind','/home/ubuntu/.nvm/versions/node/v24.19.0/bin/node','/runtime/node',
 '--ro-bind',str(root/'node_modules'),'/candidate/node_modules',
 '--ro-bind',str(root/'host-bindings-v16'),'/candidate/host-bindings-v16',
 '--ro-bind',str(root/'operational-service.mjs'),'/candidate/operational-service.mjs',
 '--ro-bind',str(source/'operational-service.test.mjs'),'/candidate/checks/operational-service.test.mjs',
 '--setenv','HOME','/home/probe','--setenv','PATH','/runtime:/usr/bin:/bin',
 '--remount-ro','/','--chdir','/candidate','/runtime/node','--test','/candidate/checks/operational-service.test.mjs','/candidate/host-bindings-v16/terminal-launcher.test.mjs']
with (root/'operational-service-check.log').open('x') as output: result=subprocess.run(command,stdout=output,stderr=subprocess.STDOUT,timeout=45)
print('OPERATIONAL_SERVICE_CHECK exit',result.returncode,'credentialsMounted=false originalDataMounted=false networkIsolated=true')
raise SystemExit(result.returncode)
