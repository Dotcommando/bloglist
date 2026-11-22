import { ConfigurePageRenderingUseCase } from '../../../src/app/use-cases/pages/configure-page-rendering.use-case.js';
import { BrowserInteraction, HtmlDelivery } from '../../../src/domain/pages/page-rendering.js';
import { fakeHookChanges } from '../../support/hooks.js';
import { FakePageRepository, pageFixture } from '../../support/pages.js';

describe('ConfigurePageRendering', () => {
  const rendering = {
    templateId: 'Home',
    delivery: HtmlDelivery.Static,
    interaction: BrowserInteraction.None,
    parameters: {},
    loaders: [],
  };

  it('validates the registry before saving a detached owned page', async () => {
    const pages = new FakePageRepository();
    const original = pageFixture();

    pages.records.set(original.pageId, original);
    const access = { assertEditor: vi.fn(async () => {}) };
    const registry = { validate: vi.fn(async () => {}) };
    const operation = new ConfigurePageRenderingUseCase(pages, access, registry, fakeHookChanges);
    const result = await operation.execute({ siteId: 'site-1', actorId: 'editor', pageId: 'page-1', rendering });

    expect(result.toState().rendering).toEqual(rendering);
    expect(original.toState().rendering).toBeUndefined();
    expect(access.assertEditor).toHaveBeenCalledWith('site-1', 'editor');
    expect(registry.validate).toHaveBeenCalledOnce();
  });
  it('does not write when access, scope or registration fails', async () => {
    const pages = new FakePageRepository();

    pages.records.set('page-1', pageFixture());
    const save = vi.spyOn(pages, 'save');
    const registry = {
      validate: vi.fn(async () => {
        throw new Error('Unknown template');
      }),
    };
    const operation = new ConfigurePageRenderingUseCase(pages, { assertEditor: async () => {} }, registry,
      fakeHookChanges);

    await expect(operation.execute({ siteId: 'site-1', actorId: 'editor', pageId: 'page-1', rendering }))
      .rejects.toThrow('Unknown template');
    await expect(operation.execute({ siteId: 'foreign', actorId: 'editor', pageId: 'page-1', rendering }))
      .rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
  });
});
