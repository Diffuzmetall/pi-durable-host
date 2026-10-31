#!/usr/bin/env python3
import os,json
from pathlib import Path
r=Path('/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-dadd5534')
b=json.loads((r/'CANDIDATE-PATH-BINDING.json').read_text());os.chdir(b['cwd'])
node='/home/ubuntu/.nvm/versions/node/v24.19.0/bin/node'
env=dict(os.environ);env['NODE_OPTIONS']='--import='+str(r/'live-control/trace-terminal.mjs')
os.execve(node,[node,str(r/'host-bindings-v15/terminal-launcher.mjs'),'--session',b['before']['id']],env)
