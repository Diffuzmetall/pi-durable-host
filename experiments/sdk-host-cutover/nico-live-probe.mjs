#!/usr/bin/env node
// One bounded read-only MCP probe while the owned Host is stopped. No Store, SQLite or model dispatch.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
const [release, beforePath, output] = process.argv.slice(2);
if (!output) throw Error('Usage: nico-live-probe.mjs RELEASE PRIVATE_BEFORE PRIVATE_OUTPUT');
assert.equal(execFileSync('systemctl',['--user','show','pi-durable-host.service','-p','MainPID','--value'],{encoding:'utf8'}).trim(),'0');
const config = JSON.parse(readFileSync(join(homedir(),'.config/pi-durable-host/host.json'),'utf8'));
assert(!existsSync(join(config.dataDir,'catalog.sqlite.lock')));
const before = JSON.parse(readFileSync(beforePath,'utf8'));
const { connectSessionMcp } = await import(pathToFileURL(join(release,'host-bindings-v16/session-mcp.mjs')));
const { AuthStorage } = await import(pathToFileURL(join(release,'host-bindings-v16/compiled/bindings.mjs')));
const { createNativeModels } = await import(pathToFileURL(join(release,'node_modules/dpi-backend/dist/dpi-backend/src/native-profile/profile.js')));
const agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(),'.pi/agent');
const models = await createNativeModels({ credentials: AuthStorage.create(join(agentDir,'auth.json')) });
const results = [];
for (const session of before.sessions) {
  const directory = join(config.dataDir,'sessions',session.id);
  assert(!existsSync(join(directory,'agent.sqlite.lock')));
  const mcp = await connectSessionMcp({ sessionId:session.id,cwd:session.cwd,directory,shellEnv:{} },{
    agentDir,projectTrusted:config.trustedWorkspaces.includes(session.cwd),authorize:()=>{},
    providerToken:async provider=>(await models.models.getAuth(provider))?.auth?.apiKey,
  });
  try {
    const status = mcp.status();
    const tools = mcp.sources.flatMap(source=>source.allowedTools.map(name=>`mcp__${source.server}__${name}`.replace(/[^A-Za-z0-9_]/g,'_')));
    const previous = session.agents.flatMap(agent=>agent.tools).filter(name=>name.startsWith('mcp__'));
    const missing = [...new Set(previous.filter(name=>!tools.includes(name)))];
    if (missing.length) {
      writeFileSync(`${output}.failed`, JSON.stringify({ sessionId: session.id, status, missing },null,2)+'\n', {flag:'wx',mode:0o600});
      throw Error('MCP_TOOL_PARITY_FAILED — see private diagnostics');
    }
    const reads = [];
    if (!results.length) {
      for (const [server,name] of [['mcp-agent-mail','health_check'],['context-mode','ctx_stats']]) {
        const source = mcp.sources.find(item=>item.server===server);
        assert(source?.allowedTools.includes(name), `Read-only probe unavailable: ${server}/${name}`);
        const result = await source.client.callTool(name,{});
        assert(!result.isError, `Read-only probe failed: ${server}/${name}`);
        reads.push({server,tool:name,passed:true});
      }
    }
    results.push({sessionId:session.id,status,tools:tools.length,missing,reads});
  } finally { await mcp.close(); }
}
writeFileSync(output,JSON.stringify({passed:true,checkedAt:new Date().toISOString(),results,modelCalls:0,openedSqlite:false},null,2)+'\n', {flag:'wx',mode:0o600,flush:true});
console.log(JSON.stringify({passed:true,sessions:results.length,status:results[0].status.servers.map(({server,state,error})=>({server,state,error})),readOnlyCalls:results.flatMap(r=>r.reads),modelCalls:0}));
