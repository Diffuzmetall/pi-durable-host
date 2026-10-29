import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BACKGROUND_CONTEXT as ctx } from '@earendil-works/chord/context';
import { fauxProvider, fauxAssistantMessage, fauxText, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { Store } from '../../src/store.js';
import { createHttpServer } from '../../src/http-server.js';
import { GrantPolicy, type GrantSpec } from '../../src/grants.js';
import { createNativeProfile, type NativeComposition } from '../../src/native-profile/profile.js';
import { SupervisorDoc } from '../../src/native-profile/subagents/supervisor.js';
import type { RuntimeProfileContext } from '../../src/runtime-profile.js';
import { tempStore, faux, until } from '../helpers.js';

function childReceipt(value: unknown) {
  assert(value && typeof value === 'object' && 'conversationId' in value && typeof value.conversationId === 'number' &&
    'executionId' in value && typeof value.executionId === 'string' && 'requestId' in value && typeof value.requestId === 'string');
  return { conversationId: value.conversationId, executionId: value.executionId, requestId: value.requestId };
}

/** Actual contact_supervisor/SQLite/native-profile HTTP fixture; no fabricated attention document. */
export async function nativeAttentionFixture() {
  const temporary = await tempStore();
  const agentDir = join(temporary.root, 'agent');
  const skillPath = join(agentDir, 'skills', 'terminal-fixture', 'SKILL.md');
  await mkdir(join(agentDir, 'skills', 'terminal-fixture'), { recursive: true });
  await writeFile(skillPath, '---\nname: terminal-fixture\ndescription: Remote fixture skill\n---\nORIGINAL_REMOTE_SKILL_BODY\n');
  const owner: GrantSpec = { id: 'attention-owner', token: 'local-terminal-attention-only', actor: 'operator', source: 'terminal', authority: 'human', permissions: ['read', 'write', 'control', 'filesystem', 'human-accept'], binding: {} };
  const guard = join(temporary.root, 'recording-dcg');
  await writeFile(guard, `#!${process.execPath}\nlet input='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>input+=s);process.stdin.on('end',()=>process.stdout.write(JSON.stringify({schema_version:1,robot_mode:true,dcg_version:'0.15.3',command:input.slice(0,-2),decision:'allow',mode:null,reason:'isolated fixture command only'})));\n`, { mode: 0o700, flag: 'wx' });
  const noFs: GrantSpec = { ...owner, id: 'attention-no-fs', token: 'local-terminal-no-fs', actor: 'no-fs', permissions: ['read', 'write'] };
  const policy = new GrantPolicy([owner, noFs]);
  const handle = policy.authenticate(owner.token);
  const compositions = new Map<string, NativeComposition>();
  const factory = createNativeProfile({
    policy, owner: handle,
    skills: () => ({ projectRoot: temporary.work, homeDir: temporary.root, agentDir, projectTrusted: true }),
    dcg: { binaryPath: guard, timeoutMs: 1000, envSource: () => ({}) },
    connectMcp: async () => ({ sources: [], close: async () => {} }),
  });
  const profile = Object.assign(async (context: RuntimeProfileContext) => {
    const composition = await factory(context);
    compositions.set(context.sessionId, composition);
    return composition;
  }, { id: factory.id, capabilities: factory.capabilities });
  const scripted = fauxProvider({ provider: 'faux', models: [{ id: 'echo', contextWindow: 128000, maxTokens: 8192 }], tokensPerSecond: 100000 });
  let questionCalls = 0, modelCalls = 0;
  scripted.setResponses(Array.from({ length: 256 }, () => context => {
    modelCalls++;
    const user = context.messages.findLast(message => message.role === 'user');
    const toolProbe = user?.role === 'user' && typeof user.content === 'string' ? /^native-terminal-tool:([a-f0-9]{32})$/.exec(user.content) : null;
    if (toolProbe && user) {
      const results = context.messages.slice(context.messages.lastIndexOf(user) + 1).filter(message => message.role === 'toolResult');
      if (results.length) return fauxAssistantMessage(fauxText('Native guarded tool completed.'));
      const encoded = (text: string) => [...text].map(char => '\\' + char.charCodeAt(0).toString(8).padStart(3, '0')).join('');
      const command = `printf '${encoded(`NATIVE_TOOL_PARTIAL_${toolProbe[1]}`)}'; sleep 1; printf '${encoded(`NATIVE_TOOL_FINAL_${toolProbe[1]}`)}'`;
      return fauxAssistantMessage(fauxToolCall('bash', { command }), { stopReason: 'toolUse' });
    }
    if (user?.role === 'user' && user.content === 'job:terminal-attention') {
      const results = context.messages.slice(context.messages.lastIndexOf(user) + 1).filter(message => message.role === 'toolResult');
      if (!results.length) {
        questionCalls++;
        return fauxAssistantMessage(fauxToolCall('contact_supervisor', { reason: 'interview_request', message: 'NATIVE_ATTENTION_COLOR_SENTINEL', interview: { questions: [{ id: 'color', question: 'Color?', options: ['red', 'blue'] }] } }), { stopReason: 'toolUse' });
      }
      return fauxAssistantMessage(fauxText(JSON.stringify({ status: 'done', summary: 'explicit reply received', changes: [], verify: [], outputs: [], needs: [] })));
    }
    return fauxAssistantMessage(fauxText('Parent observed the question; no answer was supplied.'));
  }));
  let store = await Store.open({ ...temporary.options, profile });
  store.models.setProvider(scripted.provider);
  const session = await store.create({ name: 'native-attention', cwd: temporary.work, model: faux });
  const initial = compositions.get(session.id); assert.ok(initial);
  const { c: root } = await store.resolveAgent(session.id, 'main');
  const goal = await initial.native.goals.create(root.id, { objective: 'NATIVE_GOAL_VIEW_SENTINEL', criteria: [{ id: 'human', text: 'Human acceptance remains pending', human: true }], skills: [], permissions: { scope: ['Disposable fixture only'] }, limits: { maxCalls: 1 } }, ctx);
  let server = createHttpServer(store, policy);
  let base = '';
  const listen = async () => {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); assert.ok(address && typeof address === 'object');
    base = `http://127.0.0.1:${address.port}`;
  };
  const stopHttp = async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); };
  const requests = async () => {
    const { h, c } = await store.resolveAgent(session.id, 'main');
    return Object.values((await h.snapshot(SupervisorDoc, c.id, ctx))?.requests ?? {});
  };
  const control = async () => {
    const { c } = await store.resolveAgent(session.id, 'main');
    const composition = compositions.get(session.id); assert.ok(composition);
    const api = composition.native.parentControl(async (_tx, parent) => {
      policy.assert(handle, 'control', { sessionId: session.id, conversationId: parent });
      return { binding: session.id, policyReference: policy.reference(handle), tools: [] };
    }, ctx);
    return { api, parent: c.id };
  };
  await listen();
  return {
    root: temporary.root, sessionId: session.id, token: owner.token, noFsToken: noFs.token, goalId: goal.id,
    async setSkill(body: string) { await writeFile(skillPath, `---\nname: terminal-fixture\ndescription: Remote fixture skill\n---\n${body}\n`); },
    get base() { return base; }, get questionCalls() { return questionCalls; }, get modelCalls() { return modelCalls; },
    requests,
    async goal() {
      const composition = compositions.get(session.id); assert.ok(composition);
      const { c } = await store.resolveAgent(session.id, 'main');
      return (await composition.native.goals.list(c.id, true, ctx)).find(value => value.id === goal.id);
    },
    async startSessionGoal() {
      const slow = fauxProvider({ provider: 'faux', models: [{ id: 'echo', contextWindow: 128000, maxTokens: 8192 }], tokensPerSecond: 5 });
      slow.setResponses([() => { modelCalls++; return fauxAssistantMessage(fauxText('Disposable native Goal work. '.repeat(1000))); }]);
      store.models.setProvider(slow.provider);
      const composition = compositions.get(session.id); assert.ok(composition);
      const { c } = await store.resolveAgent(session.id, 'main');
      await composition.native.goals.resume(c.id, goal.id, ctx);
      await until(async () => slow.state.callCount > 0, 10000, 'Actual session Goal foreground model execution');
      return c.id;
    },
    async protected(id: number) {
      const composition = compositions.get(session.id); assert.ok(composition);
      const { c } = await store.resolveAgent(session.id, String(id));
      return composition.native.goals.protectsExecution(c.id, ctx);
    },
    async ask() {
      const { api, parent } = await control();
      const child = childReceipt(await api.execute(parent, { action: 'spawn', controlId: 'terminal-question', name: 'terminal-question', task: 'job:terminal-attention', tools: [], expectedRevision: (await api.inspect(parent)).revision }));
      await until(async () => (await requests()).some(request => request.child === child.conversationId), 10000, 'Actual native contact_supervisor pending request');
      return child;
    },
    async reopen() {
      await stopHttp(); await store.close();
      store = await Store.open({ ...temporary.options, profile });
      store.models.setProvider(scripted.provider);
      server = createHttpServer(store, policy); await listen();
    },
    async answer() {
      const { api, parent } = await control();
      const child = childReceipt(await api.get(parent, 'terminal-question'));
      const request = (await requests()).find(request => request.state === 'pending'); assert.ok(request);
      return api.execute(parent, { action: 'reply', controlId: 'terminal-explicit-answer', expectedRevision: (await api.inspect(parent)).revision,
        target: { key: child.executionId, conversationId: child.conversationId, executionId: child.executionId, requestId: child.requestId }, replyTo: request.id, message: '{"color":"blue"}' });
    },
    async close() { await stopHttp(); await store.close(); await temporary.cleanup(); },
  };
}
