import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Harness, createRegistry } from '@earendil-works/pi-durable';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { fauxProvider, fauxAssistantMessage } from '@earendil-works/pi-ai/providers/faux';
import { BACKGROUND_CONTEXT as context, withAbortSignal } from '@earendil-works/chord/context';
import { createNativeModels, ReloadableRegistry, reloadDurable } from './dist/index.js';

test('standalone Durable package reloads a real Harness without importing or starting any Host', async () => {
  const directory=await mkdtemp(join(tmpdir(),'standalone-durable-reload-'));
  let version=1; const seen=[];
  const reference={provider:'standalone-faux',modelId:'exact-saved-id'};
  const models=await createNativeModels(()=>{
    const revision=version;
    const faux=fauxProvider({provider:reference.provider,models:[{id:reference.modelId,contextWindow:100000,maxTokens:4096},{id:`new-${revision}`,contextWindow:100000,maxTokens:4096}],tokensPerSecond:100000});
    faux.setResponses([async()=>{seen.push(revision);return fauxAssistantMessage(`version-${revision}`);}]);
    return {credentials:new InMemoryCredentialStore(),providers:[{...faux.provider,auth:{apiKey:{name:'synthetic',resolve:async()=>({auth:{apiKey:'fixture-only'}})}}}]};
  });
  const registry=new ReloadableRegistry(createRegistry());
  const harness=await Harness.open(await openNodeSqliteStorage(join(directory,'native.sqlite')),
    {models:models.models,registry,env:()=>new NodeExecutionEnv({cwd:directory,env:{HOME:directory}})},context);
  try {
    const conversation=await harness.root(context,{agent:{model:reference,cwd:directory}});
    const run=async id=>{
      const submission=await conversation.submit({type:'input',content:'standalone probe',requestId:id},context);
      assert.equal((await submission.wait(withAbortSignal(AbortSignal.timeout(5000),context))).status,'done');
    };
    await run('before-reload');
    version=2;
    const result=await reloadDurable({harness,context,models,
      prepareExtensions:async()=>registry.prepare([]),assertCurrent:()=>{}});
    assert.ok(result.models.some(model=>model.id==='new-2'));
    assert.deepEqual((await conversation.agent(context)).model,reference);
    await run('after-reload');
    assert.deepEqual(seen,[1,2]);
    assert.equal((await harness.root(context)).id,conversation.id);
  } finally {await harness.close(context);}
});
