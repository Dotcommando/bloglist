import { PublishPageUseCase } from '../../../src/app/use-cases/pages/publish-page.use-case.js';
import { RestorePageVersionUseCase } from '../../../src/app/use-cases/pages/restore-page-version.use-case.js';
import { Page } from '../../../src/domain/pages/page.js';
import { fakeHookChanges } from '../../support/hooks.js';
import { FakePageRepository, pageFixture } from '../../support/pages.js';
import { instant } from '../../support/sites.js';

describe('page version operation boundaries', () => {
  it.each(['access', 'registry', 'hook', 'persistence'] as const)(
    'publication propagates %s failure without pretending the draft is published', async (boundary) => {
      const pages = new FakePageRepository();

      pages.records.set('page-1', pageFixture());
      const failure = new Error('Controlled ' + boundary + ' failure');
      const assertEditor = vi.fn(async () => {
        if (boundary === 'access') {
          throw failure;
        }
      });
      const validate = vi.fn(async () => {
        if (boundary === 'registry') {
          throw failure;
        }
      });
      const prepare = vi.fn(async (...args: Parameters<typeof fakeHookChanges.prepare>) => {
        if (boundary === 'hook') {
          throw failure;
        }

        return fakeHookChanges.prepare(...args);
      });
      const publish = vi.fn(async () => {
        throw failure;
      });
      const operation = new PublishPageUseCase(pages, { assertEditor }, {
        publish, versions: async () => [], restore: vi.fn(),
      }, { nextPageId: () => 'unused', currentInstant: () => instant }, { validate }, { prepare });

      await expect(operation.execute({ siteId: 'site-1', pageId: 'page-1' })).rejects.toBe(failure);
      expect(pages.records.get('page-1')!.toState()).toEqual(pageFixture().toState());
      expect(publish).toHaveBeenCalledTimes(boundary === 'persistence' ? 1 : 0);

      if (boundary === 'access') {
        expect(validate).not.toHaveBeenCalled();
      }
      if (boundary === 'access' || boundary === 'registry') {
        expect(prepare).not.toHaveBeenCalled();
      }
    },
  );

  it('rejects a publication result from another site rather than exposing it', async () => {
    const pages = new FakePageRepository();

    pages.records.set('page-1', pageFixture());
    const foreign = pageFixture('page-1', 'foreign');

    foreign.publish(instant);
    const operation = new PublishPageUseCase(pages, { assertEditor: async () => {} }, {
      publish: async () => foreign, versions: async () => [], restore: vi.fn(),
    }, { nextPageId: () => 'unused', currentInstant: () => instant }, { validate: async () => {} }, fakeHookChanges);

    await expect(operation.execute({ siteId: 'site-1', pageId: 'page-1' }))
      .rejects.toMatchObject({ name: 'PageScopeError' });
  });

  it.each([0, 4, -1, 1.5, Number.NaN])('rejects position %s before publication I/O', async (version) => {
    const pages = new FakePageRepository();
    const versions = vi.fn(async () => []);
    const restore = vi.fn();
    const operation = new RestorePageVersionUseCase(pages, {
      publish: vi.fn(), versions, restore,
    }, { assertCanCreatePage: async () => {}, assertCanReadPage: async () => {}, assertCanUpdatePage: async () => {} },
    { nextPageId: () => 'unused', currentInstant: () => instant }, fakeHookChanges);

    await expect(operation.execute({ siteId: 'site-1', pageId: 'page-1', version }))
      .rejects.toMatchObject({ code: 'Validation' });
    expect(versions).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
  });

  it('preserves the draft when restoration fails and does not alter the retained snapshot', async () => {
    const pages = new FakePageRepository();

    pages.records.set('page-1', pageFixture());
    const published = new Page(pageFixture().toState());

    published.changeTitle('Retained');
    published.publish(instant);
    const retained = published.toState();
    const failure = new Error('Restoration failed');
    const operation = new RestorePageVersionUseCase(pages, {
      publish: vi.fn(),
      versions: async () => [retained],
      restore: async () => {
        throw failure;
      },
    }, { assertCanCreatePage: async () => {}, assertCanReadPage: async () => {}, assertCanUpdatePage: async () => {} },
    { nextPageId: () => 'unused', currentInstant: () => instant }, fakeHookChanges);

    await expect(operation.execute({ siteId: 'site-1', pageId: 'page-1', version: 1 })).rejects.toBe(failure);
    expect(pages.records.get('page-1')!.toState()).toEqual(pageFixture().toState());
    expect(retained).toEqual(published.toState());
  });
});
