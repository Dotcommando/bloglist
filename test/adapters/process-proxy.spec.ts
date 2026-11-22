import { Agent, createServer, request, type Server } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

import { proxyProcessRequest } from '../../src/adapters/inbound/gateway/http/process-proxy.js';

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Missing test HTTP listener');
  }

  return address.port;
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function get(port: number, agent: Agent, path = '/'): Promise<{ status: number; headers: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const outgoing = request({ hostname: '127.0.0.1', port, path, agent }, (incoming) => {
      incoming.on('error', reject);
      incoming.resume();
      incoming.once('end', () => resolve({ status: incoming.statusCode!, headers: incoming.headers }));
    });

    outgoing.on('error', reject);
    outgoing.end();
  });
}

describe('site process HTTP proxy connections', () => {
  it('reuses both public and private connections across repeated requests to each worker', async () => {
    const agent = new Agent({ keepAlive: true });
    const client = new Agent({ keepAlive: true });
    let workerConnections = 0;
    let publicConnections = 0;
    const workers = ['one', 'two'].map((site) => createServer((incoming, response) => {
      expect(incoming.headers['x-zarya-process-secret']).toBe('secret');
      response.end(site);
    }));

    for (const worker of workers) {
      worker.on('connection', () => workerConnections++);
    }
    const ports = await Promise.all(workers.map(listen));
    const gateway = createServer((incoming, response) => {
      proxyProcessRequest(incoming, response, ports[incoming.url === '/two' ? 1 : 0]!, 'secret', agent);
    });

    gateway.on('connection', () => publicConnections++);
    const port = await listen(gateway);

    try {
      for (let index = 0; index < 40; index++) {
        expect((await get(port, client, index % 2 ? '/two' : '/one')).status).toBe(200);
      }
      expect(workerConnections).toBe(2);
      expect(publicConnections).toBe(1);
    } finally {
      agent.destroy();
      client.destroy();
      await Promise.all([close(gateway), ...workers.map(close)]);
    }
  });

  it('bounds connection churn during 5000 requests from 50 concurrent clients', async () => {
    const agent = new Agent({ keepAlive: true });
    const client = new Agent({ keepAlive: true });
    let workerConnections = 0;
    let publicConnections = 0;
    const worker = createServer((_incoming, response) => response.end('ok'));

    worker.on('connection', () => workerConnections++);
    const workerPort = await listen(worker);
    const gateway = createServer((incoming, response) => {
      proxyProcessRequest(incoming, response, workerPort, 'secret', agent);
    });

    gateway.on('connection', () => publicConnections++);
    const port = await listen(gateway);

    try {
      const results = await Promise.allSettled(Array.from({ length: 50 }, async () => {
        for (let index = 0; index < 100; index++) {
          expect((await get(port, client)).status).toBe(200);
        }
      }));

      expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
      expect(workerConnections).toBeLessThanOrEqual(50);
      expect(publicConnections).toBeLessThanOrEqual(50);
    } finally {
      agent.destroy();
      client.destroy();
      await Promise.all([close(gateway), close(worker)]);
    }
  }, 30000);

  it('keeps the client connection reusable when a worker closes its own connection', async () => {
    const agent = new Agent({ keepAlive: true });
    const client = new Agent({ keepAlive: true });
    const worker = createServer((_incoming, response) => {
      response.writeHead(200, {
        Connection: 'close, X-Private-Hop',
        'X-Private-Hop': 'must not reach the client',
        'Set-Cookie': ['first=one; HttpOnly', 'second=two; HttpOnly'],
      });
      response.end('ok');
    });
    const workerPort = await listen(worker);
    let publicConnections = 0;
    const gateway = createServer((incoming, response) => {
      proxyProcessRequest(incoming, response, workerPort, 'secret', agent);
    });

    gateway.on('connection', () => publicConnections++);
    const port = await listen(gateway);

    try {
      for (let index = 0; index < 5; index++) {
        const result = await get(port, client);

        expect(result.status).toBe(200);
        expect(result.headers['x-private-hop']).toBeUndefined();
        expect(result.headers['set-cookie']).toEqual(['first=one; HttpOnly', 'second=two; HttpOnly']);
      }
      expect(publicConnections).toBe(1);
    } finally {
      agent.destroy();
      client.destroy();
      await Promise.all([close(gateway), close(worker)]);
    }
  });

  it('reports a worker disconnect without an unhandled rejection and accepts subsequent requests', async () => {
    const agent = new Agent({ keepAlive: true });
    const client = new Agent({ keepAlive: true });
    let requests = 0;
    const worker = createServer((incoming, response) => {
      if (requests++ === 0) {
        incoming.socket.destroy();
      } else {
        response.end('recovered');
      }
    });
    const workerPort = await listen(worker);
    const gateway = createServer((incoming, response) => {
      proxyProcessRequest(incoming, response, workerPort, 'secret', agent);
    });
    const port = await listen(gateway);

    try {
      expect((await get(port, client)).status).toBe(503);
      expect((await get(port, client)).status).toBe(200);
      await delay(0);
    } finally {
      agent.destroy();
      client.destroy();
      await Promise.all([close(gateway), close(worker)]);
    }
  });
});
