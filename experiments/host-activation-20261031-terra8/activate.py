#!/usr/bin/env python3
"""Authorized one-shot Host cutover. Preserve databases; never steal locks or send prompts."""
import hashlib
import http.client
import json
import os
import shutil
import sqlite3
import subprocess
import tarfile
import tempfile
from contextlib import closing
from pathlib import Path
from urllib.parse import urlsplit

os.umask(0o077)
home = Path.home()
here = Path(__file__).resolve().parent
releases = home / '.local/share/pi-durable-host/releases'
release = releases / 'c0019d7-unified-catalog-20261031-v1'
terminal = releases / 'terminal-catalog-20261031-v1'
old_service = releases / 'c0019d7-delm2/operational-service.mjs'
new_service = release / 'operational-service.mjs'
unit = home / '.config/systemd/user/pi-durable-host.service'
wrapper = home / '.local/bin/pi-durable'
dropin = unit.parent / 'pi-durable-host.service.d/99-catalog-lifecycle.conf'
config_dir = home / '.config/pi-durable-host'
node = home / '.nvm/versions/node/v24.19.0/bin/node'
checker = here / 'verify-retained.mjs'
parent = home / '.local/state/pi-durable-host/cutovers'
parent.mkdir(parents=True, exist_ok=True, mode=0o700)
evidence = Path(tempfile.mkdtemp(prefix='20261031-catalog-', dir=parent))


def command(*args, timeout=330):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=timeout).stdout.strip()


def system(*args):
    return command('systemctl', '--user', *args)


def pid():
    return int(system('show', 'pi-durable-host.service', '-p', 'MainPID', '--value'))


def service_owner():
    owner = pid()
    return Path(Path(f'/proc/{owner}/cmdline').read_bytes().split(b'\0')[1].decode()) if owner else None


def request(path):
    with closing(http.client.HTTPConnection(endpoint.hostname, endpoint.port, timeout=30)) as connection:
        connection.request('GET', path, headers={'Authorization': 'Bearer ' + client['token']})
        response = connection.getresponse()
        assert response.status == 200, 'Host response refused; redirects are never followed'
        try:
            return json.load(response)
        except (OSError, ValueError):
            raise RuntimeError('Invalid Host JSON response') from None


def idle():
    sessions = request('/v1/sessions')
    for session in sessions:
        base = '/v1/sessions/' + session['id']
        assert not request(base + '/tasks?status=live&limit=100'), 'Live tasks prevent restart'
        assert not any(agent['busy'] for agent in request(base + '/agents')), 'Busy conversations prevent restart'
    return sessions


def snapshot(name, before=None):
    args = [str(node), str(checker), str(evidence / name)]
    if before:
        args.append(str(evidence / before))
    output = command(*args, timeout=600)
    (evidence / (name + '.stdout')).write_text(output + '\n')
    try:
        return json.loads((evidence / name).read_text())
    except (OSError, ValueError):
        raise RuntimeError('Invalid private snapshot') from None


def tasks():
    result = {}
    for path in sorted((data / 'sessions').glob('*/agent.sqlite')):
        with closing(sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)) as database:
            result[str(path.relative_to(data))] = [
                [identifier, kind, status, hashlib.sha256(record.encode()).hexdigest()]
                for identifier, kind, status, record in database.execute('SELECT id,kind,status,record FROM tasks ORDER BY id')
            ]
    return result


def unlocked():
    paths = list(data.glob('*.lock')) + list((data / 'sessions').glob('*/agent.sqlite.lock'))
    assert not paths, 'Owner locks remain; no removal or ownership theft permitted'


def atomic(path, expected, replacement):
    assert not path.is_symlink() and path.read_bytes() == expected, 'Concurrent operator change refused'
    temporary = path.with_name('.' + path.name + '.catalog-' + str(os.getpid()))
    with temporary.open('xb') as stream:
        os.chmod(temporary, path.stat().st_mode & 0o777)
        stream.write(replacement)
        stream.flush()
        os.fsync(stream.fileno())
    assert path.read_bytes() == expected, 'Concurrent operator change refused'
    os.replace(temporary, path)


stopped = changed = wrapper_changed = False
previous_unit = unit.read_bytes()
previous_wrapper = wrapper.read_bytes()
replacement_unit = previous_unit.replace(str(old_service).encode(), str(new_service).encode())
replacement_wrapper = ('#!/usr/bin/env bash\nset -euo pipefail\nexec ' + str(node) + ' ' + str(terminal / 'host-bindings-v16/terminal-launcher.mjs') + ' "$@"\n').encode()
try:
    client = json.loads((releases / 'c0019d7-sse1/terminal-client.json').read_text())
    endpoint = urlsplit(client['url'])
    assert endpoint.scheme == 'http' and endpoint.hostname == '127.0.0.1' and endpoint.port
    assert not endpoint.username and not endpoint.password and not endpoint.query and not endpoint.fragment and endpoint.path in ['', '/']
    config = json.loads((config_dir / 'host.json').read_text())
    data = Path(config['dataDir'])
    assert service_owner() == old_service and previous_unit.count(str(old_service).encode()) == 1
    assert not dropin.exists() or dropin.read_text() == '[Service]\nTimeoutStartSec=300\nTimeoutStopSec=300\n', 'Unexpected lifecycle override'
    for directory in [release, terminal]:
        manifest = json.loads((directory / 'DELM-RELEASE.json').read_text())
        assert manifest['release'] == str(directory) and not directory.stat().st_mode & 0o222
        for filename, digest in manifest['files'].items():
            assert hashlib.sha256((directory / filename).read_bytes()).hexdigest() == digest, 'Release integrity failure'
        for filename, digest in manifest.get('externalFiles', {}).items():
            assert hashlib.sha256(Path(filename).read_bytes()).hexdigest() == digest, 'Pinned dependency changed'
    guarded = [config_dir / 'host.json', config_dir / 'runtime.env', home / '.pi/agent/auth.json',
               home / '.pi/agent/mcp.json', home / '.pi/agent/antigravity-accounts.json']
    preimages = {path: path.read_bytes() for path in guarded}
    before = snapshot('before.json')
    before_tasks = tasks()
    assert all(not agent['busy'] for session in before['sessions'] for agent in session['agents'])
    idle()
    size = sum(path.stat().st_size for path in data.rglob('*') if path.is_file())
    assert shutil.disk_usage(evidence).free > size + 268_435_456, 'Insufficient private backup space'
    (evidence / 'host.service.preimage').write_bytes(previous_unit)
    (evidence / 'launcher.preimage').write_bytes(previous_wrapper)
    (evidence / 'tasks-before.json').write_text(json.dumps(before_tasks))
    dropin.write_text('[Service]\nTimeoutStartSec=300\nTimeoutStopSec=300\n')
    system('daemon-reload')
    assert service_owner() == old_service
    idle()
    stopped = True
    system('stop', 'pi-durable-host.service')
    assert pid() == 0
    unlocked()
    with tarfile.open(evidence / 'pre-activation.tar', 'x') as archive:
        archive.add(data, arcname='data/main')
        archive.add(config_dir, arcname='config')
        archive.add(unit, arcname='systemd/pi-durable-host.service')
        archive.add(unit.parent / 'pi-durable-host.service.d', arcname='systemd/dropins')
        archive.add(wrapper, arcname='launcher')
    with tarfile.open(evidence / 'pre-activation.tar') as archive:
        assert 'data/main/catalog.sqlite' in archive.getnames()
    atomic(unit, previous_unit, replacement_unit)
    changed = True
    system('daemon-reload')
    system('start', 'pi-durable-host.service')
    assert service_owner() == new_service
    capabilities = request('/v1/protocol')['capabilities']
    assert 'runtime-refresh.v1' in capabilities and 'profile-reload.v1' in capabilities
    # Keep the original pre-cutover MCP baseline, not the degraded rollback catalogue.
    after = snapshot('after.json', str(parent / '20261031-catalog-7sgcwljx/before.json'))
    assert tasks() == before_tasks, 'Saved task/schedule state changed'
    sessions = request('/v1/sessions')
    models = request('/v1/sessions/' + sessions[0]['id'] + '/models')
    selected = []
    for provider, model_id in [('openai-codex', 'gpt-6.1-terra'), ('antigravity', 'gemini-3.8-flash')]:
        model = next(item for item in models if item['provider'] == provider and item['id'] == model_id)
        assert model['available'] and 'medium' in model['supportedThinkingLevels']
        selected.append({'provider': provider, 'modelId': model_id, 'available': True})
    for path, previous in preimages.items():
        assert path.read_bytes() == previous, 'Shared configuration or account file changed'
    atomic(wrapper, previous_wrapper, replacement_wrapper)
    wrapper_changed = True
    mcp_status = json.loads((evidence / 'after.json.stdout').read_text())
    result = {'activated': True, 'dataAndNativeParity': True, 'mcpParity': mcp_status['mcpParity'],
              'mcpAffectedConversations': len(mcp_status['mcpDifferences']),
              'missingMcpServers': sorted({server for item in mcp_status['mcpDifferences'] for server in item['servers']}),
              'release': str(release), 'terminal': str(terminal), 'pid': pid(),
              'sessionsRetained': len(before['sessions']),
              'conversationsRetained': sum(len(session['agents']) for session in before['sessions']),
              'entriesRetained': sum(len(agent['entries']) for session in before['sessions'] for agent in session['agents']),
              'taskStateRetained': True, 'models': selected, 'modelCallsSent': 0, 'evidence': str(evidence)}
    (evidence / 'ACTIVATED.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result), flush=True)
except Exception as error:
    (evidence / 'error.txt').write_text(type(error).__name__ + ': ' + str(error) + '\n')
    if isinstance(error, subprocess.CalledProcessError):
        (evidence / 'subprocess-stderr.txt').write_text(error.stderr or '')
    restored = False
    try:
        if stopped:
            if pid():
                assert service_owner() == new_service, 'Unexpected owner; refuse rollback'
                idle()
                system('stop', 'pi-durable-host.service')
            unlocked()
            if changed:
                atomic(unit, replacement_unit, previous_unit)
            if wrapper_changed:
                atomic(wrapper, replacement_wrapper, previous_wrapper)
            system('daemon-reload')
            system('start', 'pi-durable-host.service')
            assert service_owner() == old_service
            snapshot('rollback.json', 'before.json')
            restored = True
    except Exception as rollback_error:
        (evidence / 'rollback-error.txt').write_text(type(rollback_error).__name__ + ': ' + str(rollback_error) + '\n')
    result = {'passed': False, 'restoredPreviousRelease': restored, 'stopped': stopped, 'changed': changed,
              'error': type(error).__name__, 'evidence': str(evidence)}
    (evidence / 'FAILED.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result), flush=True)
    raise SystemExit(1) from None
