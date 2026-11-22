import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { Agent, createServer, request, type Server } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { expect, it } from 'vitest';

import { proxyProcessRequest } from '../../src/adapters/inbound/gateway/http/process-proxy.js';

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('No test listener');
  }

  return address.port;
}

async function fixture(worker: Server): Promise<{ port: number; close(): Promise<void> }> {
  const port = await listen(worker);
  const agent = new Agent({ keepAlive: true });
  const gateway = createServer((req, res) => proxyProcessRequest(req, res, port, 'secret', agent));
  const publicPort = await listen(gateway);

  return {
    port: publicPort,
    close: async () => {
      agent.destroy();
      await Promise.all([gateway, worker].map(async (server) => {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }));
    },
  };
}

it('streams a large POST and a slow response without losing bytes or crossing host identities', async () => {
  const worker = createServer((req, res) => {
    expect(req.headers['x-private-hop']).toBeUndefined();
    expect(req.headers['x-zarya-process-secret']).toBe('secret');
    res.setHeader('X-Host', req.headers.host!);
    req.on('error', () => res.destroy());
    req.pipe(res);
  });
  const f = await fixture(worker);
  const chunk = Buffer.alloc(64 * 1024, 117);
  const expected = createHash('sha256');

  for (let i = 0; i < 64; i++) {
    expected.update(chunk);
  }

  try {
    for (const host of ['one.test', 'two.test']) {
      let uploaded: Promise<void> | undefined;
      const received = new Promise<string>((resolve, reject) => {
        const req = request({
          host: '127.0.0.1',
          port: f.port,
          method: 'POST',
          headers: { Host: host, Connection: 'keep-alive, X-Private-Hop', 'X-Private-Hop': 'discard' },
        }, (res) => {
          expect(res.headers['x-host']).toBe(host);
          const digest = createHash('sha256');

          res.on('error', reject);
          res.on('data', (data: Buffer) => {
            digest.update(data);
            res.pause();
            setImmediate(() => res.resume());
          });
          res.on('end', () => resolve(digest.digest('hex')));
        });

        req.on('error', reject);
        uploaded = pipeline(Readable.from(Array.from({ length: 64 }, () => chunk)), req);
        void uploaded.catch(reject);
      });
      const observed = received.then((value) => value);

      expect(await observed).toBe(expected.copy().digest('hex'));
      await uploaded;
    }
  } finally {
    await f.close();
  }
}, 15000);

it('aborts an unfinished POST upstream without committing or replaying it', async () => {
  let started = (): void => {};
  let aborted = (): void => {};
  const startedSignal = new Promise<void>((resolve) => {
    started = resolve;
  });
  const abortedSignal = new Promise<void>((resolve) => {
    aborted = resolve;
  });
  let received = 0;
  let commits = 0;
  const worker = createServer((req, res) => {
    received++;
    req.once('data', started);
    req.once('aborted', aborted);
    req.on('error', () => {});
    req.on('end', () => {
      commits++;
      res.end('committed');
    });
  });
  const f = await fixture(worker);

  try {
    const req = request({
      host: '127.0.0.1', port: f.port, method: 'POST', headers: { 'Content-Length': 1024 * 1024 },
    });
    const closed = new Promise<void>((resolve) => req.once('error', () => resolve()));

    req.write(Buffer.alloc(65536));
    await startedSignal;
    req.destroy(new Error('synthetic client cancellation'));
    await Promise.all([closed, abortedSignal]);
    expect(received).toBe(1);
    expect(commits).toBe(0);
    const result = await fetch(`http://127.0.0.1:${f.port}`, { method: 'POST', body: 'complete' });

    expect(await result.text()).toBe('committed');
    expect(received).toBe(2);
    expect(commits).toBe(1);
  } finally {
    await f.close();
  }
}, 15000);

it('closes a backpressured upstream response when its client disappears', async () => {
  let cleaned = (): void => {};
  const cleanedSignal = new Promise<void>((resolve) => {
    cleaned = resolve;
  });
  let produced = 0;
  const worker = createServer((_req, res) => {
    const source = new Readable({
      read(): void {
        produced++;
        this.push(Buffer.alloc(65536));
      },
    });

    res.once('close', () => source.destroy());
    source.once('close', cleaned);
    source.on('error', () => {});
    source.pipe(res);
  });
  const f = await fixture(worker);

  try {
    const req = request({ host: '127.0.0.1', port: f.port });
    const response = once(req, 'response');

    req.on('error', () => {});
    req.end();
    const [incoming] = await response;

    incoming.on('error', () => {});
    incoming.pause();
    await once(incoming, 'readable');
    incoming.destroy();
    req.destroy();
    await cleanedSignal;
    const stoppedAt = produced;

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(produced).toBe(stoppedAt);
  } finally {
    await f.close();
  }
}, 15000);
