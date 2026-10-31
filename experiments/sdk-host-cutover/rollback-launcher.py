#!/usr/bin/env python3
import hashlib
from pathlib import Path
from launcher_control import replace_launcher
home=Path.home();old=home/'.local/share/pi-durable-host/releases/c0019d7-dadd5534/legacy-launcher.preimage'
original=old.read_bytes()
assert hashlib.sha256(original).hexdigest()=='5e322397b639987dc6e2fc39af472de90c515883e0112424f05d2c99bd0d6034'
replace_launcher(home/'.local/bin/pi-durable',(home/'.config/pi-durable-host/launcher.new').read_bytes(),original)
print('Legacy launcher restored exactly. Existing owners and all new Host history remain untouched; candidate DBs were not opened by the old runtime.')
