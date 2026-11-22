import { Agent, createServer, request, type Server } from 'node:http';
import { setImmediate } from 'node:timers/promises';

import { expect, it } from 'vitest';

import { proxyProcessRequest } from '../../src/adapters/inbound/gateway/http/process-proxy.js';

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Missing test listener');
  }

  return address.port;
}

async function fixture(worker: Server): Promise<{
  send(method: string, body?: string, signal?: AbortSignal): Promise<number>;
  close(): Promise<void>;
}> {
  const workerPort = await listen(worker);
  const agent = new Agent({ keepAlive: true, maxSockets: 1 });
  const client = new Agent({ keepAlive: true });
  const gateway = createServer((req, res) => proxyProcessRequest(req, res, workerPort, 'secret', agent));
  const port = await listen(gateway);

  return {
    send: (method, body, signal) => new Promise<number>((resolve, reject) => {
      const outgoing = request({
        host: '127.0.0.1',
        port,
        method,
        agent: client,
        ...(signal ? { signal } : {}),
        ...(body ? { headers: { 'Content-Length': Buffer.byteLength(body) } } : {}),
      }, (incoming) => {
        incoming.once('error', reject);
        incoming.resume();
        incoming.once('end', () => resolve(incoming.statusCode!));
      });

      outgoing.once('error', reject);
      outgoing.end(body);
    }),
    close: async () => {
      agent.destroy();
      client.destroy();
      await Promise.all([gateway, worker].map(async (server) => {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }));
    },
  };
}

it('cancels the fresh retry when its public client disconnects', async () => {
  let started = (): void => {};
  let cleaned = (): void => {};
  const startedSignal = new Promise<void>((resolve) => {
    started = resolve;
  });
  const cleanedSignal = new Promise<void>((resolve) => {
    cleaned = resolve;
  });
  let requests = 0;
  const worker = createServer((req, res) => {
    requests++;

    if (requests === 1) {
      res.end('warm');
    } else if (requests === 2) {
      req.socket.destroy();
    } else {
      res.once('close', cleaned);
      started();
    }
  });
  const f = await fixture(worker);
  const controller = new AbortController();

  try {
    expect(await f.send('GET')).toBe(200);
    await setImmediate();
    const observed = expect(f.send('GET', undefined, controller.signal)).rejects.toThrow();

    await startedSignal;
    controller.abort();
    await observed;
    await cleanedSignal;
    expect(requests).toBe(3);
  } finally {
    controller.abort();
    await f.close();
  }
});

it('stops after one fresh retry when that connection also fails', async () => {
  let requests = 0;
  const worker = createServer((req, res) => {
    if (++requests === 1) {
      res.end('warm');
    } else {
      req.socket.destroy();
    }
  });
  const f = await fixture(worker);

  try {
    expect(await f.send('GET')).toBe(200);
    await setImmediate();
    expect(await f.send('GET')).toBe(503);
    expect(requests).toBe(3);
  } finally {
    await f.close();
  }
});

it.each(['GET', 'HEAD'])('retries a reset reused socket once on a fresh connection for %s', async (method) => {
  let requests = 0;
  let connections = 0;
  const worker = createServer((req, res) => {
    if (++requests === 2) {
      req.socket.destroy();
    } else {
      res.end('ok');
    }
  });

  worker.on('connection', () => connections++);
  const f = await fixture(worker);

  try {
    expect(await f.send('GET')).toBe(200);
    await setImmediate();
    expect(await f.send(method)).toBe(200);
    expect(requests).toBe(3);
    expect(connections).toBe(2);
  } finally {
    await f.close();
  }
});

it('does not retry a POST that committed before its reused connection reset', async () => {
  let requests = 0;
  let commits = 0;
  const worker = createServer((req, res) => {
    requests++;

    if (req.method === 'POST') {
      req.resume();
      req.once('end', () => {
        commits++;
        req.socket.destroy();
      });
    } else {
      res.end('warm');
    }
  });
  const f = await fixture(worker);

  try {
    expect(await f.send('GET')).toBe(200);
    await setImmediate();
    expect(await f.send('POST', 'write once')).toBe(503);
    expect(requests).toBe(2);
    expect(commits).toBe(1);
  } finally {
    await f.close();
  }
});

it('does not retry a GET body or a failure on a fresh socket', async () => {
  let requests = 0;
  const worker = createServer((req, res) => {
    if (++requests === 1) {
      res.end('warm');
    } else {
      req.socket.destroy();
    }
  });
  const f = await fixture(worker);

  try {
    expect(await f.send('GET')).toBe(200);
    await setImmediate();
    expect(await f.send('GET', 'body')).toBe(503);
    expect(await f.send('GET')).toBe(503);
    expect(requests).toBe(3);
  } finally {
    await f.close();
  }
});

it('does not retry after response headers or mark a truncated response complete', async () => {
  let requests = 0;
  const worker = createServer((req, res) => {
    if (++requests === 1) {
      res.end('warm');
    } else {
      res.writeHead(200);
      res.write('partial');
      globalThis.setImmediate(() => req.socket.destroy());
    }
  });
  const f = await fixture(worker);

  try {
    expect(await f.send('GET')).toBe(200);
    await setImmediate();
    await expect(f.send('GET')).rejects.toThrow();
    expect(requests).toBe(2);
  } finally {
    await f.close();
  }
});
