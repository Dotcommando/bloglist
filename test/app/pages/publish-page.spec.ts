import { PublishPageUseCase } from '../../../src/app/use-cases/pages/publish-page.use-case.js';
import { type IPageState, Page } from '../../../src/domain/pages/page.js';
import { PageStatus } from '../../../src/domain/pages/page-status.enum.js';
import { fakeHookChanges } from '../../support/hooks.js';
import { FakePageRepository, pageFixture } from '../../support/pages.js';

describe('PublishPage without approval workflow', () => {
  it('publishes a draft directly and delegates atomic three-version retention', async () => {
    const pages = new FakePageRepository();

    pages.records.set('page-1', pageFixture());
    const at = new Date('2026-10-24T15:00:00Z');
    const publish = vi.fn(async (state: IPageState, instant: Date) => {
      const page = new Page(state);

      page.publish(instant);

      return page;
    });
    const operation = new PublishPageUseCase(pages, { assertEditor: async () => {} }, {
      publish,
      versions:
      async () => [],
      restore: vi.fn(),
    }, { nextPageId: () => '', currentInstant: () => at }, {
      validate:
      async () => {},
    }, fakeHookChanges);

    expect((await operation.execute({ siteId: 'site-1', pageId: 'page-1' })).status).toBe(PageStatus.PUBLISHED);
    expect(publish).toHaveBeenCalledWith(pageFixture().toState(), at,
      expect.objectContaining({ siteId: 'site-1', subject: 'page-1' }));
    expect(pages.records.get('page-1')?.status).toBe(PageStatus.DRAFT);
  });
});
