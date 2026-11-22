import type { Mock } from 'vitest';

import { artifact } from '../../../src/adapters/outbound/rendering/vite/artifacts.js';
import { PublishPageReleaseUseCase } from '../../../src/app/use-cases/publication/publish-page-release.use-case.js';
import { Page } from '../../../src/domain/pages/page.js';
import { PageStatus } from '../../../src/domain/pages/page-status.enum.js';
import { type PublishedRoute, PublishedRouteKind } from '../../../src/domain/publication/published-route.js';
import { UrlKind } from '../../../src/domain/routing/url-kind.enum.js';
import type { IPageReleaseBuildPort } from '../../../src/ports/outbound/publication/page-release-build.port.js';
import { fakeHookChanges } from '../../support/hooks.js';
import { source } from '../../support/publication.js';
import { instant } from '../../support/sites.js';

interface IFixture {
  operation: PublishPageReleaseUseCase;
  publish: { execute: Mock };
  prepare: Mock;
  render: Mock;
  buildPage: Mock<IPageReleaseBuildPort['buildPage']>;
  stage: Mock;
  activate: Mock;
  getActive: Mock;
  read: Mock;
  findActivation: Mock;
  access: { assertEditor: Mock };
  projection: { prepare: Mock };
}

describe('PublishPageRelease', () => {
  function fixture(): IFixture {
    const snapshot = source('[[*contentMd:markdown]]');
    const page = new Page({ ...snapshot.pages[0]!, status: PageStatus.PUBLISHED, publishedAt: instant });
    const at = instant;
    const publish = { execute: vi.fn(async () => page) };
    const prepare = vi.fn(async () => ({
      planId: page.pageId,
      siteId: page.siteId,
      pageId: page.pageId,
      page: page.toState(),
      settings: {},
      requestParameters: [],
      buildValues: {},
      templates: [],
      rendering: page.toState().rendering!,
      loaders: [],
      frontendSourceIds: [],
    }));
    const render = vi.fn(async () => ({ pageId: page.pageId, html: '<html></html>', frontendSourceIds: [] }));
    const file = artifact('index.html', 'text/html', '<html></html>');
    const buildPage = vi.fn<IPageReleaseBuildPort['buildPage']>(async () => ({
      manifest: {
        routes: [{
          kind: PublishedRouteKind.Static,
          urlId: 'home',
          path: '/',
          pageId: page.pageId,
          documentPath: 'index.html',
        }],
        artifacts: [{
          path: file.path,
          mimeType: file.mimeType,
          byteSize: file.byteSize,
          checksum: file.checksum,
          public: file.public,
        }],
      },
      artifacts: [file],
    }));
    const stage = vi.fn();
    const activate = vi.fn(async () => ({ siteId: page.siteId, releaseId: 'next', activatedAt: at }));
    const getActive = vi.fn(async () => null);
    const read = vi.fn(async () => null);
    const findActivation = vi.fn(async () => null);
    const access = { assertEditor: vi.fn(async () => {}) };
    const projection = { prepare: vi.fn(async (_siteId, values) => values) };
    const operation = new PublishPageReleaseUseCase(access, publish, {
      capture: async () => ({
        ...snapshot,
        pages: [page.toState(), { ...page.toState(), pageId: 'unrelated', mark: 'Other' }],
        urls: [{
          urlId: 'home',
          siteId: page.siteId,
          pageId: page.pageId,
          mark: 'HomeUrl',
          parentUrlId: null,
          segment: '/',
          path: '/',
          kind: UrlKind.PAGE,
          redirectTargetUrlId: null,
          redirectStatus: null,
          firstPublishedAt: at,
          createdAt: at,
          updatedAt: at,
        }],
      }),
    }, { prepare, compose: vi.fn() }, { render }, { buildPage }, { stage, read }, {
      getActive, activate, findActivation,
    }, { nextReleaseId: () => 'next', now: () => at }, fakeHookChanges, projection);

    return {
      operation,
      publish,
      prepare,
      render,
      buildPage,
      stage,
      activate,
      getActive,
      read,
      findActivation,
      access,
      projection,
    };
  }

  it('prepares missing legacy catalog TVs from active raw values and preserves already frozen TVs', async () => {
    const f = fixture();
    const raw = { image: { assetId: 'active-image', alt: 'Public alt' }, teaser: 'Public teaser' };
    const frozen = { image: { src: '/assets/images/frozen.webp' } };
    const summaries = ['legacy', 'frozen'].map((pageId) => ({
      siteId: 'site-1',
      pageId,
      urlId: pageId,
      parentUrlId: null,
      title: pageId,
      language: 'en',
      path: '/' + pageId + '/',
      tvValues: raw,
      ...(pageId === 'frozen' ? { tv: frozen } : {}),
    }));

    f.getActive.mockResolvedValue({ siteId: 'site-1', releaseId: 'old', activatedAt: instant });
    f.read.mockResolvedValue({
      siteId: 'site-1',
      releaseId: 'old',
      siteKey: 'demo',
      state: 'Ready',
      manifest: { routes: [], artifacts: [], publishedPages: summaries },
      failure: null,
      createdAt: instant,
      completedAt: instant,
    });
    const build = f.buildPage.getMockImplementation()!;

    f.buildPage.mockImplementationOnce(async (input) => {
      const built = await build(input);

      return {
        ...built,
        manifest: {
          ...built.manifest,
          routes: [...built.manifest.routes,
            ...summaries.map((summary): PublishedRoute => ({
              kind: PublishedRouteKind.Static,
              urlId: summary.urlId,
              pageId: summary.pageId,
              path: summary.path,
              documentPath: 'index.html',
            })),
          ],
        },
      };
    });
    await f.operation.execute({ siteId: 'site-1', pageId: 'page-1' });
    const catalog = f.prepare.mock.calls[0]?.[0].publishedPages;

    expect(catalog[0].tv).toEqual(raw);
    expect(catalog[1].tv).toEqual(frozen);
    expect(f.projection.prepare).toHaveBeenCalledExactlyOnceWith('site-1', raw);
  });

  it('publishes and renders only the selected page before staging and activation', async () => {
    const f = fixture();
    const result = await f.operation.execute({ siteId: 'site-1', pageId: 'page-1' });

    expect(result.publication.releaseId).toBe('next');
    expect(f.publish.execute).toHaveBeenCalledWith({ siteId: 'site-1', pageId: 'page-1' });
    expect(f.prepare).toHaveBeenCalledOnce();
    expect(f.render).toHaveBeenCalledOnce();
    expect(f.buildPage.mock.calls[0]?.[0].snapshot.pages.map((page) => page.pageId)).toEqual(['page-1']);
    expect(f.stage).toHaveBeenCalledOnce();
    expect(f.activate).toHaveBeenCalledWith(expect.objectContaining({ expectedActiveReleaseId: null }));
  });
  it('does not activate a failed build and does not claim the saved publication was rolled back', async () => {
    const f = fixture();

    f.buildPage.mockRejectedValueOnce(new Error('Build failed'));
    await expect(f.operation.execute({ siteId: 'site-1', pageId: 'page-1' })).rejects.toThrow('Build failed');
    expect(f.publish.execute).toHaveBeenCalledOnce();
    expect(f.activate).not.toHaveBeenCalled();
  });
  it('guards the captured base release and reconciles a lost activation acknowledgement', async () => {
    const f = fixture();
    const previous = {
      siteId: 'site-1',
      releaseId: 'old',
      siteKey: 'demo',
      state: 'Ready',
      manifest: { routes: [], artifacts: [] },
      failure: null,
      createdAt: instant,
      completedAt: instant,
    };
    const acknowledgement = { siteId: 'site-1', releaseId: 'next', activatedAt: instant };

    f.getActive.mockResolvedValue({ siteId: 'site-1', releaseId: 'old', activatedAt: instant });
    f.read.mockResolvedValue(previous);
    f.activate.mockRejectedValue(new Error('Lost response'));
    f.findActivation.mockResolvedValue(acknowledgement);
    expect((await f.operation.execute({ siteId: 'site-1', pageId: 'page-1' })).publication).toEqual(acknowledgement);
    expect(f.activate).toHaveBeenCalledWith(expect.objectContaining({ expectedActiveReleaseId: 'old' }));
    expect(f.buildPage.mock.calls[0]?.[0].previous).toEqual(previous);
  });

  it('denies publication before any mutation when authorization fails', async () => {
    const f = fixture();

    f.access.assertEditor.mockRejectedValueOnce(new Error('Denied'));
    await expect(f.operation.execute({ siteId: 'site-1', pageId: 'page-1' })).rejects.toThrow('Denied');
    expect(f.publish.execute).not.toHaveBeenCalled();
  });
});
