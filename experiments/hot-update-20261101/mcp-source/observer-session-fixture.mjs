// Test-only facade: the actual built manager remains the sole resource owner.
// Run the unchanged session/HTTP corpus with observers attached to that owner.
import assert from 'node:assert/strict';
const nico = await import(process.env.MCP_TEST_BUNDLE);
export const { createCredentialResolver, snapshotToServerSpecs, resolveMcpSnapshot,
  authorizeAgentMail, mcpNamespace } = nico;
let managers = 0, notifications = 0;
export function createMcpManager(options) {
  const manager = nico.createMcpManager(options);
  managers++;
  manager.onChange(() => { throw Error('FIXTURE_SESSION_OBSERVER_FAILURE'); });
  manager.onChange(() => { notifications++; });
  return manager;
}
process.once('beforeExit', () => {
  assert.ok(managers > 0, 'the session fixture must use actual managers');
  assert.ok(notifications >= managers, 'later observers must run despite the failing subscriber');
  console.log('OBSERVER_SESSION_INJECTION_PASS', JSON.stringify({ managers, notifications }));
});
