"""Disposable faux backend restart with the same actual terminal/editor process.
Explicit entry paths select source or Alice's unpacked candidate; no live launcher.
No model calls, npm install, production paths, inherited auth, or process-wide kills.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pty
import re
import secrets
import select
import signal
import socket
import struct
import subprocess
import tempfile
import termios
import time
import urllib.error
import urllib.parse
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--backend-entry', required=True, type=Path)
parser.add_argument('--terminal-entry', required=True, type=Path)
parser.add_argument('--backend-cwd', required=True, type=Path)
parser.add_argument('--terminal-cwd', required=True, type=Path)
args = parser.parse_args()
backend_entry = args.backend_entry.resolve(strict=True)
terminal_entry = args.terminal_entry.resolve(strict=True)
root = Path(tempfile.mkdtemp(prefix='heidi-restart-pty-'))
work = root / 'work'
work.mkdir()
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
base = 'http://127.0.0.1:' + str(port)
token = 'fixture-' + secrets.token_urlsafe(24)
env = {k: v for k, v in os.environ.items() if k in ('PATH', 'LANG')}
env.update(HOME=str(root), TERM='xterm-256color', PI_CODING_AGENT_DIR=str(root / 'agent'),
           DPI_HOME=str(root / 'host'), DPI_ENV_FILE=str(root / 'missing.env'), DPI_TOKEN=token,
           DPI_PROVIDER='faux', DPI_PROFILE='playground', DPI_START_DIRS=str(work))
log = open(root / 'host.log', 'wb')
host = None
terminal = None
master = None
output = bytearray()
checks = []
ansi = re.compile(r'\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))')
def tree_hash():
    digest = hashlib.sha256()
    for directory in (backend_entry.parent, terminal_entry.parent):
        for path in sorted(directory.rglob('*')):
            if path.is_file() and path.suffix in ('.ts', '.mts', '.js', '.mjs'):
                digest.update(str(path.relative_to(directory)).encode() + b'\0' + path.read_bytes())
    return digest.hexdigest()


before_tree = tree_hash()
report = {'result': 'FAIL', 'evidence': str(root), 'checks': checks,
          'beforeTreeHash': before_tree,
          'backendEntry': str(backend_entry), 'terminalEntry': str(terminal_entry),
          'entryHashes': {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in (backend_entry, terminal_entry)},
          'externalModelCalls': 0, 'productionActivation': 'NOT RUN'}


def command(entry):
    return ['node'] + (['--import', 'tsx'] if entry.suffix in ('.ts', '.mts') else []) + [str(entry)]


def pump():
    if master is not None and select.select([master], [], [], 0.03)[0]:
        try:
            output.extend(os.read(master, 65536))
        except OSError:
            pass


def wait(predicate, description, timeout=20):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if predicate():
            return
        pump()
        if terminal is not None and terminal.poll() is not None:
            break
        if master is None:
            time.sleep(0.025)  # Bounded fixture readiness, not model polling.
    if not predicate():
        raise AssertionError(description)


def request(path, body=None, key=None):
    headers = {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}
    if key:
        headers['Idempotency-Key'] = key
    req = urllib.request.Request(base + path, headers=headers,
                                 data=None if body is None else json.dumps(body).encode())
    with urllib.request.urlopen(req, timeout=5) as response:
        return json.load(response)


def healthy():
    try:
        return request('/healthz') is not None
    except (OSError, urllib.error.URLError):
        return False


def start_host():
    global host
    host = subprocess.Popen(command(backend_entry) + ['--port', str(port), '--host', '127.0.0.1'],
                            cwd=args.backend_cwd, env=env, stdin=subprocess.DEVNULL,
                            stdout=log, stderr=log, start_new_session=True)
    wait(healthy, 'isolated backend readiness', 30)
    assert host.poll() is None


def stop_host():
    if host is not None and host.poll() is None:
        host.send_signal(signal.SIGTERM)
        host.wait(timeout=10)
        assert host.returncode == 0, 'cooperative fixture shutdown must exit 0'


def send(text):
    os.write(master, text.encode())


def screen(marker, offset=0):
    wait(lambda: marker in ansi.sub('', output[offset:].decode(errors='replace')), 'missing renderer marker: ' + marker)


try:
    start_host()
    session = request('/v1/sessions', {'name': 'heidi-restart-pty', 'cwd': str(work),
                                     'model': {'provider': 'faux', 'modelId': 'echo'}}, 'heidi-pty-session')
    sid = session['id']
    agent = '/v1/sessions/' + sid + '/agents/main'
    request(agent + '/messages', {'content': 'HEIDI_SEED', 'requestId': 'heidi-seed', 'whenBusy': 'followUp'})
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 120, 0, 0))
    terminal = subprocess.Popen(command(terminal_entry) + [base, sid], cwd=args.terminal_cwd,
                                env=env, stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
    os.close(slave)
    screen('HEIDI_SEED')
    terminal_pid = terminal.pid
    checks.append('actual editor connected to disposable faux HTTP owner')
    stop_host()
    offset = len(output)
    draft = 'HEIDI_UNACCEPTED_DRAFT'
    send(draft + '\r')
    screen('Cannot submit', offset)
    pending = []
    for path in root.rglob('*.json'):
        try:
            item = json.loads(path.read_text())
        except (ValueError, OSError):
            continue
        if isinstance(item, dict) and item.get('text') == draft and item.get('requestId'):
            pending.append((path, item))
    assert len(pending) == 1, 'exactly one private pending request before restart'
    checks.append('offline submit records one request and displays Cannot submit')
    start_host()
    pending_path, pending_item = pending[0]
    pending_id = pending_item['requestId']
    # The client, not the probe, must perform authoritative reconciliation.
    wait(lambda: not pending_path.exists(), 'client reconciles absent request after reconnect')
    offset = len(output)
    send('-EXPLICIT\r')
    expected = draft + '-EXPLICIT'

    def inputs():
        items = request(agent + '/entries?scope=all')['items']
        return [m.get('content') for entry in items if entry.get('kind') in ('pi.user', 'host.input')
                for m in entry.get('model', []) if m.get('role') == 'user']

    wait(lambda: expected in inputs(), 'same editor restores draft and accepts explicit input after reconnect', 25)
    assert draft not in inputs(), 'old unaccepted text must not auto-submit'
    assert inputs().count(expected) == 1, 'explicit input accepted once'
    assert terminal.pid == terminal_pid and terminal.poll() is None, 'same preopened terminal survived'
    screen('Echo: HEIDI_UNACCEPTED_DRAFT-EXPLICIT', offset)
    checks.append('same editor preserves draft, accepts explicit suffix and renders new faux answer without manual Escape')
    try:
        request(agent + '/messages', {'content': draft, 'requestId': pending_id, 'whenBusy': 'steer'})
        raise AssertionError('late retired request unexpectedly accepted')
    except urllib.error.HTTPError as error:
        assert error.code == 409, 'late retired key must return 409'
    assert inputs().count(expected) == 1 and draft not in inputs()
    checks.append('retired absent key returns 409; native entries show no duplicate or automatic old input')
    send('/quit\r')
    wait(lambda: terminal.poll() is not None, 'terminal clean exit')
    assert terminal.wait(timeout=5) == 0
    stop_host()
    assert token.encode() not in output
    log.flush()
    assert token.encode() not in (root / 'host.log').read_bytes()
    report['afterTreeHash'] = tree_hash()
    assert report['afterTreeHash'] == before_tree, 'source/build changed during QA; rerun on stable candidate'
    report['result'] = 'PASS'
except Exception as error:
    report['error'] = str(error)
    raise
finally:
    (root / 'transcript.bin').write_bytes(output)
    if terminal is not None and terminal.poll() is None:
        terminal.send_signal(signal.SIGTERM)
        terminal.wait(timeout=10)
    if master is not None:
        os.close(master)
    stop_host()
    log.close()
    (root / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
