"""Actual PTY, client-only replacement with unchanged disposable native HTTP Host.
Run only under the test-only hot-update sandbox. No installed Host or credentials.
Reuses restart-pty.py's explicit entry/PTY/HTTP pattern, without restarting backend.
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
assert Path('/scratch/sandbox-check.json').exists(), 'Run with sandbox/run.py; no live fallback'
root = Path(tempfile.mkdtemp(prefix='eve-hot-ui-'))
info_path = root / 'info.json'
env = dict(os.environ, HOT_UI_INFO=str(info_path), TERM='xterm-256color')
host_log = open(root / 'host.log', 'wb')
host = subprocess.Popen(['node', '--import', 'tsx', 'tests/hot-reload-ui-probe.mts'],
                        cwd=repo / 'apps/terminal-adapter', env=env,
                        stdout=host_log, stderr=host_log, start_new_session=True)
terminal = None
master = None
output = bytearray()
checks = []
report = {'status': 'FAIL', 'checks': checks, 'productionActivation': 'NOT RUN'}
ansi = re.compile(r'\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))')


def pump():
    if master is not None and select.select([master], [], [], 0.03)[0]:
        try:
            output.extend(os.read(master, 65536))
        except OSError:
            pass


def wait(predicate, description, timeout=25):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if predicate():
            return
        pump()
        if master is None:
            time.sleep(0.025)  # Bounded fixture readiness, not agent polling.
    raise AssertionError(description)


def screen(text, offset=0):
    wait(lambda: text in ansi.sub('', output[offset:].decode(errors='replace')), text)


def request(path, body=None):
    req = urllib.request.Request(info['base'] + path,
        headers={'Authorization': 'Bearer ' + info['token'], 'Content-Type': 'application/json'},
        data=None if body is None else json.dumps(body).encode())
    with urllib.request.urlopen(req, timeout=5) as response:
        return json.load(response)


def start_terminal():
    global terminal, master, output
    output = bytearray()
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 45, 140, 0, 0))
    terminal = subprocess.Popen(['node', '--import', 'tsx', 'src/main.ts', info['base'], info['sessionId']],
        cwd=repo / 'apps/terminal-adapter', env=dict(env, DPI_TOKEN=info['token']),
        stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
    os.close(slave)
    screen('NATIVE_GOAL_VIEW_SENTINEL')


def send(text):
    os.write(master, text.encode())


try:
    wait(info_path.exists, 'fixture ready')
    info = json.loads(info_path.read_text())
    agent = '/v1/sessions/' + info['sessionId'] + '/agents/main'
    request(agent + '/messages', {'content': 'EVE_HISTORY_SEED', 'requestId': 'eve-hot-seed', 'whenBusy': 'followUp'})
    wait(lambda: any(entry.get('kind') == 'pi.assistant' for entry in request(agent + '/entries?scope=all')['items']), 'seed completion')
    before = request(agent + '/entries?scope=all')['items']
    start_terminal()
    screen('EVE_HISTORY_SEED')
    first_pid = terminal.pid
    draft = 'EVE_UNSENT_ДРАФТ'
    send(draft)
    screen(draft)
    wait(lambda: any(p.read_text() == draft for p in Path(os.environ['HOME']).rglob('editor-1.draft')), 'checkpoint of actual editor')
    checks.append('actual editor checkpoint contains exact unsent unicode draft')
    # Replace only this disposable client process. No signal/reload/reopen reaches Host.
    terminal.send_signal(signal.SIGTERM)
    terminal.wait(timeout=10)
    os.close(master)
    master = None
    start_terminal()
    assert terminal.pid != first_pid and host.poll() is None
    screen(draft)
    assert request(agent + '/entries?scope=all')['items'] == before, 'no draft replay or history change on client restart'
    send('-EXPLICIT\r')
    wait(lambda: any(draft + '-EXPLICIT' in str(entry.get('model', [])) for entry in request(agent + '/entries?scope=all')['items']), 'focused restored editor submits exact suffixed draft without Escape')
    screen('Parent observed the question')
    checks.append('new client PID; same Host PID/session/history; draft restored focused and explicitly submitted once')
    skill = Path(info['root']) / 'agent/skills/eve-hot-menu'
    skill.mkdir(parents=True)
    (skill / 'SKILL.md').write_text('---\nname: eve-hot-menu\ndescription: Updated menu fixture\n---\nBODY\n')
    offset = len(output)
    send('/reload\r')
    screen('Reload applied:', offset)
    send('/skill:eve-hot')
    screen('eve-hot-menu', offset)
    send('\x1b')  # dismiss autocomplete before clearing the command prefix
    for _ in range(5):
        pump()
    send('\x15')  # clear only editor input, not backend history
    wait(lambda: all(not p.read_text() for p in Path(os.environ['HOME']).rglob('editor-1.draft')), 'cleared editor checkpoint')
    offset = len(output)
    send('/reload\r')
    screen('Resource cleanup failed.', offset)
    screen('No rollback was performed', offset)
    checks.append('second HTTP receipt cleanup=failed renders applied warning, never rollback or automatic retry')
    offset = len(output)
    send('/reload /untrusted')
    screen('/reload /untrusted', offset)
    send('\r')
    screen('cannot admit an adapter path', offset)
    send('EVE_FOCUS_AFTER_RELOAD_ERROR\r')
    wait(lambda: any('EVE_FOCUS_AFTER_RELOAD_ERROR' in str(entry.get('model', [])) for entry in request(agent + '/entries?scope=all')['items']), 'reload error must leave editor focused without Escape')
    assert 'Cannot submit' not in ansi.sub('', output[offset:].decode(errors='replace'))
    checks.append('real /reload shows counts, updates actual autocomplete; rejected command keeps editor focus')
    send('/quit\r')
    wait(lambda: terminal.poll() is not None, 'clean detach')
    assert terminal.wait(timeout=5) == 0
    host.send_signal(signal.SIGTERM)
    host.wait(timeout=10)
    assert host.returncode == 0
    result = json.loads(Path(str(info_path) + '.result').read_text())
    assert result['pid'] == host.pid
    # Seed, explicit restored draft and explicit post-error input only; reload sends no model turns.
    assert result['modelCalls'] == 3, result
    assert result['reloadPosts'] == 2, result  # Two explicit commands, no automatic retry.
    assert result['receipts'] == ['none', 'failed'], result
    checks.append('exactly three explicit faux model turns and two explicit reload POSTs; no extra reload/reconnect turns or retries')
    report.update(status='PASS', hostPid=host.pid, firstClientPid=first_pid, secondClientPid=terminal.pid,
                  sessionId=info['sessionId'], modelCalls=result['modelCalls'], reloadPosts=result['reloadPosts'],
                  receipts=result['receipts'])
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
