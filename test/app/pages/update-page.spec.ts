import { vi } from 'vitest';

import { UpdatePageUseCase } from '../../../src/app/use-cases/pages/update-page.use-case.js';
import { OpenGraphType } from '../../../src/domain/pages/open-graph-type.enum.js';
import { PageNotFoundError } from '../../../src/domain/pages/page-not-found.error.js';
import { PageScopeError } from '../../../src/domain/pages/page-scope.error.js';
import { PageType } from '../../../src/domain/pages/page-type.enum.js';
import { BusinessError, BusinessErrorCode } from '../../../src/domain/shared/business-error.js';
import { fakeHookChanges } from '../../support/hooks.js';
import { FakePageRepository, pageFixture } from '../../support/pages.js';

describe('UpdatePageUseCase', () => {
  it('updates and clears social metadata without changing omitted values or page identity', async () => {
    const repository = new FakePageRepository();
    const page = pageFixture();

    page.publish(new Date('2026-10-24T12:00:00Z'));
    await repository.save(page);
    const operation = new UpdatePageUseCase(repository, access, fakeHookChanges);
    const result = await operation.execute({
      siteId: page.siteId,
      pageId: page.pageId,
      ogTitle: 'Social',
      ogDescription: 'Description',
      ogImage: 'https://example.test/share.webp',
      ogType: OpenGraphType.Article,
    });

    expect(result.toState()).toMatchObject({ status: 'DRAFT', ogTitle: 'Social', ogType: 'article' });
    const cleared = await operation.execute({ siteId: page.siteId, pageId: page.pageId, ogTitle: null });

    expect(cleared.toState()).toMatchObject({
      ogTitle: null,
      ogDescription: 'Description',
      ogImage: 'https://example.test/share.webp',
      ogType: 'article',
      title: 'Home',
      mark: 'Home',
    });

    for (const ogImage of ['javascript:alert(1)', 'relative.webp', 'https://user:password@example.test/a']) {
      await expect(operation.execute({ siteId: page.siteId, pageId: page.pageId, ogImage })).rejects.toThrow();
    }
  });
  it('saves literal custom-MIME drafts, preserves omitted preferences and rejects header injection', async () => {
    const repository = new FakePageRepository();
    const page = pageFixture();

    page.publish(new Date('2026-11-01T00:00:00Z'));
    await repository.save(page);
    const operation = new UpdatePageUseCase(repository, access, fakeHookChanges);
    const result = await operation.execute({
      siteId: page.siteId,
      pageId: page.pageId,
      mimeType: 'Application/vnd.example+json',
      excludeFromSitemap: true,
      contentMd: '{"literal":"[[*title]]"}',
    });

    expect(result.toState()).toMatchObject({
      mimeType: 'application/vnd.example+json',
      excludeFromSitemap: true,
      contentMd: '{"literal":"[[*title]]"}',
      status: 'DRAFT',
    });
    expect((await operation.execute({ siteId: page.siteId, pageId: page.pageId, title: 'Renamed' })).toState())
      .toMatchObject({ mimeType: 'application/vnd.example+json', excludeFromSitemap: true });
    await expect(operation.execute({
      siteId: page.siteId, pageId: page.pageId, mimeType: 'text/plain\r\nX-Injected: yes',
    })).rejects.toThrow();
    expect((await repository.findById(page.pageId))?.toState().mimeType).toBe('application/vnd.example+json');
  });
  const access = {
    assertCanCreatePage: vi.fn<(siteId: string) => Promise<void>>(),
    assertCanReadPage: vi.fn<(siteId: string) => Promise<void>>(),
    assertCanUpdatePage: vi.fn<(siteId: string) => Promise<void>>(),
  };

  beforeEach(() => vi.resetAllMocks());

  it('applies explicit values, preserves omitted fields and returns acknowledged state', async () => {
    const repository = new FakePageRepository();
    const page = pageFixture();

    page.changeSeoMetadata({ metaTitle: 'Keep', metaDescription: 'Clear' });
    await repository.save(page);
    const save = vi.spyOn(repository, 'save');
    const result = await new UpdatePageUseCase(repository, access, fakeHookChanges).execute({
      siteId: page.siteId,
      pageId: page.pageId,
      title: ' New ',
      metaDescription: null,
      contentMd: '',
      robotsIndex: false,
      type: PageType.MIXED,
    });

    expect(access.assertCanUpdatePage).toHaveBeenCalledWith(page.siteId);
    expect(save).toHaveBeenCalledOnce();
    expect(result.toState()).toMatchObject({
      title: 'New',
      metaTitle: 'Keep',
      metaDescription: null,
      contentMd: '',
      robotsIndex: false,
      type: PageType.MIXED,
      publishedAt: null,
    });
    expect(page.title).toBe('Home');
  });

  it('rejects missing/foreign identities without saving', async () => {
    const repository = new FakePageRepository();
    const save = vi.spyOn(repository, 'save');
    const operation = new UpdatePageUseCase(repository, access, fakeHookChanges);

    await expect(operation.execute({ siteId: 'site-1', pageId: 'missing' }))
      .rejects.toBeInstanceOf(PageNotFoundError);
    vi.spyOn(repository, 'findById').mockResolvedValue(pageFixture('page-1', 'foreign'));
    await expect(operation.execute({ siteId: 'site-1', pageId: 'page-1' }))
      .rejects.toBeInstanceOf(PageScopeError);
    expect(save).not.toHaveBeenCalled();
  });

  it('leaves the loaded object untouched when later validation fails', async () => {
    const repository = new FakePageRepository();
    const page = pageFixture();

    vi.spyOn(repository, 'findById').mockResolvedValue(page);
    const save = vi.spyOn(repository, 'save');
    const input = { siteId: page.siteId, pageId: page.pageId, title: 'Changed' };

    Object.defineProperty(input, 'type', { value: 'Unsupported' });
    await expect(new UpdatePageUseCase(repository, access, fakeHookChanges).execute(input)).rejects.toThrow();
    expect(page.title).toBe('Home');
    expect(save).not.toHaveBeenCalled();
  });

  it('denies before reading and propagates uncertain writes without retry', async () => {
    const repository = new FakePageRepository();
    const read = vi.spyOn(repository, 'findById').mockResolvedValue(pageFixture());
    const failure = new Error('Acknowledgement lost');
    const save = vi.spyOn(repository, 'save').mockRejectedValue(failure);
    const operation = new UpdatePageUseCase(repository, access, fakeHookChanges);

    access.assertCanUpdatePage.mockRejectedValueOnce(new BusinessError(BusinessErrorCode.Forbidden, 'Denied'));
    await expect(operation.execute({ siteId: 'site-1', pageId: 'page-1' }))
      .rejects.toMatchObject({ code: 'Forbidden' });
    expect(read).not.toHaveBeenCalled();
    await expect(operation.execute({ siteId: 'site-1', pageId: 'page-1', h1: null })).rejects.toBe(failure);
    expect(save).toHaveBeenCalledOnce();
  });

  it('does not change editorial lifecycle or first publication time', async () => {
    const repository = new FakePageRepository();
    const page = pageFixture();

    page.publish(new Date('2026-10-24T12:00:00Z'));
    page.archive();
    await repository.save(page);
    const result = await new UpdatePageUseCase(repository, access, fakeHookChanges).execute({
      siteId: page.siteId,
      pageId: page.pageId,
      title: 'Edited',
    });

    expect(result.toState().status).toBe(page.toState().status);
    expect(result.publishedAt).toEqual(page.publishedAt);
  });
});
