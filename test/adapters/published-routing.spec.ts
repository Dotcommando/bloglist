import { PublishedRoutingAdapter } from '../../src/adapters/outbound/publication/files/published-routing.adapter.js';
import { sitemapArtifact } from '../../src/adapters/outbound/publication/files/sitemap.js';
import { artifact } from '../../src/adapters/outbound/rendering/vite/artifacts.js';
import type { IPublicationReleaseState } from '../../src/domain/publication/publication-release.js';
import { ReleaseState } from '../../src/domain/publication/publication-release.js';
import { PublishedRouteKind } from '../../src/domain/publication/published-route.js';
import { instant } from '../support/sites.js';

describe('active published routing projection', () => {
  it('reads one activated release and its exact sitemap without using working state', async () => {
    const files = [artifact('index.html', 'text/html', 'home'), sitemapArtifact('https://example.test', ['/'])];
    let release: IPublicationReleaseState = {
      releaseId: 'r1',
      siteId: 'site-1',
      state: ReleaseState.Ready,
      createdAt: instant,
      completedAt: instant,
      failure: null,
      manifest: {
        routes: [{
          urlId: 'home',
          path: '/',
          pageId: 'p1',
          kind: PublishedRouteKind.Static,
          documentPath: 'index.html',
        }],
        artifacts: files,
      },
    };
    const getActive = vi.fn(async () => ({ siteId: 'site-1', releaseId: 'r1', activatedAt: instant }));
    const read = vi.fn(async () => release);
    const readPublicArtifact = vi.fn(async () => ({
      siteId: 'site-1',
      releaseId: 'r1',
      metadata: files[1]!,
      content: files[1]!.content,
      inlineStyleHashes: [],
    }));
    const adapter = new PublishedRoutingAdapter({ getActive, activate: vi.fn(), findActivation: vi.fn() },
      { read, stage: vi.fn() }, { readPublicArtifact });

    expect(await adapter.readActive('site-1')).toMatchObject({ releaseId: 'r1', sitemapPaths: ['/'] });
    expect(read).toHaveBeenCalledWith('site-1', 'r1');
    expect(readPublicArtifact).toHaveBeenCalledWith('site-1', 'r1', 'sitemap.xml');
    getActive.mockResolvedValueOnce({ siteId: 'foreign', releaseId: 'r1', activatedAt: instant });
    await expect(adapter.readActive('site-1')).rejects.toThrow();
    readPublicArtifact.mockResolvedValueOnce({
      siteId: 'foreign',
      releaseId: 'r1',
      metadata: files[1]!,
      content: files[1]!.content,
      inlineStyleHashes: [],
    });
    await expect(adapter.readActive('site-1')).rejects.toThrow();
    release = { ...release, manifest: { ...release.manifest!, artifacts: [files[0]!] } };
    expect((await adapter.readActive('site-1'))?.sitemapPaths).toBeNull();
  });
});
