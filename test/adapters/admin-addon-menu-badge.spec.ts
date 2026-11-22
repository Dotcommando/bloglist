import { createServer } from 'node:http';

import { AdminAddonsController } from '../../src/adapters/inbound/rest/addons/admin-addons.controller.js';
import { BusinessError, BusinessErrorCode } from '../../src/domain/shared/business-error.js';

it('advertises declared menu counts only after authorized add-on listing', async () => {
  const server = createServer();

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing test listener');
    }

    const origin = 'http://127.0.0.1:' + address.port;
    const current = { execute: vi.fn().mockResolvedValue({ user: { adminUserId: 'operator' } }) };
    const list = {
      execute: vi.fn().mockResolvedValue([
        { addonKey: 'with-count', definition: null, connection: null },
        { addonKey: 'without-count', definition: null, connection: null },
      ]),
    };
    const unused = { execute: vi.fn() };
    const badge = vi.fn((key: string) => key === 'with-count');
    const controller = new AdminAddonsController({ origin }, current, list, unused, unused, unused, unused, badge);
    const load = (): Promise<Response> => fetch(origin + '/api/admin/sites/site/addons',
      { headers: { 'x-zarya-admin': '1' } });

    server.on('request', (request, response) => {
      void controller.handle(request, response);
    });
    list.execute.mockRejectedValueOnce(new BusinessError(BusinessErrorCode.Forbidden, 'Denied'));
    expect((await load()).status).toBe(403);
    expect(badge).not.toHaveBeenCalled();

    const response = await load();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [
        { addonKey: 'with-count', definition: null, connection: null, menuBadge: true },
        { addonKey: 'without-count', definition: null, connection: null },
      ],
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
