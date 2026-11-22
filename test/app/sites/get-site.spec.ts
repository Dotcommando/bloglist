import { vi } from 'vitest';

import { GetSiteUseCase } from '../../../src/app/use-cases/sites/get-site.use-case.js';
import { BusinessError, BusinessErrorCode } from '../../../src/domain/shared/business-error.js';
import { FakeSiteRepository, siteFixture } from '../../support/sites.js';

describe('GetSiteUseCase', () => {
  const access = {
    assertCanListSites: vi.fn<() => Promise<void>>(),
    assertCanCreateSite: vi.fn<() => Promise<void>>(),
    assertCanReadSite: vi.fn<(siteId: string) => Promise<void>>(),
  };

  beforeEach(() => vi.resetAllMocks());

  it('returns an owned detached site, including an archived record', async () => {
    const repository = new FakeSiteRepository();
    const site = siteFixture();

    site.archive();
    await repository.save(site);
    const save = vi.spyOn(repository, 'save');
    const result = await new GetSiteUseCase(repository, access).execute({ siteId: site.siteId });

    expect(result?.toState()).toEqual(site.toState());
    expect(result).not.toBe(site);
    expect(access.assertCanReadSite).toHaveBeenCalledWith(site.siteId);
    expect(save).not.toHaveBeenCalled();
  });

  it('returns null for absence, without manufacturing a site', async () => {
    expect(await new GetSiteUseCase(new FakeSiteRepository(), access).execute({ siteId: 'missing' })).toBeNull();
  });

  it('rejects a mismatched identity', async () => {
    const repository = new FakeSiteRepository();

    vi.spyOn(repository, 'findById').mockResolvedValue(siteFixture('foreign'));
    await expect(new GetSiteUseCase(repository, access).execute({ siteId: 'site-1' }))
      .rejects.toMatchObject({ code: BusinessErrorCode.Scope });
  });

  it('denies before reading private configuration', async () => {
    const repository = new FakeSiteRepository();
    const read = vi.spyOn(repository, 'findById');

    access.assertCanReadSite.mockRejectedValue(new BusinessError(BusinessErrorCode.Forbidden, 'Denied'));
    await expect(new GetSiteUseCase(repository, access).execute({ siteId: 'site-1' }))
      .rejects.toMatchObject({ code: BusinessErrorCode.Forbidden });
    expect(read).not.toHaveBeenCalled();
  });

  it('keeps dependency failure distinct from null', async () => {
    const repository = new FakeSiteRepository();
    const failure = new Error('Unavailable');

    vi.spyOn(repository, 'findById').mockRejectedValue(failure);
    await expect(new GetSiteUseCase(repository, access).execute({ siteId: 'site-1' })).rejects.toBe(failure);
  });
});
