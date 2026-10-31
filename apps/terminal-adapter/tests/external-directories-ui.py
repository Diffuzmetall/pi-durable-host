"""Exercise the existing real Durable TUI with only a synthetic directory view."""
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
with tempfile.TemporaryDirectory(prefix="directory-tui-") as fixture:
    log = pathlib.Path(fixture) / "events.jsonl"
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 30, 140, 0, 0))
    env = dict(os.environ, HOME=fixture, PI_CODING_AGENT_DIR=fixture,
               DIRECTORY_UI_LOG=str(log), TERM="xterm-256color")
    proc = subprocess.Popen([str(candidate / "node_modules/.bin/tsx"), str(candidate / "tests/external-directories-ui-probe.mts")],
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

    def has(text):
        return text.encode() in buffer

    def send(text):
        os.write(master, text.encode())

    try:
        wait(lambda: any(event.get("ready") for event in events()), "TUI startup")
        wait(lambda: has("3 external dirs") and has("pi-durable-host, pi-durable-delm, delm-runs") and has("(/dirs to manage)"), "screenshot status row")
        buffer.clear()
        send("/dirs\r")
        wait(lambda: has("select to inspect") and has("/fixture/pi-durable-host"), "local /dirs list")
        buffer.clear()
        send("\r")
        wait(lambda: has("External directory: /fixture/pi-durable-host"), "directory inspection")
        buffer.clear()
        send("\x1b[27u")
        wait(lambda: len(buffer) > 0, "Escape restores editor")
        send("/quit\r")
        wait(lambda: any(event.get("exited") for event in events()), "clean detach")
        proc.wait(timeout=5)
        assert proc.returncode == 0
        assert not any("submitted" in event for event in events()), "/dirs must not submit paid model input"
        print(json.dumps({"pass": True, "checks": ["real TUI screenshot row", "names and /dirs hint", "local directory list", "path inspection", "Escape", "no model submission", "clean detach"]}))
    finally:
        if proc.poll() is None:
            proc.terminate()
            proc.wait(timeout=5)
        os.close(master)
