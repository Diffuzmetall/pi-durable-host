import { EventEmitter, once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';

/** Loopback-only iii 0.24.6 function transport, not a production engine or native scheduler. */
export async function engineFixture() {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const notices = new EventEmitter(), connections = new Set(), functions = new Map(), pending = new Map();
  const frames = [];
  server.on('connection', (socket, request) => {
    const connection = { socket, namespace: undefined, workerId: randomUUID() };
    connections.add(connection);
    // Never record a credential value in fixture evidence.
    frames.push({ type: 'connection', credentialPresent: Boolean(request.headers.authorization) });
    socket.on('message', bytes => {
      const message = JSON.parse(bytes.toString());
      frames.push({ type: message.type, functionId: message.function_id ?? message.id, namespace: connection.namespace });
      if (message.type === 'invokefunction' && message.function_id === 'engine::workers::register') {
        connection.namespace = message.data.namespace ?? 'default';
        socket.send(JSON.stringify({ type: 'workerregistered', worker_id: connection.workerId, reattach_token: 'disposable-reattach' }));
      } else if (message.type === 'registerfunction') {
        const key = `${connection.namespace}/${message.id}`;
        functions.set(key, connection);
        notices.emit('registration', key);
      } else if (message.type === 'unregisterfunction') {
        functions.delete(`${connection.namespace}/${message.id}`);
      } else if (message.type === 'invocationresult') {
        const waiter = pending.get(message.invocation_id);
        if (waiter) {
          pending.delete(message.invocation_id);
          if (message.error) waiter.reject(Error(message.error.message ?? String(message.error)));
          else if (waiter.dropReply) waiter.reject(Error('SIMULATED_LOST_ACK'));
          else waiter.resolve(message.result);
        }
      }
    });
    socket.on('close', () => {
      connections.delete(connection);
      for (const [key, owner] of functions) if (owner === connection) functions.delete(key);
      notices.emit('disconnect', connection.workerId);
    });
  });
  return {
    url: `ws://127.0.0.1:${server.address().port}`, frames,
    async waitFunction(namespace, functionId) {
      const key = `${namespace}/${functionId}`, signal = AbortSignal.timeout(15000);
      while (!functions.has(key)) await once(notices, 'registration', { signal });
      return functions.get(key).workerId;
    },
    async invoke(namespace, functionId, data, metadata, dropReply = false) {
      const connection = functions.get(`${namespace}/${functionId}`);
      if (!connection) throw Error('FUNCTION_NOT_REGISTERED');
      const invocationId = randomUUID();
      let timer;
      const result = new Promise((resolve, reject) => {
        timer = setTimeout(() => { pending.delete(invocationId); reject(Error('FIXTURE_INVOCATION_TIMEOUT')); }, 15000);
        pending.set(invocationId, { resolve, reject, dropReply });
      });
      connection.socket.send(JSON.stringify({ type: 'invokefunction', invocation_id: invocationId, function_id: functionId, data, ...(metadata === undefined ? {} : { metadata }) }));
      try { return await result; } finally { clearTimeout(timer); pending.delete(invocationId); }
    },
    async disconnect(namespace, functionId) {
      const connection = functions.get(`${namespace}/${functionId}`);
      if (!connection) throw Error('FUNCTION_NOT_REGISTERED');
      const disconnected = once(connection.socket, 'close');
      connection.socket.terminate();
      await disconnected;
    },
    async close() {
      for (const waiter of pending.values()) waiter.reject(Error('FIXTURE_CLOSED'));
      pending.clear();
      for (const connection of connections) connection.socket.terminate();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}
