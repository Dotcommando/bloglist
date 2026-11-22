import { UpdatePageUseCase } from '../../../src/app/use-cases/pages/update-page.use-case.js';
import { BrowserInteraction, HtmlDelivery } from '../../../src/domain/pages/page-rendering.js';
import { RequestCacheScope } from '../../../src/domain/publication/request-cache.policy.js';
import { fakeHookChanges } from '../../support/hooks.js';
import { FakePageRepository, pageFixture } from '../../support/pages.js';

it('saves an explicit Request cache policy in the draft and removes it on explicit null', async () => {
  const pages = new FakePageRepository();
  const page = pageFixture();

  page.configureRendering({
    templateId: 'Home',
    delivery: HtmlDelivery.Request,
    interaction: BrowserInteraction.Api,
    loaders: [],
    parameters: { title: 'keep' },
  });
  pages.records.set(page.pageId, page);
  const access = {
    assertCanUpdatePage: vi.fn(async () => {}),
    assertCanReadPage: vi.fn(),
    assertCanCreatePage: vi.fn(),
  };
  const operation = new UpdatePageUseCase(pages, access, fakeHookChanges);
  const policy = { scope: RequestCacheScope.SharedPublic, ttlMs: 60000 };
  const saved = await operation.execute({ siteId: page.siteId, pageId: page.pageId, requestCache: policy });

  expect(saved.toState().rendering).toEqual({ ...page.toState().rendering, requestCache: policy });
  const disabled = await operation.execute({ siteId: page.siteId, pageId: page.pageId, requestCache: null });

  expect(disabled.toState().rendering).toEqual(page.toState().rendering);
  await expect(operation.execute({
    siteId: page.siteId,
    pageId: page.pageId,
    requestCache: { ...policy, ttlMs: 0 },
  })).rejects.toThrow();
});
