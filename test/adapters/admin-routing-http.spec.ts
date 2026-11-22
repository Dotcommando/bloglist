import { createServer, type Server } from 'node:http';

import { AdminRoutingController } from '../../src/adapters/inbound/rest/routing/admin-routing.controller.js';
import type {
  IAdminRoutingOperations,
} from '../../src/adapters/inbound/rest/routing/admin-routing-operations.factory.js';
import { BusinessError, BusinessErrorCode } from '../../src/domain/shared/business-error.js';
import { urlFixture } from '../support/routing.js';
import { siteFixture } from '../support/sites.js';

describe('authenticated URL and settings HTTP boundary', () => {
  let server: Server;
  let origin: string;
  const change = vi.fn(async () => ({ url: urlFixture(), publication: null, publicationFailed: false }));
  const redirect = vi.fn(async () => ({ url: urlFixture(), publication: null, publicationFailed: false }));
  const materialize = vi.fn(async () => ({ url: urlFixture(), publication: null, publicationFailed: false }));
  const update = vi.fn(async () => siteFixture());
  const search = vi.fn(async () => ({ siteId: 'site-1', items: [] }));

  beforeEach(async () => {
    server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing port');
    }
    origin = 'http://127.0.0.1:' + address.port;
    change.mockClear();
    redirect.mockClear();
    materialize.mockClear();
    update.mockClear();
    search.mockClear();
    const controller = new AdminRoutingController({ origin }, {
      forSession(token): IAdminRoutingOperations {
        if (token !== 'session') {
          throw new BusinessError(BusinessErrorCode.AuthenticationRequired, 'Login required');
        }

        return {
          catalog: { execute: async () => ({ siteId: 'site-1', urls: [], pages: [], published: null }) },
          search: { execute: search },
          history: { execute: async () => [] },
          change: { execute: change },
          publishRouting: { execute: async () => null },
          redirect: { execute: redirect },
          materialize: { execute: materialize },
          getSite: { execute: async () => siteFixture() },
          updateSite: { execute: update },
        };
      },
    });

    server.on('request', (request, response) => {
      void controller.handle(request, response);
    });
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  function headers(): Record<string, string> {
    return {
      Origin: origin,
      'X-Zarya-Admin': '1',
      'Content-Type': 'application/json',
      Cookie:
      'zarya_admin_session=session',
    };
  }
  it('reads and validates a guarded site time zone independently of addresses', async () => {
    const url = origin + '/api/admin/sites/site-1/settings';
    const read = await fetch(url, { headers: headers() });

    expect(await read.json()).toMatchObject({ siteId: 'site-1', timeZone: 'UTC' });
    const body = { timeZone: 'Asia/Nicosia', expectedTimeZone: 'UTC' };

    expect((await fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify(body) })).status).toBe(200);
    expect(update).toHaveBeenCalledWith({ siteId: 'site-1', ...body });
    update.mockClear();

    for (const invalid of [{ ...body, timeZone: 'Invalid/Zone' }, { timeZone: 'UTC' },
      { ...body, actorId: 'forged' }]) {
      const rejected = await fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify(invalid) });

      expect(rejected.status).toBe(400);
    }
    expect(update).not.toHaveBeenCalled();
  });
  it('validates and scopes virtual-folder creation without caller-supplied authority', async () => {
    const url = origin + '/api/admin/sites/site-1/urls/virtual';
    const body = { kind: 'PAGE', path: '/example/', pageId: 'new-page' };

    expect((await fetch(url, {
      method: 'POST',
      headers: { ...headers(), Cookie: '' },
      body: JSON.stringify(body),
    })).status).toBe(401);
    expect((await fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify(body) })).status).toBe(200);
    expect(materialize).toHaveBeenCalledWith({ ...body, siteId: 'site-1' });
    materialize.mockClear();

    for (const invalid of [{ ...body, actorId: 'forged' }, { ...body, siteId: 'foreign' },
      { ...body, kind: 'OTHER' }, { ...body, pageId: '' }]) {
      const rejected = await fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify(invalid) });

      expect(rejected.status).toBe(400);
    }
    expect(materialize).not.toHaveBeenCalled();
  });
  it('accepts declared suggestion queries with limit, offset and authentication', async () => {
    const url = origin + '/api/admin/sites/site-1/urls/suggestions';
    const query = '?currentUrlId=self&purpose=Redirect&q=a%2Bb&limit=10&offset=20';

    expect((await fetch(url + query)).status).toBe(401);
    const response = await fetch(url + query, { headers: headers() });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ siteId: 'site-1', items: [] });
    expect(search).toHaveBeenCalledWith({
      siteId: 'site-1', currentUrlId: 'self', purpose: 'Redirect', query: 'a+b', limit: 10, offset: 20,
    });
    search.mockClear();

    for (const suffix of ['&limit=10', '&actorId=forged', '&unknown=x']) {
      expect((await fetch(url + query + suffix, { headers: headers() })).status).toBe(400);
    }

    for (const invalid of ['limit=11', 'limit=-1', 'limit=0', 'offset=-1', 'offset=1.5', 'purpose=Other']) {
      const params = new URLSearchParams(query.slice(1));
      const [key, value] = invalid.split('=');

      params.set(key!, value!);
      expect((await fetch(url + '?' + params, { headers: headers() })).status).toBe(400);
    }
    expect(search).not.toHaveBeenCalled();
  });
  it('authenticates reads and rejects queries, forged actors and foreign origins', async () => {
    const url = origin + '/api/admin/sites/site-1/urls';

    expect((await fetch(url)).status).toBe(401);
    const response = await fetch(url, { headers: headers() });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await fetch(url + '?siteId=other', { headers: headers() })).status).toBe(400);
    expect((await fetch(url + '/url-old/redirect', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ actorId: 'forged' }),
    })).status).toBe(400);
    expect((await fetch(url + '/url-old/redirect', {
      method: 'POST',
      headers: { ...headers(), Origin: 'https://evil.test' },
      body: '{}',
    })).status).toBe(403);
    expect(redirect).not.toHaveBeenCalled();
  });
  it('translates explicit moves and redirects and accepts only origin settings', async () => {
    const url = origin + '/api/admin/sites/site-1';

    expect((await fetch(url + '/urls/url-old/move', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        pageId: 'page-1',
        path: '/new/',
        parentUrlId: null,
        redirectStatus: 301,
        moveSubtree:
        false,
      }),
    })).status).toBe(200);
    expect(change).toHaveBeenCalledWith(expect.objectContaining({
      siteId: 'site-1',
      expectedUrlId: 'url-old',
      path:
      '/new/',
      moveSubtree: false,
    }));
    expect((await fetch(url + '/urls/url-old/redirect', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ expectedVersion: 'v1', targetUrlId: 'home', redirectStatus: 308 }),
    })).status).toBe(200);
    expect(redirect).toHaveBeenCalledWith({
      siteId: 'site-1',
      urlId: 'url-old',
      expectedVersion: 'v1',
      targetUrlId:
      'home',
      redirectStatus: 308,
    });
    expect((await fetch(url + '/settings', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        addresses: { publicOrigin: 'https://example.test', localOrigin: 'http://localhost:3100' },
        expectedAddresses: { publicOrigin: null, localOrigin: null },
      }),
    })).status).toBe(200);
    expect((await fetch(url + '/settings', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        addresses: { publicOrigin: 'https://user:password@example.test', localOrigin: null },
        expectedAddresses: { publicOrigin: null, localOrigin: null },
      }),
    })).status).toBe(400);
    expect(update).toHaveBeenCalledOnce();
  });
  it('passes the explicit delete action and rejects unsupported old-address choices', async () => {
    const route = origin + '/api/admin/sites/site-1/urls/url-old/move';
    const input = { pageId: 'page-1', path: '/new/', parentUrlId: null, moveSubtree: false, redirectStatus: 301 };

    expect((await fetch(route, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ ...input, oldUrlAction: 'Delete' }),
    })).status).toBe(200);
    expect(change).toHaveBeenCalledWith(expect.objectContaining({ oldUrlAction: 'Delete' }));
    change.mockClear();
    expect((await fetch(route, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ ...input, oldUrlAction: 'Other' }),
    })).status).toBe(400);
    expect(change).not.toHaveBeenCalled();
  });
  it('reports an acknowledged move with pending publication without claiming public success', async () => {
    change.mockResolvedValueOnce({ url: urlFixture(), publication: null, publicationFailed: true });
    const response = await fetch(origin + '/api/admin/sites/site-1/urls/url-old/move', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        pageId: 'page-1',
        path: '/new/',
        parentUrlId: null,
        moveSubtree: false,
        redirectStatus: 301,
      }),
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ publication: null, publicationFailed: true });
    expect(change).toHaveBeenCalledOnce();
  });
  it('returns an acknowledged redirect with pending publication as 202 for apply-only recovery', async () => {
    redirect.mockResolvedValueOnce({ url: urlFixture(), publication: null, publicationFailed: true });
    const response = await fetch(origin + '/api/admin/sites/site-1/urls/url-old/redirect', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ expectedVersion: 'v1', targetUrlId: 'home', redirectStatus: 301 }),
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      url: { urlId: 'url-old' }, publication: null, publicationFailed: true,
    });
    expect(redirect).toHaveBeenCalledOnce();
  });
});
