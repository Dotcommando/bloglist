import { MovePageUseCase } from '../../../src/app/use-cases/pages/move-page.use-case.js';
import { Page } from '../../../src/domain/pages/page.js';
import { fakeHookChanges } from '../../support/hooks.js';
import { FakePageRepository, pageFixture } from '../../support/pages.js';

describe('MovePage', () => {
  it('moves a page with its order and immutable number preserved through an explicit store', async () => {
    const pages = new FakePageRepository();
    const root = new Page({ ...pageFixture().toState(), pageId: 'root', pageNumber: '1', sortOrder: 100 });
    const child = new Page({
      ...pageFixture().toState(),
      pageId: 'child',
      pageNumber: '2',
      parentPageId: 'root',
      sortOrder: 200,
    });

    pages.records.set(root.pageId, root);
    pages.records.set(child.pageId, child);
    const store = { move: vi.fn(async () => new Page({ ...child.toState(), parentPageId: null })) };
    const operation = new MovePageUseCase(pages, {
      assertCanUpdatePage: vi.fn(),
      assertCanReadPage: vi.fn(),
      assertCanCreatePage: vi.fn(),
    }, store, fakeHookChanges);
    const moved = await operation.execute({
      siteId: 'site-1',
      pageId: 'child',
      parentPageId: null,
      expectedParentPageId: 'root',
      expectedSortOrder: 200,
    });

    expect(moved.toState()).toMatchObject({ parentPageId: null, pageNumber: '2', sortOrder: 200 });
    expect(store.move).toHaveBeenCalledExactlyOnceWith(child.toState(), null,
      expect.objectContaining({ siteId: 'site-1', subject: 'child' }));
  });

  it('rejects stale positions, cycles and foreign parents before writing', async () => {
    const pages = new FakePageRepository();

    pages.records.set('root', new Page({ ...pageFixture().toState(), pageId: 'root', sortOrder: 100 }));
    pages.records.set('child', new Page({ ...pageFixture().toState(), pageId: 'child', parentPageId: 'root' }));
    pages.records.set('foreign', pageFixture('foreign', 'other'));
    const store = { move: vi.fn() };
    const access = { assertCanUpdatePage: vi.fn(), assertCanReadPage: vi.fn(), assertCanCreatePage: vi.fn() };
    const operation = new MovePageUseCase(pages, access, store, fakeHookChanges);
    const input = {
      siteId: 'site-1',
      pageId: 'root',
      parentPageId: 'child',
      expectedParentPageId: null,
      expectedSortOrder: 100,
    };

    await expect(operation.execute(input)).rejects.toMatchObject({ code: 'Validation' });
    await expect(operation.execute({ ...input, parentPageId: 'foreign' })).rejects.toMatchObject({ code: 'NotFound' });
    await expect(operation.execute({ ...input, parentPageId: null, expectedSortOrder: 200 }))
      .rejects.toMatchObject({ code: 'Conflict' });
    access.assertCanUpdatePage.mockRejectedValue(new Error('Denied'));
    await expect(operation.execute(input)).rejects.toThrow('Denied');
    expect(store.move).not.toHaveBeenCalled();
  });
});
