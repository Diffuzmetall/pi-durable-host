#!/usr/bin/env python3
"""Read-only ISC-77 snapshot. Never connects to Host HTTP, opens DB or reads auth/config.json.

Reads only systemd's explicitly selected identity properties, /proc PID identity,
unit-file digests, and known release selector symlinks. No service mutations.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess


def snapshot():
    command = ['systemctl', '--user', 'show', 'pi-durable-host.service',
               '--property=MainPID,ActiveState,FragmentPath,DropInPaths,ExecMainStartTimestamp']
    uid = os.getuid()
    env = {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'XDG_RUNTIME_DIR': f'/run/user/{uid}',
           'DBUS_SESSION_BUS_ADDRESS': f'unix:path=/run/user/{uid}/bus'}
    completed = subprocess.run(command, env=env, capture_output=True, text=True, check=True, timeout=10)
    properties = dict(line.split('=', 1) for line in completed.stdout.splitlines() if '=' in line)
    pid = int(properties['MainPID'])
    assert pid > 0 and properties['ActiveState'] == 'active', 'Expected existing active production Host'
    # comm may contain spaces/parentheses; the suffix starts after its final closing parenthesis.
    fields = Path(f'/proc/{pid}/stat').read_text().rsplit(') ', 1)[1].split()
    units = [properties['FragmentPath'], *shlex.split(properties.get('DropInPaths', ''))]
    hashes = {}
    for name in units:
        path = Path(name)
        assert path.is_absolute() and path.suffix in ('.conf', '.service'), 'Unexpected unit path'
        hashes[name] = hashlib.sha256(path.read_bytes()).hexdigest()
    selectors = {}
    for name in ['/home/ubuntu/.local/share/pi-durable-host/current',
                 '/home/ubuntu/.local/share/pi-durable/host']:
        path = Path(name)
        selectors[name] = {'exists': path.exists(), 'symlink': path.is_symlink(),
                           'resolved': str(path.resolve()) if path.exists() else None}
    # Retain only absolute JavaScript entry paths, never argv values, credentials or environment.
    arguments = Path(f'/proc/{pid}/cmdline').read_bytes().split(b'\0')
    entries = [Path(value.decode()) for value in arguments
               if value.startswith(b'/') and value.endswith((b'.mjs', b'.js', b'.cjs'))]
    launcher_targets = {str(path): str(path.resolve(strict=True)) for path in entries}
    assert launcher_targets, 'No exact production launcher target observed'
    return {'service': properties, 'launcherTargets': launcher_targets, 'pid': pid, 'startticks': fields[19],
            'cwd': os.readlink(f'/proc/{pid}/cwd'), 'executable': os.readlink(f'/proc/{pid}/exe'),
            'unitSha256': hashes, 'selectors': selectors}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--compare', type=Path)
    parser.add_argument('--out', type=Path)
    args = parser.parse_args()
    state = snapshot()
    if args.compare:
        assert state == json.loads(args.compare.read_text()), 'ISC-77 production identity/config/selectors changed'
    if args.out:
        args.out.write_text(json.dumps(state, indent=2) + '\n')
    print(json.dumps({'status': 'MATCH' if args.compare else 'BASELINE_ONLY', 'pid': state['pid'],
                      'startticks': state['startticks'], 'unitFiles': len(state['unitSha256']),
                      'output': str(args.out) if args.out else None, 'productionActivation': 'NOT RUN'}))


if __name__ == '__main__':
    main()
