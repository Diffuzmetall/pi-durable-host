"""Stage a terminal-only release; never edits an existing release or starts services."""
import hashlib, json, os, shutil, stat
from pathlib import Path
os.umask(0o077)
project = Path(__file__).resolve().parents[2]
old = Path('/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-sse1')
release = old.parent / 'terminal-model-skills-20261030-v1'
launcher = Path('/home/ubuntu/.local/bin/pi-durable')
preimage = launcher.read_bytes()
assert hashlib.sha256(preimage).hexdigest() == '5f58a3d129baa0cc10fce2c5dddc2d5c03210d0224a66b5c99e64950ef517917'
assert not release.exists()
release.mkdir(mode=0o700)
modules = release / 'node_modules'
modules.mkdir()
for item in (old / 'node_modules').iterdir():
    if item.name != 'dpi-terminal-adapter':
        (modules / item.name).symlink_to(item, target_is_directory=item.is_dir())
terminal = modules / 'dpi-terminal-adapter'
terminal.mkdir()
source = project / 'apps/terminal-adapter'
for name in ['dist', 'package.json', 'README.md', 'NOTICE.md']:
    path = source / name
    if path.is_dir(): shutil.copytree(path, terminal / name)
    else: shutil.copy2(path, terminal / name)
(release / 'host-bindings-v16').mkdir()
code = (old / 'host-bindings-v16/terminal-launcher.mjs').read_text()
code = code.replace("new URL('../terminal-client.json', import.meta.url)", "new URL('file://' + " + repr(str(old / 'terminal-client.json')) + ")")
(release / 'host-bindings-v16/terminal-launcher.mjs').write_text(code)
(release / 'launcher.preimage').write_bytes(preimage)
replacement = preimage.replace(str(old).encode(), str(release).encode())
(release / 'launcher.candidate').write_bytes(replacement)
shutil.copy2(project / 'experiments/sdk-host-cutover/launcher_control.py', release / 'launcher_control.py')
(release / 'rollback.py').write_text("from pathlib import Path\nfrom launcher_control import replace_launcher\nr=Path(__file__).resolve().parent\nreplace_launcher(Path('/home/ubuntu/.local/bin/pi-durable'),(r/'launcher.candidate').read_bytes(),(r/'launcher.preimage').read_bytes())\nprint('Previous launcher restored exactly; no sessions/services/DBs changed')\n")
manifest = {'release': str(release), 'previousLauncherSha256': hashlib.sha256(preimage).hexdigest(), 'candidateLauncherSha256': hashlib.sha256(replacement).hexdigest(), 'previousRelease': str(old), 'backendChanged': False, 'clientConfigCopied': False, 'files': {str(p.relative_to(terminal)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(terminal.rglob('*')) if p.is_file()}}
(release / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
# Seal only new files, never follow shared dependency symlinks.
for root, dirs, files in os.walk(release, topdown=False, followlinks=False):
    for name in files:
        p=Path(root)/name
        if not p.is_symlink(): p.chmod(stat.S_IMODE(p.stat().st_mode) & ~0o222)
    if not Path(root).is_symlink(): Path(root).chmod(0o500)
print(release)
