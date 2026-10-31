import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DpiClient } from 'dpi-sdk';
const release = '/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-dadd5534';
const root = join(release, 'live-control');
assert(!existsSync(join(release, 'live-acceptance-ledger/selected-copy.json')));
const state = JSON.parse(readFileSync(join(root, 'host-state.json'), 'utf8'));
const probe = JSON.parse(readFileSync(join(root, 'selected-copy-probe.json'), 'utf8'));
const client = new DpiClient(`http://127.0.0.1:${state.port}`, state.ownerToken);
// Keep the hard context-window gate; reserve only 1024 for this <=512-token check.
// Restore the exact catalog preimage once the controlled turn is complete.
const settings = await client.session(probe.sessionId).setCompaction({ reserveTokens: 1024, backgroundTokens: 0 });
assert.equal(settings.enabled, true);
writeFileSync(join(root, 'active-permit.next'), JSON.stringify(probe), { flag: 'wx', mode: 0o600 });
renameSync(join(root, 'active-permit.next'), join(root, 'active-permit.json'));
console.log(JSON.stringify({ status: 'CONTROLLED_RESERVE_SET', hardContextGatePreserved: true, providerSlotsConsumed: 0 }));
