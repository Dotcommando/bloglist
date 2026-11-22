import { Agent, createServer, request, type Server } from 'node:http';

import { expect, it, vi } from 'vitest';

import { proxyAdmittedProcessRequest } from '../../src/adapters/inbound/gateway/http/process-proxy.js';

interface ICompletion {
  readonly promise: Promise<void>;
  resolve(): void;
  reject(reason: unknown): void;
}

function completion(): ICompletion {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });

  return { promise, resolve, reject };
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Missing test listener');
  }

  return address.port;
}

async function close(...servers: Server[]): Promise<void> {
  const results = await Promise.allSettled(servers.map(async server => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }));
  const failures = results.filter(result => result.status === 'rejected');

  if (failures.length) {
    throw new AggregateError(failures.map(result => result.reason), 'Proxy test cleanup failed');
  }
}

it('does not admit a request that disconnected while asynchronous dispatch was pending', async () => {
  const entered = completion();
  const resume = completion();
  const disconnected = completion();
  const dispatched = completion();
  const agent = new Agent({ keepAlive: true });
  const release = vi.fn();
  const acquire = vi.fn(() => ({ worker: { port: 1 }, release }));
  const server = createServer((incoming, response) => {
    response.once('close', () => disconnected.resolve());
    entered.resolve();
    const work = resume.promise.then(() => {
      proxyAdmittedProcessRequest(incoming, response, acquire, 'secret', agent);
    });

    work.then(() => dispatched.resolve(), error => dispatched.reject(error));
  });
  const port = await listen(server);
  const client = request({ hostname: '127.0.0.1', port });
  const closed = new Promise<void>(resolve => client.once('close', resolve));
  const clientError = new Promise<Error>(resolve => client.once('error', resolve));

  client.end();

  try {
    await entered.promise;
    client.destroy();
    await Promise.all([closed, disconnected.promise]);
    const error = await clientError;

    expect('code' in error && error.code).toBe('ECONNRESET');
    resume.resolve();
    await dispatched.promise;
    expect(acquire).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  } finally {
    resume.resolve();
    await dispatched.promise;
    agent.destroy();
    client.destroy();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

it('releases an admitted request exactly once after a normal response finishes and closes', async () => {
  const upstream = createServer((_incoming, response) => response.end('complete'));
  const port = await listen(upstream);
  const agent = new Agent({ keepAlive: true });
  const release = vi.fn();
  const acquire = vi.fn(() => ({ worker: { port }, release }));
  const gateway = createServer((incoming, response) => {
    proxyAdmittedProcessRequest(incoming, response, acquire, 'secret', agent);
  });
  const gatewayPort = await listen(gateway);

  try {
    const reply = await fetch(`http://127.0.0.1:${gatewayPort}/`);

    expect(await reply.text()).toBe('complete');
    expect(acquire).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  } finally {
    agent.destroy();
    await close(gateway, upstream);
  }
});

it('releases admission when proxy setup fails before forwarding', async () => {
  const agent = new Agent({ keepAlive: true });
  const release = vi.fn();
  const acquire = vi.fn(() => ({ worker: { port: 65536 }, release }));
  let failure: unknown;
  const gateway = createServer((incoming, response) => {
    try {
      proxyAdmittedProcessRequest(incoming, response, acquire, 'secret', agent);
    } catch (error) {
      failure = error;
      response.writeHead(500).end();
    }
  });
  const port = await listen(gateway);

  try {
    const reply = await fetch(`http://127.0.0.1:${port}/`);

    await reply.arrayBuffer();
    expect(reply.status).toBe(500);
    expect(failure).toBeInstanceOf(RangeError);
    expect(acquire).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  } finally {
    agent.destroy();
    await close(gateway);
  }
});
