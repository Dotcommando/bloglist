import { PageReleaseBuildAdapter } from '../../src/adapters/outbound/publication/files/page-release-build.adapter.js';
import { artifact } from '../../src/adapters/outbound/rendering/vite/artifacts.js';
import type { IArtifactMetadata, IPublicationArtifact } from '../../src/domain/publication/publication-artifact.js';
import { PublicationRelease, ReleaseState } from '../../src/domain/publication/publication-release.js';
import {
  type IStaticPublishedRoute,
  type PublishedRoute,
  PublishedRouteKind,
} from '../../src/domain/publication/published-route.js';
import { requestPlanFixture } from '../support/delivery.js';
import { source } from '../support/publication.js';
import { instant } from '../support/sites.js';

describe('single-page release assembly', () => {
  function metadata(file: IPublicationArtifact): IArtifactMetadata {
    return {
      path: file.path,
      mimeType: file.mimeType,
      byteSize: file.byteSize,
      checksum: file.checksum,
      public: file.public,
    };
  }

  it.each([
    { name: 'retains the valid site favicon', href: '/favicon.ico?v=' + 'a'.repeat(64), extra: '', rejected: false },
    {
      name: 'rejects a foreign asset disguised as a favicon',
      href: '/assets/releases/foreign/plan.json',
      extra: '',
      rejected: true,
    },
    {
      name: 'rejects extra executable favicon attributes',
      href: '/favicon.ico?v=' + 'a'.repeat(64),
      extra: ' onload="alert(1)"',
      rejected: true,
    },
  ])('$name while rebasing frozen Request assets', async ({ href, extra, rejected }) => {
    const css = artifact('assets/styles/common.reflow.hash.css', 'text/css', 'body{margin:0}');
    const saved = requestPlanFixture();
    const favicon = '<link rel="icon" type="image/x-icon" href="' + href + '" data-zarya-favicon=""' + extra + '>';
    const plan = artifact('plans/page-1.json', 'application/json', JSON.stringify({
      ...saved.plan,
      buildValues: { frozen: 'Keep me' },
      assets: {
        head: '<link rel="stylesheet" href="/assets/releases/old/styles/common.reflow.hash.css">' + favicon,
        body: '',
      },
    }), false);
    const previous = new PublicationRelease({
      siteId: 'site-1',
      siteKey: 'demo',
      releaseId: 'old',
      state: ReleaseState.Ready,
      manifest: {
        routes: [{
          kind: PublishedRouteKind.Request,
          urlId: 'live',
          pageId: 'page-1',
          path: '/live/',
          renderPlanId: 'page-1',
        }],
        artifacts: [plan, css].map(metadata),
      },
      failure: null,
      createdAt: instant,
      completedAt: instant,
    }).toState();
    const adapter = new PageReleaseBuildAdapter({
      build: async () => ({ artifacts: [], manifest: { routes: [], artifacts: [] } }),
    },
    { readArtifacts: async () => [plan, css] });
    const building = adapter.buildPage({
      releaseId: 'new',
      pageId: 'page-2',
      previous,
      snapshot: source('Other'),
      documents: [],
      requestPlans: [],
    });

    if (rejected) {
      await expect(building).rejects.toThrow('Foreign retained plan asset');

      return;
    }

    const built = await building;
    const output = built.artifacts.find((file) => file.path === plan.path)!;
    const bytes: Uint8Array[] = [];

    for await (const chunk of output.content.bytes) {
      bytes.push(chunk);
    }
    const decoded: unknown = JSON.parse(Buffer.concat(bytes).toString());

    expect(decoded).toMatchObject({
      buildValues: { frozen: 'Keep me' },
      assets: { head: '<link rel="stylesheet" href="/assets/releases/new/styles/common.reflow.hash.css">' + favicon },
    });
  });

  it('reuses other pages, private plans and assets while replacing only the selected page', async () => {
    const old = [artifact('index.html', 'text/html', 'Old home'),
      artifact('other/index.html', 'text/html', 'Other page'),
      artifact('plans/other.json', 'application/json', '{"frozen":true}', false),
      artifact('assets/styles/common.reflow.old.css', 'text/css', 'body{margin:0}'),
      artifact('representations/home.md', 'text/markdown', 'Old Markdown')];
    const routes: PublishedRoute[] = [{
      kind: PublishedRouteKind.Static,
      urlId: 'home',
      pageId: 'page-1',
      path: '/',
      documentPath: 'index.html',
      markdownPath: 'representations/home.md',
    }, {
      kind: PublishedRouteKind.Static,
      urlId: 'other',
      pageId: 'page-2',
      path: '/other/',
      documentPath: 'other/index.html',
    }];
    const previous = new PublicationRelease({
      releaseId: 'old',
      siteId: 'site-1',
      siteKey: 'demo',
      state: ReleaseState.Ready,
      manifest: { routes, artifacts: old.map(metadata) },
      createdAt: instant,
      completedAt: instant,
      failure: null,
    }).toState();
    const changed = artifact('index.html', 'text/html', 'New home');
    const changedMarkdown = artifact('representations/home.md', 'text/markdown', 'New Markdown');
    const compile = vi.fn(async () => ({
      artifacts: [changed, changedMarkdown],
      manifest: { routes: [routes[0]!], artifacts: [metadata(changed), metadata(changedMarkdown)] },
    }));
    const readArtifacts = vi.fn(async () => old);
    const adapter = new PageReleaseBuildAdapter({ build: compile }, { readArtifacts });
    const built = await adapter.buildPage({
      releaseId: 'new', previous, pageId: 'page-1', snapshot: source('Home'), documents: [], requestPlans: [],
    });

    expect(built.manifest.routes).toEqual([routes[1], routes[0]]);
    expect(built.artifacts.find((file) => file.path === 'other/index.html')).toBe(old[1]);
    expect(built.artifacts.find((file) => file.path === 'plans/other.json')).toBe(old[2]);
    expect(built.artifacts.find((file) => file.path === 'index.html')).toBe(changed);
    expect(built.artifacts.find((file) => file.path === 'representations/home.md')).toBe(changedMarkdown);
    expect(readArtifacts).toHaveBeenCalledWith('site-1', 'old');
    expect(compile).toHaveBeenCalledOnce();
  });
  it('refuses a route collision with another published page and foreign base releases', async () => {
    const file = artifact('index.html', 'text/html', 'New');
    const route: IStaticPublishedRoute = {
      kind: PublishedRouteKind.Static,
      urlId: 'new',
      pageId: 'page-1',
      path: '/',
      documentPath: 'index.html',
    };
    const adapter = new PageReleaseBuildAdapter({
      build: async () => ({ artifacts: [file], manifest: { routes: [route], artifacts: [metadata(file)] } }),
    }, { readArtifacts: async () => [file] });
    const previous = new PublicationRelease({
      releaseId: 'old',
      siteId: 'site-1',
      siteKey: 'demo',
      state: ReleaseState.Ready,
      manifest: { routes: [{ ...route, pageId: 'page-2', urlId: 'other' }], artifacts: [metadata(file)] },
      createdAt: instant,
      completedAt: instant,
      failure: null,
    }).toState();
    const input = {
      releaseId: 'new',
      previous,
      pageId: 'page-1',
      snapshot: source('Home'),
      documents: [],
      requestPlans: [],
    };

    await expect(adapter.buildPage(input)).rejects.toMatchObject({ code: 'Conflict' });
    await expect(adapter.buildPage({ ...input, previous: { ...previous, siteId: 'foreign' } })).rejects.toThrow();
  });
});
