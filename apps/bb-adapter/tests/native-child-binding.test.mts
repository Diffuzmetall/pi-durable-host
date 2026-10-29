import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import {
  nativeChildKey, nativeChildRegistrationRequestId, projectNativeChildInBb,
  type NativeChildDescriptor, type NativeChildOwner, type RegisterExistingPort, type RegisterExistingRequest,
} from '../src/native-child-binding.js';

const child: NativeChildDescriptor = {
  providerId: 'fixture-provider', sessionId: 'fixture-session', conversationId: '11',
  parentProviderThreadId: 'fixture-session:0', parentThreadId: 'fixture-root', title: 'Existing child',
};
const owner: NativeChildOwner = {
  providerId: child.providerId, sessionId: child.sessionId,
  parentProviderThreadId: child.parentProviderThreadId, parentThreadId: child.parentThreadId!,
};

test('stable keys preserve exact native identities and do not collide on separators', () => {
  assert.equal(nativeChildKey(child), JSON.stringify([child.providerId, child.sessionId, child.conversationId]));
  assert.equal(nativeChildRegistrationRequestId(child), JSON.stringify([child.providerId, child.sessionId, child.conversationId, child.parentProviderThreadId]));
  assert.notEqual(nativeChildKey({ ...child, sessionId: 'a:b', conversationId: 'c' }), nativeChildKey({ ...child, sessionId: 'a', conversationId: 'b:c' }));
  assert.equal(nativeChildRegistrationRequestId({ ...child, requestId: 'existing-stable-request' }), 'existing-stable-request');
  for (const key of ['providerId', 'sessionId', 'conversationId'] as const) {
    for (const value of ['', ' ', undefined, null, 1]) {
      const invalid = { ...child, [key]: value } as unknown as NativeChildDescriptor;
      assert.throws(() => nativeChildKey(invalid), TypeError);
      assert.throws(() => nativeChildRegistrationRequestId(invalid), TypeError);
    }
  }
  for (const requestId of ['', ' ', 'x'.repeat(201)]) assert.throws(() => nativeChildRegistrationRequestId({ ...child, requestId }), TypeError);
  assert.throws(() => nativeChildRegistrationRequestId({ ...child, parentProviderThreadId: '' }), TypeError);
});

test('invalid identity and mismatched owner cannot reach the registration port', async () => {
  let calls = 0;
  const port = { async registerExisting() { calls++; return { threadId: 'never' }; } };
  for (const key of ['providerId', 'sessionId', 'parentProviderThreadId', 'parentThreadId'] as const) {
    assert.deepEqual(await projectNativeChildInBb({ ...child, [key]: 'foreign' }, owner, port), { status: 'projection-unavailable', reason: 'owner-mismatch' });
    assert.deepEqual(await projectNativeChildInBb({ ...child, [key]: '' }, owner, port), { status: 'projection-unavailable', reason: 'invalid-identity' });
    assert.deepEqual(await projectNativeChildInBb(child, { ...owner, [key]: '' }, port), { status: 'projection-unavailable', reason: 'invalid-identity' });
  }
  assert.deepEqual(await projectNativeChildInBb({ ...child, conversationId: '' }, owner, port), { status: 'projection-unavailable', reason: 'invalid-identity' });
  for (const requestId of ['', ' ', 'x'.repeat(201)]) {
    assert.deepEqual(await projectNativeChildInBb({ ...child, requestId }, owner, port), { status: 'projection-unavailable', reason: 'registration-unconfirmed' });
  }
  assert.equal(calls, 0);
});

test('missing port or malformed/rejected registration is unavailable, never a spawn fallback', async () => {
  assert.deepEqual(await projectNativeChildInBb(child, owner), { status: 'projection-unavailable', reason: 'unsupported-registration-port' });
  for (const response of [null, undefined, {}, { threadId: '' }, { threadId: ' ' }, { threadId: 1 }]) {
    const port = { async registerExisting() { return response; } } as unknown as RegisterExistingPort;
    assert.deepEqual(await projectNativeChildInBb(child, owner, port), { status: 'projection-unavailable', reason: 'registration-unconfirmed' });
  }
  assert.deepEqual(await projectNativeChildInBb(child, owner, { async registerExisting() { throw Error('denied'); } }), { status: 'projection-unavailable', reason: 'registration-unconfirmed' });
});

test('confirmed binding is immutable routing data, preserving optional request fields', async () => {
  const before = structuredClone({ child, owner });
  const requests: RegisterExistingRequest[] = [];
  const result = await projectNativeChildInBb(child, owner, { async registerExisting(request) { requests.push(request); return { threadId: 'existing-bb-child' }; } });
  assert.equal(result.status, 'registered');
  if (result.status !== 'registered') assert.fail('registration must succeed');
  assert.deepEqual(result.binding, { providerId: child.providerId, sessionId: child.sessionId, conversationId: '11', parentThreadId: owner.parentThreadId, bbThreadId: 'existing-bb-child' });
  assert.equal(Object.isFrozen(result.binding), true);
  assert.deepEqual(requests, [{ requestId: nativeChildRegistrationRequestId(child), sessionId: child.sessionId, conversationId: '11', parentProviderThreadId: child.parentProviderThreadId, providerId: child.providerId, parentThreadId: child.parentThreadId, title: child.title }]);
  assert.deepEqual({ child, owner }, before);
  await projectNativeChildInBb({ ...child, parentThreadId: undefined, title: undefined, requestId: 'explicit-key' }, owner, { async registerExisting(request) {
    assert.equal(request.requestId, 'explicit-key');
    assert.equal(Object.hasOwn(request, 'parentThreadId'), false);
    assert.equal(Object.hasOwn(request, 'title'), false);
    return { threadId: 'existing-bb-child' };
  } });
});

test('real loopback socket ACK loss retries existing child; Core auth precedes idempotent no-op', async (t) => {
  // Recording registerExisting port, not the actual BB Core or a native owner.
  let authorized = true;
  let dropAck = true;
  let mutations = 0;
  const requests: RegisterExistingRequest[] = [];
  const bindings = new Map<string, { json: string; threadId: string }>();
  const server = createServer(async (request, response) => {
    let json = '';
    for await (const bytes of request) json += bytes;
    const params = JSON.parse(json) as RegisterExistingRequest;
    requests.push(params);
    // A matching tuple is not permission; this fixture has its own current grant.
    if (!authorized || request.headers.authorization !== 'Bearer fixture-only' || params.providerId !== child.providerId || params.sessionId !== child.sessionId || params.conversationId !== child.conversationId || params.parentProviderThreadId !== child.parentProviderThreadId || params.parentThreadId !== owner.parentThreadId) {
      response.writeHead(403).end('denied'); return;
    }
    const existing = bindings.get(params.requestId);
    if (existing && existing.json !== json) { response.writeHead(409).end('conflict'); return; }
    const binding = existing ?? { json, threadId: `existing-child-${bindings.size + 1}` };
    if (!existing) { bindings.set(params.requestId, binding); mutations++; }
    if (dropAck) { dropAck = false; response.destroy(); return; }
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ threadId: binding.threadId }));
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port: RegisterExistingPort = { async registerExisting(params) {
    const response = await fetch(`http://127.0.0.1:${address.port}/fixture-register-existing`, {
      method: 'POST', headers: { authorization: 'Bearer fixture-only', 'content-type': 'application/json' }, body: JSON.stringify(params),
    });
    if (!response.ok) throw Error(`registration refused: ${response.status}`);
    return await response.json() as { threadId: string };
  } };
  assert.deepEqual(await projectNativeChildInBb(child, owner, port), { status: 'projection-unavailable', reason: 'registration-unconfirmed' });
  assert.equal(mutations, 1);
  assert.equal(requests.length, 1, 'no hidden retry after lost response');
  authorized = false;
  assert.deepEqual(await projectNativeChildInBb(child, owner, port), { status: 'projection-unavailable', reason: 'registration-unconfirmed' });
  assert.equal(mutations, 1, 'revoked request cannot become a successful existing-binding no-op');
  authorized = true;
  const confirmed = await projectNativeChildInBb(child, owner, port);
  assert.equal(confirmed.status, 'registered');
  if (confirmed.status !== 'registered') assert.fail('identical retry must confirm committed binding');
  assert.equal(confirmed.binding.bbThreadId, 'existing-child-1');
  assert.equal(confirmed.binding.conversationId, '11');
  assert.equal(mutations, 1);
  assert.equal(bindings.size, 1);
  assert.deepEqual(requests[0], requests[1]);
  assert.deepEqual(requests[0], requests[2]);
  assert.deepEqual(await projectNativeChildInBb({ ...child, sessionId: 'foreign-session' }, { ...owner, sessionId: 'foreign-session' }, port), { status: 'projection-unavailable', reason: 'registration-unconfirmed' });
  assert.equal(mutations, 1, 'internally matching forged tuple does not authorize registration');
  for (const params of requests) for (const key of ['prompt', 'message', 'initialPrompt', 'spawn']) assert.equal(Object.hasOwn(params, key), false);
});
