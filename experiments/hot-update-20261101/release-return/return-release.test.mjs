import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, chmod, rm, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { returnRelease } from './return-release.mjs';

// Explicit lifecycle fixture, NOT a packaged Host, native receipt or compatibility proof.
const script=`import {readFileSync,writeFileSync,appendFileSync,unlinkSync} from 'node:fs';
import {createServer} from 'node:http';import {join} from 'node:path';
process.umask(0o077);const config=JSON.parse(readFileSync(process.argv[2]));
const version=readFileSync(new URL('./VERSION',import.meta.url),'utf8');
if(version==='crash')process.exit(23);
const lock=join(config.dataDir,'catalog.sqlite.lock');writeFileSync(lock,String(process.pid),{flag:'wx'});
const server=createServer((req,res)=>{if(req.method==='POST')appendFileSync(join(config.dataDir,'records'),version+'\\n');res.end(version);});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({port:server.address().port})));
process.on('SIGTERM',()=>{server.closeAllConnections();server.close(()=>{unlinkSync(lock);process.exit(0);});});`;
const digest=text=>createHash('sha256').update(text).digest('hex');

async function fixture() {
  const home=await mkdtemp(join(tmpdir(),'release-mechanics-')),dataDir=join(home,'data'),config=join(home,'host.json'),unit=join(home,'fixture.service');
  await mkdir(dataDir,{mode:0o700});await mkdir(join(dataDir,'sessions'));
  await writeFile(config,JSON.stringify({dataDir}),{mode:0o600});
  const releases=[];
  for(const version of ['v1','v2','crash']){
    const root=join(home,version);await mkdir(root);
    await writeFile(join(root,'operational-service.mjs'),script,{mode:0o444});await writeFile(join(root,'VERSION'),version,{mode:0o444});
    const manifest=JSON.stringify({files:{'operational-service.mjs':{sha256:digest(script)},VERSION:{sha256:digest(version)}}});
    await writeFile(join(root,'RESTART-CANDIDATE.json'),manifest,{mode:0o444});await chmod(root,0o555);
    releases.push({root,manifestSha256:digest(manifest)});
  }
  const [v1,v2,crash]=releases;
  await writeFile(unit,`[Service]\nExecStart=${process.execPath} ${join(v1.root,'operational-service.mjs')} ${config}\n`,{mode:0o600});
  let child,command=[],port,starts=0,stops=0;
  const control={
    async inspect(service){return {service,unit,pid:child&&child.exitCode===null&&child.signalCode===null?child.pid:0,command};},
    async start(){
      starts++;
      command=(await readFile(unit,'utf8')).split('\n').find(line=>line.startsWith('ExecStart=')).slice(10).split(' ');
      child=spawn(command[0],command.slice(1),{stdio:['ignore','pipe','pipe']});
      const exit=new Promise((_,reject)=>child.once('exit',code=>reject(Error(`START_FAILED:${code}`))));
      const ready=(async()=>{const [bytes]=await once(child.stdout,'data');port=JSON.parse(bytes.toString()).port;})();
      await Promise.race([ready,exit]);
    },
    async stop(){stops++;if(!child||child.exitCode!==null||child.signalCode!==null)return;const done=once(child,'exit');child.kill('SIGTERM');await done;},
  };
  await control.start();
  return {home,dataDir,config,unit,v1,v2,crash,control,
    get starts(){return starts;},get stops(){return stops;},
    options:(expected=v1,target=v2,name='attempt')=>({service:'fixture.service',dataDir,evidence:join(home,name),expected,target}),
    async record(){return (await fetch(`http://127.0.0.1:${port}`,{method:'POST'})).text();},
    async close(){await control.stop();for(const r of releases){await chmod(r.root,0o700);for(const name of ['operational-service.mjs','VERSION','RESTART-CANDIDATE.json'])await chmod(join(r.root,name),0o600);}await rm(home,{recursive:true,force:true});},
  };
}
const compatible=async()=>true; // synthetic trust boundary; never used by the operator CLI.

test('explicit child fixture switches v1→v2→v1 with current records and backup, no implicit replay',{timeout:10000},async()=>{
  const f=await fixture();try{
    assert.equal(await f.record(),'v1');const first=await f.control.inspect('fixture.service');
    const phases=[];
    const switched=await returnRelease(f.options(),{control:f.control,preflight:async value=>{phases.push(value.phase);if(value.phase==='stopped-current-data')assert.equal(await readFile(join(value.copyDirectory,'records'),'utf8'),'v1\n');return true;}});
    assert.equal(switched.status,'release-selected');assert.notEqual(switched.pid,first.pid);
    assert.deepEqual(phases,['before-stop','stopped-current-data']);
    assert.equal(await f.record(),'v2');
    const returned=await returnRelease(f.options(f.v2,f.v1,'return'),{control:f.control,preflight:compatible});
    assert.equal(returned.status,'release-selected');assert.equal(await f.record(),'v1');
    assert.equal(await readFile(join(f.dataDir,'records'),'utf8'),'v1\nv2\nv1\n');
    assert.equal(await readFile(join(f.home,'return','data-backup','records'),'utf8'),'v1\nv2\n');
    assert.equal(f.starts,3);assert.equal(f.stops,2);
    await assert.rejects(()=>returnRelease(f.options(f.v2,f.v1,'stale-repeat'),{control:f.control,preflight:compatible}),/FOREIGN_RELEASE/);
    assert.equal(f.starts,3);assert.equal(f.stops,2);
  }finally{await f.close();}
});

test('unknown/incompatible preflight and foreign identity/data refuse before stop',{timeout:10000},async()=>{
  const f=await fixture();try{
    await assert.rejects(()=>returnRelease(f.options(),{control:f.control}),/RELEASE_COMPATIBILITY_UNKNOWN/);
    await assert.rejects(()=>returnRelease(f.options(),{control:f.control,preflight:async()=>false}),/RELEASE_COMPATIBILITY_UNKNOWN/);
    const foreign={...f.control,inspect:async()=>({...await f.control.inspect('fixture.service'),service:'other.service'})};
    await assert.rejects(()=>returnRelease(f.options(),{control:foreign,preflight:compatible}),/FOREIGN_SERVICE/);
    await writeFile(f.config,JSON.stringify({dataDir:join(f.home,'foreign-data')}));
    await assert.rejects(()=>returnRelease(f.options(),{control:f.control,preflight:compatible}),/FOREIGN_DATA/);
    assert.equal(f.stops,0);assert.equal(f.starts,1);
  }finally{await f.close();}
});

test('real operator CLI refuses unknown compatibility before contacting a service manager',{timeout:10000},async()=>{
  const f=await fixture();try{
    const o=f.options(),unit=await readFile(f.unit,'utf8');
    const args=['service',o.service,'data-dir',o.dataDir,'evidence',o.evidence,'expected',o.expected.root,'expected-sha256',o.expected.manifestSha256,'target',o.target.root,'target-sha256',o.target.manifestSha256];
    const flags=args.map((value,index)=>index%2===0?'--'+value:value);
    await assert.rejects(()=>promisify(execFile)(process.execPath,[fileURLToPath(new URL('./return-release.mjs',import.meta.url)),...flags],{timeout:5000}),error=>error.code===2&&error.stderr.includes('RELEASE_COMPATIBILITY_UNKNOWN'));
    assert.equal(await readFile(f.unit,'utf8'),unit);assert.equal(f.starts,1);assert.equal(f.stops,0);
    await assert.rejects(()=>lstat(o.evidence),{code:'ENOENT'});
  }finally{await f.close();}
});

test('stop refusal keeps the previous owner and unit; no second start',{timeout:10000},async()=>{
  const f=await fixture();try{
    const unit=await readFile(f.unit,'utf8'),owner=await f.control.inspect('fixture.service');
    const result=await returnRelease(f.options(),{control:{...f.control,stop:async()=>{}},preflight:compatible});
    assert.equal(result.status,'refused-or-uncertain');assert.equal(result.stage,'stopping');assert.equal(result.published,false);
    assert.match(result.error,/SERVICE_STOP_UNCONFIRMED/);assert.equal((await f.control.inspect('fixture.service')).pid,owner.pid);
    assert.equal(await readFile(f.unit,'utf8'),unit);assert.equal(f.starts,1);
  }finally{await f.close();}
});

test('stopped-current-data incompatibility and a remaining lock refuse publication',{timeout:10000},async()=>{
  for(const fault of ['compatibility','lock']){
    const f=await fixture();try{
      const original=await readFile(f.unit,'utf8');
      const control={...f.control,stop:async()=>{await f.control.stop();if(fault==='lock')await writeFile(join(f.dataDir,'catalog.sqlite.lock'),'stale fixture');}};
      const result=await returnRelease(f.options(),{control,preflight:async value=>fault!=='compatibility'||value.phase==='before-stop'});
      assert.equal(result.published,false);assert.equal(await readFile(f.unit,'utf8'),original);assert.equal(f.starts,1);
      assert.match(result.error,fault==='lock'?/OWNER_LOCK_REMAINS/:/RELEASE_COMPATIBILITY_UNKNOWN/);
    }finally{await f.close();}
  }
});

test('startup failure is bounded and never starts a compensating second owner',{timeout:10000},async()=>{
  const f=await fixture();try{
    const result=await returnRelease(f.options(f.v1,f.crash),{control:f.control,preflight:compatible});
    assert.equal(result.status,'refused-or-uncertain');assert.equal(result.stage,'starting');assert.equal(result.published,true);
    assert.match(result.error,/START_FAILED:23/);assert.equal(f.starts,2);assert.equal((await f.control.inspect('fixture.service')).pid,0);
  }finally{await f.close();}
});

test('operator mutex refuses a concurrent transition without stealing ownership',{timeout:10000},async()=>{
  const f=await fixture();let release;
  const gate=new Promise(resolve=>{release=resolve;});let entered;
  const stopping=new Promise(resolve=>{entered=resolve;});
  try{
    const first=returnRelease(f.options(),{control:{...f.control,stop:async()=>{entered();await gate;await f.control.stop();}},preflight:compatible});
    await stopping;
    await assert.rejects(()=>returnRelease(f.options(f.v1,f.v2,'concurrent'),{control:f.control,preflight:compatible}),{code:'EEXIST'});
    release();assert.equal((await first).status,'release-selected');assert.equal(f.starts,2);assert.equal(f.stops,1);
    await assert.rejects(()=>lstat(f.unit+'.release-return.lock'),{code:'ENOENT'});
  }finally{release();await f.close();}
});
