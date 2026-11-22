import { GetPageEditorialStatesUseCase } from '../../../src/app/use-cases/pages/get-page-editorial-states.use-case.js';
import { type IPageState, Page } from '../../../src/domain/pages/page.js';
import { pageFixture } from '../../support/pages.js';

it('compares against the selected active snapshot, ignores timestamps and retains newer draft changes', async () => {
  const original = pageFixture().toState();
  let draft = new Page({ ...original, metaTitle: 'Unpublished SEO', updatedAt: new Date(1) });
  const readRelease = vi.fn(async () => original);
  const operation = new GetPageEditorialStatesUseCase({ assertCanReadPage: async () => {} }, {
    findBySite: async () => [draft],
  }, { getActive: async () => ({ siteId: original.siteId, releaseId: 'active', activatedAt: new Date(0) }) },
  { readRelease });
  const result = await operation.execute({ siteId: original.siteId, pageId: original.pageId });

  expect(result.pages[0]?.changedFields).toEqual(['metaTitle']);
  expect(result.publishedPage).toEqual(original);
  expect(readRelease).toHaveBeenCalledExactlyOnceWith(original.siteId, original.pageId, 'active');
  draft = new Page({ ...original, updatedAt: new Date(2) });
  expect((await operation.execute({ siteId: original.siteId })).pages[0]?.changedFields).toEqual([]);
});

it('authorizes before reading and rejects foreign snapshots', async () => {
  const original = pageFixture().toState();
  const findBySite = vi.fn(async () => [new Page(original)]);
  const denied = new GetPageEditorialStatesUseCase({
    assertCanReadPage: async () => {
      throw new Error('Denied');
    },
  },
  { findBySite }, { getActive: vi.fn() }, { readRelease: vi.fn() });

  await expect(denied.execute({ siteId: original.siteId })).rejects.toThrow('Denied');
  expect(findBySite).not.toHaveBeenCalled();
  const operation = new GetPageEditorialStatesUseCase({ assertCanReadPage: async () => {} }, { findBySite }, {
    getActive: async () => ({ siteId: original.siteId, releaseId: 'active', activatedAt: new Date(0) }),
  }, { readRelease: async () => ({ ...original, siteId: 'foreign' }) });

  await expect(operation.execute({ siteId: original.siteId })).rejects.toThrow();
});

it('observes sibling read failures after the first comparison fails', async () => {
  const page = pageFixture().toState();
  const failures: ((error: Error) => void)[] = [];
  let admitted!: () => void;
  const ready = new Promise<void>((resolve) => {
    admitted = resolve;
  });
  const operation = new GetPageEditorialStatesUseCase({ assertCanReadPage: async () => {} }, {
    findBySite: async () => [new Page(page), new Page({ ...page, pageId: 'second', mark: 'Second' })],
  }, { getActive: async () => ({ siteId: page.siteId, releaseId: 'active', activatedAt: new Date(0) }) }, {
    readRelease: () => new Promise<IPageState | null>((_resolve, reject) => {
      failures.push(reject);

      if (failures.length === 2) {
        admitted();
      }
    }),
  });
  const first = new Error('First failed read');
  const outcome = operation.execute({ siteId: page.siteId }).then(() => null, (error: unknown) => error);

  await ready;
  failures[0]!(first);
  expect(await outcome).toBe(first);
  failures[1]!(new Error('Later sibling failure'));
  await Promise.resolve();
  await Promise.resolve();
});
