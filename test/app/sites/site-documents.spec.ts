import { CompleteSiteSetupService } from '../../../src/app/services/sites/complete-site-setup.service.js';
import { SystemDocument } from '../../../src/domain/pages/document-mime.js';
import type {
  IBuiltPublication, IFrontendBuildInput,
} from '../../../src/ports/outbound/publication/frontend-build.port.js';
import type { ISiteDocumentSeed } from '../../../src/ports/outbound/sites/site-documents.port.js';
import { fakeHookChanges, fakeSiteSetup } from '../../support/hooks.js';
import { FakePublicationStore, FakeReleaseActivation } from '../../support/publication.js';
import { instant, siteFixture } from '../../support/sites.js';

describe('site setup with public root documents', () => {
  it('provisions three published root documents and activates before acknowledging setup', async () => {
    const site = siteFixture();
    const activation = new FakeReleaseActivation();
    const intent = await fakeHookChanges.prepare({
      siteId: site.siteId,
      subject: site.siteId,
      checkKey: 'cms.site.setup.complete.check',
      facts: [],
      actorId: 'system',
      candidate: {},
    });
    const ensure = vi.fn(async (_siteId: string, documents: readonly ISiteDocumentSeed[]) => documents);
    const complete = vi.spyOn(fakeSiteSetup, 'complete');
    const build = vi.fn<(input: IFrontendBuildInput) => Promise<IBuiltPublication>>(async () => ({
      manifest: { routes: [], artifacts: [] }, artifacts: [],
    }));
    let sequence = 0;
    const service = new CompleteSiteSetupService(fakeSiteSetup, { ensure }, { build },
      new FakePublicationStore(), activation, {
        now: () => instant,
        nextPageId: () => 'p' + ++sequence,
        nextUrlId: () => 'u' + ++sequence,
      });

    await service.complete(site, site, intent);
    const seeds = ensure.mock.calls[0]![1];

    expect(seeds.map((seed) => [seed.page.systemDocument, seed.page.sortOrder, seed.url.path])).toEqual([
      [SystemDocument.Sitemap, 100, '/sitemap.xml'], [SystemDocument.Robots, 200, '/robots.txt'],
      [SystemDocument.Llms, 300, '/llms.txt'],
    ]);
    expect(seeds.map((seed) => seed.page.mark)).toEqual(['sitemapXml', 'robotsTxt', 'llmsTxt']);
    expect(seeds.every((seed) => seed.page.status === 'PUBLISHED' && seed.page.parentPageId === null)).toBe(true);
    expect(seeds[1]!.page.contentMd).toContain('Disallow: /admin/');
    expect(seeds[1]!.page.contentMd).not.toContain('Sitemap:');
    expect(build.mock.calls[0]![0].documents.map((doc) => doc.html)).toContain('');
    expect(await activation.getActive(site.siteId)).not.toBeNull();
    expect(complete).toHaveBeenCalled();
    complete.mockRestore();
  });
});
