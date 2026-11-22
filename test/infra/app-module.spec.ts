import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { createConnection } from 'mongoose';

import { artifact } from '../../src/adapters/outbound/rendering/vite/artifacts.js';
import { MovePageUseCase } from '../../src/app/use-cases/pages/move-page.use-case.js';
import { GetPublicationOptionsUseCase } from '../../src/app/use-cases/publication/get-publication-options.use-case.js';
import { PublishCurrentPageUseCase } from '../../src/app/use-cases/publication/publish-current-page.use-case.js';
import { PublishPageReleaseUseCase } from '../../src/app/use-cases/publication/publish-page-release.use-case.js';
import { GetUrlCatalogUseCase } from '../../src/app/use-cases/routing/get-url-catalog.use-case.js';
import { type IPageState, Page } from '../../src/domain/pages/page.js';
import { BrowserInteraction, HtmlDelivery } from '../../src/domain/pages/page-rendering.js';
import { PublishedVersionPosition } from '../../src/domain/pages/published-page-version.js';
import { DocumentRepresentation } from '../../src/domain/publication/published-document.js';
import { UrlRedirectStatus } from '../../src/domain/routing/url-redirect-status.enum.js';
import { AppModule } from '../../src/infra/app.module.js';
import { HOOK_CHANGES, HOOK_CONFIGURATION, HOOK_PERSISTENCE } from '../../src/infra/hooks/hooks.tokens.js';
import {
  BUILD_JSON_LD_PAGE, JSON_LD_CATALOG_READER, LIST_JSON_LD_CATALOG, SAVE_JSON_LD_CATALOG,
} from '../../src/infra/json-ld/json-ld.tokens.js';
import { SITE_ASSET_DIRECTORY } from '../../src/infra/media/media.tokens.js';
import {
  CREATE_PAGE, GET_PAGE, LIST_PAGES, MOVE_PAGE, PAGE_REPOSITORY, PAGE_TREE_STORE,
  PAGE_VALUES, RESTORE_PAGE_VERSION,
  UPDATE_PAGE,
} from '../../src/infra/pages/pages.tokens.js';
import { MONGO_CONNECTION } from '../../src/infra/persistence/persistence.tokens.js';
import {
  CONFIGURE_PAGE_RENDERING,
  GET_PUBLICATION_OPTIONS,
  GET_PUBLISHED_ARTIFACT,
  PAGE_PUBLICATIONS,
  PREVIEW_DELIVERY,
  PREVIEW_MARKDOWN_DRAFT,
  PREVIEW_MARKDOWN_PUBLISHED,
  PREVIEW_PAGE,
  PUBLICATION_SOURCE,
  PUBLICATION_STORE,
  PUBLICATION_VALUES,
  PUBLISH_CURRENT_PAGE,
  PUBLISH_PAGE,
  PUBLISH_PAGE_RELEASE,
  PUBLISH_SITE_RELEASE,
  PUBLISHED_CONTENT,
  RELEASE_ACTIVATION,
  RENDER_PUBLISHED_PAGE,
  RENDERING_REGISTRY,
  RENDERING_SOURCE,
  RESOLVE_PUBLISHED_PATH,
  ROUTING_CONTENT_SOURCE,
} from '../../src/infra/publication/publication.tokens.js';
import { ELEMENT_CATALOG } from '../../src/infra/rendering/rendering.tokens.js';
import { GET_URL_CATALOG } from '../../src/infra/routing/routing.tokens.js';
import {
  ASSIGN_INITIAL_PAGE_URL, CHANGE_PAGE_URL, FIND_URL_BY_PATH, GET_URL_HISTORY, URL_REPOSITORY, URL_VALUES,
} from '../../src/infra/routing/routing.tokens.js';
import { SITE_SETUP } from '../../src/infra/sites/sites.tokens.js';
import {
  CREATE_SITE, GET_SITE, LIST_SITES,
  RESOLVE_SITE, SITE_REPOSITORY, SITE_VALUES,
} from '../../src/infra/sites/sites.tokens.js';
import type { IBuildJsonLdPage } from '../../src/ports/inbound/json-ld/build-json-ld-page.port.js';
import type { IListJsonLdCatalog, ISaveJsonLdCatalog } from '../../src/ports/inbound/json-ld/json-ld-catalog.port.js';
import type { IConfigurePageRendering } from '../../src/ports/inbound/pages/configure-page-rendering.port.js';
import type { ICreatePage } from '../../src/ports/inbound/pages/create-page.port.js';
import type { IGetPage } from '../../src/ports/inbound/pages/get-page.port.js';
import type { IListPages } from '../../src/ports/inbound/pages/list-pages.port.js';
import type { IMovePage } from '../../src/ports/inbound/pages/move-page.port.js';
import type { IPublishPage } from '../../src/ports/inbound/pages/publish-page.port.js';
import type { IRestorePageVersion } from '../../src/ports/inbound/pages/restore-page-version.port.js';
import type { IUpdatePage } from '../../src/ports/inbound/pages/update-page.port.js';
import type { IGetPublishedArtifact } from '../../src/ports/inbound/publication/get-published-artifact.port.js';
import type { IPreviewMarkdownDraft } from '../../src/ports/inbound/publication/preview-markdown-draft.port.js';
import type { IPreviewPage } from '../../src/ports/inbound/publication/preview-page.port.js';
import type { IPublishSiteRelease } from '../../src/ports/inbound/publication/publish-site-release.port.js';
import type { IRenderPublishedPage } from '../../src/ports/inbound/publication/render-published-page.port.js';
import type { IResolvePublishedPath } from '../../src/ports/inbound/publication/resolve-published-path.port.js';
import type { IAssignInitialPageUrl } from '../../src/ports/inbound/routing/assign-initial-page-url.port.js';
import type { IChangePageUrl } from '../../src/ports/inbound/routing/change-page-url.port.js';
import type { IFindUrlByPath } from '../../src/ports/inbound/routing/find-url-by-path.port.js';
import type { IGetUrlHistory } from '../../src/ports/inbound/routing/get-url-history.port.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import type { IGetSite } from '../../src/ports/inbound/sites/get-site.port.js';
import type { IListSites } from '../../src/ports/inbound/sites/list-sites.port.js';
import type { IResolveSite } from '../../src/ports/inbound/sites/resolve-site.port.js';
import { requestPlanFixture } from '../support/delivery.js';
import { fakeHookChanges, fakeSiteSetup, HookConfigurationFake } from '../support/hooks.js';
import { FakePageRepository, pageInput } from '../support/pages.js';
import { FakePublicationStore, FakeReleaseActivation, source } from '../support/publication.js';
import { FakeUrlRepository, routingValues, urlInput } from '../support/routing.js';
import { FakeSiteRepository, instant, siteInput } from '../support/sites.js';

export const localOptions = {
  mongoUri: 'mongodb://localhost:27017',
  database: 'zarya_unit',
  operator: { operatorId: 'unit-operator', platformAdministrator: true },
};

describe('AppModule local composition', () => {
  it('resolves CreateSite through an inbound token with fake outbound overrides', async () => {
    const directory = { synchronize: vi.fn(async () => {}) };
    const module = await Test.createTestingModule({ imports: [AppModule.forLocalOperator(localOptions)] })
      .overrideProvider(JSON_LD_CATALOG_READER).useValue({
        read: async (siteId: string) => ({ siteId, version: '0', profiles: [], objects: [] }),
        save: async () => {},
      })
      .overrideProvider(ELEMENT_CATALOG).useValue({ list: async () => [] })
      .overrideProvider(SITE_ASSET_DIRECTORY).useValue(directory)
      .overrideProvider(HOOK_PERSISTENCE).useValue({ connection: createConnection() })
      .overrideProvider(HOOK_CONFIGURATION).useValue(new HookConfigurationFake())
      .overrideProvider(HOOK_CHANGES).useValue(fakeHookChanges)
      .overrideProvider(SITE_SETUP).useValue(fakeSiteSetup)
      .overrideProvider(MONGO_CONNECTION).useValue(createConnection())
      .overrideProvider(SITE_REPOSITORY).useValue(new FakeSiteRepository())
      .overrideProvider(SITE_VALUES).useValue({ nextSiteId: () => 'site-1', currentInstant: () => instant })
      .overrideProvider(PAGE_REPOSITORY).useValue(new FakePageRepository())
      .overrideProvider(PAGE_TREE_STORE).useValue({
        move: async (state: IPageState, parentPageId: string | null) => new Page({ ...state, parentPageId }),
      })
      .overrideProvider(PAGE_VALUES).useValue({ nextPageId: () => 'page-1', currentInstant: () => instant })
      .overrideProvider(URL_REPOSITORY).useValue(new FakeUrlRepository())
      .overrideProvider(URL_VALUES).useValue(routingValues())
      .overrideProvider(RENDERING_REGISTRY).useValue({ validate: async () => {} })
      .overrideProvider(RENDERING_SOURCE).useValue({ read: async () => source('Template') })
      .overrideProvider(PUBLICATION_SOURCE).useValue({ capture: async () => source('Preview') })
      .overrideProvider(ROUTING_CONTENT_SOURCE).useValue({ readUrls: async () => [] })
      .overrideProvider(PUBLICATION_STORE).useValue(new FakePublicationStore())
      .overrideProvider(RELEASE_ACTIVATION).useValue(new FakeReleaseActivation())
      .overrideProvider(PUBLICATION_VALUES).useValue({ nextReleaseId: () => 'release-1', now: () => instant })
      .overrideProvider(PUBLISHED_CONTENT).useValue({
        readPlan: async () => requestPlanFixture(),
        readPublicArtifact: async () => {
          const file = artifact('assets/test.css', 'text/css', 'body{margin:0}');

          return {
            siteId: 'site-1',
            releaseId: 'release-1',
            metadata: file,
            content: file.content,
            inlineStyleHashes: [],
          };
        },
      })
      .overrideProvider(PREVIEW_DELIVERY).useValue({
        close: async () => {},
        present: async () =>
          ({
            pageId: 'page-1',
            html: 'Preview',
            frontendSourceIds: [],
            previewId: 'preview',
            url:
            'http://127.0.0.1/',
          }),
      })
      .overrideProvider(PAGE_PUBLICATIONS).useValue({
        versions: async () => [requestPlanFixture().plan.page],
        restore: async (_expected: IPageState, _selected: IPageState, _position:
        PublishedVersionPosition, page: Page) => page,
        publish: async (state: IPageState, at: Date) => {
          const page = new Page(state);

          page.publish(at);

          return page;
        },
      })
      .compile();

    try {
      expect(module.get(GET_URL_CATALOG)).toBeInstanceOf(GetUrlCatalogUseCase);
      const operation = module.get<ICreateSite>(CREATE_SITE);

      expect(module.get(PUBLISH_PAGE_RELEASE)).toBeInstanceOf(PublishPageReleaseUseCase);
      expect(module.get(PUBLISH_CURRENT_PAGE)).toBeInstanceOf(PublishCurrentPageUseCase);
      expect(module.get(GET_PUBLICATION_OPTIONS)).toBeInstanceOf(GetPublicationOptionsUseCase);

      expect((await operation.execute(siteInput())).siteId).toBe('site-1');
      expect(directory.synchronize).toHaveBeenCalledExactlyOnceWith('site-1');
      expect((await module.get<GetPublicationOptionsUseCase>(GET_PUBLICATION_OPTIONS)
        .execute({ siteId: 'site-1' })).pageAvailability).toEqual([]);
      expect(await module.get<GetUrlCatalogUseCase>(GET_URL_CATALOG).execute({ siteId: 'site-1' }))
        .toMatchObject({ siteId: 'site-1', urls: [], pages: [], published: null });
      expect((await module.get<IGetSite>(GET_SITE).execute({ siteId: 'site-1' }))?.siteId).toBe('site-1');
      expect((await module.get<IListSites>(LIST_SITES).execute()).map((site) => site.siteId)).toEqual(['site-1']);
      const resolved = await module.get<IResolveSite>(RESOLVE_SITE).execute({ hostname: 'EXAMPLE.TEST' });

      expect(resolved?.siteId).toBe('site-1');
      expect((await module.get<ICreatePage>(CREATE_PAGE).execute(pageInput())).pageId).toBe('page-1');
      const page = await module.get<IGetPage>(GET_PAGE).execute({ siteId: 'site-1', pageId: 'page-1' });

      expect(page?.title).toBe('Home');
      expect(module.get(MOVE_PAGE)).toBeInstanceOf(MovePageUseCase);
      expect((await module.get<IMovePage>(MOVE_PAGE).execute({
        siteId: 'site-1',
        pageId: 'page-1',
        parentPageId: null,
        expectedParentPageId: null,
        expectedSortOrder: 100,
      })).pageNumber).toBe('1');
      expect((await module.get<IListPages>(LIST_PAGES).execute({ siteId: 'site-1' })).map((page) => page.pageId))
        .toEqual(['page-1']);
      expect((await module.get<IConfigurePageRendering>(CONFIGURE_PAGE_RENDERING).execute({
        siteId: 'site-1',
        actorId: 'unit-operator',
        pageId: 'page-1',
        rendering: {
          templateId: 'Home',
          delivery: HtmlDelivery.Static,
          interaction: BrowserInteraction.None,
          parameters: {},
          loaders: [],
        },
      })).toState().rendering?.templateId).toBe('Home');
      expect((await module.get<IPreviewPage>(PREVIEW_PAGE).execute({
        siteId: 'site-1', actorId: 'unit-operator', pageId: 'page-1',
      })).previewId).toBe('preview');
      expect(module.get(PREVIEW_MARKDOWN_PUBLISHED)).toBeDefined();
      expect(await module.get<IListJsonLdCatalog>(LIST_JSON_LD_CATALOG).execute({ siteId: 'site-1' }))
        .toEqual({ siteId: 'site-1', version: '0', profiles: [], objects: [] });
      const jsonLd = await module.get<ISaveJsonLdCatalog>(SAVE_JSON_LD_CATALOG).execute({
        siteId: 'site-1', expectedVersion: '0', profiles: [], objects: [],
      });

      expect(jsonLd.version).not.toBe('0');
      expect(module.get<IBuildJsonLdPage>(BUILD_JSON_LD_PAGE).execute({
        siteId: 'site-1',
        pageId: 'page-1',
        templateId: 'Basic',
        origin: 'https://example.test',
        catalog: jsonLd,
        pageFields: {},
        templateValues: {},
        snippetValues: {},
        routes: [],
      })).toBeNull();
      expect((await module.get<IPreviewMarkdownDraft>(PREVIEW_MARKDOWN_DRAFT).execute({
        siteId: 'site-1', actorId: 'unit-operator', pageId: 'page-1',
      })).markdown).toContain('Preview');
      expect((await module.get<IPublishPage>(PUBLISH_PAGE).execute({ siteId: 'site-1', pageId: 'page-1' })).status)
        .toBe('PUBLISHED');
      expect((await module.get<IPublishSiteRelease>(PUBLISH_SITE_RELEASE).execute({
        siteId: 'site-1', actorId: 'unit-operator', expectedActiveReleaseId: null,
      })).releaseId).toBe('release-1');
      expect((await module.get<IRenderPublishedPage>(RENDER_PUBLISHED_PAGE).execute({
        siteId: 'site-1', releaseId: 'release-1', renderPlanId: 'page-1',
      })).html).toContain('Published body');
      expect((await module.get<IRenderPublishedPage>(RENDER_PUBLISHED_PAGE).execute({
        siteId: 'site-1',
        releaseId: 'release-1',
        renderPlanId: 'page-1',
        representation: DocumentRepresentation.Markdown,
      })).markdown).toContain('Published body');
      expect((await module.get<IGetPublishedArtifact>(GET_PUBLISHED_ARTIFACT).execute({
        siteId: 'site-1', releaseId: 'release-1', path: 'assets/test.css',
      }))?.metadata.mimeType).toBe('text/css');
      expect((await module.get<IRestorePageVersion>(RESTORE_PAGE_VERSION).execute({
        siteId: 'site-1', pageId: 'page-1', version: PublishedVersionPosition.Latest,
      })).status).toBe('DRAFT');
      expect(await module.get<IResolvePublishedPath>(RESOLVE_PUBLISHED_PATH).execute({ siteId: 'site-1', path: '/' }))
        .toEqual({ kind: 'NotFound' });
      expect((await module.get<IAssignInitialPageUrl>(ASSIGN_INITIAL_PAGE_URL).execute(urlInput())).path)
        .toBe('/games/new/');
      expect((await module.get<IFindUrlByPath>(FIND_URL_BY_PATH)
        .execute({ siteId: 'site-1', path: '/games/new/' }))?.pageId).toBe('page-1');
      const changed = await module.get<IChangePageUrl>(CHANGE_PAGE_URL).execute({
        ...urlInput(),
        mark: 'FinalAddress',
        path: '/games/final/',
        segment: 'final',
        redirectStatus: UrlRedirectStatus.HTTP_301,
      });

      expect(changed.path).toBe('/games/final/');
      expect(await module.get<IGetUrlHistory>(GET_URL_HISTORY).execute({ siteId: 'site-1', urlId: 'url-new-1' }))
        .toHaveLength(1);
      expect((await module.get<IUpdatePage>(UPDATE_PAGE).execute({
        siteId: 'site-1',
        pageId: 'page-1',
        title: 'Updated',
      })).title).toBe('Updated');
    } finally {
      await module.close();
    }
  });

  it('rejects a missing operator or implicit privilege at composition time', () => {
    expect(() => AppModule.forLocalOperator({
      ...localOptions,
      operator: { operatorId: '', platformAdministrator: true },
    })).toThrow();
    expect(() => AppModule.forLocalOperator({
      ...localOptions,
      operator: { operatorId: 'reader', platformAdministrator: false },
    })).toThrow();
    expect(() => AppModule.forLocalOperator({ ...localOptions, database: '' })).toThrow();
  });
});
