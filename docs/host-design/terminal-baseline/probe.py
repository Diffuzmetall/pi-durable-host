"""Exercise the actual selected TUI with synthetic controller/view; never opens a session DB."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pty
import select
import struct
import subprocess
import tempfile
import termios
import time

parser = argparse.ArgumentParser()
parser.add_argument('--release', required=True, type=Path)
args = parser.parse_args()
release = args.release.resolve(strict=True)
fixture = Path(__file__).with_name('fixture.mjs')
home = Path(tempfile.mkdtemp(prefix='dpi-terminal-baseline-'))
events_path = home / 'events.jsonl'
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 120, 0, 0))
env = {key: value for key, value in os.environ.items() if key in ('PATH', 'LANG')}
env.update(HOME=str(home), TERM='xterm-256color', PI_OFFLINE='1', PI_CODING_AGENT_DIR=str(home / 'agent'), PI_DURABLE_EXTENSION_ROOT=str(release / 'extensions-lane'), PI_DURABLE_LOCAL_HOST_ROOT=str(release / 'extensions-lane'), BASELINE_RELEASE=str(release), BASELINE_EVENTS=str(events_path))
proc = subprocess.Popen(['node', '--import', str(release / 'host-lane/global-runtime.mjs'), str(fixture)], cwd=home, env=env, stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
os.close(slave)
output = bytearray()
checks = []


def events():
    return [json.loads(line) for line in events_path.read_text().splitlines()] if events_path.exists() else []


def wait(predicate, description, timeout=20):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        readable, _, _ = select.select([master], [], [], 0.05)
        if readable:
            try:
                chunk = os.read(master, 65536)
            except OSError:
                break
            if not chunk:
                break
            output.extend(chunk)
        if proc.poll() is not None:
            break
    raise AssertionError(description + '; transcript=' + str(home / 'transcript.bin'))


def screen(marker, start=0):
    wait(lambda: marker.encode() in output[start:], 'Missing screen marker ' + marker)


def recorded(kind, predicate=lambda e: True, start=0):
    wait(lambda: any(e['type'] == kind and predicate(e) for e in events()[start:]), 'Missing controller event ' + kind)


def send(data):
    os.write(master, data)


try:
    screen('baseline-model')
    checks.append('actual TUI startup')
    send(b'\x1b[200~baseline\neditor\x1b[201~\r')
    recorded('submit', lambda e: e['text'] == 'baseline\neditor' and e['whenBusy'] == 'steer')
    screen('BASELINE_STREAM')
    send(b'\x0f')  # Existing Ctrl+O expands tool output.
    screen('TOOL_PARTIAL_ONE')
    checks.append('multiline editor submit and tool stream')
    send(b'steer marker\r')
    recorded('submit', lambda e: e['text'] == 'steer marker' and e['whenBusy'] == 'steer')
    screen('TOOL_PARTIAL_TWO')
    send(b'queued marker\x1b\r')  # Existing Alt+Enter follow-up binding.
    recorded('submit', lambda e: e['text'] == 'queued marker' and e['whenBusy'] == 'followUp')
    checks.append('busy steer and follow-up dispatch')
    send(b'/agents\r')
    screen('Switch to:')
    send(b'\r')  # Reversed list selects the child first.
    recorded('switch', lambda e: e['id'] == 2)
    screen('CHILD_TRANSCRIPT')
    mark = len(events())
    send(b'\x1b')
    recorded('switch', lambda e: e['id'] == 1, start=mark)
    assert not any(e['type'] == 'abort' for e in events()), 'Child Escape must navigate, not abort'
    checks.append('navigation and child Escape returns to root')
    send(b'\x1b')
    recorded('abort', lambda e: e['shown'] == 1)
    screen('TOOL_FINAL')
    checks.append('root Escape abort dispatch and committed tool result')
    send(b'/tasks\r')
    recorded('tasks', lambda e: e['expanded'])
    latencies_ms = []
    for sample in range(50):
        marker = f'LATENCY_RENDER_{sample:03d}'
        start = len(output)
        send(f'latency {sample}\r'.encode())
        screen(marker, start=start)
        observed_ns = time.monotonic_ns()
        commit = next(e for e in events() if e['type'] == 'latency-commit' and e['marker'] == marker)
        elapsed_ms = (observed_ns - int(commit['committedNs'])) / 1_000_000
        assert 0 <= elapsed_ms < 20000, 'Monotonic clocks must agree and the marker must render before timeout'
        latencies_ms.append(elapsed_ms)
    sorted_ms = sorted(latencies_ms)
    latency = {'samples': len(latencies_ms), 'p50Ms': sorted_ms[24], 'p95Ms': sorted_ms[47], 'maxMs': sorted_ms[-1], 'sampleMs': latencies_ms, 'metric': 'synthetic view commit to actual TUI marker observed in PTY output', 'clock': 'node process.hrtime.bigint / Python time.monotonic_ns on same Linux host'}
    checks.append('50 synthetic commit-to-PTY-render latency samples')
    send(b'/quit\r')
    screen('BASELINE_CLEAN_EXIT')
    assert proc.wait(timeout=5) == 0
    recorded_exit = next(e for e in events() if e['type'] == 'exit')
    assert recorded_exit['listeners'] == 0
    for code in (b'\x1b[?1049l', b'\x1b[?2004l', b'\x1b[?25h'):
        assert code in output, 'Missing terminal cleanup ' + repr(code)
    checks.append('quit unsubscribes and restores terminal')
    hashes = {str(path.relative_to(release)): hashlib.sha256(path.read_bytes()).hexdigest() for path in [release / 'host-lane/host/packages/coding-agent/src/experimental/durable' / name for name in ('tui.ts', 'runtime.ts', 'main.ts')]}
    report = {'result': 'PASS', 'checks': checks, 'release': str(release), 'sourcesSha256': hashes, 'modelCalls': 0, 'harnessOpened': False, 'transcriptBytes': len(output), 'latency': latency, 'evidence': str(home)}
    (home / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
finally:
    (home / 'transcript.bin').write_bytes(output)
    if proc.poll() is None:
        proc.terminate()
        proc.wait(timeout=5)
    os.close(master)
