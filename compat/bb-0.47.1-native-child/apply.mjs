// SPDX-License-Identifier: MIT
import { createHash } from 'node:crypto';
import { readFile, writeFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeRegisteredChildRouting, committedNativeHistoryTurn } from './registered-child-routing.mjs';
import { manualStopLifecycleIds, manualStopLifecycleReceipt, retainLifecycleTurnHeaders } from './manual-stop-history.mjs';
export const baselineServerSha256 = 'faba35ca0960b99ad2e63f941200de92ecbbea47fdd721a67033797ea4218604';

export const baselineSha256 = 'ca743511bf1429795bca496a6e5531fc3f13e84ccc3b8b36d4f89147057bfb7a';
const registration = 'e.onNativeThreadRegistration(xe).then(de=>{G9(o,P,j.data,de),Bo({child:P.child,id:_.parsedId,result:de})},se)';
const replacement = `e.onNativeThreadRegistration(xe).then(de=>{try{
  if(to(P.child)||M.requireProviderProcess({processKey:P.processKey,providerId:P.providerId})!==P)throw Error("Native parent process replaced");
  const childRouting=initializeRegisteredChildRouting({parent:a.get(ge),existing:a.get(de.threadId),parentThreadId:ge,childThreadId:de.threadId,providerId:P.providerId,processKey:P.processKey,resolveEnvironment:Nu});
  G9(o,P,j.data,de);
  if(!a.has(de.threadId))We(de.threadId,childRouting);
  Bo({child:P.child,id:_.parsedId,result:de});
}catch{se()}},se)`;
const anchor = 'function G9(e,t,r,n){';
const historyDispatch = 'L8(_,P,o,e.onNativeHistory,';
const observedHistoryDispatch = `L8(_,P,o,e.onNativeHistory&&(async request=>{
  const receipt=await e.onNativeHistory(request);
  const event=committedNativeHistoryTurn(request,receipt);
  if(event){I.observe(event);w.observe(event);wt(event)}
  return receipt;
}),`;
export function buildPatchedDaemon(bytes) {
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== baselineSha256) throw Error('Unsupported BB Core compatibility build: input SHA-256 differs; no output written');
  const source = bytes.toString('utf8');
  if (source.split(registration).length !== 2 || source.split(anchor).length !== 2 || source.split(historyDispatch).length !== 2 ||
      source.includes('function initializeRegisteredChildRouting(')) throw Error('Unsupported Core lifecycle seam');
  return source.replace(anchor, `${initializeRegisteredChildRouting.toString()}\n${committedNativeHistoryTurn.toString()}\n${anchor}`)
    .replace(registration, replacement).replace(historyDispatch, observedHistoryDispatch);
}

export function buildPatchedServer(bytes) {
  if (createHash('sha256').update(bytes).digest('hex') !== baselineServerSha256)
    throw Error('Unsupported BB Core server build: input SHA-256 differs; no output written');
  const source = bytes.toString('utf8');
  const anchor = 'function reconcileNativeHistory(db, hostId, input2, core) {';
  const guard = 'if (lifecycleIds.has(row.id)) return false;';
  const rowsStart = 'const rows = stored.filter((row) => {';
  const replaced = 'const replaced = [...rows, ...admittedControls];';
  const metadata = 'const metadataJson = JSON.stringify({ version: 1, digest: nextDigest, nativeStatus: snapshot.status, rowCount: finalRows.length, rowsDigest: hash2(finalRows) });';
  if (source.split(anchor).length !== 2 || source.split(guard).length !== 2 || source.split(rowsStart).length !== 2 || source.split(replaced).length !== 2 || source.split(metadata).length !== 2)
    throw Error('Unsupported Core history lifecycle seam');
  return source.replace(anchor, `${manualStopLifecycleIds.toString()}\n${manualStopLifecycleReceipt.toString()}\n${retainLifecycleTurnHeaders.toString()}\n${anchor}`)
    .replace(rowsStart, `const manualStopIds = manualStopLifecycleIds(stored, old, lifecycleData, hash2, lifecycleIds);\n    if (!manualStopIds) throw new NativeHistoryError(409, "Corrupt manual-stop lifecycle attestation");\n    ${rowsStart}`)
    .replace(guard, 'if (lifecycleIds.has(row.id) || manualStopIds.has(row.id)) return false;')
    .replace(replaced, 'retainLifecycleTurnHeaders(stored, manualStopIds, lifecycleData);\n    const replaced = [...rows.filter(row => !manualStopIds.has(row.id)), ...admittedControls];')
    .replace(metadata, 'const metadataJson = JSON.stringify({ version: 1, digest: nextDigest, nativeStatus: snapshot.status, rowCount: finalRows.length, rowsDigest: hash2(finalRows), ...manualStopLifecycleReceipt(stored, manualStopIds, hash2) });');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output, serverInput, serverOutput, ...extra] = process.argv.slice(2);
  if (!input || !output || !serverInput || !serverOutput || extra.length)
    throw Error('Usage: node apply.mjs INPUT_DAEMON NEW_DAEMON INPUT_SERVER NEW_SERVER');
  const inputPath = await realpath(input), serverInputPath = await realpath(serverInput);
  if ([inputPath, serverInputPath].some(path => path === resolve(output) || path === resolve(serverOutput)) || resolve(output) === resolve(serverOutput))
    throw Error('Inputs and outputs must differ: patch a new disposable copy only');
  const daemon = buildPatchedDaemon(await readFile(inputPath));
  const server = buildPatchedServer(await readFile(serverInputPath));
  // Exclusive creation: never overwrite an installed runtime or previous candidate.
  await writeFile(output, daemon, { flag: 'wx', mode: 0o644 });
  await writeFile(serverOutput, server, { flag: 'wx', mode: 0o644 });
  console.log(JSON.stringify({ status: 'built-not-activated', daemon: { inputSha256: baselineSha256,
    outputSha256: createHash('sha256').update(daemon).digest('hex') }, server: { inputSha256: baselineServerSha256,
    outputSha256: createHash('sha256').update(server).digest('hex') } }));
}
