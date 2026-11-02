"""Isolated actual editor/PTY recovery regression. No live Host or external services."""
import fcntl
import json
import os
import pathlib
import pty
import select
import struct
import subprocess
import sys
import tempfile
import termios
import time

candidate = pathlib.Path(sys.argv[1]).resolve()
fixture = pathlib.Path(tempfile.mkdtemp(prefix="eve-submit-recovery-"))
log = fixture / "events.jsonl"
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 35, 120, 0, 0))
env = dict(os.environ, HOME=str(fixture), PI_CODING_AGENT_DIR=str(fixture),
           SUBMIT_RECOVERY_LOG=str(log), TERM="xterm-256color")
proc = subprocess.Popen([str(candidate / "node_modules/.bin/tsx"), str(candidate / "tests/submit-recovery-ui-probe.mts")],
                        cwd=candidate, stdin=slave, stdout=slave, stderr=slave, env=env)
os.close(slave)
buffer = bytearray()

def events():
    return [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []

def wait(predicate, label):
    deadline = time.monotonic() + 12
    while time.monotonic() < deadline:
        ready, _, _ = select.select([master], [], [], 0.05)
        if ready:
            try:
                buffer.extend(os.read(master, 65536))
            except OSError:
                pass
        if predicate():
            return
        if proc.poll() is not None:
            break
    raise AssertionError(label + "\n" + buffer.decode(errors="replace")[-1800:])

def send(text):
    os.write(master, text.encode())

try:
    wait(lambda: any(e.get("ready") for e in events()), "TUI startup")
    send("preserved draft\r")
    wait(lambda: b"Cannot submit" in buffer, "Submit failure modal")
    wait(lambda: any(e.get("onlineButUncertain") for e in events()), "Online is not reconciliation")
    assert len([e for e in events() if "submitted" in e]) == 1
    wait(lambda: any(e.get("reconciled") for e in events()), "Authoritative reconciliation")
    # No Escape/manual journal cleanup. The actual editor must receive this suffix.
    send(" plus new input\r")
    wait(lambda: len([e for e in events() if "submitted" in e]) == 2, "Recovered editor submits without Escape")
    assert [e["submitted"] for e in events() if "submitted" in e] == ["preserved draft", "preserved draft plus new input"]
    send("/quit\r")
    wait(lambda: any(e.get("exited") for e in events()), "Clean detach")
    proc.wait(timeout=5)
    assert proc.returncode == 0
    print(json.dumps({"pass": True, "fixture": str(fixture), "events": events(), "checks": ["actual editor draft preserved", "online alone not readiness", "no automatic replay", "automatic transient dismissal", "new input without Escape", "clean detach"]}))
finally:
    if proc.poll() is None:
        proc.terminate()
        proc.wait(timeout=5)
    os.close(master)
