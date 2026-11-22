import { createServer, type Server } from 'node:http';

import { AdminContentController } from '../../src/adapters/inbound/rest/content/admin-content.controller.js';
import type {
  IAdminContentOperations,
} from '../../src/adapters/inbound/rest/content/admin-content-operations.factory.js';
import { AdminRequestGate } from '../../src/adapters/inbound/rest/shared/admin-request-gate.js';
import {
  SessionContentAccessAdapter,
} from '../../src/adapters/outbound/access/admin-users/content/session-content-access.adapter.js';
import { PageSiteLookupAdapter } from '../../src/adapters/outbound/capabilities/sites/page-site-lookup.adapter.js';
import { AdminAuthContextService } from '../../src/app/services/admin-auth/admin-auth-context.service.js';
import { GetCurrentAdminUserUseCase } from '../../src/app/use-cases/admin-auth/get-current-admin-user.use-case.js';
import { LoginAdminUserUseCase } from '../../src/app/use-cases/admin-auth/login-admin-user.use-case.js';
import { CreatePageUseCase } from '../../src/app/use-cases/pages/create-page.use-case.js';
import { GetPageUseCase } from '../../src/app/use-cases/pages/get-page.use-case.js';
import { ListPagesUseCase } from '../../src/app/use-cases/pages/list-pages.use-case.js';
import { MovePageUseCase } from '../../src/app/use-cases/pages/move-page.use-case.js';
import {
  RewritePageMediaReferencesUseCase,
} from '../../src/app/use-cases/pages/rewrite-page-media-references.use-case.js';
import { UpdatePageUseCase } from '../../src/app/use-cases/pages/update-page.use-case.js';
import { CreateSiteUseCase } from '../../src/app/use-cases/sites/create-site.use-case.js';
import { GetSiteUseCase } from '../../src/app/use-cases/sites/get-site.use-case.js';
import { ListSitesUseCase } from '../../src/app/use-cases/sites/list-sites.use-case.js';
import type { ICurrentAdminUser } from '../../src/domain/admin-auth/admin-auth-session.js';
import type { ObjectScope } from '../../src/domain/authorization/content-access.js';
import { Page } from '../../src/domain/pages/page.js';
import { SiteOriginMode } from '../../src/domain/sites/site-origin-mode.enum.js';
import { authFixture, loginInput } from '../support/admin-auth.js';
import { fakeSiteSetup } from '../support/hooks.js';
import { fakeHookChanges } from '../support/hooks.js';
import { FakePageRepository, pageFixture } from '../support/pages.js';
import { FakeSiteRepository, instant, siteFixture } from '../support/sites.js';

describe('administration content REST translation', () => {
  let server: Server;
  let base: string;
  let token: string;
  let pages: FakePageRepository;
  let sites: FakeSiteRepository;
  let pageReadScopes: readonly ObjectScope[];

  beforeEach(async () => {
    const f = authFixture();
    const current = new GetCurrentAdminUserUseCase(f.work, new AdminAuthContextService(f.secrets), f.values);

    token = (await new LoginAdminUserUseCase(f.work, f.passwords, f.secrets, f.values).execute(loginInput)).token;
    sites = new FakeSiteRepository();

    sites.records.set('site-1', siteFixture());
    pages = new FakePageRepository();
    pages.records.set('page-1', pageFixture());
    server = createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing port');
    }
    base = 'http://127.0.0.1:' + address.port;
    const controller = new AdminContentController({ origin: base }, {
      forSession(value): IAdminContentOperations {
        const access = new SessionContentAccessAdapter(current, value);
        const getSite = new GetSiteUseCase(sites, access);
        const getPage = new GetPageUseCase(pages, access);

        return {
          listSites: new ListSitesUseCase(sites, access),
          getSite,
          createSite: new CreateSiteUseCase(sites, {
            nextSiteId: () => 'site-2', currentInstant: () => instant,
          }, access, undefined, fakeHookChanges, fakeSiteSetup),
          listPages: new ListPagesUseCase(pages, access),
          getPage: {
            execute: (input): Promise<Page | null> => input.authority?.scopes.includes('own')
              ? Promise.resolve(null) : getPage.execute(input),
          },
          createPage: new CreatePageUseCase(pages, new PageSiteLookupAdapter(getSite), {
            nextPageId: () => 'page-2', currentInstant: () => instant,
          }, access, fakeHookChanges),
          rewritePageMedia: new RewritePageMediaReferencesUseCase(pages, access, getSite, fakeHookChanges),
          updatePage: new UpdatePageUseCase(pages, access, fakeHookChanges),
          movePage: new MovePageUseCase(pages, access, {
            move: async (expected, parentPageId) => {
              const moved = new Page({ ...expected, parentPageId });

              pages.records.set(moved.pageId, moved);

              return moved;
            },
          }, fakeHookChanges),
        };
      },
    });

    pageReadScopes = ['all'];
    const gate = new AdminRequestGate({ origin: base }, {
      async execute(input): Promise<ICurrentAdminUser> {
        const session = await current.execute(input);

        return {
          ...session,
          user: {
            ...session.user,
            authorization: {
              systemAdmin: false,
              siteIds: ['site-1'],
              siteAdminSiteIds: [],
              siteGrants: [{
                siteId: 'site-1',
                actionIds: ['cms.pages.update', ...(pageReadScopes.length ? ['cms.pages.read'] : [])],
                objectScopes: { 'cms.pages.update': ['all'], 'cms.pages.read': pageReadScopes },
                groupIds: ['writers'],
              }],
            },
          },
        };
      },
    });

    server.on('request', async (request, response) => {
      if (
        request.method === 'POST'
        && request.url === '/api/admin/sites/site-1/pages/page-1'
        && !await gate.allow(request, response)
      ) {
        return;
      }
      await controller.handle(request, response);
    });
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });
  async function request(route = '', body?: unknown, authenticated = true, origin = base): Promise<Response> {
    return fetch(base + '/api/admin/sites' + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Origin: origin,
        'X-Zarya-Admin': '1',
        'Content-Type': 'application/json',
        ...(authenticated ? { Cookie: 'zarya_admin_session=' + token } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  it('identifies the occupied local address without exposing the owning site', async () => {
    sites.records.get('site-1')!.changeAddresses({
      publicOrigin: 'https://example.test',
      localOrigin: 'http://localhost:3000',
      originMode: SiteOriginMode.Local,
    });
    const response = await request('', {
      mark: 'Other',
      name: 'Other site',
      primaryDomain: 'other.test',
      languages: ['en'],
      defaultLanguage: 'en',
      onboarding: { localAddress: 'http://LOCALHOST:3000/', originMode: 'Local' },
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Conflict', field: 'onboarding.localAddress' });
    expect(sites.records.size).toBe(1);
  });
  it('accepts onboarding only with an explicit serving choice and a development port', async () => {
    const body = {
      mark: 'FutureSite',
      name: 'Future site',
      primaryDomain: 'future.test',
      languages: ['en'],
      defaultLanguage: 'en',
    };

    for (const onboarding of [null, { localAddress: 'localhost:3100' },
      { localAddress: 'localhost:3100', originMode: 'Unknown' },
      { localAddress: 'localhost', originMode: 'Local' },
      { localAddress: 'localhost:3100', originMode: 'Local', siteId: 'foreign' }]) {
      expect((await request('', { ...body, onboarding })).status).toBe(400);
    }
    const response = await request('', {
      ...body,
      onboarding: {
        localAddress: 'localhost:3100', originMode: 'Local',
      },
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      primaryDomain: 'future.test',
      addresses: {
        publicOrigin: 'https://future.test', localOrigin: 'http://localhost:3100', originMode: 'Local',
      },
    });
  });
  it('requires authentication and trusted origin and rejects ownership injection', async () => {
    expect((await request('', undefined, false)).status).toBe(401);
    expect((await request('/site-1/pages', undefined, false)).status).toBe(401);
    const body = { mark: 'Other', language: 'en', title: 'Other', contentMd: '' };

    expect((await request('/site-1/pages', body, true, 'https://foreign.test')).status).toBe(403);
    expect((await request('/site-1/pages', { ...body, siteId: 'other' })).status).toBe(400);
    expect((await request('?limit=1')).status).toBe(400);
    expect(pages.records.size).toBe(1);
  });
  it('projects site-scoped lists, saves drafts and hides foreign-page identities', async () => {
    expect(await (await request('')).json()).toMatchObject({ items: [{ siteId: 'site-1' }] });
    const listed: unknown = await (await request('/site-1/pages')).json();

    expect(listed).toMatchObject({ items: [{ pageId: 'page-1', siteId: 'site-1' }] });
    expect(JSON.stringify(listed)).not.toContain('contentMd');
    expect((await request('/other/pages/page-1')).status).toBe(404);
    const updated = await request('/site-1/pages/page-1', { title: 'Updated', contentMd: 'Draft' });

    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ title: 'Updated', contentMd: 'Draft', status: 'DRAFT' });
    expect((await request('/other/pages/page-1', { title: 'Foreign', contentMd: '' })).status).toBe(404);
    expect(pages.records.get('page-1')?.title).toBe('Updated');
  });
  it.each([
    { name: 'no read grant', scopes: [], canRead: false },
    { name: 'another owner', scopes: ['own'], canRead: false },
    { name: 'the page group', scopes: ['groups'], canRead: true },
  ] satisfies { name: string; scopes: ObjectScope[]; canRead: boolean }[])(
    'projects an update response with $name',
    async ({ scopes, canRead }) => {
      pageReadScopes = scopes;
      pages.records.set('page-1', new Page({
        ...pageFixture().toState(), metaDescription: 'Private draft',
      }));
      const response = await request('/site-1/pages/page-1', { title: 'Updated title', contentMd: 'New text' });

      expect(response.status).toBe(200);

      if (canRead) {
        expect(await response.json()).toMatchObject({ title: 'Updated title', metaDescription: 'Private draft' });
      } else {
        expect(await response.json()).toEqual({ saved: true });
      }
      expect(pages.records.get('page-1')?.title).toBe('Updated title');
    },
  );
  it('moves through an authenticated scoped position endpoint and rejects number or cycle injection', async () => {
    pages.records.set('folder', pageFixture('folder', 'site-1', 'Folder'));
    const body = { parentPageId: 'folder', expectedParentPageId: null, expectedSortOrder: 100 };
    const route = '/site-1/pages/page-1/position';

    expect((await request(route, body, false)).status).toBe(401);
    expect((await request(route, { ...body, pageNumber: '12' })).status).toBe(400);
    expect((await request(route, { ...body, parentPageId: 'page-1' })).status).toBe(400);
    expect((await request('/other/pages/page-1/position', body)).status).toBe(404);
    const moved = await request(route, body);

    expect(moved.status).toBe(200);
    expect(await moved.json()).toMatchObject({ pageId: 'page-1', parentPageId: 'folder', sortOrder: 100 });
    expect((await request(route, body)).status).toBe(409);
    expect((await request('/site-1/pages/page-1', { pageNumber: '9' })).status).toBe(400);
    expect((await request('/site-1/pages/page-1', { title: 'Home', contentMd: '', sortOrder: 25 })).status).toBe(200);
    expect(pages.records.get('page-1')?.sortOrder).toBe(25);
  });

  it('accepts page content beyond auth-body size but rejects actual byte overflow and malformed domain', async () => {
    expect((await request('/site-1/pages', {
      mark: 'Large', language: 'en', title: 'Large', contentMd: 'x'.repeat(9000),
    })).status).toBe(201);
    expect((await request('/site-1/pages', {
      mark: 'Overflow', language: 'en', title: 'Overflow', contentMd: 'x'.repeat(1024 * 1024),
    })).status).toBe(413);
    expect((await request('', {
      mark: 'New', name: 'New', primaryDomain: 'https://invalid.test/path', languages: ['en'], defaultLanguage: 'en',
    })).status).toBe(400);
  });
});
