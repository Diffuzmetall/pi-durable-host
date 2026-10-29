"""Same synthetic view-commit/PTY metric as baseline, with the actual remote HTTP transport added."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import pty
import select
import signal
import struct
import subprocess
import tempfile
import termios
import time

parser = argparse.ArgumentParser()
parser.add_argument('--entry', type=Path, default=Path(__file__).resolve().parents[1] / 'src/main.ts')
args = parser.parse_args()
entry = args.entry.resolve(strict=True)
node_args = ['node'] + (['--import', 'tsx'] if entry.suffix in ('.ts', '.mts') else [])
backend = Path(__file__).resolve().parents[2] / 'dpi-backend'
root = Path(tempfile.mkdtemp(prefix='dpi-terminal-latency-'))
env = {k: v for k, v in os.environ.items() if k in ('PATH', 'LANG')}
env.update(HOME=str(root), TERM='xterm-256color', PI_CODING_AGENT_DIR=str(root / 'agent'), DPI_TOKEN='local-recording-fixture-only', TERMINAL_PROBE_ROOT=str(root))
log = open(root / 'host.log', 'wb')
host = subprocess.Popen(['node', str(Path(__file__).with_name('latency-host.mjs'))], cwd=backend, env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
proc = None
master = None
output = bytearray()


def wait(predicate, description, timeout=20):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        if master is None:
            time.sleep(0.02)  # Only local fixture startup readiness.
        elif select.select([master], [], [], 0.01)[0]:
            try:
                data = os.read(master, 65536)
            except OSError:
                data = b''
            output.extend(data)
        if host.poll() is not None or (proc is not None and proc.poll() is not None):
            break
    # A clean child exit is itself the awaited detach condition, not a failure.
    if predicate():
        return
    raise AssertionError(description + '; evidence=' + str(root))


try:
    wait(lambda: (root / 'ready.json').exists(), 'Recording fixture readiness')
    ready = json.loads((root / 'ready.json').read_text())
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 120, 0, 0))
    proc = subprocess.Popen(node_args + [str(entry), ready['base'], ready['sessionId']], cwd=backend, env=env, stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
    os.close(slave)
    wait(lambda: b'UNKNOWN_RENDER_SAFE_TEXT' in output, 'Unknown render kind safe text fallback')
    values = []
    for sample in range(50):
        marker = f'LATENCY_RENDER_{sample:03d}'
        start = len(output)
        os.write(master, f'latency {sample}\r'.encode())
        wait(lambda: marker.encode() in output[start:], 'Remote rendered sample ' + str(sample))
        observed_ns = time.monotonic_ns()
        commits = [json.loads(line) for line in (root / 'latency.jsonl').read_text().splitlines()]
        commit = next(item for item in commits if item['marker'] == marker)
        elapsed = (observed_ns - int(commit['committedNs'])) / 1_000_000
        assert 0 <= elapsed < 20000
        values.append(elapsed)
    sorted_values = sorted(values)
    baseline_p95 = 1.622629
    budget = 1.2 * baseline_p95 + 50
    result = {'result': 'PASS' if sorted_values[47] <= budget else 'FAIL', 'samples': 50, 'p50Ms': sorted_values[24], 'p95Ms': sorted_values[47], 'maxMs': sorted_values[-1], 'baselineP95Ms': baseline_p95, 'budgetMs': budget, 'sampleMs': values, 'metric': 'synthetic view commit on recording HTTP host to actual localized TUI marker observed in PTY', 'clock': 'Node hrtime.bigint / Python monotonic_ns on same Linux host', 'nativeHarnessOpened': False, 'modelCalls': 0, 'unknownKindSafeFallback': True, 'entry': str(entry), 'evidence': str(root)}
    (root / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
    os.write(master, b'/quit\r')
    wait(lambda: proc.poll() is not None, 'Terminal detach')
    assert proc.wait(timeout=5) == 0
    print(json.dumps(result, indent=2))
    assert result['result'] == 'PASS', 'ISC-26 transport budget exceeded'
finally:
    (root / 'transcript.bin').write_bytes(output)
    if proc is not None and proc.poll() is None:
        os.killpg(proc.pid, signal.SIGTERM)
        proc.wait(timeout=10)
    if master is not None:
        os.close(master)
    if host.poll() is None:
        os.killpg(host.pid, signal.SIGTERM)
        host.wait(timeout=10)
    log.close()
