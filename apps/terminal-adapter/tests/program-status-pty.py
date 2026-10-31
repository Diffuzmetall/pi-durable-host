"""Offline PTY regression checks for the real DurableTui/ProcessTerminal lifecycle."""
import argparse
import base64
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

MODES = ("1", "0", "supported", "unsupported", "failure", "late-failure",
         "published-failure", "setup-failure", "subscribe-failure", "unsubscribe-failure")
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("candidate", nargs="?", type=Path, default=Path(__file__).resolve().parents[1])
parser.add_argument("--mode", choices=MODES)
args = parser.parse_args()
root = args.candidate.resolve(strict=True)
results = []
for mode in ([args.mode] if args.mode else MODES):
    with tempfile.TemporaryDirectory(prefix="osc7501-home-") as home:
        env = {key: value for key, value in os.environ.items() if key in ("PATH", "LANG")}
        env.update(HOME=home, TERM="xterm-256color", PI_CODING_AGENT_DIR=home + "/agent",
                   XDG_DATA_HOME=home + "/data", XDG_STATE_HOME=home + "/state",
                   XDG_CONFIG_HOME=home + "/config", XDG_CACHE_HOME=home + "/cache")
        failure = mode.endswith("failure")
        if mode in ("0", "1") or failure:
            env["PI_PROGRAM_STATUS"] = "1" if failure else mode
        master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 120, 0, 0))
        before = termios.tcgetattr(slave)
        command = ["node", "--import", "tsx", "tests/program-status-probe.ts"]
        if failure:
            command.append("--" + mode)
        process = subprocess.Popen(command, cwd=root, env=env, stdin=slave,
                                   stdout=slave, stderr=slave, start_new_session=True)
        output = bytearray()
        responded = False
        try:
            deadline = time.monotonic() + 12
            while time.monotonic() < deadline:
                if select.select([master], [], [], 0.05)[0]:
                    output.extend(os.read(master, 65536))
                if not responded and b"\x1b[c" in output:
                    reply = b"\x1b]7501;?\x1b\\" if mode == "supported" else b""
                    os.write(master, reply + b"\x1b[?1;2c")
                    responded = True
                if process.poll() is not None:
                    while select.select([master], [], [], 0)[0]:
                        output.extend(os.read(master, 65536))
                    break
            assert process.poll() is not None, f"{mode}: timed out (UI resources leaked)"
            assert process.returncode == 0, f"{mode}: exit={process.returncode}; tail={bytes(output[-1200:])!r}"
            bodies = re.findall(rb"\x1b\]7501;([^\x1b\x07]*)(?:\x1b\\|\x07)", bytes(output))
            records = [body for body in bodies if body != b"?"]
            states = [body.split(b":", 1)[0].removeprefix(b"state=").decode() for body in records]
            if mode in ("1", "supported"):
                wanted = ["idle", "working", "blocked", "working", "done", "error", "idle", "clear"]
            elif mode == "late-failure":
                wanted = ["idle", "working", "clear"]
            elif mode in ("published-failure", "unsubscribe-failure"):
                wanted = ["idle", "clear"]
            else:
                wanted = []
            assert states == wanted, (mode, states, wanted)
            if failure:
                assert b"CLEANUP_FAILURE_CAUGHT" in output, (mode, "error not propagated to UI owner")
            for body in records:
                if body != b"state=clear":
                    assert b"app=pi" in body, body
                for encoded in re.findall(rb"(?:^|:)msg=([^:]*)", body):
                    message = base64.b64decode(encoded).decode("utf-8")
                    assert "PRIVATE_" not in message, (mode, message)
            if mode not in ("setup-failure", "subscribe-failure"):
                for control in (b"\x1b[?2004l", b"\x1b[?25h"):
                    assert control in output, (mode, "missing terminal restoration", control)
                if mode in ("1", "0", "supported", "unsupported", "late-failure"):
                    assert b"\x1b[?1049l" in output, (mode, "alternate screen not restored")
            after = termios.tcgetattr(slave)
            assert (after[3] & (termios.ICANON | termios.ECHO)) == (before[3] & (termios.ICANON | termios.ECHO)), mode
            results.append({"mode": mode, "states": states, "exit": process.returncode,
                            "terminal_restored": True})
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=5)
            os.close(master)
            os.close(slave)
print(json.dumps({"real_durable_tui_pty": results, "cases": len(results),
                  "network_or_model_calls": 0}, ensure_ascii=False))
