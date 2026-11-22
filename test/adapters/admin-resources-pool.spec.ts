import { createServer } from 'node:http';

import { expect, it, vi } from 'vitest';

import { AdminResourcesController } from '../../src/adapters/inbound/rest/resources/admin-resources.controller.js';
import { currentAdmin } from '../support/current-admin.js';

it('translates a positive site pool size and rejects malformed values before invoking the operation', async () => {
  const server = createServer();

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Missing HTTP test listener');
  }

  const origin = `http://127.0.0.1:${address.port}`;
  const change = {
    execute: vi.fn(async () => {
      throw new Error('Synthetic operation failure');
    }),
  };
  const controller = new AdminResourcesController({ origin },
    { execute: async () => currentAdmin() },
    {
      execute: async () => {
        throw new Error('Unused read');
      },
    }, change);

  server.on('request', (request, response) => void controller.handle(request, response));

  try {
    const send = (sitePoolSize: unknown): Promise<Response> => fetch(origin + '/api/admin/installation/resources', {
      method: 'POST',
      headers: { Origin: origin, 'X-Zarya-Admin': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion: 'v1', databaseCpu: 1, sites: [], sitePoolSize }),
    });

    expect((await send(3)).status).toBe(500);
    expect(change.execute).toHaveBeenCalledWith(expect.objectContaining({ sitePoolSize: 3 }));
    change.execute.mockClear();

    for (const value of [0, -1, 1.5, '3', null]) {
      expect((await send(value)).status).toBe(400);
    }
    expect(change.execute).not.toHaveBeenCalled();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
