import { createServer, request as httpRequest, type Server } from 'node:http';

import {
  AdminAddonInstallationsController,
} from '../../src/adapters/inbound/rest/addons/admin-addon-installations.controller.js';
import { BusinessError, BusinessErrorCode } from '../../src/domain/shared/business-error.js';

describe('repository installation REST boundary', () => {
  let server: Server;
  let origin: string;
  const current = { execute: vi.fn() };
  const install = { execute: vi.fn() };
  const list = { execute: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    current.execute.mockResolvedValue({ user: { adminUserId: 'trusted-admin' } });
    install.execute.mockResolvedValue({ addonKey: 'synthetic', status: 'Installed', installedBy: 'private-actor' });
    list.execute.mockResolvedValue([]);
    server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing test listener');
    }
    origin = 'http://127.0.0.1:' + address.port;
    const controller = new AdminAddonInstallationsController({ origin }, current, install, list);

    server.on('request', (request, response) => {
      void controller.handle(request, response);
    });
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function post(body: unknown, suffix = ''): Promise<Response> {
    return fetch(origin + '/api/admin/sites/site/addon-installations' + suffix, {
      method: 'POST',
      headers: {
        origin, 'content-type': 'application/json', 'x-zarya-admin': '1', cookie: 'zarya_admin_session=synthetic',
      },
      body: JSON.stringify(body),
    });
  }

  it('passes only the trusted actor, route site and repository URL to the operation', async () => {
    const response = await post({ repositoryUrl: 'https://github.com/example/synthetic' });

    expect(response.status).toBe(200);
    expect(install.execute).toHaveBeenCalledWith({
      actorId: 'trusted-admin', siteId: 'site', repositoryUrl: 'https://github.com/example/synthetic',
    });
    expect(await response.json()).not.toHaveProperty('installedBy');
  });

  it('passes a validated installed add-on key and rejects malformed keys', async () => {
    const repositoryUrl = 'https://github.com/example/synthetic';

    expect((await post({ repositoryUrl, installedAddonKey: 'synthetic' })).status).toBe(200);
    expect(install.execute).toHaveBeenCalledWith({
      actorId: 'trusted-admin', siteId: 'site', repositoryUrl, installedAddonKey: 'synthetic',
    });
    expect((await post({ repositoryUrl, installedAddonKey: '../synthetic' })).status).toBe(400);
    expect(install.execute).toHaveBeenCalledOnce();
  });

  it('rejects unknown fields, query parameters, oversized bodies and wrong methods', async () => {
    expect((await post({ repositoryUrl: 'https://github.com/example/synthetic', actorId: 'attacker' })).status).toBe(400);
    expect((await post({ repositoryUrl: 'https://github.com/example/synthetic' }, '?site=foreign')).status).toBe(400);
    expect((await post({ repositoryUrl: 'x'.repeat(9000) })).status).toBe(413);
    expect(install.execute).not.toHaveBeenCalled();
  });

  it('authenticates an unfinished oversized request before reading any body or invoking an operation', async () => {
    current.execute.mockRejectedValueOnce(new BusinessError(BusinessErrorCode.AuthenticationRequired, 'Sign in'));
    let client!: ReturnType<typeof httpRequest>;
    const status = new Promise<number>((resolve, reject) => {
      client = httpRequest(origin + '/api/admin/sites/site/addon-installations', {
        method: 'POST',
        headers: {
          origin,
          'x-zarya-admin': '1',
          'content-type': 'application/json',
          'content-length': 1000000,
        },
      }, (response) => {
        response.resume();
        response.once('end', () => resolve(response.statusCode ?? 0));
      });
      client.on('error', reject);
      client.flushHeaders();
    });

    try {
      expect(await status).toBe(401);
      expect(install.execute).not.toHaveBeenCalled();
      expect(list.execute).not.toHaveBeenCalled();
    } finally {
      client.destroy();
    }
  });
});
