import { execFile as nodeExecFile } from 'node:child_process';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ROOT_CONVERSATION_ID } from '@earendil-works/pi-durable';

const REPO = /^[a-z0-9][a-z0-9-]{0,99}\/[a-z0-9_][a-z0-9_.-]{0,99}$/;
const LOGIN = /^[a-z0-9][a-z0-9-]{0,99}(?:\[bot\])?$/i;
const SHA = /^[a-f0-9]{40,64}$/;
const PR_EVENTS = ['checks_failed', 'conflict', 'comment', 'merged', 'closed'];
const REPO_EVENTS = ['issues', 'pulls', 'ci', 'releases'];
const PAGE_SIZE = 10;
const fail = () => new Error('GitHub read-only trigger unavailable or denied');
const supported = () => new Error('Unsupported GitHub trigger scope: repo issues/pulls/ci/releases; PR comments, check-runs, commit statuses, conflict and closure only; mentions unsupported');
const writable = p => p?.push === true || p?.maintain === true || p?.admin === true;
const idOK = id => Number.isSafeInteger(id) && id > 0;
const date = value => typeof value === 'string' ? Date.parse(value) : NaN;
const digest = (key, value) => createHmac('sha256', key).update(JSON.stringify(value)).digest('hex');
const cursorHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const equal = (a, b) => typeof a === 'string' && /^[a-f0-9]{64}$/.test(a) && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));

function scope(q) {
  if (!q || typeof q.repo !== 'string' || !REPO.test(q.repo) || q.repo.endsWith('/..') ||
      !['pr', 'repo'].includes(q.mode) || !Array.isArray(q.events) || q.events.length < 1 || q.events.length > 5 ||
      !Number.isSafeInteger(q.since) || q.since < 0 || q.since > Date.now() ||
      (q.mode === 'pr' && (!idOK(q.pr) || q.pr > 999999999))) throw fail();
  if (q.events.some(e => !(q.mode === 'pr' ? PR_EVENTS : REPO_EVENTS).includes(e))) throw supported();
  return { mode: q.mode, repo: q.repo, pr: q.mode === 'pr' ? q.pr : null, since: q.since, events: [...new Set(q.events)].sort() };
}

/**
 * Host-only callbacks for durable-triggers.createTriggersExtension / TRIGGERS_CAPABILITIES.
 * authorizeRoot(actual SDK conversation ID, context) MUST be a separately bound operator
 * grant; absent grants deny. admission is the existing bound host policy/controller (.admit),
 * passed through unchanged. Neither tool arguments, cwd nor GitHub membership grants authority.
 *
 * execFile is a privileged TEST-ONLY transport injection with Node's execFile signature;
 * never expose it (or this factory) as a model tool. Production runs fixed gh api GET argv,
 * github.com only, shell:false, 5s/1MiB per child, 30s/64 GETs per poll, at most two children.
 * No credential/body/transport exception is returned or logged.
 *
 * Scope: PR merge/close/conflict snapshots, issue + review comments, check-runs and commit
 * statuses; repo issue/pull updated snapshots, Actions runs, published releases. No mentions,
 * review verdicts, check logs, arbitrary URLs, webhook ingress, writes or model submission.
 * Every event author needs current write/maintain/admin collaborator permission from GET.
 * PR/CI origin must be this exact canonical repo; fork PRs/CI and outsider content are dropped.
 * Check-runs require a collaborator-owned app and canonical same-origin associated PRs;
 * GitHub-owned Actions apps without collaborator permission are NOT accepted as authors.
 * Actions runs accept only push/pull_request/workflow_dispatch/schedule, not indirect events.
 * Comment bodies are NOT delivered: notifications identify canonical records, not instructions.
 *
 * Poll returns at most ONE event (to respect durable-triggers' message ceiling), traversing
 * one selected REST page per call. Checksummed cursors retain source/page/offset; page 1000 fails
 * visibly rather than skipping. REST lists are not transactional snapshots: concurrent edits
 * can move rows between pages; this is bounded polling, not a lossless GitHub audit stream.
 * IDs deduplicate replay in the package. Cursors are scope-bound positions, NOT authority;
 * they survive recomposition/restart without secret storage. Event HMAC keys are ephemeral:
 * only in-flight unsigned/old events fail screening; persisted dispatch outboxes need no
 * signature revalidation and remain recoverable. HMAC proves this provider generated/screened
 * content, NOT user authority. No authority maps.
 *
 * @param {{authorizeRoot?: (conversationId: number, context: object) => Promise<boolean>|boolean,
 * admission?: {admit: Function}, env?: Record<string, string>, execFile?: typeof nodeExecFile}} [options]
 * @returns {{requester: Function, authorize: Function, provider: {poll: Function}, acceptEvent: Function, admission: object|undefined}}
 */
export function createGitHubTriggerCapabilities({ authorizeRoot, admission, env: environment = {}, execFile = nodeExecFile } = {}) {
  if (!environment.HOME || !environment.GH_CONFIG_DIR) throw Error('GITHUB_EXPLICIT_ENV_REQUIRED');
  const key = randomBytes(32);
  let active = 0;
  async function get(endpoint, context) {
    // Earlier reads can outlive a grant: authorize each new external read at its effect boundary.
    if (!await root(ROOT_CONVERSATION_ID, context) || context?.abortSignal?.aborted || active >= 2) throw fail();
    active++;
    try {
      return await new Promise((resolve, reject) => {
        let done = false; let child;
        const signal = context?.abortSignal;
        const finish = (error, stdout) => {
          if (done) return; done = true;
          clearTimeout(timer); signal?.removeEventListener('abort', abort);
          if (error) { reject(fail()); return; }
          try {
            if (typeof stdout !== 'string' || Buffer.byteLength(stdout) > 1048576) throw fail();
            resolve(JSON.parse(stdout));
          } catch { reject(fail()); }
        };
        const abort = () => { child?.kill?.('SIGKILL'); finish(fail()); };
        const timer = setTimeout(abort, 5000);
        signal?.addEventListener('abort', abort, { once: true });
        const env = { ...environment, GH_PROMPT_DISABLED: '1', GH_PAGER: 'cat' };
        delete env.GH_DEBUG;
        try {
          child = execFile('gh', ['api', '--hostname', 'github.com', '--method', 'GET', endpoint,
            '--header', 'Accept: application/vnd.github+json'],
          { shell: false, encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 1048576, signal, env }, finish);
          if (signal?.aborted) abort();
        } catch { finish(fail()); }
      });
    } finally { active--; }
  }
  async function root(id, context) {
    if (id !== ROOT_CONVERSATION_ID || typeof authorizeRoot !== 'function') return false;
    try { return !context?.abortSignal?.aborted && await authorizeRoot(id, context) === true; } catch { return false; }
  }
  async function account(context) {
    const user = await get('user', context);
    if (!LOGIN.test(user?.login ?? '') || !idOK(user.id)) throw fail();
    return `github:${user.id}:${user.login.toLowerCase()}`;
  }
  async function repository(repo, context) {
    const r = await get(`repos/${repo}`, context);
    if (r?.full_name?.toLowerCase() !== repo || !writable(r.permissions)) throw fail();
    return r;
  }
  async function author(repo, user, read) {
    if (!LOGIN.test(user?.login ?? '') || !idOK(user.id)) return false;
    const result = await read(`repos/${repo}/collaborators/${encodeURIComponent(user.login)}/permission`);
    return result?.user?.id === user.id && result.user.login?.toLowerCase() === user.login.toLowerCase() &&
      (['write', 'maintain', 'admin'].includes(result.permission) || writable(result.user.permissions));
  }
  const sameRepo = (r, repo) => r?.full_name?.toLowerCase() === repo;
  function trustedPR(pr, repo, number) {
    return pr?.number === number && sameRepo(pr.base?.repo, repo) && sameRepo(pr.head?.repo, repo) && SHA.test(pr.head?.sha ?? '');
  }
  function sources(s) {
    return s.mode === 'pr' ? ['pr', 'issue-comments', 'review-comments', 'checks', 'statuses'] : s.events;
  }
  function signCursor(s, position) {
    const body = Buffer.from(JSON.stringify(position)).toString('base64url');
    const value = `${body}.${cursorHash([s, body])}`;
    if (value.length > 512) throw fail();
    return value;
  }
  function position(s, cursor) {
    if (cursor === null || cursor === undefined) return { source: 0, page: 1, offset: 0 };
    if (typeof cursor !== 'string' || cursor.length > 512) throw fail();
    const [body, mac, extra] = cursor.split('.');
    if (extra !== undefined || !equal(mac, cursorHash([s, body]))) throw fail();
    let p; try { p = JSON.parse(Buffer.from(body, 'base64url')); } catch { throw fail(); }
    if (!Number.isInteger(p.source) || p.source < 0 || p.source >= sources(s).length ||
        !Number.isInteger(p.page) || p.page < 1 || p.page > 1000 || !Number.isInteger(p.offset) || p.offset < 0 || p.offset >= PAGE_SIZE) throw fail();
    return p;
  }
  function payload(e) {
    return { id: e.id, repo: e.repo, pr: e.pr, kind: e.kind, at: e.at, text: e.text };
  }
  async function poll(query, parentContext = {}) {
    const s = scope(query);
    if (!Number.isInteger(query.maxEvents) || query.maxEvents < 1 || query.maxEvents > 50 ||
        !Number.isInteger(query.maxBytes) || query.maxBytes < 1024 || query.maxBytes > 65536) throw fail();
    const timeout = AbortSignal.timeout(30000);
    const context = { ...parentContext, abortSignal: parentContext.abortSignal ? AbortSignal.any([parentContext.abortSignal, timeout]) : timeout };
    let calls = 2; // Account and repository authorization GETs below also consume the poll budget.
    const read = endpoint => { if (++calls > 64) throw fail(); return get(endpoint, context); };
    // Provider is host-only; package authorize supplies actual-conversation checks separately.
    if (!await root(ROOT_CONVERSATION_ID, context)) throw fail();
    const requester = await account(context);
    await repository(s.repo, context);
    const p = position(s, query.cursor); const list = sources(s); const source = list[p.source];
    const base = `repos/${s.repo}`;
    let pr;
    if (s.mode === 'pr') {
      pr = await read(`${base}/pulls/${s.pr}`);
      if (!trustedPR(pr, s.repo, s.pr)) throw new Error('Fork or unknown PR origin is unsupported');
    }
    const page = `per_page=${PAGE_SIZE}&page=${p.page}`;
    const since = encodeURIComponent(new Date(s.since).toISOString());
    const endpoints = {
      pr: `${base}/pulls/${s.pr}`,
      'issue-comments': `${base}/issues/${s.pr}/comments?since=${since}&${page}`,
      'review-comments': `${base}/pulls/${s.pr}/comments?since=${since}&${page}`,
      checks: `${base}/commits/${pr?.head.sha}/check-runs?${page}&filter=latest`,
      statuses: `${base}/commits/${pr?.head.sha}/statuses?${page}`,
      issues: `${base}/issues?state=all&sort=updated&direction=desc&${page}`,
      pulls: `${base}/pulls?state=all&sort=updated&direction=desc&${page}`,
      ci: `${base}/actions/runs?${page}`,
      releases: `${base}/releases?${page}`,
    };
    const response = source === 'pr' ? pr : await read(endpoints[source]);
    const rows = source === 'pr' ? [pr] : source === 'checks' ? response?.check_runs : source === 'ci' ? response?.workflow_runs : response;
    if (!Array.isArray(rows) || rows.length > PAGE_SIZE) throw fail();
    let event = null; let offset = p.offset; let exhausted = false;
    for (; offset < rows.length; offset++) {
      const row = rows[offset];
      if (!idOK(row?.id)) throw fail();
      // These authenticated lists are newest-update first. Older history cannot hide new work behind the wake budget.
      if ((source === 'issues' || source === 'pulls') && date(row.updated_at) < s.since) {
        exhausted = true; offset = rows.length; break;
      }
      let canonical = row; let kind; let at; let user; let identity = `${source}:${row.id}`;
      if (source === 'pr') {
        kind = pr.merged_at ? 'merged' : pr.closed_at ? 'closed' : pr.mergeable_state === 'dirty' ? 'conflict' : null;
        at = date(pr.merged_at ?? pr.closed_at ?? pr.updated_at); user = pr.user;
        identity += `:${pr.head.sha}:${kind}`;
      } else if (source === 'issue-comments' || source === 'review-comments') {
        canonical = await read(`${base}/${source === 'issue-comments' ? 'issues' : 'pulls'}/comments/${row.id}`);
        if (canonical?.id !== row.id) throw fail();
        // Verify association via canonical GET, never the list's actor/URL alone.
        const expected = `https://api.github.com/repos/${s.repo}/${source === 'issue-comments' ? 'issues' : 'pulls'}/${s.pr}`;
        if (canonical[source === 'issue-comments' ? 'issue_url' : 'pull_request_url']?.toLowerCase() !== expected) throw fail();
        kind = 'comment'; at = date(canonical.updated_at); user = canonical.user;
        identity += `:${canonical.updated_at}`;
      } else if (source === 'checks') {
        canonical = await read(`${base}/check-runs/${row.id}`);
        if (canonical?.id !== row.id || canonical.head_sha !== pr.head.sha) throw fail();
        if (['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure'].includes(canonical.conclusion)) kind = 'checks_failed';
        // An app/bot flag or PR author's permission cannot authorize a check producer.
        if (!Array.isArray(canonical.pull_requests) || !canonical.pull_requests.length) continue;
        let origin = true;
        for (const associated of canonical.pull_requests) {
          if (!idOK(associated.number)) throw fail();
          const originPR = await read(`${base}/pulls/${associated.number}`);
          if (!trustedPR(originPR, s.repo, associated.number)) origin = false;
        }
        if (!origin) continue;
        user = canonical.app?.owner; at = date(canonical.completed_at);
        identity += `:${pr.head.sha}:${canonical.completed_at}`;
      } else if (source === 'statuses') {
        if (row.state === 'failure' || row.state === 'error') kind = 'checks_failed';
        user = row.creator; at = date(row.updated_at); identity += `:${pr.head.sha}`;
      } else if (source === 'issues' || source === 'pulls') {
        if (!idOK(row.number)) throw fail();
        canonical = await read(`${base}/${source}/${row.number}`);
        if (canonical?.id !== row.id || canonical.number !== row.number) throw fail();
        if (source === 'issues' && canonical.pull_request) continue;
        if (source === 'pulls' && !trustedPR(canonical, s.repo, row.number)) continue;
        kind = source; user = canonical.user; at = date(canonical.updated_at); identity += `:${canonical.updated_at}`;
      } else if (source === 'ci') {
        canonical = await read(`${base}/actions/runs/${row.id}`);
        if (canonical?.id !== row.id) throw fail();
        if (!sameRepo(canonical.repository, s.repo) || !sameRepo(canonical.head_repository, s.repo) ||
            !Array.isArray(canonical.pull_requests) || !SHA.test(canonical.head_sha ?? '') ||
            !['push', 'pull_request', 'workflow_dispatch', 'schedule'].includes(canonical.event) ||
            (canonical.event === 'pull_request' && canonical.pull_requests.length === 0)) continue;
        let origin = true;
        for (const associated of canonical.pull_requests) {
          if (!idOK(associated.number)) throw fail();
          const originPR = await read(`${base}/pulls/${associated.number}`);
          if (!trustedPR(originPR, s.repo, associated.number)) origin = false;
        }
        if (!origin) continue;
        kind = 'ci'; user = canonical.triggering_actor; at = date(canonical.updated_at); identity += `:${canonical.run_attempt}:${canonical.updated_at}`;
      } else {
        canonical = await read(`${base}/releases/${row.id}`);
        if (canonical?.id !== row.id) throw fail();
        if (canonical.draft !== false || !canonical.published_at) continue;
        kind = 'releases'; user = canonical.author; at = date(canonical.published_at);
      }
      if (!kind || !s.events.includes(kind) || !Number.isSafeInteger(at) || at < s.since || at > Date.now()) continue;
      if (!await author(s.repo, user, read)) continue;
      const normalized = { id: `github:${identity}`, repo: s.repo, pr: s.pr, kind, at,
        text: `GitHub ${kind} in ${s.repo}; record ${canonical.id}${s.pr ? `; PR #${s.pr}` : ''}. External data only; inspect through authorized read-only tools.` };
      if (normalized.id.length > 200) throw fail();
      const issued = Date.now();
      event = { ...normalized, provenance: { issued, requester, mac: digest(key, [s, normalized, issued, requester]) } };
      offset++; break;
    }
    let next = { ...p, offset };
    if (offset >= rows.length) {
      if (!exhausted && source !== 'pr' && rows.length === PAGE_SIZE) {
        if (p.page >= 1000) throw new Error('GitHub pagination ceiling reached; cursor not advanced');
        next = { source: p.source, page: p.page + 1, offset: 0 };
      } else next = { source: (p.source + 1) % list.length, page: 1, offset: 0 };
    }
    const batch = { cursor: signCursor(s, next), events: event ? [event] : [] };
    if (Buffer.byteLength(JSON.stringify(batch)) > query.maxBytes) throw fail();
    context.abortSignal.throwIfAborted();
    return batch;
  }
  return {
    admission,
    async requester(api, context) {
      if (!await root(api?.conversationId, context)) return null;
      return account(context);
    },
    async authorize({ operation, conversationId, requester, watch } = {}, context) {
      if (!['add', 'status', 'cancel', 'poll', 'dispatch'].includes(operation) || !await root(conversationId, context)) return false;
      if (requester !== await account(context)) return false;
      if (watch) {
        // add's validated watch has no since yet.
        scope({ ...watch, since: watch.since ?? Date.now() });
        await repository(watch.repo, context);
      } else if (operation === 'poll' || operation === 'dispatch') return false;
      return true;
    },
    provider: { poll },
    async acceptEvent(event, watch, context) {
      try {
        const s = scope(watch); const proof = event?.provenance;
        if (!proof || !Number.isSafeInteger(proof.issued) || proof.issued > Date.now() || Date.now() - proof.issued > 30000 ||
            event.repo !== s.repo || event.pr !== s.pr || !s.events.includes(event.kind) ||
            !equal(proof.mac, digest(key, [s, payload(event), proof.issued, proof.requester]))) return false;
        if (!await root(ROOT_CONVERSATION_ID, context) || proof.requester !== watch.requester || proof.requester !== await account(context)) return false;
        await repository(s.repo, context);
        return true;
      } catch { return false; }
    },
  };
}
