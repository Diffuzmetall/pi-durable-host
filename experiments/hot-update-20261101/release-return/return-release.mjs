#!/usr/bin/env node
// Narrow existing service operation boundary. Compatibility is a trusted caller's
// read-only prerequisite, NOT inferred from integrity or a successful startup.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, realpath, readFile, readdir, open, rename, unlink, mkdir, copyFile } from 'node:fs/promises';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { validateSealedArtifact } from '../../sdk-host-cutover/native-artifact.mjs';

const execute = promisify(execFile);
const missing = error => { if (error.code !== 'ENOENT') throw error; return undefined; };
const outside = (root, path) => { const name=relative(root,path);return name==='..'||name.startsWith('../')||isAbsolute(name); };

/** Real user-service operations; test callers use an explicit disposable child owner. */
export function systemdControl() {
  const system = async (...args) => (await execute('/usr/bin/systemctl',['--user',...args],{timeout:15000,maxBuffer:16384})).stdout.trim();
  return {
    async inspect(service) {
      const id=await system('show',service,'-p','Id','--value');
      const unit=await system('show',service,'-p','FragmentPath','--value');
      const pid=Number(await system('show',service,'-p','MainPID','--value'));
      const command=pid>1?(await readFile(`/proc/${pid}/cmdline`,'utf8')).split('\0').filter(Boolean):[];
      return {service:id,unit,pid,command};
    },
    stop: service => system('stop',service),
    async start(service) { await system('daemon-reload');await system('start',service); },
  };
}

/** No compatibility callback means refusal before stop. No implicit recovery/DB restore. */
export async function returnRelease(options, {control=systemdControl(), preflight}={}) {
  const {service,dataDir,evidence,expected,target}=options;
  assert.match(service??'',/^[A-Za-z0-9_.@-]+\.service$/,'EXPLICIT_SERVICE_REQUIRED');
  const current=await validateSealedArtifact(expected), next=await validateSealedArtifact(target);
  assert.notEqual(current.root,next.root,'DISTINCT_RELEASES_REQUIRED');
  for(const release of [current,next]) assert.ok(release.files.has('operational-service.mjs'),'SERVICE_ENTRY_MISSING');
  assert.equal(await realpath(dataDir),dataDir,'CANONICAL_DATA_REQUIRED');
  const dataInfo=await lstat(dataDir);
  assert.ok(dataInfo.isDirectory()&&dataInfo.uid===process.getuid()&&!(dataInfo.mode&0o077),'PRIVATE_DATA_REQUIRED');
  assert.ok(outside(current.root,dataDir)&&outside(next.root,dataDir),'RELEASE_DATA_OVERLAP');
  assert.equal(resolve(evidence),evidence,'ABSOLUTE_EVIDENCE_REQUIRED');
  assert.equal(await realpath(dirname(evidence)),dirname(evidence),'CANONICAL_EVIDENCE_PARENT_REQUIRED');
  for(const root of [dataDir,current.root,next.root]) assert.ok(outside(root,evidence)&&outside(evidence,root),'EVIDENCE_OVERLAP');
  assert.equal(await lstat(evidence).catch(missing),undefined,'NEW_EVIDENCE_REQUIRED');
  assert.equal(typeof preflight,'function','RELEASE_COMPATIBILITY_UNKNOWN');
  const original=await control.inspect(service);
  assert.equal(original.service,service,'FOREIGN_SERVICE');
  assert.ok(Number.isSafeInteger(original.pid)&&original.pid>1,'ACTIVE_EXPECTED_OWNER_REQUIRED');
  assert.equal(await realpath(original.unit),original.unit,'CANONICAL_UNIT_REQUIRED');
  const unitInfo=await lstat(original.unit);
  assert.ok(unitInfo.isFile()&&unitInfo.uid===process.getuid()&&!(unitInfo.mode&0o022),'OPERATOR_UNIT_REQUIRED');
  const unit=await readFile(original.unit,'utf8');
  const commandLines=unit.split('\n').filter(line=>line.startsWith('ExecStart='));
  assert.equal(commandLines.length,1,'ONE_EXECSTART_REQUIRED');
  const command=commandLines[0].slice('ExecStart='.length).split(' ');
  assert.equal(command.length,3,'EXACT_UNQUOTED_SERVICE_COMMAND_REQUIRED');
  assert.equal(command[0],process.execPath,'EXACT_NODE_REQUIRED');
  assert.equal(command[1],join(current.root,'operational-service.mjs'),'FOREIGN_RELEASE');
  assert.deepEqual(original.command,command,'FOREIGN_PROCESS_OWNER');
  const configInfo=await lstat(command[2]);
  assert.equal(await realpath(command[2]),command[2],'CANONICAL_CONFIG_REQUIRED');
  assert.ok(configInfo.isFile()&&configInfo.uid===process.getuid()&&!(configInfo.mode&0o077),'PRIVATE_CONFIG_REQUIRED');
  const configBytes=await readFile(command[2]);
  assert.equal(JSON.parse(configBytes).dataDir,dataDir,'FOREIGN_DATA');
  const inputs={service,dataDir,expected,target};
  assert.equal(await preflight({...inputs,phase:'before-stop'}),true,'RELEASE_COMPATIBILITY_UNKNOWN');

  // Serialize this operator's service transition. Never steal a stale lock by age.
  const lock=original.unit+'.release-return.lock';
  const lockHandle=await open(lock,'wx',0o600);
  let stage='locked', published=false, evidenceCreated=false, result;
  const note=async(name,value)=>{
    const handle=await open(join(evidence,name),'wx',0o600);
    try{await handle.writeFile(typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');await handle.sync();}finally{await handle.close();}
  };
  async function confirmStopped() {
    const state=await control.inspect(service);
    assert.equal(state.service,service,'FOREIGN_SERVICE');
    assert.equal(state.pid,0,'SERVICE_STOP_UNCONFIRMED');
    let alive=true;
    try{process.kill(original.pid,0);}catch(error){if(error.code==='ESRCH')alive=false;else throw error;}
    assert.equal(alive,false,'PREVIOUS_OWNER_STILL_ALIVE');
    const paths=[join(dataDir,'catalog.sqlite.lock')];
    for(const entry of await readdir(join(dataDir,'sessions'),{withFileTypes:true}))
      if(entry.isDirectory())paths.push(join(dataDir,'sessions',entry.name,'agent.sqlite.lock'));
    for(const path of paths)assert.equal(await lstat(path).catch(missing),undefined,'OWNER_LOCK_REMAINS');
  }
  try {
    assert.deepEqual(await control.inspect(service),original,'SERVICE_CHANGED_DURING_PREFLIGHT');
    assert.equal(await readFile(original.unit,'utf8'),unit,'UNIT_CHANGED_DURING_PREFLIGHT');
    assert.ok((await readFile(command[2])).equals(configBytes),'CONFIG_CHANGED_DURING_PREFLIGHT');
    await mkdir(evidence,{mode:0o700});evidenceCreated=true;
    await note('service.preimage',unit);
    await note('intent.json',{...inputs,pid:original.pid,compatibility:'trusted callable; not manifest inference'});
    stage='stopping';await control.stop(service);
    await confirmStopped();stage='stopped';
    // Snapshot only after confirmed shutdown; never restore it over newer records.
    const copyDirectory=join(evidence,'data-backup');
    const pending=[[dataDir,copyDirectory]];
    while(pending.length){
      const [from,to]=pending.pop();await mkdir(to,{mode:0o700});
      for(const entry of await readdir(from,{withFileTypes:true})){
        const source=join(from,entry.name),destination=join(to,entry.name),info=await lstat(source);
        assert.ok(!info.isSymbolicLink()&&(info.isFile()||info.isDirectory()),'BACKUP_LINK_OR_SPECIAL_FILE');
        if(info.isDirectory())pending.push([source,destination]);else await copyFile(source,destination,1);
      }
    }
    await confirmStopped();
    assert.equal(await preflight({...inputs,phase:'stopped-current-data',copyDirectory}),true,'RELEASE_COMPATIBILITY_UNKNOWN');
    assert.equal(await readFile(original.unit,'utf8'),unit,'UNIT_CHANGED_WHILE_STOPPED');
    assert.ok((await readFile(command[2])).equals(configBytes),'CONFIG_CHANGED_WHILE_STOPPED');
    const replacement=unit.replace(commandLines[0],`ExecStart=${command[0]} ${join(next.root,'operational-service.mjs')} ${command[2]}`);
    const temporary=join(dirname(original.unit),`.release-return-${randomUUID()}`);
    const handle=await open(temporary,'wx',unitInfo.mode&0o777);
    try{await handle.writeFile(replacement);await handle.sync();await handle.close();await rename(temporary,original.unit);}
    finally{await handle.close().catch(()=>{});await unlink(temporary).catch(missing);}
    published=true;stage='starting';await control.start(service);
    const started=await control.inspect(service);
    assert.equal(started.service,service,'FOREIGN_SERVICE');
    assert.equal(started.unit,original.unit,'UNIT_CHANGED_ON_START');
    assert.ok(started.pid>1&&started.pid!==original.pid,'NEW_OWNER_REQUIRED');
    assert.deepEqual(started.command,[command[0],join(next.root,'operational-service.mjs'),command[2]],'UNEXPECTED_STARTED_OWNER');
    result={status:'release-selected',stage:'started',service,dataDir,previousPid:original.pid,pid:started.pid,root:next.root,published};
  }catch(error){
    // No blind second start or compensating DB restore after an uncertain operation.
    result={status:'refused-or-uncertain',stage,published,service,dataDir,error:error.message};
  }finally{
    await lockHandle.close();
    try{await unlink(lock);}catch(error){result={...result,status:'refused-or-uncertain',cleanupError:error.code};}
  }
  if(evidenceCreated)await note('result.json',result);
  return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2), options={};
  try{
    const allowed=new Set(['service','data-dir','evidence','expected','expected-sha256','target','target-sha256']);
    for(let i=0;i<args.length;i+=2){const key=args[i].replace(/^--/,'');assert.ok(args[i].startsWith('--')&&allowed.has(key)&&args[i+1]&&!Object.hasOwn(options,key),'EXPLICIT_ARGUMENTS_REQUIRED');options[key]=args[i+1];}
    // Until the exact previous-release pure target is supplied, this operator CLI
    // is intentionally denial-only. No injected/synthetic compatibility in CLI.
    const result=await returnRelease({service:options.service,dataDir:options['data-dir'],evidence:options.evidence,
      expected:{root:options.expected,manifestSha256:options['expected-sha256']},target:{root:options.target,manifestSha256:options['target-sha256']}});
    console.log(JSON.stringify(result));if(result.status!=='release-selected')process.exitCode=2;
  }catch(error){console.error(JSON.stringify({status:'refused',error:error.message}));process.exitCode=2;}
}
