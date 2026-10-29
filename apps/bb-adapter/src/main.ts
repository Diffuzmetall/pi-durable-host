#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { DpiClient } from 'dpi-sdk/client';
import { BbProviderBridge } from './provider-bridge.js';

// Trusted operator launch context, never copied from model/BB request bodies or printed.
const required = ['DPI_BASE', 'DPI_TOKEN', 'DPI_SESSION', 'DPI_BB_THREAD', 'DPI_CWD'] as const;
for (const name of required) if (!process.env[name]) throw Error(`Missing ${name}`);
const conversationId = Number(process.env.DPI_CONVERSATION ?? '1');
if (!Number.isSafeInteger(conversationId) || conversationId < 1) throw Error('Invalid DPI_CONVERSATION');
const enrollmentFingerprint = process.env.DPI_BB_ENROLLMENT_FINGERPRINT;
const rootProfileFingerprint = process.env.DPI_BB_ROOT_PROFILE_FINGERPRINT;
if (!!enrollmentFingerprint !== !!rootProfileFingerprint) throw Error('Both BB Root attachment fingerprints are required together');
const bridge = new BbProviderBridge(json => { process.stdout.write(json); }, {
  client: new DpiClient(process.env.DPI_BASE!, process.env.DPI_TOKEN!),
  providerId: 'pi-durable', sessionId: process.env.DPI_SESSION!, conversationId,
  threadId: process.env.DPI_BB_THREAD!, cwd: process.env.DPI_CWD!,
  ...(enrollmentFingerprint && rootProfileFingerprint ? { rootAttachment: { enrollmentFingerprint, rootProfileFingerprint } } : {}),
});
const lines = createInterface({ input: process.stdin, terminal: false });
// Responses to reverse Core requests must be admitted while an earlier request awaits them.
lines.on('line', line => { void bridge.handleLine(line).catch(() => { process.stderr.write('BB request processing failed\n'); }); });
let closing: Promise<void> | undefined;
const close = () => { closing ??= bridge.shutdown(); void closing.then(() => { lines.close(); process.stdin.pause(); }); };
lines.once('close', close);
process.once('SIGTERM', close);
process.once('SIGINT', close);
