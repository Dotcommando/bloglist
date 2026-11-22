import { createServer, request } from 'node:http';

import { expect, it, vi } from 'vitest';

import { AdminAddonUpdatesController } from '../../src/adapters/inbound/rest/addons/admin-addon-updates.controller.js';
import { BusinessError, BusinessErrorCode } from '../../src/domain/shared/business-error.js';

it('rejects an unfinished upload before reading a body or preparing a package', async () => {
  const prepare = { execute: vi.fn() };
  const controller = new AdminAddonUpdatesController({ origin: 'http://localhost:3002' }, () => ({
    actorId: async () => {
      throw new BusinessError(BusinessErrorCode.AuthenticationRequired, 'login');
    },
    prepare,
    checkRepository: { execute: vi.fn() },
    apply: { execute: vi.fn() },
    read: { execute: vi.fn() },
  }));
  const server = createServer((incoming, response) => {
    void controller.handle(incoming, response);
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('no listener');
    }

    const status = await new Promise<number>((resolve, reject) => {
      const outgoing = request({
        host: '127.0.0.1',
        port: address.port,
        path: '/api/admin/addon-updates',
        method: 'POST',
        headers: {
          Host: 'localhost:3002',
          Origin: 'http://localhost:3002',
          'X-Zarya-Admin': '1',
          'Content-Type': 'application/gzip',
          'Content-Length': '67108864',
        },
      }, response => {
        response.resume();
        resolve(response.statusCode ?? 0);
      });

      outgoing.flushHeaders();
      outgoing.on('error', reject);
    });

    expect(status).toBe(401);
    expect(prepare.execute).not.toHaveBeenCalled();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
