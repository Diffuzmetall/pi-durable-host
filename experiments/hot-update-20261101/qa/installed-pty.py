"""Independent U17/ISC-68/69 installed native HTTP/PTY probe. Sandbox only.
Reuse the prior restart PTY pattern, but replace only this disposable client.
All executable product imports and client entry resolve inside /candidate.
"""
import argparse
import fcntl
import hashlib
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

parser = argparse.ArgumentParser()
parser.add_argument('--manifest', required=True, type=Path)
parser.add_argument('--digest', required=True)
args = parser.parse_args()
assert os.environ.get('HOME') == '/scratch/home', 'Sandbox only; no live fallback'
check = json.loads(Path('/scratch/sandbox-check.json').read_text())
assert check['status'] == check['child'] == 'PASS'
qa = Path(__file__).resolve().parent
candidate = Path('/candidate')
assert args.manifest.resolve().parent == candidate
verify_command = ['python3', str(qa / 'candidate-manifest.py'), '--candidate', str(candidate), '--manifest', str(args.manifest), '--digest', args.digest]
root = Path(tempfile.mkdtemp(prefix='heidi-installed-pty-', dir='/scratch/tmp'))
(root / 'node_modules').symlink_to(candidate / 'node_modules', target_is_directory=True)
host_script = root / 'host.mjs'
host_script.write_bytes((qa / 'installed-pty-host.mjs').read_bytes())
info_path = root / 'info.json'
terminal_entry = candidate / 'node_modules/dpi-terminal-adapter/dist/main.js'
assert terminal_entry.resolve(strict=True).is_relative_to(candidate)
env = dict(os.environ, TERM='xterm-256color')
report = {'status': 'FAIL', 'candidateDigest': args.digest, 'checks': [], 'productionActivation': 'NOT RUN',
          'fixtureSha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__), host_script]},
          'realBoundaries': ['installed Store', 'Harness', 'SQLite', 'HTTP', 'actual PTY/editor'],
          'externalBoundaries': ['faux model', 'synthetic credentials', 'empty MCP servers', 'injected error after actual installed MCP drain']}
host = terminal = master = None
output = bytearray()
log = (root / 'host.log').open('wb')
ansi = re.compile(r'\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))')

def pump():
    if master is not None and select.select([master], [], [], 0.03)[0]:
        try:
            output.extend(os.read(master, 65536))
        except OSError:
            pass

def wait(predicate, description, timeout=25):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        pump()
        if master is None:
            time.sleep(0.025)  # Bounded child readiness, not model polling.
    raise AssertionError(description)

def screen(marker, offset=0):
    wait(lambda: marker in ansi.sub('', output[offset:].decode(errors='replace')), 'missing actual renderer marker: ' + marker)

def request(path, body=None):
    req = urllib.request.Request(info['base'] + path,
        headers={'Authorization': 'Bearer ' + info['token'], 'Content-Type': 'application/json'},
        data=None if body is None else json.dumps(body).encode())
    with urllib.request.urlopen(req, timeout=5) as response:
        return json.load(response)

def entries():
    return request(agent + '/entries?scope=all')['items']

def inputs():
    return [model.get('content') for entry in entries() if entry.get('kind') in ('pi.user', 'host.input')
            for model in entry.get('model', []) if model.get('role') == 'user']

def send(text):
    os.write(master, text.encode())

def start_terminal():
    global terminal, master, output
    output = bytearray()
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 45, 140, 0, 0))
    terminal = subprocess.Popen(['node', str(terminal_entry), info['base'], info['sessionId']],
        cwd=candidate, env=dict(env, DPI_TOKEN=info['token']), stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
    os.close(slave)
    screen('HEIDI_PTY_HISTORY_SEED')

try:
    with (root / 'manifest-before.json').open('wb') as proof:
        subprocess.run(verify_command, stdout=proof, stderr=subprocess.STDOUT, check=True, timeout=120)
    host = subprocess.Popen(['node', str(host_script), str(info_path)], cwd=root, env=env,
                            stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
    wait(info_path.exists, 'native installed fixture readiness')
    info = json.loads(info_path.read_text())
    report['identityBefore'] = {key: info[key] for key in ['pid', 'startticks', 'sessionId', 'rootId']}
    agent = '/v1/sessions/' + info['sessionId'] + '/agents/main'
    request(agent + '/messages', {'content': 'HEIDI_PTY_HISTORY_SEED', 'requestId': 'heidi-pty-seed', 'whenBusy': 'followUp'})
    wait(lambda: any(e.get('kind') == 'pi.assistant' for e in entries()), 'seed model completion')
    before = entries()
    start_terminal()
    first_pid = terminal.pid
    draft = 'HEIDI_UNSENT_ДРАФТ'
    send(draft)
    screen(draft)
    wait(lambda: any(p.read_text() == draft for p in Path(env['HOME']).rglob('editor-1.draft')), 'exact unsent Unicode checkpoint')
    terminal.send_signal(signal.SIGTERM); terminal.wait(timeout=10)
    (root / 'first-client-screen.bin').write_bytes(output)
    os.close(master); master = None
    start_terminal()
    assert terminal.pid != first_pid and host.poll() is None
    screen(draft)
    assert entries() == before, 'client replacement must not replay draft or mutate history'
    send('-EXPLICIT\r')
    wait(lambda: inputs().count(draft + '-EXPLICIT') == 1, 'restored draft remains focused and submits explicitly exactly once')
    assert draft not in inputs()
    screen('HEIDI_PTY_NATIVE_REPLY')
    report['checks'].append('new disposable client PID; unsent Unicode draft/history/focus preserved without Host restart or automatic submit')
    skill = Path(env['HOME']) / '.pi/agent/skills/heidi-menu'
    skill.mkdir(parents=True)
    (skill / 'SKILL.md').write_text('---\nname: heidi-menu\ndescription: Independent installed menu fixture\n---\nHEIDI_SKILL_BODY\n')
    offset = len(output)
    send('/reload\r')
    screen('Reload applied:', offset)
    send('/skill:heidi')
    screen('heidi-menu', offset)
    send('\x1b')
    for _ in range(5): pump()
    send('\x15')
    wait(lambda: all(not p.read_text() for p in Path(env['HOME']).rglob('editor-1.draft')), 'menu prefix cleared from actual editor')
    # Inject only the retirement error: real owner -> backend -> SDK -> renderer.
    retired_skill = skill.parent / 'heidi-retained'
    retired_skill.mkdir()
    (retired_skill / 'SKILL.md').write_text('---\nname: heidi-retained\ndescription: Published before cleanup failure\n---\nHEIDI_RETAINED_BODY\n')
    (root / 'retirement-fault').write_text('QA injection after actual drain\n')
    offset = len(output)
    send('/reload\r')
    screen('Reload applied:', offset)
    screen('Resource cleanup failed. No rollback was performed; no automatic retry.', offset)
    assert 'PRIVATE_PTY_RETIREMENT_FAULT' not in ansi.sub('', output[offset:].decode(errors='replace'))
    send('/skill:heidi-ret')
    screen('heidi-retained', offset)
    send('\x1b')
    for _ in range(5): pump()
    send('\x15')
    wait(lambda: all(not p.read_text() for p in Path(env['HOME']).rglob('editor-1.draft')), 'cleanup warning menu prefix cleared')
    report['checks'].append('injected post-drain failure reaches real backend/SDK/UI as applied warning; published skill retained, private error hidden')
    offset = len(output)
    send('/reload /untrusted\r')
    screen('cannot admit an adapter path', offset)
    send('HEIDI_FOCUS_AFTER_REJECT\r')
    wait(lambda: inputs().count('HEIDI_FOCUS_AFTER_REJECT') == 1, 'rejected reload preserves focus without Escape')
    assert 'Cannot submit' not in ansi.sub('', output[offset:].decode(errors='replace'))
    report['checks'].append('actual /reload result counts and refreshed menu; path admission refusal preserves editor focus')
    send('/quit\r')
    wait(lambda: terminal.poll() is not None, 'client clean detach')
    assert terminal.wait(timeout=5) == 0
    host.send_signal(signal.SIGTERM); host.wait(timeout=15)
    assert host.returncode == 0
    result = json.loads(Path(str(info_path) + '.result').read_text())
    assert result['status'] == 'PASS' and result['sameHarness']
    assert result['modelCalls'] == 3, 'only seed and two explicit inputs; no reload/reconnect model turn'
    report['identityAfter'] = {key: result[key] for key in ['pid', 'startticks', 'sessionId', 'rootId']}
    assert report['identityBefore'] == report['identityAfter']
    report.update(status='PASS', firstClientPid=first_pid, secondClientPid=terminal.pid, modelCalls=result['modelCalls'])
except Exception as error:
    report['error'] = str(error)
finally:
    for child in [terminal, host]:
        if child is not None and child.poll() is None:
            child.send_signal(signal.SIGTERM)
            try:
                child.wait(timeout=15)
            except subprocess.TimeoutExpired:
                report.update(status='FAIL', cleanupError='owned disposable process did not terminate; sandbox launcher owns final cleanup')
    if master is not None: os.close(master)
    log.close()
    (root / 'screen.bin').write_bytes(output)
    try:
        with (root / 'manifest-after.json').open('wb') as proof:
            subprocess.run(verify_command, stdout=proof, stderr=subprocess.STDOUT, check=True, timeout=120)
    except Exception as error:
        report.update(status='FAIL', integrityError=str(error))
    (root / 'result.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps({'evidence': str(root), **report}, ensure_ascii=False))
raise SystemExit(0 if report['status'] == 'PASS' else 1)
