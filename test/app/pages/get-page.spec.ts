import { vi } from 'vitest';

import { GetPageUseCase } from '../../../src/app/use-cases/pages/get-page.use-case.js';
import { PageScopeError } from '../../../src/domain/pages/page-scope.error.js';
import { BusinessError, BusinessErrorCode } from '../../../src/domain/shared/business-error.js';
import { FakePageRepository, pageFixture } from '../../support/pages.js';

describe('GetPageUseCase', () => {
  const access = {
    assertCanCreatePage: vi.fn<(siteId: string) => Promise<void>>(),
    assertCanUpdatePage: vi.fn<(siteId: string) => Promise<void>>(),
    assertCanReadPage: vi.fn<(siteId: string) => Promise<void>>(),
  };

  beforeEach(() => vi.resetAllMocks());

  it('reads an owned editable page without writing or publishing it', async () => {
    const repository = new FakePageRepository();
    const page = await repository.save(pageFixture());
    const save = vi.spyOn(repository, 'save');
    const found = await new GetPageUseCase(repository, access).execute({ siteId: 'site-1', pageId: 'page-1' });

    expect(found?.toState()).toEqual(page.toState());
    expect(found).not.toBe(page);
    expect(access.assertCanReadPage).toHaveBeenCalledWith('site-1');
    expect(save).not.toHaveBeenCalled();
  });

  it('returns null for an absent page', async () => {
    expect(await new GetPageUseCase(new FakePageRepository(), access)
      .execute({ siteId: 'site-1', pageId: 'missing' })).toBeNull();
  });

  it.each(['site', 'page'])('rejects a mismatched %s identity', async (mismatch) => {
    const repository = new FakePageRepository();

    vi.spyOn(repository, 'findById').mockResolvedValue(
      pageFixture(mismatch === 'page' ? 'other-page' : 'page-1', mismatch === 'site' ? 'other-site' : 'site-1'),
    );
    await expect(new GetPageUseCase(repository, access).execute({ siteId: 'site-1', pageId: 'page-1' }))
      .rejects.toBeInstanceOf(PageScopeError);
  });

  it('denies before reading another entity', async () => {
    const repository = new FakePageRepository();
    const read = vi.spyOn(repository, 'findById');

    access.assertCanReadPage.mockRejectedValue(new BusinessError(BusinessErrorCode.Forbidden, 'Denied'));
    await expect(new GetPageUseCase(repository, access).execute({ siteId: 'site-1', pageId: 'page-1' }))
      .rejects.toMatchObject({ code: BusinessErrorCode.Forbidden });
    expect(read).not.toHaveBeenCalled();
  });

  it('propagates dependency failure instead of treating it as absence', async () => {
    const repository = new FakePageRepository();
    const failure = new Error('Unavailable');

    vi.spyOn(repository, 'findById').mockRejectedValue(failure);
    await expect(new GetPageUseCase(repository, access).execute({ siteId: 'site-1', pageId: 'page-1' }))
      .rejects.toBe(failure);
  });
});
