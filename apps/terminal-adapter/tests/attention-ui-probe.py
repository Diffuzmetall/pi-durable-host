"""Observe a real fixture's pending attention row through the selected TUI; never submit an answer."""
import fcntl
import json
import os
from pathlib import Path
import pty
import uuid
import select
import signal
import struct
import subprocess
import sys
import termios
import time
from urllib.parse import urlparse
from urllib.request import Request, urlopen

base, session, reply_to = sys.argv[1:4]
assert urlparse(base).hostname == '127.0.0.1', 'Disposable loopback fixture only'
entry = Path(sys.argv[4]) if len(sys.argv) > 4 else Path(__file__).resolve().parents[1] / 'src/main.ts'
command = ['node'] + (['--import', 'tsx'] if entry.suffix in ('.ts', '.mts') else []) + [str(entry), base, session]
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 160, 0, 0))
backend = Path(__file__).resolve().parents[2] / 'dpi-backend'
proc = subprocess.Popen(command, cwd=backend, env=os.environ.copy(), stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
os.close(slave)
output = bytearray()

def observe(predicate):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if predicate():
            return
        if select.select([master], [], [], 0.02)[0]:
            try:
                output.extend(os.read(master, 65536))
            except OSError:
                pass
        if proc.poll() is not None:
            break
    assert predicate(), 'Attention TUI condition failed; inspect isolated transcript'

try:
    marker = 'Attention · terminal-question · NATIVE_ATTENTION_COLOR_SENTINEL'.encode()
    observe(lambda: marker in output and ('replyTo=' + reply_to).encode() in output and b'NATIVE_GOAL_VIEW_SENTINEL' in output)
    mark = len(output)
    probe_id = uuid.uuid4().hex  # Reopened history must never satisfy this new run's markers.
    partial = ('NATIVE_TOOL_PARTIAL_' + probe_id).encode()
    final = ('NATIVE_TOOL_FINAL_' + probe_id).encode()
    os.write(master, ('native-terminal-tool:' + probe_id + '\r').encode())
    os.write(master, b'\x0f')  # Same existing expand-tool gesture as the baseline probe.
    observe(lambda: partial in output[mark:])
    assert final not in output[mark:], 'Native partial must render before committed final output'
    observe(lambda: final in output[mark:])
    skill_intent = 'PTY_SKILL_REQUEST_' + uuid.uuid4().hex
    os.write(master, ('/skill:terminal-fixture ' + skill_intent + '\r').encode())
    def skill_received():
        request = Request(base + '/v1/sessions/' + session + '/agents/main/entries?scope=all', headers={'Authorization': 'Bearer ' + os.environ['DPI_TOKEN']})
        with urlopen(request, timeout=3) as response:
            entries = json.load(response)['items']
        return any(message.get('role') == 'user' and isinstance(message.get('content'), str) and skill_intent in message['content'] and 'ORIGINAL_REMOTE_SKILL_BODY' in message['content'] and '<skill name="terminal-fixture"' in message['content'] for entry in entries for message in entry.get('model', []))
    observe(skill_received)
    mark = len(output)
    os.write(master, b'/goal status\r')
    observe(lambda: b'Human acceptance remains pending' in output[mark:])
    os.write(master, b'/quit\r')
    observe(lambda: proc.poll() is not None)
    assert proc.returncode == 0
    print(json.dumps({'result': 'PASS', 'replyTo': reply_to, 'pendingRowVisible': True, 'goalStatusRendered': True, 'guardedToolStream': True, 'skillSubmitted': True, 'answerSubmitted': False, 'bytes': len(output)}))
finally:
    Path(os.environ['HOME'], 'attention-transcript.bin').write_bytes(output)
    if proc.poll() is None:
        os.killpg(proc.pid, signal.SIGTERM)
        proc.wait(timeout=10)
    os.close(master)
