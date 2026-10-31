#!/usr/bin/env python3
"""Run the single live acceptance owner, retaining diagnostics privately."""
import os
from pathlib import Path

os.umask(0o077)
root = Path('/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-dadd5534/live-control')
log = root / ('host-run-%03d.log' % (len(list(root.glob('host-run-*.log'))) + 1))
fd = os.open(log, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
os.dup2(fd, 2)
os.close(fd)
node = '/home/ubuntu/.nvm/versions/node/v24.19.0/bin/node'
os.execv(node, [node, str(root / 'live-host-v3.mjs')])
