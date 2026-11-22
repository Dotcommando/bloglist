import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

import {
  parsePublicTarget,
  PublicDocumentController,
} from '../../src/adapters/inbound/documents/http/publication/public-document.controller.js';
import { DocumentRepresentation } from '../../src/domain/publication/published-document.js';
import {
  type PublishedResolution,
  PublishedResolutionKind,
} from '../../src/domain/publication/published-resolution.js';
import { siteFixture } from '../support/sites.js';

describe('public HTTP translation', () => {
  it('normalizes the hostname and query data while rejecting unsafe document paths', () => {
    expect(parsePublicTarget('/games/?date=2026-10-25', 'EXAMPLE.TEST:3000')).toEqual({
      hostname: 'example.test', authority: 'example.test:3000', path: '/games/', query: { date: '2026-10-25' },
    });

    for (const target of ['/assets/%2e%2e/private', '/%5cprivate', '/%00', '/%3Fprivate']) {
      expect(() => parsePublicTarget(target, 'example.test')).toThrow();
    }
    expect(() => parsePublicTarget('/', 'user@example.test')).toThrow();
  });
  it.each([
    {
      name: 'admin cookies',
      cookie: 'zarya_admin_session=test; zarya_admin_site=site; zarya_admin_ui_session=test',
      authorized: false,
    },
    { name: 'unrelated cookies', cookie: 'analytics=visitor; language=ru; future_cookie=value', authorized: false },
    { name: 'empty cookie', cookie: '', authorized: false },
    { name: 'authorization with cookies', cookie: 'analytics=visitor', authorized: true },
  ])('preserves public cache eligibility with $name', async ({ cookie, authorized }) => {
    const socket = new Socket();
    const request = new IncomingMessage(socket);

    request.url = '/page?category=public';
    request.method = 'GET';
    request.headers.host = 'example.test';
    request.headers.cookie = cookie;

    if (authorized) {
      request.headers.authorization = 'Bearer test';
    }

    const response = new ServerResponse(request);

    vi.spyOn(response, 'end').mockImplementation(() => response);
    const render = vi.fn(async () => ({
      releaseId: 'release-1', pageId: 'page-1', html: '<p>Public</p>', inlineStyleHashes: [],
    }));
    const controller = new PublicDocumentController({ execute: async () => siteFixture() }, {
      execute: async () => ({
        kind: PublishedResolutionKind.RequestPlan,
        releaseId: 'release-1',
        renderPlanId: 'page-1',
        robotsIndex: true,
      }),
    }, { execute: render }, { execute: vi.fn() });

    try {
      await controller.handle(request, response);
      expect(response.statusCode).toBe(200);
      expect(render).toHaveBeenCalledWith({
        siteId: siteFixture().siteId,
        releaseId: 'release-1',
        renderPlanId: 'page-1',
        path: '/page',
        requestValues: { category: 'public' },
        sharedCacheAllowed: !authorized,
        signal: expect.any(AbortSignal),
      });
    } finally {
      socket.destroy();
    }
  });
  it('negotiates Markdown for a Request page without losing release identity', async () => {
    const socket = new Socket();
    const request = new IncomingMessage(socket);

    request.url = '/page';
    request.method = 'GET';
    request.headers.host = 'example.test';
    request.headers.accept = 'text/markdown';
    const response = new ServerResponse(request);
    const end = vi.spyOn(response, 'end').mockImplementation(() => response);
    const render = vi.fn(async () => ({
      releaseId: 'release-1',
      pageId: 'page-1',
      html: '<h1>Title</h1>',
      inlineStyleHashes: [],
      markdown: '# Title',
    }));
    const controller = new PublicDocumentController({ execute: async () => siteFixture() }, {
      execute: async () => ({
        kind: PublishedResolutionKind.RequestPlan,
        releaseId: 'release-1',
        renderPlanId: 'page-1',
        robotsIndex: true,
      }),
    }, { execute: render }, { execute: vi.fn() });

    try {
      await controller.handle(request, response);
      expect(render).toHaveBeenCalledWith(expect.objectContaining({
        releaseId: 'release-1', representation: DocumentRepresentation.Markdown,
      }));
      expect(response.getHeader('Content-Type')).toBe('text/markdown; charset=utf-8');
      expect(response.getHeader('Vary')).toBe('Accept');
      expect(response.getHeader('Cache-Control')).toBe('no-store');
      expect(end).toHaveBeenCalledWith('# Title');
    } finally {
      socket.destroy();
    }
  });
  it('selects the release-pinned static Markdown artifact for HEAD', async () => {
    const socket = new Socket();
    const request = new IncomingMessage(socket);

    request.url = '/page';
    request.method = 'HEAD';
    request.headers.host = 'example.test';
    request.headers.accept = 'text/markdown';
    const response = new ServerResponse(request);
    const end = vi.spyOn(response, 'end').mockImplementation(() => response);
    const get = vi.fn(async () => ({
      siteId: 'site-1',
      releaseId: 'release-1',
      metadata: {
        path: 'representations/page.md', mimeType: 'text/markdown', byteSize: 7, checksum: 'mdhash', public: true,
      },
      content: { mimeType: 'text/markdown', byteSize: 7, bytes: (async function* () {})() },
      inlineStyleHashes: [],
    }));
    const controller = new PublicDocumentController({ execute: async () => siteFixture() }, {
      execute: async () => ({
        kind: PublishedResolutionKind.StoredDocument,
        releaseId: 'release-1',
        documentPath: 'page/index.html',
        markdownPath: 'representations/page.md',
      }),
    }, { execute: vi.fn() }, { execute: get });

    try {
      await controller.handle(request, response);
      expect(get).toHaveBeenCalledWith(expect.objectContaining({
        releaseId: 'release-1', path: 'representations/page.md', metadataOnly: true,
      }));
      expect(response.getHeader('Content-Type')).toBe('text/markdown; charset=utf-8');
      expect(response.getHeader('Vary')).toBe('Accept');
      expect(response.getHeader('ETag')).toBe('"mdhash"');
      expect(end).toHaveBeenCalledWith();
    } finally {
      socket.destroy();
    }
  });
  it('maps HEAD, redirects and method rejection through read-only operations', async () => {
    const socket = new Socket();
    const request = new IncomingMessage(socket);

    request.url = '/';
    request.method = 'HEAD';
    request.headers.host = 'example.test';
    const response = new ServerResponse(request);
    const end = vi.spyOn(response, 'end').mockImplementation(() => response);
    const resolve = vi.fn(async (): Promise<PublishedResolution> => ({
      kind: PublishedResolutionKind.Redirect,
      releaseId: 'r',
      status: 308,
      targetPath: '/new/',
    }));
    const controller = new PublicDocumentController({ execute: async () => siteFixture() },
      { execute: resolve }, { execute: vi.fn() }, { execute: vi.fn() });

    try {
      await controller.handle(request, response);
      expect(response.statusCode).toBe(308);
      expect(response.getHeader('Location')).toBe('/new/');
      expect(end).toHaveBeenCalledWith();
      request.method = 'POST';
      await controller.handle(request, response);
      expect(response.statusCode).toBe(405);
      expect(resolve).toHaveBeenCalledOnce();
    } finally {
      socket.destroy();
    }
  });
});
