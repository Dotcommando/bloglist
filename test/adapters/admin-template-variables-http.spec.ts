import { createServer } from 'node:http';

import {
  AdminTemplateVariablesController,
} from '../../src/adapters/inbound/rest/template-variables/admin-template-variables.controller.js';

it('TV HTTP checks origin, preserves explicit nulls and translates UTC page guards', async () => {
  const savePage = vi.fn(async (input) => input);
  const operations = {
    list: { execute: vi.fn() },
    save: { execute: vi.fn() },
    getPage: { execute: vi.fn() },
    savePage: { execute: savePage },
  };
  const server = createServer();

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Missing address');
  }

  const origin = 'http://127.0.0.1:' + address.port;
  const controller = new AdminTemplateVariablesController({ origin }, { forSession: () => operations });

  server.on('request', (request, response) => {
    void controller.handle(request, response);
  });
  const body = {
    values: { summary: null },
    templateId: 'Game',
    expectedUpdatedAt: '2026-10-31T00:00:00.000Z',
    catalogVersion: 'c1',
    mediaVersion: 'm1',
  };
  const headers = { Origin: origin, 'X-Zarya-Admin': '1', 'Content-Type': 'application/json' };

  try {
    const route = origin + '/api/admin/sites/site-1/pages/page-1/template-variables';

    expect((await fetch(route, { method: 'POST', headers, body: JSON.stringify(body) })).status).toBe(200);
    expect(savePage).toHaveBeenCalledWith({
      ...body,
      siteId: 'site-1',
      pageId: 'page-1',
      expectedUpdatedAt: new Date(body.expectedUpdatedAt),
    });
    expect((await fetch(route, {
      method: 'POST',
      headers: { ...headers, Origin: 'https://other.test' },
      body: '{}',
    })).status).toBe(403);
    expect((await fetch(route, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...body,
        unexpected: true,
      }),
    })).status).toBe(400);
    expect(savePage).toHaveBeenCalledTimes(1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
