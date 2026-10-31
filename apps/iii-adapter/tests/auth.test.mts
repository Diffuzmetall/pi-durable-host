import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { Admission, canonical, fingerprint, signed } from '../src/auth.js';

const now = 1800000000000;
const session = 'disposable-native-session';
const operation = 'requests::start';
const keys = generateKeyPairSync('ed25519');
const otherKeys = generateKeyPairSync('ed25519');
const payload = { requestId: 'stable-request-1', content: 'local fixture', nested: [true, null, { b: 2, a: 1 }] };
const issue = (expires = now + 60000) => signed(keys.privateKey, session, operation, payload, expires);

test('actual canonical bytes and fingerprints preserve JSON order semantics and reject non-JSON values', () => {
  const expected = '{"a":[true,null,{"x":"é","y":2}],"z":1}';
  const a = { z: 1, a: [true, null, { y: 2, x: 'é' }] };
  const b = { a: [true, null, { x: 'é', y: 2 }], z: 1 };
  assert.equal(canonical(a), expected);
  assert.equal(canonical(b), expected);
  assert.equal(fingerprint(a), createHash('sha256').update(expected).digest('hex'));
  assert.equal(fingerprint(a), fingerprint(b));
  assert.notEqual(fingerprint(['a', 'b']), fingerprint(['b', 'a']));
  assert.equal(canonical(Object.assign(Object.create(null), { b: 2, a: 1 })), '{"a":1,"b":2}');
  for (const invalid of [undefined, NaN, Infinity, -Infinity, 1n, Symbol('x'), () => 1, new Date(), /x/, Object.assign(Object.create({ foreign: true }), { a: 1 }), [undefined], { a: undefined }]) {
    assert.throws(() => canonical(invalid));
  }
  assert.throws(() => canonical(new Array(1)), /INVALID_OBJECT|INVALID_JSON/, 'array holes are not valid JSON and must not collide with []');
});

test('generated Ed25519 keys authenticate exact session/function/body with no caller identity inference', () => {
  const admission = new Admission(keys.publicKey, session, () => now);
  const envelope = issue();
  assert.deepEqual(admission.authorize(operation, envelope), payload);
  const publicPem = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privatePem = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  assert.deepEqual(new Admission(publicPem, session, () => now).authorize(operation, signed(privatePem, session, operation, payload, now + 1000)), payload);
  for (const hint of ['human', 'root', 'foreign-worker', { authority: 'human', mode: 'local-iii' }]) {
    assert.deepEqual(admission.authorize(operation, { ...envelope, _caller_worker_id: hint }), payload);
    assert.equal(admission.mode, 'signed'); assert.equal(admission.sessionId, session);
  }
  assert.throws(() => admission.authorize(operation, { ...envelope, mode: 'local-iii' }), /UNAUTHORIZED/);
  assert.throws(() => admission.authorize(operation, { ...envelope, authority: 'human' }), /UNAUTHORIZED/);
  assert.throws(() => new Admission(otherKeys.publicKey, session, () => now).authorize(operation, envelope), /UNAUTHORIZED/);
  assert.throws(() => new Admission(keys.publicKey, 'foreign-session', () => now).authorize(operation, envelope), /UNAUTHORIZED/);
  assert.throws(() => admission.authorize('requests::stop', envelope), /UNAUTHORIZED/);
});

test('envelope tamper, extra/missing fields, malformed signatures and invalid JSON fail closed', () => {
  const admission = new Admission(keys.publicKey, session, () => now);
  const envelope = issue();
  const bytes = Buffer.from(envelope.signature, 'base64url'); bytes[0] ^= 1;
  const invalid = [null, 'payload', [], {}, { ...envelope, payload: { ...payload, content: 'tampered' } },
    { ...envelope, expires: now + 2000 }, { ...envelope, version: 2 }, { ...envelope, signature: bytes.toString('base64url') },
    { ...envelope, signature: '' }, { ...envelope, signature: 'x'.repeat(129) }, { ...envelope, signature: {} },
    { ...envelope, extra: true }, { ...envelope, payload: { invalid: undefined } }, { ...envelope, payload: NaN },
    { ...envelope, payload: new Date() }, { ...envelope, payload: new Array(1) },
  ];
  for (const field of Object.keys(envelope)) {
    const incomplete = { ...envelope }; delete incomplete[field as keyof typeof incomplete]; invalid.push(incomplete);
  }
  for (const value of invalid) assert.throws(() => admission.authorize(operation, value), /UNAUTHORIZED/);
});

test('expiry and UTF-8 byte budgets are exact; invalid keys/modes cannot select unsigned ingress', () => {
  const admission = new Admission(keys.publicKey, session, () => now);
  assert.deepEqual(admission.authorize(operation, issue(now + 300000)), payload);
  for (const expires of [now, now - 1, now + 300001, now + 0.5, NaN, Infinity]) {
    const value = Number.isFinite(expires) ? issue(expires) : { ...issue(), expires };
    assert.throws(() => admission.authorize(operation, value), /UNAUTHORIZED/);
  }
  const small = { content: 'x'.repeat(64000) };
  assert.deepEqual(admission.authorize(operation, signed(keys.privateKey, session, operation, small, now + 1000)), small);
  for (const content of ['x'.repeat(65536), 'é'.repeat(32768)]) {
    assert.throws(() => admission.authorize(operation, signed(keys.privateKey, session, operation, { content }, now + 1000)), /UNAUTHORIZED/);
  }
  assert.throws(() => new Admission(keys.privateKey, session), /ED25519_PUBLIC_KEY_REQUIRED/);
  const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  assert.throws(() => new Admission(ec.publicKey, session), /ED25519_PUBLIC_KEY_REQUIRED/);
  assert.throws(() => new Admission(keys.publicKey, session, () => now, 'untrusted' as never), /INVALID_INGRESS_MODE/);
});

test('local-iii is explicit trusted configuration only; strips worker hint and retains no identity or native capability', () => {
  const local = new Admission(keys.publicKey, session, () => now, 'local-iii');
  assert.deepEqual(local.authorize(operation, { requestId: 'j1', content: 'fixture', _caller_worker_id: 'root' }), { requestId: 'j1', content: 'fixture' });
  assert.equal(local.mode, 'local-iii');
  assert.throws(() => new Admission(keys.publicKey, session, () => now).authorize(operation, { content: 'unsigned', _caller_worker_id: 'human', mode: 'local-iii' }), /UNAUTHORIZED/);
  assert.throws(() => local.authorize(operation, { content: 'é'.repeat(32768) }), /PAYLOAD_TOO_LARGE/);
  assert.throws(() => local.authorize(operation, { content: undefined }));
  assert.throws(() => local.authorize(operation, null));
  assert.deepEqual(Object.keys(local).sort(), ['mode', 'now', 'publicKey', 'sessionId']);
});
