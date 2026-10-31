"""CAS switch future Pi Durable terminal launches only; no service operation."""
import hashlib, importlib.util, json, tempfile
from pathlib import Path
release=Path('/home/ubuntu/.local/share/pi-durable-host/releases/terminal-model-skills-20261030-v1')
spec=importlib.util.spec_from_file_location('launcher_control',release/'launcher_control.py')
control=importlib.util.module_from_spec(spec);spec.loader.exec_module(control)
manifest=json.loads((release/'manifest.json').read_text())
for name,digest in manifest['files'].items():
    assert hashlib.sha256((release/'node_modules/dpi-terminal-adapter'/name).read_bytes()).hexdigest()==digest,name
old=(release/'launcher.preimage').read_bytes();new=(release/'launcher.candidate').read_bytes()
with tempfile.TemporaryDirectory(prefix='model-switch-cas-') as directory:
    probe=Path(directory)/'launcher';probe.write_bytes(old);probe.chmod(0o775)
    control.replace_launcher(probe,old,new);control.replace_launcher(probe,new,old)
    assert probe.read_bytes()==old
    probe.write_bytes(b'changed')
    try: control.replace_launcher(probe,old,new)
    except RuntimeError: pass
    else: raise AssertionError('Concurrent change not refused')
control.replace_launcher(Path('/home/ubuntu/.local/bin/pi-durable'),old,new)
print(json.dumps({'activeRelease':str(release),'launcherSha256':hashlib.sha256(new).hexdigest(),'rollbackCanary':True,'concurrentChangeRefused':True,'servicesRestarted':False}))
