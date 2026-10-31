import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { DpiClient } from 'dpi-sdk';
const binary = new URL('./operational-service.mjs', import.meta.url).pathname;
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'service-test-')); await mkdir(join(root,'sessions'));
  const config = { dataDir: root, startDirs: [root], trustedWorkspaces: [], port: 49182, ownerGrantId: 'test', grants: [
    { id:'test',actor:'test',token:'synthetic-token',source:'terminal',authority:'human',permissions:['read','write','control','filesystem','human-accept'],binding:{} }
  ] };
  const path=join(root,'host.json'); await writeFile(path,JSON.stringify(config),{mode:0o600}); return {root,path};
}
test('service refuses existing dead-owner locks without touching them', {timeout:10000}, async()=>{
 const {root,path}=await fixture(); const lock=join(root,'catalog.sqlite.lock'); await writeFile(lock,'999999999',{mode:0o600});
 const child=spawn(process.execPath,[binary,path]); let error=''; child.stderr.on('data',data=>{error+=data;});
 const [code]=await once(child,'exit'); assert.equal(code,1); assert.match(error,/EXISTING_OWNER_LOCK_REFUSED/); assert.equal(await readFile(lock,'utf8'),'999999999');
});
test('native operational service starts, serves SDK discovery, closes and reopens without a model call', {timeout:20000}, async()=>{
 const {path}=await fixture();
 await mkdir(join(homedir(),'.pi/agent'),{recursive:true});
 await writeFile(join(homedir(),'.pi/agent/auth.json'),JSON.stringify({'openai-codex':{type:'oauth',access:'SYNTHETIC_OFFLINE_ACCESS',refresh:'SYNTHETIC_OFFLINE_REFRESH',expires:Date.now()+3600000}}),{mode:0o600});
 for(let opening=0;opening<2;opening++){
   const child=spawn(process.execPath,[binary,path]); let errors='';child.stderr.on('data',data=>{errors+=data;});
   const exited=once(child,'exit');
   try{
     const ready=(async()=>{ for await(const line of createInterface({input:child.stdout})) if(line.includes('NATIVE_HOST_READY')) return JSON.parse(line); throw Error('No ready event: '+errors); })();
     const info=await Promise.race([ready,exited.then(([code])=>{throw Error('Startup exit '+code+': '+errors);})]);
     assert.equal(info.profile,'native@1');
     const client=new DpiClient(info.endpoint,'synthetic-token'); const device=await client.device();
     assert.deepEqual(device.defaultModelRef,{provider:'openai-codex',modelId:'gpt-6.1-sol'});
     assert.deepEqual(await client.sessions(),[]);
   }finally{child.kill('SIGTERM'); assert.equal((await exited)[0],0);}
 }
});
