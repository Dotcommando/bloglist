import {
  RewritePageMediaReferencesUseCase,
} from '../../../src/app/use-cases/pages/rewrite-page-media-references.use-case.js';
import { Page } from '../../../src/domain/pages/page.js';
import { BrowserInteraction, HtmlDelivery, LoaderPhase } from '../../../src/domain/pages/page-rendering.js';
import { fakeHookChanges } from '../../support/hooks.js';
import { FakePageRepository, pageFixture } from '../../support/pages.js';
import { siteFixture } from '../../support/sites.js';

it('rewrites guarded page media fields without changing other draft values', async () => {
  const repository = new FakePageRepository();
  const page = new Page({
    ...pageFixture().toState(),
    contentMd: '![Photo](/assets/images/old.png)',
    ogImage: 'https://example.test/assets/images/old.png',
    tvValues: { untouched: 'draft value' },
    rendering: {
      templateId: 'Home',
      delivery: HtmlDelivery.Static,
      interaction: BrowserInteraction.None,
      parameters: { photo: '/assets/images/old.png' },
      loaders: [{
        loaderId: 'images',
        alias: 'images',
        phase: LoaderPhase.Build,
        parameters: { photo: '/assets/images/old.png' },
        dependsOn: [],
        required: false,
      }],
    },
  });

  repository.records.set(page.pageId, page);
  const save = vi.spyOn(repository, 'save');
  const operation = new RewritePageMediaReferencesUseCase(repository, { assertCanUpdatePage: async () => {} },
    { execute: async () => siteFixture() }, fakeHookChanges);

  await operation.execute({
    siteId: page.siteId,
    pageId: page.pageId,
    paths: [{ from: '/assets/images/old.png', to: '/assets/images/new.png' }],
  });
  const result = (await repository.findById(page.pageId))!.toState();

  expect(result.contentMd).toBe('![Photo](/assets/images/new.png)');
  expect(result.ogImage).toBe('https://example.test/assets/images/new.png');
  expect(result.rendering?.parameters.photo).toBe('/assets/images/new.png');
  expect(result.rendering?.loaders[0]?.parameters.photo).toBe('/assets/images/new.png');
  expect(result.tvValues).toEqual(page.toState().tvValues);
  expect(result.title).toBe(page.title);
  expect(save).toHaveBeenCalledWith(expect.any(Page), expect.anything(), page.toState());
});

it('authorizes before reads and rejects foreign pages without writing', async () => {
  const repository = new FakePageRepository();
  const read = vi.spyOn(repository, 'findById');
  const access = {
    assertCanUpdatePage: vi.fn<(siteId: string) => Promise<void>>(async () => {
      throw new Error('denied');
    }),
  };
  const operation = new RewritePageMediaReferencesUseCase(repository, access,
    { execute: async () => siteFixture() }, fakeHookChanges);
  const input = {
    siteId: 'site-1', pageId: 'page-1', paths: [{ from: '/assets/images/a.png', to: '/assets/images/b.png' }],
  };

  await expect(operation.execute(input)).rejects.toThrow('denied');
  expect(read).not.toHaveBeenCalled();
  access.assertCanUpdatePage.mockResolvedValue(undefined);
  repository.records.set('page-1', pageFixture('page-1', 'foreign'));
  await expect(operation.execute(input)).rejects.toThrow();
});

it('does not save unaffected pages and observes a rejected guarded save', async () => {
  const repository = new FakePageRepository();

  repository.records.set('page-1', pageFixture());
  const save = vi.spyOn(repository, 'save');
  const operation = new RewritePageMediaReferencesUseCase(repository, { assertCanUpdatePage: async () => {} },
    { execute: async () => siteFixture() }, fakeHookChanges);
  const input = {
    siteId: 'site-1', pageId: 'page-1', paths: [{ from: '/assets/images/a.png', to: '/assets/images/b.png' }],
  };

  await operation.execute(input);
  expect(save).not.toHaveBeenCalled();
  repository.records.set('page-1', new Page({ ...pageFixture().toState(), ogImage: 'https://example.test/assets/images/a.png' }));
  save.mockRejectedValueOnce(new Error('concurrent edit'));
  await expect(operation.execute(input)).rejects.toThrow('concurrent edit');
  expect((await repository.findById('page-1'))!.toState().ogImage).toBe('https://example.test/assets/images/a.png');
});
