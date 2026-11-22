import { artifact } from '../../../src/adapters/outbound/rendering/vite/artifacts.js';
import { PublishSiteReleaseUseCase } from '../../../src/app/use-cases/publication/publish-site-release.use-case.js';
import { PageStatus } from '../../../src/domain/pages/page-status.enum.js';
import { PublishedRouteKind } from '../../../src/domain/publication/published-route.js';
import { UrlKind } from '../../../src/domain/routing/url-kind.enum.js';
import { fakeHookChanges } from '../../support/hooks.js';
import { FakePublicationStore, FakeReleaseActivation, source } from '../../support/publication.js';
import { instant } from '../../support/sites.js';

it('retains prepared public image, responsive outputs, alt and teaser in the full publication catalog', async () => {
  const snapshot = source('catalog');
  const page = {
    ...snapshot.pages[0]!,
    status: PageStatus.PUBLISHED,
    tvValues: { image: { assetId: 'public-image' }, teaser: 'Published teaser' },
  };
  const prepared = {
    image: {
      src: '/assets/images/card.webp',
      srcset: 'card.webp 320w',
      alt: 'Published alt',
      width: 320,
      height: 200,
    },
    teaser: 'Published teaser',
  };
  const file = artifact('index.html', 'text/html', '<html></html>');
  const store = new FakePublicationStore();
  const operation = new PublishSiteReleaseUseCase({ assertEditor: async () => {} }, {
    capture: async () => ({
      ...snapshot,
      pages: [page],
      templateValues: { [page.pageId]: prepared },
      urls: [{
        urlId: 'home',
        siteId: page.siteId,
        pageId: page.pageId,
        mark: 'Home',
        parentUrlId: null,
        segment: '/',
        path: '/',
        kind: UrlKind.PAGE,
        redirectTargetUrlId: null,
        redirectStatus: null,
        firstPublishedAt: instant,
        createdAt: instant,
        updatedAt: instant,
      }],
    }),
  }, {
    prepare: async () => ({
      planId: 'p',
      siteId: page.siteId,
      pageId: page.pageId,
      page,
      settings: {},
      requestParameters: [],
      buildValues: {},
      templates: [],
      rendering: page.rendering!,
      loaders: [],
      frontendSourceIds: [],
    }),
    compose: vi.fn(),
  }, {
    render: async () => ({ pageId: page.pageId, html: '', frontendSourceIds: [] }),
  }, {
    build: async () => ({
      artifacts: [file],
      manifest: {
        routes: [{
          kind: PublishedRouteKind.Static,
          urlId: 'home',
          path: '/',
          pageId: page.pageId,
          documentPath: file.path,
        }],
        artifacts: [{
          path: file.path,
          mimeType: file.mimeType,
          byteSize: file.byteSize,
          checksum: file.checksum,
          public: file.public,
        }],
      },
    }),
  }, store,
  new FakeReleaseActivation(), { nextReleaseId: () => 'full', now: () => instant }, fakeHookChanges);

  await operation.execute({ siteId: page.siteId, actorId: 'owner', expectedActiveReleaseId: null });
  expect(store.records.get('full')?.manifest?.publishedPages?.[0]?.tv).toEqual(prepared);
});
