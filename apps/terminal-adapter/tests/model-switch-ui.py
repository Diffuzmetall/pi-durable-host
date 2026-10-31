"""Drive the isolated real TUI through a PTY. No network, models, credentials or live data."""
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
fixture = pathlib.Path(tempfile.mkdtemp(prefix="skill-model-ui-"))
(fixture / "configs").mkdir()
(fixture / "configs/model-switch.json").write_text(json.dumps({"sections": {"first": ["p/a", "p/b"], "second": ["p/b"]}}))
log = fixture / "events.jsonl"
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 35, 120, 0, 0))
env = dict(os.environ, HOME=str(fixture), PI_CODING_AGENT_DIR=str(fixture),
           MODEL_SWITCH_PROBE_LOG=str(log), TERM="xterm-256color")
proc = subprocess.Popen([str(candidate / "node_modules/.bin/tsx"), str(candidate / "tests/model-switch-ui-probe.mts")],
                        cwd=candidate, stdin=slave, stdout=slave, stderr=slave, env=env)
os.close(slave)
buffer = bytearray()

def pump():
    ready, _, _ = select.select([master], [], [], 0.05)
    if ready:
        try:
            buffer.extend(os.read(master, 65536))
        except OSError:
            pass

def events():
    return [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []

def wait(predicate, label):
    deadline = time.monotonic() + 12
    while time.monotonic() < deadline:
        pump()
        if predicate():
            return
        if proc.poll() is not None:
            break
    raise AssertionError(label + "\n" + buffer.decode(errors="replace")[-2500:])

def send(data):
    os.write(master, data.encode())

def screen(text):
    return text.encode() in buffer

try:
    wait(lambda: any(e.get("ready") for e in events()), "TUI startup")
    send("\x1b[109;6u")  # Ctrl+Shift+M
    wait(lambda: any(e.get("model", {}).get("modelId") == "b" for e in events()), "Model cycle")
    buffer.clear()
    send("/model-switch\r")
    wait(lambda: screen("[first]"), "Original model section picker")
    buffer.clear()
    send("\x1b[27u")  # Unambiguous Kitty Escape, not an Alt prefix for the next key.
    wait(lambda: len(buffer) > 0, "Escape restores editor")
    buffer.clear()
    send("\x1b[109;8u")  # Ctrl+Shift+Alt+M
    wait(lambda: any(e.get("model", {}).get("modelId") == "a" for e in events()), "Backward model key")
    buffer.clear()
    send("\x1b[108;6u")  # Ctrl+Shift+L
    wait(lambda: screen("[first]"), "Menu hotkey")
    buffer.clear()
    send("\t")
    wait(lambda: screen("[second]"), "Section navigation")
    send("b\r")
    wait(lambda: len([e for e in events() if e.get("model", {}).get("modelId") == "b"]) == 2, "Menu search and switch")
    (fixture / "configs/model-switch.json").write_text(json.dumps({"sections": {"saved": ["p/a"]}}))
    buffer.clear()
    send("/model-switch add-current\r")
    wait(lambda: screen("to section"), "add-current section")
    send("\r")
    wait(lambda: "p/b" in json.loads((fixture / "configs/model-switch.json").read_text())["sections"]["saved"], "add-current persisted")
    send("\x1b[27u")
    (fixture / "configs/model-switch.json").write_text(json.dumps({"sections": {"saved": ["p/b"]}}))
    buffer.clear()
    send("/model-switch add\r")
    wait(lambda: screen("Add a model"), "add model picker")
    send("a\r")
    buffer.clear()
    wait(lambda: screen("to section"), "add section")
    send("\r")
    wait(lambda: "p/a" in json.loads((fixture / "configs/model-switch.json").read_text())["sections"]["saved"], "add persisted")
    send("\x1b[27u")
    buffer.clear()
    send("$")
    wait(lambda: screen("Skills"), "Cancel skill picker opened")
    send("\x1b[27u")
    buffer.clear()
    send("/skill-selector alpha\r")
    wait(lambda: screen('matching "alpha"'), "Skill selector command fallback")
    send("\r")
    buffer.clear()
    send("$")
    wait(lambda: screen("Skills"), "Dollar opens skill picker at the current cursor")
    send("beta\r")
    buffer.clear()
    send(" together\r")
    wait(lambda: any("submitted" in e for e in events()), "Multi-skill prompt submission")
    submitted = next(e["submitted"] for e in events() if "submitted" in e)
    assert "/skill:alpha " in submitted and "/skill:beta " in submitted, submitted
    send("/quit\r")
    wait(lambda: any(e.get("exited") for e in events()), "Clean detach")
    proc.wait(timeout=5)
    assert proc.returncode == 0, proc.returncode
    print(json.dumps({"pass": True, "checks": ["forward/backward/menu hotkeys", "model section navigation and search", "Escape restore", "hot config reread", "add/add-current persisted", "skill cancel", "skill-selector command", "$ picker", "two skill insertions", "clean detach"], "events": events()}))
finally:
    if proc.poll() is None:
        proc.terminate()
        proc.wait(timeout=5)
    os.close(master)
