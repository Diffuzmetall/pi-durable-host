#!/usr/bin/env python3
import os,sys,json
from pathlib import Path
os.umask(0o077)
r=Path('/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-dadd5534');c=r/'live-control'
node='/home/ubuntu/.nvm/versions/node/v24.19.0/bin/node'
env={'HOME':str(c/'iii-home'),'PATH':str(Path(node).parent)+':/usr/bin:/bin','OTEL_ENABLED':'false','LANG':'C.UTF-8'}
if sys.argv[1]=='engine':
 command=['/home/ubuntu/.local/bin/iii','--config',str(c/'iii-engine.yaml'),'--no-update-check']
elif sys.argv[1]=='worker':
 state=json.loads((c/'host-state.json').read_text());env['PI_DURABLE_III_TOKEN']=state['iiiGrant']['token']
 command=[node,str(r/'node_modules/dpi-iii-adapter/dist/main.js'),'--config',str(c/'iii-worker.json')]
else: raise SystemExit('engine or worker required')
os.execve(command[0],command,env)
