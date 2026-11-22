import { createServer } from 'node:http';

import { AdminJsonLdController } from '../../src/adapters/inbound/rest/json-ld/admin-json-ld.controller.js';

it('JSON-LD administration enforces origin, validates input and passes the session to operations', async () => {
  const save = vi.fn(async (input) => ({ ...input, version: 'v2' }));
  const list = vi.fn(async () => ({ siteId: 'site-1', version: 'v1', profiles: [], objects: [] }));
  const factory = { forSession: vi.fn(() => ({ list: { execute: list }, save: { execute: save } })) };
  const server = createServer();

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Missing address');
  }

  const origin = `http://127.0.0.1:${address.port}`;
  const controller = new AdminJsonLdController({ origin }, factory);
  const route = origin + '/api/admin/sites/site-1/json-ld';
  const headers = { Origin: origin, 'X-Zarya-Admin': '1', 'Content-Type': 'application/json' };

  server.on('request', (request, response) => {
    void controller.handle(request, response);
  });

  try {
    expect((await fetch(route, { headers })).status).toBe(200);
    expect((await fetch(route, {
      method: 'POST', headers, body: JSON.stringify({ expectedVersion: 'v1', profiles: [], objects: [] }),
    })).status).toBe(200);
    expect(save).toHaveBeenCalledWith({ siteId: 'site-1', expectedVersion: 'v1', profiles: [], objects: [] });
    expect((await fetch(route, {
      method: 'POST', headers, body: JSON.stringify({ expectedVersion: 'v1', profiles: [null], objects: [] }),
    })).status).toBe(400);
    expect((await fetch(route, { method: 'POST', headers: { ...headers, Origin: 'https://other.test' }, body: '{}' }))
      .status).toBe(403);
    expect(save).toHaveBeenCalledTimes(1);
    expect(factory.forSession).toHaveBeenCalled();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
