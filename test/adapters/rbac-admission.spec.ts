import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

import { AdminRequestGate } from '../../src/adapters/inbound/rest/shared/admin-request-gate.js';
import type { IAdminAuthorization } from '../../src/domain/authorization/admin-authorization.js';
import type { IGetCurrentAdminUser } from '../../src/ports/inbound/admin-auth/get-current-admin-user.port.js';
import { account } from '../support/admin-users.js';

async function admit(path: string, method: string, authorization: IAdminAuthorization,
  hasLegacyHandler?: (pathname: string) => boolean): Promise<boolean> {
  const time = new Date();
  const current: IGetCurrentAdminUser = {
    execute: async () => ({
      user: { ...account().profile(), authorization },
      session: {
        sessionId: 'session',
        createdAt: time,
        lastSeenAt: time,
        expiresAt: time,
        clientAddress: null,
        userAgent: null,
        current: true,
      },
    }),
  };
  const socket = new Socket();
  const request = new IncomingMessage(socket);

  request.url = path;
  request.method = method;
  const headers: Record<string, string> = method === 'GET' ? { host: 'admin.example.test' } : {
    host: 'admin.example.test', origin: 'https://admin.example.test', 'x-zarya-admin': '1',
  };

  request.headers = headers;
  request.rawHeaders = Object.entries(headers).flat();

  try {
    return await new AdminRequestGate({ origin: 'https://admin.example.test' }, current)
      .allow(request, new ServerResponse(request), hasLegacyHandler);
  } finally {
    socket.destroy();
  }
}

describe('endpoint role admission', () => {
  it('keeps SiteAdmin on the assigned site and allows site General', async () => {
    const siteAdmin = {
      systemAdmin: false,
      siteIds: ['one'],
      siteAdminSiteIds: ['one'],
      siteAdminActionIds: ['cms.site-settings.read', 'cms.pages.list', 'cms.sites.list'],
    };

    await expect(admit('/api/admin/sites/one/settings', 'GET', siteAdmin)).resolves.toBe(true);
    await expect(admit('/api/admin/sites/one/settings', 'POST', siteAdmin)).resolves.toBe(false);
    await expect(admit('/api/admin/sites', 'GET', siteAdmin)).resolves.toBe(true);
    await expect(admit('/api/admin/sites', 'GET', { ...siteAdmin, siteAdminActionIds: [] })).resolves.toBe(false);
    await expect(admit('/api/admin/sites/two/pages', 'GET', siteAdmin)).resolves.toBe(false);
    await expect(admit('/api/admin/installation/settings', 'GET', siteAdmin)).resolves.toBe(false);
    await expect(admit('/api/admin/sites/one/addon-installations', 'GET', siteAdmin)).resolves.toBe(false);
  });

  it('gives Manager only account and site discovery by default', async () => {
    const manager = { systemAdmin: false, siteIds: ['one'], siteAdminSiteIds: [] };

    await expect(admit('/api/admin/auth/me', 'GET', manager)).resolves.toBe(true);
    await expect(admit('/api/admin/sites', 'GET', manager)).resolves.toBe(true);
    await expect(admit('/api/admin/sites/one/pages', 'GET', manager)).resolves.toBe(false);
  });

  it('gives SystemAdmin installation authority without per-site assignments', async () => {
    const systemAdmin = {
      systemAdmin: true,
      siteIds: [],
      siteAdminSiteIds: [],
      systemActionIds: ['cms.installation-settings.read', 'cms.pages.list'],
    };

    await expect(admit('/api/admin/installation/settings', 'GET', systemAdmin)).resolves.toBe(true);
    await expect(admit('/api/admin/sites/new-site/pages', 'GET', systemAdmin)).resolves.toBe(true);
    await expect(admit('/api/admin/installation/settings', 'POST', systemAdmin)).resolves.toBe(false);
    await expect(admit('/api/admin/sites/new-site/unregistered', 'GET', systemAdmin)).resolves.toBe(false);
  });

  it('preserves public and SystemAdmin admission for installed add-ons without declarations', async () => {
    const systemAdmin = {
      systemAdmin: true,
      siteIds: [],
      siteAdminSiteIds: [],
      systemActionIds: ['cms.addons.dispatch-legacy-admin'],
    };
    const siteAdmin = { systemAdmin: false, siteIds: ['one'], siteAdminSiteIds: ['one'] };
    const routes = ['/api/admin/sites/one/sessions', '/api/admin/sites/one/bloglist/bloggers'];
    const hasHandler = (pathname: string): boolean => routes.includes(pathname);

    await expect(admit('/api/sessions', 'GET', siteAdmin, hasHandler)).resolves.toBe(true);

    for (const route of routes) {
      await expect(admit(route, 'GET', systemAdmin, hasHandler)).resolves.toBe(true);
      await expect(admit(route, 'GET', siteAdmin, hasHandler)).resolves.toBe(false);
      await expect(admit(route, 'GET', systemAdmin)).resolves.toBe(false);
    }
    await expect(admit('/api/admin/sites/one/settings', 'POST', systemAdmin, () => true)).resolves.toBe(false);
  });

  it('uses the action and site named by an explicit Manager grant', async () => {
    const manager: IAdminAuthorization = {
      systemAdmin: false,
      siteIds: ['one', 'two'],
      siteAdminSiteIds: [],
      siteGrants: [{
        siteId: 'one',
        actionIds: ['cms.pages.list'],
        objectScopes: { 'cms.pages.list': ['all'] },
        groupIds: [],
      }],
    };

    await expect(admit('/api/admin/sites/one/pages', 'GET', manager)).resolves.toBe(true);
    await expect(admit('/api/admin/sites/two/pages', 'GET', manager)).resolves.toBe(false);
    await expect(admit('/api/admin/sites/one/pages/example', 'GET', manager)).resolves.toBe(false);
    await expect(admit('/api/admin/sites/one/access', 'GET', manager)).resolves.toBe(false);
  });
});
