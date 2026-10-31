from pathlib import Path
from launcher_control import replace_launcher
r=Path(__file__).resolve().parent
replace_launcher(Path('/home/ubuntu/.local/bin/pi-durable'),(r/'launcher.candidate').read_bytes(),(r/'launcher.preimage').read_bytes())
print('Previous launcher restored exactly; no sessions/services/DBs changed')
