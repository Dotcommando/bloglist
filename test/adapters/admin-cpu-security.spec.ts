import { once } from 'node:events';
import { createServer } from 'node:http';

import { expect, it, type Mock, vi } from 'vitest';
import { WebSocket } from 'ws';

import { AdminCpuTelemetryController } from
  '../../src/adapters/inbound/websocket/resources/admin-cpu-telemetry.controller.js';
import type { ICurrentAdminUser } from '../../src/domain/admin-auth/admin-auth-session.js';
import type { ICpuTelemetrySubscriber } from '../../src/ports/outbound/resources/cpu-counters.port.js';
import { currentAdmin } from '../support/current-admin.js';

interface ICpuBoundary {
  origin: string;
  connect(headers: Record<string, string | string[]>): Promise<{ status: number; client: WebSocket }>;
  subscribe: Mock<(subscriber: ICpuTelemetrySubscriber) => () => void>;
  stop: Mock<() => void>;
  subscriber(): ICpuTelemetrySubscriber;
  profile(value: ICurrentAdminUser): void;
  version(value: string): void;
  close(): Promise<void>;
}

async function fixture(): Promise<ICpuBoundary> {
  const server = createServer();

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Missing synthetic listener');
  }

  const origin = `http://127.0.0.1:${address.port}`;
  let profile = currentAdmin();
  let version = 'v1';
  let subscriber: ICpuTelemetrySubscriber | undefined;
  const stop = vi.fn();
  const subscribe = vi.fn((value: ICpuTelemetrySubscriber) => {
    subscriber = value;

    return stop;
  });
  const controller = new AdminCpuTelemetryController({ subscribe, close: () => {} }, {
    execute: async ({ token }) => {
      if (token !== 'valid') {
        throw new Error('Synthetic authorization failure');
      }

      return profile;
    },
  }, async () => {
    const captured = version;

    return { origin, cookieVersion: () => captured };
  });
  const clients: WebSocket[] = [];

  server.on('upgrade', (request, socket, head) => {
    void controller.upgrade(request, socket, head).catch(() => socket.destroy());
  });
  const connect = (headers: Record<string, string | string[]>): Promise<{ status: number; client: WebSocket }> =>
    new Promise((resolve, reject) => {
      const client = new WebSocket(origin.replace('http:', 'ws:') + '/api/admin/installation/cpu', { headers });

      clients.push(client);
      client.once('open', () => resolve({ status: 101, client }));
      client.once('error', reject);
      client.once('unexpected-response', (_request, response) => {
        response.resume();
        response.once('end', () => {
          resolve({ status: response.statusCode!, client });
          client.terminate();
        });
      });
    });

  return {
    origin,
    connect,
    subscribe,
    stop,
    subscriber: () => subscriber!,
    profile: (value: typeof profile) => {
      profile = value;
    },
    version: (value: string) => {
      version = value;
    },
    close: async () => {
      for (const client of clients) {
        client.terminate();
      }
      controller.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

it('rejects cross-site WebSocket hijacking, forged identities and ambiguous cookies before subscription', async () => {
  const f = await fixture();

  try {
    for (const headers of [
      { Origin: f.origin },
      { Cookie: 'zarya_admin_session=v1.valid' },
      { Origin: 'null', Cookie: 'zarya_admin_session=v1.valid' },
      { Origin: 'https://foreign.test', Cookie: 'zarya_admin_session=v1.valid' },
      { Origin: f.origin, Authorization: 'Bearer valid', 'X-Forwarded-User': 'admin' },
      { Origin: f.origin, Cookie: 'zarya_admin_ui_session=v1.valid' },
      { Origin: f.origin, Cookie: 'zarya_admin_session=v1.valid; zarya_admin_session=v1.valid' },
      { Origin: [f.origin, f.origin], Cookie: 'zarya_admin_session=v1.valid' },
    ]) {
      expect((await f.connect(headers)).status).toBe(403);
    }
    expect(f.subscribe).not.toHaveBeenCalled();
  } finally {
    await f.close();
  }
});

it.each(['blocked', 'restricted', 'version'])('rechecks %s authority after the WebSocket has opened', async (kind) => {
  const f = await fixture();

  try {
    const connected = await f.connect({ Origin: f.origin, Cookie: 'zarya_admin_session=v1.valid' });

    expect(connected.status).toBe(101);
    await expect(f.subscriber().authorize()).resolves.toBeUndefined();
    const profile = currentAdmin();

    if (kind === 'version') {
      f.version('v2');
    } else {
      f.profile({
        ...profile,
        user: {
          ...profile.user,
          ...(kind === 'blocked' ? { blocked: true }
            : { authorization: { systemAdmin: false, siteIds: ['one'], siteAdminSiteIds: ['one'] } }),
        },
      });
    }
    await expect(f.subscriber().authorize()).rejects.toThrow();
  } finally {
    await f.close();
  }
});

it('keeps the CPU socket read-only and removes its subscription on resource commands', async () => {
  const f = await fixture();

  try {
    const { client } = await f.connect({ Origin: f.origin, Cookie: 'zarya_admin_session=v1.valid' });
    const closed = once(client, 'close');

    client.send(JSON.stringify({ databaseCpu: 8, sitePoolSize: 100, sites: [{ siteId: 'one', processes: 10 }] }));
    expect((await closed)[0]).toBe(1008);
    expect(f.stop).toHaveBeenCalledOnce();
  } finally {
    await f.close();
  }
});
