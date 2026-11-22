import { createServer, type Server } from 'node:http';

import { AdminRenderingController } from '../../src/adapters/inbound/rest/rendering/admin-rendering.controller.js';
import type {
  IAdminRenderingOperations,
} from '../../src/adapters/inbound/rest/rendering/admin-rendering-operations.factory.js';
import { paginationParameters, paginationSnippetSource } from '../../src/domain/rendering/pagination-snippet.js';
import { BusinessError, BusinessErrorCode } from '../../src/domain/shared/business-error.js';
import { elementFixture } from '../support/rendering.js';

describe('rendering element REST boundary', () => {
  let server: Server;
  let origin: string;
  const update = vi.fn();

  beforeEach(async () => {
    server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing listener');
    }
    origin = 'http://127.0.0.1:' + address.port;
    update.mockReset().mockResolvedValue(elementFixture());
    const controller = new AdminRenderingController({ origin }, {
      forSession(token): IAdminRenderingOperations {
        if (token !== 'session') {
          throw new BusinessError(BusinessErrorCode.AuthenticationRequired, 'Login required');
        }

        return {
          list: { execute: async () => [elementFixture()] },
          get: { execute: async () => ({ ...elementFixture(), usages: [] }) },
          create: { execute: vi.fn() },
          update: { execute: update },
          preview: { execute: vi.fn() },
          readPreview: { execute: vi.fn() },
          previewMarkdownDraft: { execute: async () => ({ markdown: '# Saved draft' }) },
          inspectJsonLdDraft: { execute: async () => ({ jsonLd: null, warnings: [] }) },
          inspectJsonLdPublished: { execute: async () => ({ jsonLd: null, warnings: [] }) },
          previewMarkdownPublished: { execute: async () => ({ markdown: '# Published' }) },
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
  it('protects the saved draft Markdown preview and marks it private', async () => {
    const url = origin + '/api/admin/sites/site-1/pages/page-1/markdown-preview';

    expect((await fetch(url)).status).toBe(401);
    const response = await fetch(url, {
      headers: {
        Origin: origin, 'X-Zarya-Admin': '1', Cookie: 'zarya_admin_session=session',
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('x-robots-tag')).toContain('noindex');
    expect(await response.json()).toEqual({ markdown: '# Saved draft' });
    const published = await fetch(url.replace('markdown-preview', 'markdown-published'), {
      headers: {
        Origin: origin, 'X-Zarya-Admin': '1', Cookie: 'zarya_admin_session=session',
      },
    });

    expect(published.status).toBe(200);
    expect(await published.json()).toEqual({ markdown: '# Published' });
  });
  it('requires authentication, exact origin and declared fields and forwards scoped updates', async () => {
    const url = origin + '/api/admin/sites/site-1/templates/Home';
    const headers = {
      Origin: origin,
      'X-Zarya-Admin': '1',
      'Content-Type': 'application/json',
      Cookie: 'zarya_admin_session=session',
    };

    expect((await fetch(url)).status).toBe(401);
    const content = {
      name: 'Home', html: '<html></html>', css: '', browserTypeScript: null, parameters: [], expectedVersion: 'v1',
    };

    expect((await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...content, siteId: 'other' }),
    })).status).toBe(400);
    expect((await fetch(url, {
      method: 'POST',
      headers: { ...headers, Origin: 'https://foreign.test' },
      body: JSON.stringify(content),
    })).status).toBe(403);
    expect((await fetch(url, { method: 'POST', headers, body: JSON.stringify(content) })).status).toBe(200);
    expect(update).toHaveBeenCalledExactlyOnceWith({ ...content, siteId: 'site-1', kind: 'Template', key: 'Home' });
    expect((await fetch(url + '?siteId=other', { headers })).status).toBe(400);
    const unknown = { ...content, parameters: [{ name: 'title', kind: 'String', required: false, execute: 'code' }] };

    expect((await fetch(url, { method: 'POST', headers, body: JSON.stringify(unknown) })).status).toBe(400);
  });
  it('accepts Snippet source contracts and refuses compiler or identity fields from the browser', async () => {
    const url = origin + '/api/admin/sites/site-1/snippets/Pagination';
    const headers = {
      Origin: origin,
      'X-Zarya-Admin': '1',
      'Content-Type': 'application/json',
      Cookie: 'zarya_admin_session=session',
    };
    const body = {
      name: 'Pagination',
      html: '',
      css: '',
      browserTypeScript: null,
      parameters: paginationParameters,
      expectedVersion: 'v1',
      snippet: paginationSnippetSource,
    };

    expect((await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })).status).toBe(200);
    expect(update).toHaveBeenCalledWith({ ...body, siteId: 'site-1', kind: 'Snippet', key: 'Pagination' });
    expect((await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...body, snippet: { ...body.snippet, compiledJavaScript: 'untrusted' } }),
    })).status).toBe(400);
    expect((await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...body, siteId: 'foreign' }),
    })).status).toBe(400);
  });
});
