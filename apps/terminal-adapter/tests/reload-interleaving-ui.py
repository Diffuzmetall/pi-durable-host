"""Actual editor race: newer draft survives delayed applied and lost-ACK reload.
Run only in sandbox/run.py. Reuses the native-attention Host and PTY entry pattern.
"""
import fcntl
import json
import os
from pathlib import Path
import pty
import re
import select
import signal
import struct
import subprocess
import tempfile
import termios
import time
import urllib.request

repo = Path(__file__).resolve().parents[3]
assert Path('/scratch/sandbox-check.json').exists(), 'Physical sandbox required; no live fallback'
root = Path(tempfile.mkdtemp(prefix='eve-reload-interleaving-'))
info_path = root / 'info.json'
env = dict(os.environ, HOT_UI_INFO=str(info_path), TERM='xterm-256color')
host_log = open(root / 'host.log', 'wb')
host = subprocess.Popen(['node', '--import', 'tsx', 'tests/reload-interleaving-ui-probe.mts'],
    cwd=repo / 'apps/terminal-adapter', env=env, stdout=host_log, stderr=host_log, start_new_session=True)
terminal = None
master = None
output = bytearray()
checks = []
report = {'status': 'FAIL', 'checks': checks, 'productionActivation': 'NOT RUN'}
ansi = re.compile(r'\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))')


def wait(predicate, description, timeout=25):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if predicate():
            return
        if master is not None and select.select([master], [], [], 0.03)[0]:
            try:
                output.extend(os.read(master, 65536))
            except OSError:
                pass
        elif master is None:
            time.sleep(0.025)  # Bounded fixture startup, not model polling.
    raise AssertionError(description)


def screen(text, offset=0):
    wait(lambda: text in ansi.sub('', output[offset:].decode(errors='replace')), text)


def request(path, body=None):
    req = urllib.request.Request(info['base'] + path,
        headers={'Authorization': 'Bearer ' + info['token'], 'Content-Type': 'application/json'},
        data=None if body is None else json.dumps(body).encode())
    with urllib.request.urlopen(req, timeout=5) as response:
        return json.load(response) if response.status != 204 else None


def send(text):
    os.write(master, text.encode())


try:
    wait(info_path.exists, 'fixture ready')
    info = json.loads(info_path.read_text())
    agent = '/v1/sessions/' + info['sessionId'] + '/agents/main'
    request(agent + '/messages', {'content': 'EVE_HISTORY_SEED', 'requestId': 'interleaving-seed', 'whenBusy': 'followUp'})
    wait(lambda: any(entry.get('kind') == 'pi.assistant' for entry in request(agent + '/entries?scope=all')['items']), 'seed completion')
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 45, 140, 0, 0))
    terminal = subprocess.Popen(['node', '--import', 'tsx', 'src/main.ts', info['base'], info['sessionId']],
        cwd=repo / 'apps/terminal-adapter', env=dict(env, DPI_TOKEN=info['token']),
        stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
    os.close(slave)
    screen('NATIVE_GOAL_VIEW_SENTINEL')
    for case, notice in [(1, 'Reload applied:'), (2, 'Reload unconfirmed:')]:
        before = request(agent + '/entries?scope=all')['items']
        offset = len(output)
        send('/reload\r')
        ready = Path(str(info_path) + f'.reload-{case}.json')
        wait(ready.exists, 'real Host reload has published before transport reply')
        receipt = json.loads(ready.read_text())
        assert receipt['status'] == 200, receipt
        assert json.loads(receipt['body'])['sessionId'] == info['sessionId']
        draft = f'EVE_NEW_DRAFT_ДРАФТ_{case}'
        send(draft)
        screen(draft, offset)
        wait(lambda: any(p.read_text() == draft for p in Path(os.environ['HOME']).rglob('editor-1.draft')), 'new editor draft checkpoint before reply')
        request(f'/_fixture/release/{case}', {})
        screen(notice, offset)
        assert 'Cannot submit' not in ansi.sub('', output[offset:].decode(errors='replace'))
        assert any(p.read_text() == draft for p in Path(os.environ['HOME']).rglob('editor-1.draft')), 'late reload result must not replace the newer draft'
        assert request(agent + '/entries?scope=all')['items'] == before, 'reload and draft typing must not submit model input'
        send('-EXPLICIT\r')
        wait(lambda: any(draft + '-EXPLICIT' in str(entry.get('model', [])) for entry in request(agent + '/entries?scope=all')['items']), 'newer draft remains focused and submits exact text without Escape')
        # Wait for this explicit model response before the next reload.
        screen('Parent observed the question', offset)
        checks.append(f'case {case}: real published reload, newer Unicode draft/focus/history retained, explicit submit only')
    send('/quit\r')
    wait(lambda: terminal.poll() is not None, 'terminal clean detach')
    assert terminal.wait(timeout=5) == 0
    host.send_signal(signal.SIGTERM)
    assert host.wait(timeout=10) == 0
    counts = json.loads(Path(str(info_path) + '.result').read_text())
    assert counts == {'modelCalls': 3, 'pid': host.pid, 'reloadPosts': 2, 'held': 0}, counts
    checks.append('exactly two explicit reload POSTs; no ACK-loss retry; exactly three explicit model turns')
    report.update(status='PASS', hostPid=host.pid, clientPid=terminal.pid, sessionId=info['sessionId'], **counts)
finally:
    for child in (terminal, host):
        if child is not None and child.poll() is None:
            child.send_signal(signal.SIGTERM)
            child.wait(timeout=10)
    if master is not None:
        os.close(master)
    host_log.close()
    (root / 'screen.log').write_bytes(output)
    (root / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'evidence': str(root), **report}))
