import {
  GetPublicationOptionsUseCase,
} from '../../../src/app/use-cases/publication/get-publication-options.use-case.js';
import { PublishedRouteKind } from '../../../src/domain/publication/published-route.js';
import type { IPublishedRouting } from '../../../src/domain/publication/published-routing.js';
import type { IGetPageEditorialStates } from '../../../src/ports/inbound/pages/get-page-editorial-states.port.js';
import type { IPublishedRoutingPort } from '../../../src/ports/outbound/publication/published-routing.port.js';
import { pageFixture } from '../../support/pages.js';
import { source } from '../../support/publication.js';
import { urlFixture } from '../../support/routing.js';
import { siteFixture } from '../../support/sites.js';

const editorial = {
  execute: async () => ({
    releaseId: null,
    pages: [],
    publishedPage: null,
    robotsHasUnpublishedChanges: false,
  }),
};

function editorialFor(published: IPublishedRoutingPort): IGetPageEditorialStates {
  return {
    execute: async () => ({
      ...await editorial.execute(),
      releaseId: (await published.readActive('site-1'))?.releaseId ?? null,
    }),
  };
}

describe('GetPublicationOptions', () => {
  it('distinguishes retained page versions from assigned URLs and active public routes', async () => {
    const published = {
      readActive: vi.fn(async (): Promise<IPublishedRouting> => ({
        releaseId: 'active',
        sitemapPaths: null,
        routes: [{
          kind: PublishedRouteKind.Redirect,
          urlId: 'url-old',
          path: '/old/',
          targetUrlId: 'target',
          targetPath: '/target/',
          status: 301,
        }],
      })),
    };
    const operation = new GetPublicationOptionsUseCase({ execute: async () => siteFixture() },
      { execute: async () => pageFixture() }, { read: async () => source('Template') },
      { readUrls: async () => [] }, published, editorialFor(published));

    expect(await operation.execute({ siteId: 'site-1', pageId: 'page-1' })).toMatchObject({
      path: null, pageAvailability: [{ pageId: 'page-1', assignedPath: null, publicPath: null }],
    });
  });
  it('reports working and public paths separately and rejects foreign routing before reading publication', async () => {
    const published = {
      readActive: vi.fn(async (): Promise<IPublishedRouting | null> => ({
        releaseId: 'active',
        sitemapPaths: null,
        routes: [{
          kind: PublishedRouteKind.Static,
          urlId: 'old',
          pageId: 'page-1',
          path: '/old/',
          documentPath: 'old/index.html',
        }],
      })),
    };
    const routing = { readUrls: vi.fn(async () => [urlFixture({ path: '/new/' }).toState()]) };
    const operation = new GetPublicationOptionsUseCase({ execute: async () => siteFixture() },
      { execute: async () => pageFixture() }, { read: async () => source('Template') }, routing, published,
      editorialFor(published));

    expect((await operation.execute({ siteId: 'site-1' })).pageAvailability).toEqual([
      { pageId: 'page-1', assignedPath: '/new/', publicPath: '/old/' },
    ]);
    routing.readUrls.mockResolvedValueOnce([]);
    expect((await operation.execute({ siteId: 'site-1' })).pageAvailability).toEqual([
      { pageId: 'page-1', assignedPath: null, publicPath: '/old/' },
    ]);
    published.readActive.mockResolvedValue(null);
    expect((await operation.execute({ siteId: 'site-1' })).pageAvailability).toEqual([
      { pageId: 'page-1', assignedPath: '/new/', publicPath: null },
    ]);
    published.readActive.mockClear();
    routing.readUrls.mockResolvedValueOnce([urlFixture({ siteId: 'foreign' }).toState()]);
    await expect(operation.execute({ siteId: 'site-1' })).rejects.toThrow('Foreign page routing');
    expect(published.readActive).not.toHaveBeenCalled();
  });
  it('returns configured document templates without exposing chunks or source code', async () => {
    const operation = new GetPublicationOptionsUseCase({ execute: async () => siteFixture() },
      { execute: async () => pageFixture() }, { read: async () => source('Private template source') },
      { readUrls: async () => [] }, { readActive: async () => null }, editorial);

    expect(await operation.execute({ siteId: 'site-1' })).toEqual({
      editorial: await editorial.execute(),
      requestCache: null,
      requestDelivery: false,
      mimeTypes: expect.arrayContaining(['text/html', 'text/plain', 'application/xml']),
      crawlerDiagnostics: [],
      generatedContent: null,
      templates: [{ templateId: 'Home', name: 'Home', requiresParameters: false }],
      templateId: null,
      path: null,
      pageAvailability: [],
    });
  });
  it('checks owned site/page access before reading source files', async () => {
    const read = vi.fn();
    const operation = new GetPublicationOptionsUseCase({ execute: async () => null },
      { execute: async () => pageFixture() }, { read }, { readUrls: async () => [] },
      { readActive: async () => null }, editorial);

    await expect(operation.execute({ siteId: 'site-1' })).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });
});
