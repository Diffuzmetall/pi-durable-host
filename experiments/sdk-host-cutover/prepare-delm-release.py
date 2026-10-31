#!/usr/bin/env python3
"""Stage a new Host release with the existing pinned DeLM engine; never activate."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

os.umask(0o077)
if len(sys.argv) != 4:
    raise SystemExit('Usage: prepare-delm-release.py BASE_RELEASE NEW_RELEASE PINNED_DELM_PACKAGE')
base, release, package = [Path(p).resolve() for p in sys.argv[1:]]
source = Path(__file__).resolve().parent
assert base.is_dir() and base.parent == release.parent and not release.exists()
assert not (base.stat().st_mode & 0o222), 'Base release must remain sealed'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
assert (package / 'extensions/delm/index.js').is_file()
subprocess.run(['cp', '-a', '--reflink=auto', str(base), str(release)], check=True)
release.chmod(0o700)
bindings = release / 'host-bindings-v16'
bindings.chmod(0o700)
# This integration is based on the exact current operational profile, not an older release.
old = (base / 'host-bindings-v16/operational-profile.mjs').read_text()
expected = old.replace("import { provisionNewSessionMail } from './provision-session-mail.mjs';", "import { provisionNewSessionMail } from './provision-session-mail.mjs';\nimport { attachDelm } from './delm-profile.mjs';")
expected = expected.replace('    composition.extensions.push(status);\n    return composition;', "    composition.extensions.push(status);\n    if (process.env.DELM_BINDINGS_FILE) await attachDelm(composition, context, {\n      bindingFile: process.env.DELM_BINDINGS_FILE,\n      modulePath: new URL('./delm-engine/index.js', import.meta.url).pathname,\n    });\n    return composition;")
assert expected != old and (source / 'operational-profile.mjs').read_text() == expected, 'Unexpected operational profile diff'
for name in ['operational-profile.mjs', 'delm-profile.mjs', 'delm-profile.test.mjs']:
    target = bindings / name
    if target.exists(): target.chmod(0o600)
    shutil.copyfile(source / name, target)
    target.chmod(0o600)
engine = bindings / 'delm-engine'
engine.mkdir(mode=0o700)
(engine / 'package.json').write_text('{"type":"module"}\n')
for name in ['index.js', 'protocol.js']:
    shutil.copyfile(package / 'extensions/delm' / name, engine / name)
manifest = {'base': str(base), 'release': str(release), 'package': str(package), 'activated': False,
            'scope': 'DeLM session binding only; all existing Host dependencies and MCP retained',
            'files': {str(p.relative_to(release)): sha(p) for p in [bindings / 'operational-profile.mjs', bindings / 'delm-profile.mjs', *engine.iterdir()]}}
(release / 'DELM-RELEASE.json').write_text(json.dumps(manifest, indent=2) + '\n')
for path in release.rglob('*'):
    if not path.is_symlink(): path.chmod(path.stat().st_mode & ~0o222)
release.chmod(0o500)
print(json.dumps({'release': str(release), 'sealed': True, 'base': str(base)}))
