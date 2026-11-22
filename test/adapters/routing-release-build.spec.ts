import {
  RoutingReleaseBuildAdapter,
} from '../../src/adapters/outbound/publication/files/routing-release-build.adapter.js';
import { sitemapArtifact, sitemapPaths } from '../../src/adapters/outbound/publication/files/sitemap.js';
import { artifact } from '../../src/adapters/outbound/rendering/vite/artifacts.js';
import { ReleaseState } from '../../src/domain/publication/publication-release.js';
import { PublishedRouteKind } from '../../src/domain/publication/published-route.js';
import { requestPlanFixture } from '../support/delivery.js';
import { urlFixture } from '../support/routing.js';
import { instant } from '../support/sites.js';

describe('routing-only immutable release', () => {
  it('retains the site favicon while updating frozen Request catalogs and asset links', async () => {
    const saved = requestPlanFixture();
    const summary = {
      siteId: 'site-1',
      pageId: 'page-1',
      urlId: 'old',
      parentUrlId: null,
      title: 'Frozen title',
      language: 'en',
      path: '/old/',
    };
    const plan = { ...saved.plan, buildValues: { frozen: 'Keep this value' }, publishedPages: [summary] };
    const favicon = '<link rel="icon" type="image/x-icon" href="/favicon.ico?v=' + 'a'.repeat(64)
      + '" data-zarya-favicon="">';
    const assets = {
      head: '<link rel="stylesheet" href="/assets/releases/old/styles/frozen.css">' + favicon,
      body: '',
    };
    const css = artifact('assets/styles/frozen.css', 'text/css', 'body{margin:0}');
    const files = [css, artifact('plans/page-1.json', 'application/json', JSON.stringify({
      ...plan, assets,
    }), false)];
    const built = await new RoutingReleaseBuildAdapter({ readArtifacts: async () => files }).build({
      siteId: 'site-1',
      releaseId: 'next',
      publicOrigin: null,
      urls: [urlFixture({ urlId: 'new', path: '/new/' }).toState()],
      previous: {
        siteId: 'site-1',
        releaseId: 'old',
        state: ReleaseState.Ready,
        createdAt: instant,
        completedAt: instant,
        failure: null,
        manifest: {
          routes: [{
            kind: PublishedRouteKind.Request,
            urlId: 'old',
            pageId: 'page-1',
            path: '/old/',
            renderPlanId: 'page-1',
          }],
          artifacts: files,
          publishedPages: [summary],
        },
      },
    });
    const chunks: Uint8Array[] = [];

    for await (const chunk of built.artifacts.find((file) => file.path === 'plans/page-1.json')!.content.bytes) {
      chunks.push(chunk);
    }
    const decoded: Record<string, unknown> = JSON.parse(Buffer.concat(chunks).toString('utf8'));

    expect(decoded.buildValues).toEqual(plan.buildValues);
    expect(decoded.page).toEqual(JSON.parse(JSON.stringify(plan.page)));
    expect(decoded.assets).toMatchObject({
      head: '<link rel="stylesheet" href="/assets/releases/next/styles/frozen.css">' + favicon, body: '',
    });
    expect(built.artifacts.find((file) => file.path === css.path)?.checksum).toBe(css.checksum);
    expect(decoded.publishedPages).toEqual([{ ...summary, urlId: 'new', path: '/new/' }]);
  });
  it('moves frozen HTML without compiling or publishing drafts and replaces old sitemap paths', async () => {
    const files = [artifact('old/index.html', 'text/html', '<h1>Frozen publication</h1>'),
      artifact('representations/kept.md', 'text/markdown', '# Frozen publication'),
      artifact('removed/index.html', 'text/html', '<h1>Removed</h1>'),
      artifact('representations/removed.md', 'text/markdown', '# Removed'),
      sitemapArtifact('https://example.test', ['/old/'])];
    const readArtifacts = vi.fn(async () => files);
    const built = await new RoutingReleaseBuildAdapter({ readArtifacts }).build({
      siteId: 'site-1',
      releaseId: 'next',
      publicOrigin: 'https://example.test',
      previous: {
        siteId: 'site-1',
        releaseId: 'old',
        state: ReleaseState.Ready,
        createdAt: instant,
        completedAt: instant,
        failure: null,
        manifest: {
          routes: [{
            kind: PublishedRouteKind.Static,
            pageId: 'page-1',
            urlId: 'old',
            path: '/old/',
            documentPath: 'old/index.html',
            markdownPath: 'representations/kept.md',
          }, {
            kind: PublishedRouteKind.Static,
            pageId: 'page-2',
            urlId: 'removed',
            path: '/removed/',
            documentPath: 'removed/index.html',
            markdownPath: 'representations/removed.md',
          }],
          artifacts: files,
        },
      },
      urls: [urlFixture({ urlId: 'new', path: '/new/' }).toState()],
    });

    expect(built.manifest.routes).toMatchObject([{ path: '/new/', pageId: 'page-1', documentPath: 'new/index.html' }]);
    expect(built.artifacts.some((file) => file.path === 'old/index.html')).toBe(false);
    expect(built.artifacts.some((file) => file.path === 'representations/kept.md')).toBe(true);
    expect(built.artifacts.some((file) => file.path === 'representations/removed.md')).toBe(false);
    let html = '';
    let xml = '';

    for await (const chunk of built.artifacts.find((file) => file.path === 'new/index.html')!.content.bytes) {
      html += new TextDecoder().decode(chunk);
    }

    for await (const chunk of built.artifacts.find((file) => file.path === 'sitemap.xml')!.content.bytes) {
      xml += new TextDecoder().decode(chunk);
    }
    expect(html).toBe('<h1>Frozen publication</h1>');
    expect(sitemapPaths(xml)).toEqual(['/new/']);
    expect(xml).toContain('href="/assets/releases/next/styles/sitemap.');
    expect(built.artifacts.some((file) => file.mimeType === 'text/css')).toBe(true);
  });
});
