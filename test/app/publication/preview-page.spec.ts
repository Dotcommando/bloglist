import { PreviewPageUseCase } from '../../../src/app/use-cases/publication/preview-page.use-case.js';
import { BrowserInteraction, HtmlDelivery } from '../../../src/domain/pages/page-rendering.js';
import { pageFixture } from '../../support/pages.js';

describe('PreviewPage', () => {
  it('builds a private preview without any release activation', async () => {
    const page = pageFixture().toState();
    const rendering = {
      templateId: 'Home',
      delivery: HtmlDelivery.Static,
      interaction: BrowserInteraction.None,
      parameters: {},
      loaders: [],
    };
    const snapshot = {
      siteId: 'site-1',
      siteKey: 'demo',
      settings: {},
      requestParameters: [],
      pages: [{ ...page, rendering }],
      urls: [],
      templates: [],
      frontendSources: [],
    };
    const plan = {
      planId: 'p',
      siteId: 'site-1',
      pageId: 'page-1',
      settings: {},
      requestParameters: [],
      buildValues: {},
      page: { ...page, rendering },
      templates: [],
      rendering,
      loaders: [],
      frontendSourceIds: [],
    };
    const document = { pageId: 'page-1', html: '<html></html>', frontendSourceIds: [] };
    const build = { artifacts: [], manifest: { routes: [], artifacts: [] } };
    const source = { capture: vi.fn(async () => snapshot) };
    const runtime = { render: vi.fn(async () => document) };
    const frontend = { build: vi.fn(async () => build) };
    const delivery = { present: vi.fn(async () => ({ ...document, previewId: 'preview', url: 'http://127.0.0.1/' })) };
    const operation = new PreviewPageUseCase({ assertEditor: async () => {} }, source,
      { prepare: async () => plan, compose: async () => document }, runtime, frontend, delivery,
      { nextReleaseId: () => 'preview', now: () => new Date('2026-10-24Z') });

    expect((await operation.execute({
      siteId: 'site-1',
      actorId: 'owner',
      pageId:
'page-1',
    })).previewId).toBe('preview');
    expect(source.capture).toHaveBeenCalledWith('site-1', 'page-1');
    expect(frontend.build).toHaveBeenCalledWith(expect.objectContaining({ documents: [document] }));
    expect(delivery.present).toHaveBeenCalledWith(document, build);
  });
});
