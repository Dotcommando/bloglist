import { once } from 'node:events';
import { createServer } from 'node:http';

import { expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { AdminCpuTelemetryController } from
  '../../src/adapters/inbound/websocket/resources/admin-cpu-telemetry.controller.js';
import { CpuTelemetryService } from '../../src/app/services/resources/cpu-telemetry.service.js';
import { currentAdmin } from '../support/current-admin.js';

it('rejects foreign origins and missing sessions, closes messages and expires live sessions', async () => {
  const server = createServer();

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Missing test listener');
  }

  const origin = `http://127.0.0.1:${address.port}`;
  let expired = false;
  const telemetry = new CpuTelemetryService({
    read: async () => ({
      timestamp: new Date().toISOString(),
      monotonicMs: performance.now(),
      source: 'test',
      cores: [{ total: performance.now(), idle: 0 }],
    }),
  });
  const controller = new AdminCpuTelemetryController(telemetry, {
    execute: async ({ token }) => {
      if (expired || token !== 'valid') {
        throw new Error('Unauthorized');
      }

      return currentAdmin();
    },
  }, async () => ({ origin }));
  const clients: WebSocket[] = [];

  server.on('upgrade', (request, socket, head) => {
    void controller.upgrade(request, socket, head);
  });
  const connect = (headers: Record<string, string>): WebSocket => {
    const client = new WebSocket(origin.replace('http:', 'ws:') + '/api/admin/installation/cpu', { headers });

    clients.push(client);

    return client;
  };

  try {
    for (const headers of [{ Origin: origin }, { Origin: 'http://foreign.test', Cookie: 'zarya_admin_session=valid' }]) {
      const client = connect(headers);
      const rejected = new Promise<number>((resolve, reject) => {
        client.once('unexpected-response', (_request, response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        });
        client.once('error', reject);
      });

      expect(await rejected).toBe(403);
    }
    const writer = connect({ Origin: origin, Cookie: 'zarya_admin_session=valid' });

    await once(writer, 'open');
    const closed = once(writer, 'close');

    writer.send('forbidden');
    expect((await closed)[0]).toBe(1008);
    const viewer = connect({ Origin: origin, Cookie: 'zarya_admin_session=valid' });

    await once(viewer, 'open');
    const received = once(viewer, 'message');

    expect(JSON.parse(String((await received)[0]))).toMatchObject({ logicalCpuCount: 1, source: 'test' });
    const expiry = once(viewer, 'close');

    expired = true;
    await expiry;
  } finally {
    for (const client of clients) {
      client.on('error', () => {});
      client.terminate();
    }
    controller.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}, 10000);
