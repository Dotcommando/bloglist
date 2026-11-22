import { vi } from 'vitest';

import { CreatePageUseCase } from '../../../src/app/use-cases/pages/create-page.use-case.js';
import { OpenGraphType } from '../../../src/domain/pages/open-graph-type.enum.js';
import { PageConflictError } from '../../../src/domain/pages/page-conflict.error.js';
import { PageNotFoundError } from '../../../src/domain/pages/page-not-found.error.js';
import { PageScopeError } from '../../../src/domain/pages/page-scope.error.js';
import { PageStatus } from '../../../src/domain/pages/page-status.enum.js';
import { PageType } from '../../../src/domain/pages/page-type.enum.js';
import type { ISiteReference } from '../../../src/domain/pages/site-reference.js';
import { BusinessError, BusinessErrorCode } from '../../../src/domain/shared/business-error.js';
import type { IHookChangesPort } from '../../../src/ports/outbound/hooks/hook-execution.port.js';
import type { IPrepareAutomaticPageUrl } from '../../../src/ports/outbound/pages/page-creation.port.js';
import { fakeHookChanges } from '../../support/hooks.js';
import { FakePageRepository, pageFixture, pageInput } from '../../support/pages.js';
import { urlFixture } from '../../support/routing.js';
import { instant } from '../../support/sites.js';

function setup(hooks: IHookChangesPort = fakeHookChanges, automaticUrls?: IPrepareAutomaticPageUrl): {
  repository: FakePageRepository;
  lookup: { findSite: ReturnType<typeof vi.fn<(siteId: string) => Promise<ISiteReference | null>>> };
  access: { assertCanCreatePage: ReturnType<typeof vi.fn<(siteId: string) => Promise<void>>> };
  useCase: CreatePageUseCase;
} {
  const repository = new FakePageRepository();
  const lookup = {
    findSite: vi.fn<(siteId: string) => Promise<ISiteReference | null>>()
      .mockResolvedValue({ siteId: 'site-1', languages: ['en'] }),
  };
  const access = {
    assertCanCreatePage: vi.fn<(siteId: string) => Promise<void>>(),
    assertCanUpdatePage: vi.fn<(siteId: string) => Promise<void>>(),
    assertCanReadPage: vi.fn<(siteId: string) => Promise<void>>(),
  };
  const useCase = new CreatePageUseCase(repository, lookup, {
    nextPageId: () => 'page-1',
    currentInstant: () => instant,
  }, access, hooks, automaticUrls);

  return { repository, lookup, access, useCase };
}

describe('CreatePageUseCase', () => {
  it('creates a normalized draft with the agreed defaults and no cluster provider', async () => {
    const { repository, lookup, access, useCase } = setup();
    const save = vi.spyOn(repository, 'save');
    const result = await useCase.execute(pageInput());

    expect(access.assertCanCreatePage).toHaveBeenCalledWith('site-1');
    expect(lookup.findSite).toHaveBeenCalledWith('site-1');
    expect(save).toHaveBeenCalledOnce();
    expect(result.toState()).toEqual({ ...pageFixture().toState(), pageNumber: '1' });
    expect(result.toState()).toMatchObject({
      status: PageStatus.DRAFT,
      publishedAt: null,
      clusterId: null,
      type: PageType.STATIC,
      robotsIndex: true,
    });
    expect(result.toState()).not.toHaveProperty('rendering');
  });

  it('requires a heading before saving a draft that needs an automatic URL', async () => {
    const { repository, useCase } = setup();
    const save = vi.spyOn(repository, 'save');
    const authority = {
      actorId: 'editor',
      siteId: 'site-1',
      actionId: 'cms.pages.create',
      scopes: ['own'] as const,
      groupIds: [],
      administrator: false,
      automaticPageUrl: true as const,
    };

    await expect(useCase.execute({ ...pageInput(), h1: '  ', authority }))
      .rejects.toMatchObject({ code: BusinessErrorCode.Validation });
    expect(save).not.toHaveBeenCalled();
  });

  it('preserves explicit content/SEO values, including false and empty strings', async () => {
    const { useCase } = setup();
    const result = await useCase.execute({
      ...pageInput(),
      h1: 'Heading',
      metaTitle: '',
      metaDescription: null,
      ogTitle: 'Social title',
      ogDescription: 'Social description',
      ogImage: 'https://example.test/share.webp',
      ogType: OpenGraphType.Article,
      contentMd: '# Content',
      type: PageType.MIXED,
      robotsIndex: false,
    });

    expect(result.toState()).toMatchObject({
      h1: 'Heading',
      metaTitle: '',
      metaDescription: null,
      ogTitle: 'Social title',
      ogDescription: 'Social description',
      ogImage: 'https://example.test/share.webp',
      ogType: OpenGraphType.Article,
      contentMd: '# Content',
      type: PageType.MIXED,
      robotsIndex: false,
    });
  });

  it('respects routing checks before an automatic URL and its page can be saved', async () => {
    const check = vi.fn<IHookChangesPort['prepare']>(async (change) => {
      if (change.checkKey === 'cms.routing.change.check') {
        throw new BusinessError(BusinessErrorCode.HookDenied, 'Address is disallowed');
      }

      return fakeHookChanges.prepare(change);
    });
    const url = urlFixture({ path: '/automatic', segment: 'automatic' });
    const { useCase, repository } = setup({ prepare: check }, { prepare: async () => url });
    const save = vi.spyOn(repository, 'save');

    await expect(useCase.execute({
      ...pageInput(),
      h1: 'Automatic',
      authority: {
        actorId: 'editor',
        siteId: 'site-1',
        actionId: 'cms.pages.create',
        scopes: ['all'],
        groupIds: [],
        administrator: false,
        automaticPageUrl: true,
      },
    })).rejects.toMatchObject({ code: BusinessErrorCode.HookDenied });
    expect(check).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'editor',
      checkKey: 'cms.routing.change.check',
      candidate: expect.objectContaining({ path: '/automatic' }),
    }));
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects missing/foreign site references and disabled languages before saving', async () => {
    const { repository, lookup, useCase } = setup();
    const save = vi.spyOn(repository, 'save');

    lookup.findSite.mockResolvedValueOnce(null);
    await expect(useCase.execute(pageInput())).rejects.toBeInstanceOf(PageNotFoundError);
    lookup.findSite.mockResolvedValueOnce({ siteId: 'foreign', languages: ['en'] });
    await expect(useCase.execute(pageInput())).rejects.toBeInstanceOf(PageScopeError);
    await expect(useCase.execute({ ...pageInput(), language: 'de' })).rejects.toBeInstanceOf(PageScopeError);
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects unsupported non-null clusters instead of fabricating a provider', async () => {
    const { repository, useCase } = setup();
    const save = vi.spyOn(repository, 'save');

    await expect(useCase.execute({ ...pageInput(), clusterId: 'cluster' })).rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
  });

  it('allows the same mark in another site and rejects case-insensitive duplicates within the site', async () => {
    const { repository, useCase } = setup();

    await repository.save(pageFixture('other', 'another-site', 'hOME'));
    const save = vi.spyOn(repository, 'save');

    expect((await useCase.execute(pageInput())).siteId).toBe('site-1');
    expect(repository.records.get('other')?.siteId).toBe('another-site');
    await expect(useCase.execute({ ...pageInput(), mark: 'hOME' })).rejects.toBeInstanceOf(PageConflictError);
    expect(save).toHaveBeenCalledOnce();
  });

  it('denies before accessing cross-capability data', async () => {
    const { lookup, access, useCase } = setup();

    access.assertCanCreatePage.mockRejectedValue(new BusinessError(BusinessErrorCode.Forbidden, 'Denied'));
    await expect(useCase.execute(pageInput())).rejects.toMatchObject({ code: BusinessErrorCode.Forbidden });
    expect(lookup.findSite).not.toHaveBeenCalled();
  });

  it('does not retry or hide a failed persistence acknowledgement', async () => {
    const { repository, useCase } = setup();
    const failure = new Error('Uncertain write');
    const save = vi.spyOn(repository, 'save').mockRejectedValue(failure);

    await expect(useCase.execute(pageInput())).rejects.toBe(failure);
    expect(save).toHaveBeenCalledOnce();
  });

  it('rejects an inconsistent saved page', async () => {
    const { repository, useCase } = setup();

    vi.spyOn(repository, 'save').mockResolvedValue(pageFixture('page-1', 'foreign-site'));
    await expect(useCase.execute(pageInput())).rejects.toBeInstanceOf(PageScopeError);
  });
});
