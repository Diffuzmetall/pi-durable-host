#!/usr/bin/env python3
"""Side-effect-free gate: exit 0 only when every Host conversation and task is idle."""
import http.client
import json
import sys
from contextlib import closing
from pathlib import Path
from urllib.parse import urlsplit

try:
    config = json.loads((Path.home() / '.local/share/pi-durable-host/releases/c0019d7-sse1/terminal-client.json').read_text())
    endpoint = urlsplit(config['url'])
    assert endpoint.scheme == 'http' and endpoint.hostname == '127.0.0.1' and endpoint.port
    assert not endpoint.username and not endpoint.password

    def request(path):
        with closing(http.client.HTTPConnection(endpoint.hostname, endpoint.port, timeout=10)) as connection:
            connection.request('GET', path, headers={'Authorization': 'Bearer ' + config['token']})
            response = connection.getresponse()
            assert response.status == 200
            return json.load(response)

    for session in request('/v1/sessions'):
        base = '/v1/sessions/' + session['id']
        if request(base + '/tasks?status=live&limit=100') or any(agent['busy'] for agent in request(base + '/agents')):
            sys.exit(1)
    print('HOST_IDLE')
except (OSError, ValueError, AssertionError, http.client.HTTPException):
    sys.exit(2)
