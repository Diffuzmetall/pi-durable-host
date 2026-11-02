import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, chmod, symlink, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { selectedNativeAdapters, readNativeSelection, validateSealedArtifact } from '../../sdk-host-cutover/native-artifact.mjs';
import { selectNativeArtifact } from '../../sdk-host-cutover/select-native-artifact.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
export async function artifact(root, version) {
  await mkdir(root, { mode: 0o700 });
  const files = {
    'value.mjs': `export const version=${JSON.stringify(version)};`,
    'adapter.mjs': `import {createRegistry,defineExtension,defineTool,defineTask} from '@earendil-works/pi-durable';
import {version} from './value.mjs';
import {appendFileSync} from 'node:fs';
export default base=>{const r=createRegistry();for(const e of base.snapshot().installed())r.install(e);
r.install(defineExtension({name:'rollback-fixture',tasks:[...(${JSON.stringify(version)}==='v2'?[defineTask({name:'artifact.checkpoint',version:2,initial:()=>({phase:'run'}),phases:{run:async(record,runtime,context)=>{await process.artifactCheckpointGate?.();await runtime.commit(()=>({status:'terminal',outcome:{status:'completed',result:version}}),context);}},abort:async()=>{}})]:[])],tools:[defineTool({name:'artifact_version',parameters:{type:'object',properties:{}},replay:'unsafe',execute:async()=>{await process.artifactGate?.();appendFileSync(process.env.ARTIFACT_EFFECT_FILE,version+'\\n');return {output:[{type:'text',text:version}]};}})]}));return r;};`,
  };
  for (const [name, text] of Object.entries(files)) await writeFile(join(root, name), text, { mode: 0o400 });
  const manifest = JSON.stringify({ activated: false, files: Object.fromEntries(Object.entries(files).map(([n,s]) => [n,{sha256:hash(s)}])) });
  await writeFile(join(root,'RESTART-CANDIDATE.json'), manifest, { mode:0o400 });
  await chmod(root, 0o500);
  return { root, manifestSha256: hash(manifest), adapters:['adapter.mjs'] };
}
export async function fixture(sessionId='session-A', url='http://127.0.0.1:7777') {
  const root=await mkdtemp(join(tmpdir(),'artifact-selection-'));
  const artifacts={ v1:await artifact(join(root,'v1'),'v1'), v2:await artifact(join(root,'v2'),'v2') };
  const selector=join(root,'selection.json');
  await writeFile(selector,JSON.stringify({sessionId,url,current:'v1',artifacts}),{mode:0o600});
  return {root,selector,artifacts};
}

test('sealed transitive closure and session binding validate before adapter loading',async()=>{
  const f=await fixture();
  const checked=await validateSealedArtifact({root:f.artifacts.v1.root,manifestSha256:f.artifacts.v1.manifestSha256});
  assert.deepEqual([...checked.files].sort(),['adapter.mjs','value.mjs']);
  assert.equal(checked.root,f.artifacts.v1.root);
  await assert.rejects(validateSealedArtifact({root:f.artifacts.v1.root,manifestSha256:'0'.repeat(64)}),/MANIFEST_CHANGED/);
  assert.deepEqual(await selectedNativeAdapters(f.selector,'session-A'),[join(f.artifacts.v1.root,'adapter.mjs')]);
  await assert.rejects(selectedNativeAdapters(f.selector,'session-B'),/SESSION_SELECTOR/);
  await assert.rejects(selectedNativeAdapters(f.selector),/BOUND_SESSION_REQUIRED/);
  await chmod(join(f.artifacts.v1.root,'value.mjs'),0o600);
  await writeFile(join(f.artifacts.v1.root,'value.mjs'),'changed');
  await assert.rejects(readNativeSelection(f.selector),/MUTABLE_ARTIFACT/);
  await chmod(join(f.artifacts.v1.root,'value.mjs'),0o400);
  await assert.rejects(readNativeSelection(f.selector),/ARTIFACT_CONTENT_CHANGED/);
});

test('explicit approved target uses existing reload once; repeated uncertain target is never resent',async()=>{
  const f=await fixture(); let calls=0;
  const client={session:id=>{assert.equal(id,'session-A');return {reload:async()=>{calls++;throw Error('lost ACK');}};}};
  const result=await selectNativeArtifact({selector:f.selector,target:'v2',expected:'v1',client});
  assert.equal(result.status,'uncertain');assert.equal(calls,1);
  assert.equal((await readNativeSelection(f.selector)).config.current,'v2');
  const repeated=await selectNativeArtifact({selector:f.selector,target:'v2',expected:'v1',client});
  assert.equal(repeated.status,'already-selected');assert.equal(repeated.reloadSent,false);assert.equal(calls,1);
  await assert.rejects(selectNativeArtifact({selector:f.selector,target:'v1',expected:'wrong',client}),/CONFLICT/);
  await assert.rejects(selectNativeArtifact({selector:f.selector,target:'outside',expected:'v2',client}),/UNAPPROVED/);
  assert.equal(calls,1);
});

test('post-publication lock cleanup failure returns uncertainty without reverting or resending',async()=>{
  const f=await fixture();let calls=0;
  const client={session:()=>({reload:async()=>{calls++;await unlink(`${f.selector}.lock`);return {models:[]};}})};
  const result=await selectNativeArtifact({selector:f.selector,target:'v2',expected:'v1',client});
  assert.equal(result.status,'uncertain');assert.equal(result.reloadSent,true);
  assert.equal((await readNativeSelection(f.selector)).config.current,'v2');
  assert.equal((await selectNativeArtifact({selector:f.selector,target:'v2',expected:'v1',client})).reloadSent,false);
  assert.equal(calls,1);
});

test('manifest substitution, aliases, concurrent selector and writable config are refused before reload',async()=>{
  const f=await fixture(); const original=await readFile(f.selector,'utf8');let calls=0;
  const client={session:()=>({reload:async()=>{calls++;}})};
  await writeFile(`${f.selector}.lock`,'held',{mode:0o600});
  await assert.rejects(selectNativeArtifact({selector:f.selector,target:'v2',expected:'v1',client}),e=>e.code==='EEXIST');
  assert.equal(await readFile(f.selector,'utf8'),original);assert.equal(calls,0);
  const changed=JSON.parse(original);changed.artifacts.v1.manifestSha256='0'.repeat(64);
  await writeFile(f.selector,JSON.stringify(changed));
  await assert.rejects(readNativeSelection(f.selector),/MANIFEST_CHANGED/);
  await writeFile(f.selector,original);
  await symlink(f.selector,join(f.root,'alias'));
  await assert.rejects(readNativeSelection(join(f.root,'alias')),/PRIVATE_CANONICAL/);
  await chmod(f.selector,0o644);
  await assert.rejects(readNativeSelection(f.selector),/PRIVATE_CANONICAL/);
});
