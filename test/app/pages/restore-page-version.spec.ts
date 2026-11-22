import { RestorePageVersionUseCase } from '../../../src/app/use-cases/pages/restore-page-version.use-case.js';
import { type IPageState, Page } from '../../../src/domain/pages/page.js';
import { HtmlDelivery } from '../../../src/domain/pages/page-rendering.js';
import { PageType } from '../../../src/domain/pages/page-type.enum.js';
import { PublishedVersionPosition } from '../../../src/domain/pages/published-page-version.js';
import { fakeHookChanges } from '../../support/hooks.js';
import { FakePageRepository, pageFixture } from '../../support/pages.js';
import { source } from '../../support/publication.js';
import { instant } from '../../support/sites.js';

describe('RestorePageVersion', () => {
  it('replaces the draft content/rendering while preserving identity, URLs and retained publications', async () => {
    const current = pageFixture();

    current.publish(instant);
    current.changeTitle('Current draft');
    current.editDraft();
    const previous = pageFixture();

    previous.changeTitle('Saved version');
    previous.changeHeading('Saved heading');
    previous.changeSeoMetadata({ metaTitle: 'Saved SEO', metaDescription: 'Saved description' });
    previous.changeContent('Saved **body**');
    previous.changeType(PageType.MIXED);
    previous.setRobotsIndex(false);
    previous.configureRendering({ ...source('').pages[0]!.rendering!, delivery: HtmlDelivery.Request });
    previous.publish(instant);
    const pages = new FakePageRepository();

    pages.records.set(current.pageId, current);
    const restore = vi.fn(async (_expected: IPageState, _selected: IPageState, _position: PublishedVersionPosition,
      page: Page) => new Page(page.toState()));
    const operation = new RestorePageVersionUseCase(pages, {
      versions: async () => [
        previous.toState()],
      restore,
      publish: vi.fn(),
    }, {
      assertCanReadPage: async () => {},
      assertCanCreatePage: async () => {},
      assertCanUpdatePage: async () => {},
    }, { nextPageId: () => '', currentInstant: () => instant }, fakeHookChanges);
    const result = await operation.execute({
      siteId: 'site-1',
      pageId: 'page-1',
      version: PublishedVersionPosition.Latest,
    });

    expect(result.status).toBe('DRAFT');
    expect(result.title).toBe('Saved version');
    expect(result.toState()).toMatchObject({
      h1: 'Saved heading',
      metaTitle: 'Saved SEO',
      metaDescription: 'Saved description',
      contentMd: 'Saved **body**',
      type: PageType.MIXED,
      robotsIndex: false,
    });
    expect(result.toState().rendering?.delivery).toBe(HtmlDelivery.Request);
    expect(result.publishedAt).toEqual(current.publishedAt);
    expect(current.title).toBe('Current draft');
    expect(restore).toHaveBeenCalledOnce();
  });
  it('fails when the selected retained version is absent', async () => {
    const pages = new FakePageRepository();

    pages.records.set('page-1', pageFixture());
    const restore = vi.fn();
    const operation = new RestorePageVersionUseCase(pages, {
      versions: async () => [],
      restore,
      publish:
      vi.fn(),
    }, {
      assertCanReadPage: async () => {},
      assertCanCreatePage: async () => {},
      assertCanUpdatePage: async () => {},
    }, { nextPageId: () => '', currentInstant: () => instant }, fakeHookChanges);

    await expect(operation.execute({ siteId: 'site-1', pageId: 'page-1', version: PublishedVersionPosition.Oldest }))
      .rejects.toMatchObject({ code: 'NotFound' });
    expect(restore).not.toHaveBeenCalled();
  });
  it('denies before reading the current page or retained versions', async () => {
    const pages = new FakePageRepository();
    const read = vi.spyOn(pages, 'findById');
    const versions = vi.fn();
    const operation = new RestorePageVersionUseCase(pages, { versions, restore: vi.fn(), publish: vi.fn() }, {
      assertCanReadPage: async () => {},
      assertCanCreatePage: async () => {},
      assertCanUpdatePage: async () => {
        throw new Error('Denied');
      },
    }, { nextPageId: () => '', currentInstant: () => instant }, fakeHookChanges);

    await expect(operation.execute({ siteId: 'site-1', pageId: 'page-1', version: PublishedVersionPosition.Latest }))
      .rejects.toThrow('Denied');
    expect(read).not.toHaveBeenCalled();
    expect(versions).not.toHaveBeenCalled();
  });
});
