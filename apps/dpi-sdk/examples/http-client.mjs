// No SDK, Harness, storage or dependency imports: Node's standard HTTP API only.
async function main() {
  const required = (key) => {
    const value = process.env[key];
    if (!value?.trim()) throw Error(`Missing ${key}`);
    return value;
  };
  const url = new URL(required('DPI_URL'));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error('Use an HTTP(S) host URL without credentials');
  const base = url.href.replace(/\/$/, '');
  const token = required('DPI_TOKEN');
  const key = required('DPI_REQUEST_KEY');
  if (key.length > 110) throw Error('DPI_REQUEST_KEY must be at most 110 characters');
  const cwd = required('DPI_CWD');
  const provider = required('DPI_MODEL_PROVIDER');
  const modelId = required('DPI_MODEL_ID');
  const content = process.env.DPI_PROMPT ?? 'Hello from the HTTP recipe';
  const request = async (path, body, requestKey) => {
    const response = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(requestKey ? { 'idempotency-key': requestKey } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw Error(`HTTP operation failed (${response.status})`);
    return response.json();
  };
  const protocol = await request('/v1/protocol');
  if (protocol?.apiVersion !== 1 || !Array.isArray(protocol.capabilities) || !protocol.capabilities.every((value) => typeof value === 'string')) throw Error('Incompatible host protocol');
  // The caller retains this key before sending. Repeating the whole recipe reconciles the same resources.
  const session = await request('/v1/sessions', { name: 'HTTP recipe', cwd, model: { provider, modelId } }, `${key}:session`);
  if (typeof session?.id !== 'string' || !session.id) throw Error('Invalid session response');
  const path = `/v1/sessions/${encodeURIComponent(session.id)}`;
  const requestId = `${key}:submit`;
  let result = await request(path + '/agents/main/messages', { content, whenBusy: 'followUp', requestId });
  if (!Number.isSafeInteger(result?.submissionId) || result.submissionId <= 0) throw Error('Invalid submission response');
  // Receipt lookup is a separate read and does not resubmit the message.
  const receipt = await request(path + '/agents/main/receipts/' + encodeURIComponent(requestId));
  if (receipt?.submissionId !== result.submissionId) throw Error('Receipt did not reconcile the native submission');
  for (let attempts = 0; attempts < 30 && (result.status === 'pending' || result.status === 'queued'); attempts++)
    result = await request(path + `/submissions/${result.submissionId}?waitMs=1000`);
  if (result?.status !== 'done' || typeof result.answer?.text !== 'string') throw Error('No terminal answer yet; retry unchanged inputs and key');
  console.log(JSON.stringify({ sessionId: session.id, submissionId: result.submissionId, status: result.status, answer: result.answer.text }));
}

main().catch(() => {
  console.error('HTTP recipe failed. Check the documented environment and host availability; retry unchanged inputs with the same DPI_REQUEST_KEY.');
  process.exitCode = 1;
});
