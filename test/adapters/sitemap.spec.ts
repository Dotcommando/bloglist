import { PageReleaseBuildAdapter } from '../../src/adapters/outbound/publication/files/page-release-build.adapter.js';
import { sitemapArtifact, sitemapPaths } from '../../src/adapters/outbound/publication/files/sitemap.js';
import { MarkdownConversionAdapter } from '../../src/adapters/outbound/rendering/html/markdown-conversion.adapter.js';
import { artifact } from '../../src/adapters/outbound/rendering/vite/artifacts.js';
import { FrontendBuildAdapter } from '../../src/adapters/outbound/rendering/vite/frontend-build.adapter.js';
import { PageStatus } from '../../src/domain/pages/page-status.enum.js';
import { ReleaseState } from '../../src/domain/publication/publication-release.js';
import { type PublishedRoute, PublishedRouteKind } from '../../src/domain/publication/published-route.js';
import { UrlKind } from '../../src/domain/routing/url-kind.enum.js';
import type { IBuiltPublication } from '../../src/ports/outbound/publication/frontend-build.port.js';
import { source } from '../support/publication.js';
import { urlFixture } from '../support/routing.js';
import { instant } from '../support/sites.js';

describe('immutable sitemap artifacts', () => {
  it('ships a release-scoped stylesheet even when sitemap is the only styled document', async () => {
    const base = source('hello');
    const built = await new FrontendBuildAdapter(undefined, undefined, new MarkdownConversionAdapter()).build({
      releaseId: 'styled',
      assetBasePath: '/assets/releases/styled/',
      snapshot: { ...base, publicOrigin: 'https://example.test' },
      requestPlans: [],
      documents: [],
    });
    const read = async (path: string): Promise<string> => {
      let text = '';

      for await (const chunk of built.artifacts.find((file) => file.path === path)!.content.bytes) {
        text += new TextDecoder().decode(chunk);
      }

      return text;
    };
    const xml = await read('sitemap.xml');
    const stylesheet = /<\?xml-stylesheet type="text\/css" href="([^"]+)"\?>/.exec(xml)?.[1];

    expect(stylesheet).toMatch(/^\/assets\/releases\/styled\/styles\/sitemap\.[a-f0-9]+\.css$/);
    const stylesheetPath = stylesheet?.replace('/assets/releases/styled/', 'assets/');
    const file = built.artifacts.find((file) => file.path === stylesheetPath);

    expect(file).toMatchObject({ mimeType: 'text/css', public: true });
    expect(built.manifest.artifacts.some((entry) => entry.path === file?.path
      && entry.checksum === file.checksum)).toBe(true);
    expect(await read('_redirects')).toContain('/assets/releases/styled/* /assets/:splat 200');
    expect(sitemapPaths(xml)).toEqual([]);
  });
  it('retains sitemap membership of unchanged published pages during a single-page release', async () => {
    const oldFiles = [artifact('old/index.html', 'text/html', 'old'), artifact('keep/index.html', 'text/html', 'keep'),
      sitemapArtifact('https://old.test', ['/old/', '/keep/'])];
    const oldRoutes: PublishedRoute[] = [{
      kind: PublishedRouteKind.Static,
      urlId: 'old',
      pageId: 'page-1',
      path: '/old/',
      documentPath: 'old/index.html',
    },
    {
      kind: PublishedRouteKind.Static,
      urlId: 'keep',
      pageId: 'page-2',
      path: '/keep/',
      documentPath:
        'keep/index.html',
    }];
    const nextFiles = [artifact('new/index.html', 'text/html', 'new'), sitemapArtifact('https://new.test', ['/new/'])];
    const adapter = new PageReleaseBuildAdapter({
      build: async () => ({
        artifacts: nextFiles,
        manifest: {
          routes: [{
            kind: PublishedRouteKind.Static,
            urlId: 'new',
            pageId: 'page-1',
            path: '/new/',
            documentPath:
            'new/index.html',
          }],
          artifacts: nextFiles,
        },
      }),
    }, { readArtifacts: async () => oldFiles });
    const built = await adapter.buildPage({
      releaseId: 'new',
      pageId: 'page-1',
      previous: {
        siteId: 'site-1',
        siteKey: 'demo',
        releaseId: 'old',
        state: ReleaseState.Ready,
        createdAt: instant,
        completedAt: instant,
        failure: null,
        manifest: { routes: oldRoutes, artifacts: oldFiles },
      },
      snapshot: { ...source('hello'), publicOrigin: 'https://new.test' },
      documents: [],
      requestPlans: [],
    });
    let xml = '';

    for await (const chunk of built.artifacts.find((file) => file.path === 'sitemap.xml')!.content.bytes) {
      xml += new TextDecoder().decode(chunk);
    }
    expect(sitemapPaths(xml)).toEqual(['/keep/', '/new/']);
    expect(xml).not.toContain('old.test');
    expect(xml).toContain('href="/assets/releases/new/styles/sitemap.');
    expect(built.artifacts.some((file) => file.mimeType === 'text/css')).toBe(true);
    const legacyFiles = oldFiles.filter((file) => file.path !== 'sitemap.xml');
    const legacyBuild = new PageReleaseBuildAdapter({
      build: async () => ({
        artifacts: nextFiles,
        manifest: { routes: built.manifest.routes.filter((route) => route.urlId === 'new'), artifacts: nextFiles },
      }),
    }, { readArtifacts: async () => legacyFiles });
    const legacy = await legacyBuild.buildPage({
      releaseId: 'legacy-next',
      pageId: 'page-1',
      previous: {
        siteId: 'site-1',
        siteKey: 'demo',
        releaseId: 'legacy',
        state: ReleaseState.Ready,
        createdAt: instant,
        completedAt: instant,
        failure: null,
        manifest: { routes: oldRoutes, artifacts: legacyFiles },
      },
      snapshot: { ...source('hello'), publicOrigin: 'https://new.test' },
      documents: [],
      requestPlans: [],
    });

    expect(legacy.artifacts.some((file) => file.path === 'sitemap.xml')).toBe(false);
  });
  it('encodes actual paths and XML and rejects malformed or oversized sitemaps', async () => {
    const file = sitemapArtifact('https://example.test', ['/a&b/', '/русский/']);
    let xml = '';

    for await (const chunk of file.content.bytes) {
      xml += new TextDecoder().decode(chunk);
    }
    expect(xml).toContain('https://example.test/a&amp;b/');
    expect(sitemapPaths(xml)).toEqual(['/a&b/', '/русский/']);
    expect(() => sitemapArtifact('https://example.test', Array.from({ length: 50001 }, (_, i) => '/' + i)))
      .toThrow();
    expect(() => sitemapPaths('<broken')).toThrow();
  });
  it('builds sitemap from rendered published indexable pages, omitting drafts and redirects', async () => {
    const base = source('hello');
    const page = { ...base.pages[0]!, status: PageStatus.PUBLISHED, robotsIndex: true };
    const snapshot = {
      ...base,
      publicOrigin: 'https://example.test',
      pages: [page],
      urls: [urlFixture().toState(), urlFixture({
        urlId: 'redirect',
        mark: 'Redirect',
        path: '/old/',
        kind: UrlKind.REDIRECT,
        pageId: null,
        redirectTargetUrlId: 'url-old',
        redirectStatus: 301,
      }).toState()],
    };
    const build = (): Promise<IBuiltPublication> =>
      new FrontendBuildAdapter(undefined, undefined, new MarkdownConversionAdapter()).build({
        releaseId: 'r',
        snapshot,
        requestPlans: [],
        documents: [{ pageId: page.pageId, html: '<html><head></head><body></body></html>', frontendSourceIds: [] }],
      });
    const result = await build();
    let xml = '';

    for await (const chunk of result.artifacts.find((file) => file.path === 'sitemap.xml')!.content.bytes) {
      xml += new TextDecoder().decode(chunk);
    }
    expect(sitemapPaths(xml)).toEqual(['/games/old/']);
    snapshot.pages[0]!.robotsIndex = false;
    const noindex = await build();
    let empty = '';

    for await (const chunk of noindex.artifacts.find((file) => file.path === 'sitemap.xml')!.content.bytes) {
      empty += new TextDecoder().decode(chunk);
    }
    expect(sitemapPaths(empty)).toEqual([]);
  });
});
