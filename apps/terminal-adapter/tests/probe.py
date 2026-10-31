"""Real HTTP/faux owner + localized existing TUI in a PTY. Never reads a live session."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import pty
import re
import secrets
import select
import signal
import struct
import subprocess
import tempfile
import termios
import time
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--entry', type=Path, default=Path(__file__).resolve().parents[1] / 'src/main.ts')
args = parser.parse_args()
entry = args.entry.resolve(strict=True)
node_args = ['node'] + (['--import', 'tsx'] if entry.suffix in ('.ts', '.mts') else [])
backend = Path(__file__).resolve().parents[2] / 'dpi-backend'
root = Path(tempfile.mkdtemp(prefix='dpi-remote-terminal-'))
token = 'fixture-' + secrets.token_urlsafe(24)
env = {k: v for k, v in os.environ.items() if k in ('PATH', 'LANG')}
env.update(HOME=str(root), TERM='xterm-256color', PI_CODING_AGENT_DIR=str(root / 'agent'), DPI_TOKEN=token, TERMINAL_PROBE_ROOT=str(root))
host_log = open(root / 'host.log', 'wb')
host = subprocess.Popen(['node', '--import', 'tsx', str(Path(__file__).with_name('probe-host.mjs'))], cwd=backend, env=env, stdin=subprocess.DEVNULL, stdout=host_log, stderr=host_log, start_new_session=True)
proc = None
master = None
output = bytearray()
checks = []
ansi = re.compile(r'\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))')


def api(path, body=None, key=None):
    headers = {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}
    if key:
        headers['Idempotency-Key'] = key
    request = urllib.request.Request(ready['base'] + '/v1' + path, data=None if body is None else json.dumps(body).encode(), headers=headers)
    with urllib.request.urlopen(request, timeout=20) as reply:
        return json.load(reply)


def wait(predicate, description, timeout=20):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        if master is not None:
            readable, _, _ = select.select([master], [], [], 0.03)
            if readable:
                try:
                    chunk = os.read(master, 65536)
                except OSError:
                    chunk = b''
                output.extend(chunk)
        else:
            time.sleep(0.02)  # Bounded fixture readiness, not agent/model polling.
        if proc is not None and proc.poll() is not None:
            break
        if host.poll() is not None:
            break
    # The child can exit between the top predicate and the liveness check.
    if predicate():
        return
    raise AssertionError(description + '; evidence=' + str(root))


def screen(marker, start=0):
    wait(lambda: marker in ansi.sub('', output[start:].decode(errors='replace')), 'Missing renderer marker: ' + marker)


def send(text):
    os.write(master, text if isinstance(text, bytes) else text.encode())


def entries(agent='main'):
    return api('/sessions/' + ready['sessionId'] + '/agents/' + str(agent) + '/entries?scope=active')['items']


def accepted_id(content, agent='main'):
    found = [e for e in entries(agent) if e.get('kind') in ('pi.user', 'host.input') and any(m.get('role') == 'user' and m.get('content') == content for m in e.get('model', []))]
    return found[-1].get('data', {}).get('requestId') if found else None


def receipt(content, agent='main'):
    from urllib.parse import quote
    key = accepted_id(content, agent)
    if not key:
        return None
    return api('/sessions/' + ready['sessionId'] + '/agents/' + str(agent) + '/receipts/' + quote(key, safe=''))


def terminal_status(submission_id):
    return api('/sessions/' + ready['sessionId'] + '/submissions/' + str(submission_id))


def command_for(*parts):
    # Result markers do not appear in the editor text, so input echo cannot satisfy renderer checks.
    return '!' + '; '.join("printf '" + ''.join('\\%03o' % b for b in part.encode()) + "'" if isinstance(part, str) else 'sleep ' + str(part) for part in parts)


def start_terminal(session_id):
    global master, proc
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 120, 0, 0))
    proc = subprocess.Popen(node_args + [str(entry), ready['base'], session_id], cwd=backend, env=env, stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
    os.close(slave)


def quit_terminal():
    send('/quit\r')
    wait(lambda: proc.poll() is not None, 'TUI must exit after /quit')
    assert proc.wait(timeout=5) == 0
    while select.select([master], [], [], 0)[0]:
        try:
            chunk = os.read(master, 65536)
        except OSError:
            break
        if not chunk:
            break
        output.extend(chunk)
    for code in (b'\x1b[?1049l', b'\x1b[?2004l', b'\x1b[?25h'):
        assert code in output, 'Terminal restoration missing'


try:
    wait(lambda: (root / 'ready.json').exists(), 'Disposable host readiness', 30)
    ready = json.loads((root / 'ready.json').read_text())
    start_terminal(ready['sessionId'])
    screen('REMOTE_ROOT_TRANSCRIPT')
    screen('git unknown')
    checks.append('localized original TUI startup over real HTTP; no client Git branch presented as server state')
    mark = len(output)
    text = 'remote\neditor'
    send(b'\x1b[200~' + text.encode() + b'\x1b[201~\r')
    wait(lambda: accepted_id(text) is not None, 'Exact multiline native input')
    screen('Echo: remote', mark)
    checks.append('original multiline editor submits exact steer input')
    tool = command_for('REMOTE_TOOL_PARTIAL', 1.5, 'REMOTE_TOOL_FINAL')
    mark = len(output)
    send(tool + '\r')
    send(b'\x0f')
    screen('REMOTE_TOOL_PARTIAL', mark)
    wait(lambda: receipt(tool) is not None, 'Tool submission receipt')
    assert terminal_status(receipt(tool)['submissionId'])['status'] in ('queued', 'pending'), 'Partial must render while native tool is running'
    screen('REMOTE_TOOL_FINAL', mark)
    checks.append('real tool partial then committed result with unchanged tool-card UI')
    child_job = api('/sessions/' + ready['sessionId'] + '/agents/' + str(ready['childId']) + '/messages', {'content': '!sleep 5', 'requestId': 'pty-child-active', 'whenBusy': 'followUp'})
    mark = len(output)
    send('/agents\r')
    screen('Switch to:', mark)
    send(b'\r')
    screen('REMOTE_CHILD_TRANSCRIPT', mark)
    mark = len(output)
    send(b'\x1b')
    screen('REMOTE_ROOT_TRANSCRIPT', mark)
    assert terminal_status(child_job['submissionId'])['status'] in ('queued', 'pending'), 'Child Escape must not cancel its native work'
    api('/sessions/' + ready['sessionId'] + '/agents/' + str(ready['childId']) + '/abort', {})
    checks.append('conversation navigation and child Escape return without child abort')
    root_job = command_for('ROOT_INTERRUPT_STARTED', 5, 'ROOT_INTERRUPT_UNEXPECTED')
    mark = len(output)
    send(root_job + '\r')
    screen('ROOT_INTERRUPT_STARTED', mark)
    wait(lambda: receipt(root_job) is not None, 'Interrupt target receipt')
    root_submission = receipt(root_job)['submissionId']
    send(b'\x1b')
    wait(lambda: terminal_status(root_submission)['status'] in ('done', 'unanswered'), 'Native root interrupt terminal outcome')
    assert 'ROOT_INTERRUPT_UNEXPECTED' not in ansi.sub('', output[mark:].decode(errors='replace'))
    checks.append('root Escape reaches native conversation interrupt, not generic task control')
    mark = len(output)
    send('/tasks\r')
    screen('Tasks ·', mark)
    send('/name remote-renamed\r')
    wait(lambda: api('/sessions/' + ready['sessionId'])['name'] == 'remote-renamed', 'Remote persistent session name')
    checks.append('task expansion and server-owned session rename')
    detached = command_for(0.8, 'REMOTE_DETACHED_RESULT')
    send(detached + b'\x1b\r'.decode())  # Existing Alt+Enter follow-up binding.
    wait(lambda: receipt(detached) is not None, 'Accepted follow-up before detach')
    detached_id = receipt(detached)['submissionId']
    quit_terminal()
    result = api('/sessions/' + ready['sessionId'] + '/submissions/' + str(detached_id) + '?waitMs=15000')
    assert result['status'] == 'done' and 'REMOTE_DETACHED_RESULT' in result['answer']['text']
    checks.append('closing last TUI leaves native work running for independent HTTP reader')
    os.close(master)
    master = None
    mark = len(output)
    start_terminal(ready['sessionId'])
    screen('REMOTE_DETACHED_RESULT', mark)
    send('/resume\r')
    screen('Resume session', mark)
    send('resume-target\r')
    screen('REMOTE_RESUMED_TRANSCRIPT', mark)
    count = len(api('/sessions'))
    mark = len(output)
    send('/new\r')
    wait(lambda: len(api('/sessions')) == count + 1, 'Remote /new creates one session')
    screen('Untitled session', mark)
    quit_terminal()
    checks.append('same conversation reconnect, remote session selection and /new')
    assert token.encode() not in output
    host_log.flush()
    assert token.encode() not in (root / 'host.log').read_bytes()
    report = {'result': 'PASS', 'checks': checks, 'entry': str(entry), 'evidence': str(root), 'transcriptBytes': len(output), 'providers': ['faux'], 'externalModelCalls': 0, 'clientHarnessOpened': False}
    (root / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
finally:
    (root / 'transcript.bin').write_bytes(output)
    if proc is not None and proc.poll() is None:
        os.killpg(proc.pid, signal.SIGTERM)
        proc.wait(timeout=10)
    if master is not None:
        os.close(master)
    if host.poll() is None:
        os.killpg(host.pid, signal.SIGTERM)
        host.wait(timeout=15)
    host_log.close()
