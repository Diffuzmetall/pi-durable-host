import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { Store } from '../src/store.js';
import { createHttpServer } from '../src/http-server.js';
import { minimalProfile, type RuntimeProfileContext } from '../src/runtime-profile.js';
import { createNativeProfile } from '../src/native-profile/profile.js';
import { createNativeModels } from '../src/native-profile/models/index.js';
import { GrantPolicy } from '../src/grants.js';
import { ApiFault, errorMiddleware, invalid } from '../src/errors.js';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { fauxProvider } from '@earendil-works/pi-ai/providers/faux';
import { tempStore, faux } from './helpers.js';

for (const family of ['factory','wrapped','model','auth','mcp']) {
  test(`actual ${family} initializer privacy across first request, cached reads and owner reopen`, { timeout: 20000 }, async () => {
    const temp = await tempStore(), sentinel = `SYNTHETIC_PRIVATE_${family}_${crypto.randomUUID()}`;
    let armed = false, reached = 0;
    const fail = () => { reached++; if (family === 'wrapped') throw new ApiFault('invalid', `Initializer cause ${sentinel}`); throw Error(`Initializer cause ${sentinel}`); };
    const credentials = new InMemoryCredentialStore();
    await credentials.modify('faux', async () => ({ type: 'api_key', key: 'DISPOSABLE_NATIVE_AUTH' }));
    const createModels = async () => {
      const native = fauxProvider({ provider:'faux', models:[{ id:'echo', contextWindow:128000,maxTokens:8192 }] });
      const provider = family === 'model' ? { ...native.provider, refreshModels: async () => { if (armed) fail(); } }
        : { ...native.provider, auth:{apiKey:{name:'Explicit fixture credential',resolve:async () => { if (armed) fail(); return {auth:{apiKey:'DISPOSABLE_NATIVE_AUTH'}}; }}} };
      return createNativeModels({ credentials,providers:[provider] });
    };
    const token='DISPOSABLE_INITIALIZER_TOKEN';
    const policy=new GrantPolicy([{id:'operator',token,actor:'operator',source:'terminal',authority:'human',permissions:['read','write','control','filesystem','human-accept'],binding:{}}]);
    const nativeProfile=createNativeProfile({policy,owner:policy.authenticate(token),resolveSkill:async()=>{throw Error('No fixture skill')},connectMcp:async()=>{if(armed&&family==='mcp')fail();return {sources:[],close:async()=>{}}}});
    const deviceCatalogue = family==='model'||family==='auth' ? await (await createModels()).catalogue() : undefined;
    const models = deviceCatalogue ? {defaultModel:faux,catalogue:async()=>deviceCatalogue,create:createModels} : undefined;
    const profile=Object.assign(async(context:RuntimeProfileContext)=>{if(armed&&(family==='factory'||family==='wrapped'))fail();return family==='mcp'?nativeProfile(context):minimalProfile(context)}, {id:`error-family-${family}@1`,...(models?{models}:{})});
    let store=await Store.open({...temp.options,profile}), opened=true;
    const session=await store.create({name:'existing',cwd:temp.work,model:faux});
    await store.close();opened=false;
    const diagnostics:string[]=[], publicBodies:string[]=[], failureStatuses:number[]=[], originalError=console.error, originalWarn=console.warn;
    console.error=(...args:unknown[])=>{diagnostics.push(args.map(String).join(' '))};
    console.warn=(...args:unknown[])=>{diagnostics.push(args.map(String).join(' '))};
    armed=true;
    let server:ReturnType<typeof createHttpServer>|undefined;
    try {
      for(let epoch=0;epoch<2;epoch++) {
        store=await Store.open({...temp.options,profile});opened=true;
        server=createHttpServer(store,policy).listen(0,'127.0.0.1');await once(server,'listening');
        const address=server.address();assert.ok(address&&typeof address==='object');const url=`http://127.0.0.1:${address.port}`;
        const call=async(path:string,init:RequestInit={})=>{
          const headers = new Headers(init.headers); headers.set('authorization',`Bearer ${token}`); headers.set('content-type','application/json');
          const response=await fetch(url+path,{...init,headers});
          publicBodies.push(await response.text());return response;
        };
        await call('/v1/sessions');await call('/v1/tree');await call(`/v1/sessions/${session.id}`);await call(`/v1/sessions/${session.id}/agents/main`);
        const first=await call('/v1/sessions',{method:'POST',headers:{'idempotency-key':`failure-${family}-${epoch}`},body:JSON.stringify({name:'new-failure',cwd:temp.work,model:faux})});
        failureStatuses.push(first.status);
        await call('/v1/tree');await call(`/v1/sessions/${session.id}/agents/main`);
        server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));server=undefined;
        await store.close();opened=false;
      }
      assert.ok(reached>0,'actual initializer callback was exercised, not a label-only fixture');
      const exposure={http:publicBodies.join('\n').includes(sentinel),diagnostic:diagnostics.join('\n').includes(sentinel)};
      originalError('INITIALIZER_PRIVACY_BOOLEAN',family,JSON.stringify(exposure));
      assert.equal(exposure.http,false,'all initial/cache/reopen HTTP bodies must omit private cause');
      assert.equal(exposure.diagnostic,false,'all structured diagnostics must omit private cause/stack');
      assert.ok(failureStatuses.every(status => status >= 500), 'initializer causes remain server failures, not trusted client faults');
      assert.ok(diagnostics.some(line=>line.includes('dpi-backend')),'safe useful diagnostics must still exist');
    } finally {
      console.error=originalError;console.warn=originalWarn;
      if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()))}
      if(opened)await store.close();await temp.cleanup();
    }
  });
}

test('HTTP boundary preserves safe client faults and opaque healthy JSON, but not internal causes', async () => {
  const sentinel = `SYNTHETIC_INTERNAL_${crypto.randomUUID()}`;
  const healthy = { tokenLike: sentinel, nested: { message: 'Invalid business value', stack: 'opaque user data' } };
  const app = express();
  app.get('/invalid', (_req, _res, next) => next(invalid('name is required')));
  app.get('/conflict', (_req, _res, next) => next(new ApiFault('conflict', 'Request key has a different payload')));
  app.get('/unavailable', (_req, _res, next) => next(new ApiFault('unavailable', sentinel)));
  app.get('/internal', (_req, _res, next) => next(new ApiFault('internal', sentinel)));
  app.get('/plain', (_req, _res, next) => next(Error(`Invalid provider ${sentinel}`)));
  app.get('/healthy', (_req, res) => res.json(healthy));
  app.use(errorMiddleware);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}`, logs: string[] = [], original = console.error;
  console.error = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };
  try {
    for (const [path, status, message] of [
      ['/invalid', 400, 'name is required'], ['/conflict', 409, 'Request key has a different payload'],
      ['/unavailable', 503, 'Service unavailable'], ['/internal', 500, 'Internal error'], ['/plain', 400, 'Invalid request'],
    ] as const) {
      const response = await fetch(url + path), body = await response.json();
      assert.equal(response.status, status); assert.equal(body.error.message, message);
      assert.equal(JSON.stringify(body).includes(sentinel), false);
      if (status >= 500) assert.match(response.headers.get('x-dpi-error-id') ?? '', /^[a-f0-9-]{36}$/);
    }
    assert.deepEqual(await (await fetch(url + '/healthy')).json(), healthy, 'business JSON is never a redaction target');
    assert.equal(logs.join('\n').includes(sentinel), false);
    const records = logs.map(line => JSON.parse(line.replace(/^\[dpi-backend\] /, '')));
    assert.equal(records.length, 2);
    for (const record of records) {
      assert.deepEqual(Object.keys(record).sort(), ['event','id','kind','operation']);
      assert.equal(record.event, 'operation_failed'); assert.equal(record.operation, 'http.GET');
      assert.equal(record.kind, 'Error');
    }
  } finally {
    console.error = original; server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
