#!/usr/bin/env python3
"""Test-only bwrap launcher. No host root/HOME/tmp/network mounts or live fallback."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, help='Optional read-only source tree at /repo')
    parser.add_argument('--candidate', type=Path, help='Optional disposable artifact at /candidate')
    parser.add_argument('--previous', type=Path, help='Optional disposable prior artifact at /previous')
    parser.add_argument('--timeout', type=int, default=180)
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ['--'] else args.command
    if not command or not 1 <= args.timeout <= 1800:
        parser.error('Supply -- COMMAND; timeout must be 1..1800 seconds')
    bwrap = shutil.which('bwrap')
    node = shutil.which('node')
    if not bwrap or not node:
        parser.error('BLOCKED: bwrap and an installed node are required; no live fallback')
    node = Path(node).resolve()
    source = Path(__file__).resolve().parent
    mounts = []
    if args.repo:
        repo = args.repo.resolve(strict=True)
        if repo != source.parents[2]:
            parser.error('--repo must be this source checkout, never a parent or production path')
        mounts += ['--ro-bind', str(repo), '/repo']
    for value, target in [(args.candidate, '/candidate'), (args.previous, '/previous')]:
        if value:
            path = value.resolve(strict=True)
            if not path.is_dir() or path == Path('/tmp') or not path.is_relative_to('/tmp'):
                parser.error('Artifact mounts must be separate disposable directories under /tmp')
            mounts += ['--ro-bind', str(path), target]
    os.umask(0o077)
    root = Path(tempfile.mkdtemp(prefix='hot-update-sandbox-'))
    work = root / 'work'
    for directory in ['home/.pi/agent', 'data', 'tmp', 'config']:
        (work / directory).mkdir(parents=True, exist_ok=True)
    # This synthetic sentinel is outside every mounted directory, never in production.
    sentinel = root / 'outside-sentinel'
    sentinel.write_text('SYNTHETIC_UNMOUNTED_SENTINEL\n')
    sandbox = [bwrap, '--unshare-all', '--die-with-parent', '--new-session',
               '--cap-drop', 'ALL', '--clearenv',
               '--ro-bind', '/usr', '/usr', '--ro-bind', '/lib', '/lib',
               '--ro-bind', '/lib64', '/lib64', '--symlink', 'usr/bin', '/bin',
               '--symlink', 'usr/sbin', '/sbin', '--proc', '/proc', '--dev', '/dev',
               '--tmpfs', '/tmp', '--ro-bind', str(node), '/node/bin/node',
               '--ro-bind', str(source), '/sandbox', '--bind', str(work), '/scratch',
               *mounts,
               '--setenv', 'PATH', '/node/bin:/usr/bin:/bin',
               '--setenv', 'HOME', '/scratch/home',
               '--setenv', 'PI_CODING_AGENT_DIR', '/scratch/home/.pi/agent',
               '--setenv', 'XDG_CONFIG_HOME', '/scratch/config',
               '--setenv', 'TMPDIR', '/scratch/tmp', '--setenv', 'LANG', 'C.UTF-8',
               '--setenv', 'TERM', 'xterm-256color',
               '--remount-ro', '/', '--chdir', '/scratch',
               '/node/bin/node', '/sandbox/entry.mjs', str(sentinel), *command]
    (root / 'command.json').write_text(json.dumps(sandbox, indent=2) + '\n')
    # Even bwrap's PID-1 monitor must not inherit host secrets through /proc/environ.
    env = {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'}
    print(json.dumps({'sandboxRoot': str(root), 'command': command}), flush=True)
    with (root / 'run.log').open('wb') as log:
        result = subprocess.run(sandbox, env=env, stdin=subprocess.DEVNULL,
                                stdout=log, stderr=subprocess.STDOUT,
                                timeout=args.timeout, close_fds=True)
    print(json.dumps({'exitCode': result.returncode, 'evidence': str(root),
                      'selfCheck': str(work / 'sandbox-check.json'),
                      'productionActivation': 'NOT RUN'}), flush=True)
    raise SystemExit(result.returncode)


if __name__ == '__main__':
    main()
