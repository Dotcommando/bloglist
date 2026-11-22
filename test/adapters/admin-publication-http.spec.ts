import { createServer, type Server } from 'node:http';

import {
  AdminPublicationController,
} from '../../src/adapters/inbound/rest/publication/admin-publication.controller.js';
import type {
  IAdminPublicationOperations,
} from '../../src/adapters/inbound/rest/publication/admin-publication-operations.factory.js';
import { TemplateSourceKind } from '../../src/domain/publication/render-plan.js';
import {
  TemplateValidationError, TemplateValidationIssue,
} from '../../src/domain/publication/template-validation.error.js';
import { BusinessError, BusinessErrorCode } from '../../src/domain/shared/business-error.js';
import { pageFixture } from '../support/pages.js';
import { instant } from '../support/sites.js';

describe('session-bound publication HTTP boundary', () => {
  let server: Server;
  let origin: string;
  const publish = vi.fn();

  beforeEach(async () => {
    server = createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing address');
    }
    origin = 'http://127.0.0.1:' + address.port;
    publish.mockReset().mockResolvedValue({
      page: pageFixture(), publication: { siteId: 'site-1', releaseId: 'release', activatedAt: instant },
    });
    const controller = new AdminPublicationController({ origin }, {
      forSession(token): IAdminPublicationOperations {
        if (token !== 'session') {
          throw new BusinessError(BusinessErrorCode.AuthenticationRequired, 'Authentication required');
        }

        return {
          getOptions: { execute: async () => ({ templates: [], templateId: null, path: null, pageAvailability: [] }) },
          publishPage: { execute: publish },
          publishSite: { execute: vi.fn() },
        };
      },
    });

    server.on('request', (request, response) => {
      void controller.handle(request, response);
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
  it('requires the session, same origin and declared publication fields', async () => {
    const route = origin + '/api/admin/sites/site-1/pages/page-1/publication';
    const headers = { Origin: origin, 'X-Zarya-Admin': '1', 'Content-Type': 'application/json' };

    expect((await fetch(route, { method: 'POST', headers, body: '{}' })).status).toBe(401);
    const trusted = { ...headers, Cookie: 'zarya_admin_session=session' };

    expect((await fetch(route, { method: 'POST', headers: trusted, body: '{"actorId":"owner"}' })).status).toBe(400);
    expect((await fetch(route, {
      method: 'POST',
      headers: { ...trusted, Origin: 'https://foreign.test' },
      body: '{}',
    })).status)
      .toBe(403);
    expect((await fetch(route, {
      method: 'POST',
      headers: trusted,
      body: '{"templateId":"ZaryaBasic","path":"/"}',
    })).status)
      .toBe(200);
    expect(publish).toHaveBeenCalledExactlyOnceWith({
      siteId: 'site-1',
      pageId: 'page-1',
      templateId: 'ZaryaBasic',
      path: '/',
    });
  });
  it('returns a structured source diagnostic without exposing raw source values or private errors', async () => {
    const diagnostic = {
      issue: TemplateValidationIssue.UnknownChunkParameter,
      source: { kind: TemplateSourceKind.Chunk, key: '1' },
      parameter: 'title',
    };

    publish.mockRejectedValueOnce(new TemplateValidationError(diagnostic));
    const result = await fetch(origin + '/api/admin/sites/site-1/pages/page-1/publication', {
      method: 'POST',
      headers: {
        Origin: origin, 'X-Zarya-Admin': '1', 'Content-Type': 'application/json', Cookie: 'zarya_admin_session=session',
      },
      body: '{}',
    });

    expect(result.status).toBe(400);
    expect(await result.json()).toEqual({ error: 'Validation', diagnostic });
    publish.mockRejectedValueOnce(new Error('private source value and database connection details'));
    const unexpected = await fetch(origin + '/api/admin/sites/site-1/pages/page-1/publication', {
      method: 'POST',
      headers: {
        Origin: origin, 'X-Zarya-Admin': '1', 'Content-Type': 'application/json', Cookie: 'zarya_admin_session=session',
      },
      body: '{}',
    });

    expect(unexpected.status).toBe(500);
    expect(await unexpected.json()).toEqual({ error: 'InternalError' });
  });
});
