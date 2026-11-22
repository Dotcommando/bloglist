import { createServer, type Server } from 'node:http';
import { createConnection } from 'node:net';

import { startLocalSiteListeners } from '../../src/adapters/inbound/gateway/http/local-site-listeners.js';
import type { ISiteState } from '../../src/domain/sites/site.js';
import { SiteOriginMode } from '../../src/domain/sites/site-origin-mode.enum.js';
import { SiteStatus } from '../../src/domain/sites/site-status.enum.js';

async function listen(server: Server, host = '127.0.0.1'): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Expected TCP listener');
  }

  return address.port;
}

async function close(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }

  const done = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));

  server.closeIdleConnections();
  await done;
}

async function freePort(): Promise<number> {
  const server = createServer();
  const port = await listen(server);

  await close(server);

  return port;
}

function site(
  origin: string, originMode = SiteOriginMode.Local, status = SiteStatus.ACTIVE,
): Pick<ISiteState, 'status' | 'addresses'> {
  return { status, addresses: { originMode, localOrigin: origin, publicOrigin: 'https://site.example' } };
}

describe('local site HTTP listeners', () => {
  it('opens the configured localhost port for ordinary requests and closes it with the CMS', async () => {
    const gateway = createServer((request, response) => response.end(request.headers.host));

    await listen(gateway);
    const port = await freePort();
    const origin = 'http://localhost:' + port;
    const listeners = await startLocalSiteListeners(gateway, [site(origin), site(origin)]);

    try {
      const response = await fetch(origin + '/robots.txt');

      expect(response.status).toBe(200);
      expect(await response.text()).toBe('localhost:' + port);
      expect(listeners.origins).toEqual([origin]);
      const foreign = await fetch('http://127.0.0.1:' + port + '/', { headers: { Host: 'foreign.example' } });

      expect(foreign.status).toBe(421);
      await foreign.arrayBuffer();
      const admin = await fetch(origin + '/api/admin/sites');

      expect(admin.status).toBe(404);
      await admin.arrayBuffer();
    } finally {
      await listeners.close();
      await close(gateway);
    }
    await expect(fetch(origin + '/robots.txt', { signal: AbortSignal.timeout(2000) })).rejects.toThrow();
    await listeners.close();
  });

  it('reuses the primary socket and does not bind Public, HTTPS, remote or archived local addresses', async () => {
    const gateway = createServer((_request, response) => response.end('gateway'));
    const port = await listen(gateway);
    const origin = 'http://localhost:' + port;
    const listeners = await startLocalSiteListeners(gateway, [
      site(origin), site('http://localhost:' + await freePort(), SiteOriginMode.Public),
      site('https://localhost:3443'), site('http://192.0.2.1:3000'),
      site('http://localhost:3999', SiteOriginMode.Local, SiteStatus.ARCHIVED),
    ]);

    try {
      expect(listeners.origins).toEqual([origin]);
      const response = await fetch(origin);

      expect(await response.text()).toBe('gateway');
      await listeners.close();
      expect(gateway.listening).toBe(true);
    } finally {
      await listeners.close();
      await close(gateway);
    }
  });

  it('rolls back earlier listeners when a later configured port is occupied', async () => {
    const gateway = createServer();
    const occupied = createServer((_request, response) => response.end('owner'));

    await listen(gateway);
    const occupiedPort = await listen(occupied);
    const port = await freePort();

    try {
      await expect(startLocalSiteListeners(gateway, [
        site('http://localhost:' + port), site('http://localhost:' + occupiedPort),
      ])).rejects.toMatchObject({ origin: 'http://localhost:' + occupiedPort });
      await expect(fetch('http://localhost:' + port)).rejects.toThrow();
      const response = await fetch('http://localhost:' + occupiedPort);

      expect(await response.text()).toBe('owner');
    } finally {
      await close(occupied);
      await close(gateway);
    }
  });

  it('closes connections with incomplete headers during final cleanup', async () => {
    const gateway = createServer();

    await listen(gateway);
    const port = await freePort();
    const listeners = await startLocalSiteListeners(gateway, [site('http://localhost:' + port)]);
    const socket = createConnection(port, '127.0.0.1');
    const connected = new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('error', reject);
    });
    const closed = new Promise<void>(resolve => socket.once('close', () => resolve()));

    try {
      await connected;
      await new Promise<void>((resolve, reject) => {
        socket.write('GET / HTTP/1.1\r\nHost: local', error => error ? reject(error) : resolve());
      });
      listeners.beginShutdown();
      await listeners.close();
      await closed;
    } finally {
      socket.destroy();
      await closed;
      await listeners.close();
      await close(gateway);
    }
  });

  it('lets an admitted public request finish while closing the listener', async () => {
    let markAdmitted!: () => void;
    let finishResponse!: () => void;
    const admitted = new Promise<void>(resolve => {
      markAdmitted = resolve;
    });
    const gateway = createServer((_request, response) => {
      finishResponse = () => {
        response.end('done');
      };
      response.write('started');
      markAdmitted();
    });

    await listen(gateway);
    const origin = 'http://localhost:' + await freePort();
    const listeners = await startLocalSiteListeners(gateway, [site(origin)]);
    const request = fetch(origin).then(response => response.text());
    const observed = Promise.allSettled([request]);

    try {
      await admitted;
      listeners.beginShutdown();
      finishResponse();
      expect(await request).toBe('starteddone');
      await listeners.close();
    } finally {
      await observed;
      await listeners.close();
      await close(gateway);
    }
  });
});
