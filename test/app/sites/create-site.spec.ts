import { vi } from 'vitest';

import { CreateSiteUseCase } from '../../../src/app/use-cases/sites/create-site.use-case.js';
import { BusinessError, BusinessErrorCode } from '../../../src/domain/shared/business-error.js';
import { SiteOriginMode } from '../../../src/domain/sites/site-origin-mode.enum.js';
import { SiteStatus } from '../../../src/domain/sites/site-status.enum.js';
import { fakeSiteSetup } from '../../support/hooks.js';
import { fakeHookChanges } from '../../support/hooks.js';
import { FakeSiteRepository, instant, siteFixture, siteInput } from '../../support/sites.js';

function setup(): {
  repository: FakeSiteRepository;
  access: {
    assertCanCreateSite: ReturnType<typeof vi.fn<() => Promise<void>>>;
    assertCanListSites: ReturnType<typeof vi.fn<() => Promise<void>>>;
    assertCanReadSite: ReturnType<typeof vi.fn<(siteId: string) => Promise<void>>>;
  };
  useCase: CreateSiteUseCase;
} {
  const repository = new FakeSiteRepository();
  const access = {
    assertCanListSites: vi.fn<() => Promise<void>>(),
    assertCanCreateSite: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    assertCanReadSite: vi.fn<(siteId: string) => Promise<void>>(),
  };
  const useCase = new CreateSiteUseCase(repository, {
    nextSiteId: () => 'site-1',
    currentInstant: () => new
    Date(instant),
  }, access, undefined, fakeHookChanges, fakeSiteSetup);

  return { repository, access, useCase };
}

describe('CreateSiteUseCase', () => {
  it('resumes pending setup after initialization failure without creating another site', async () => {
    const f = setup();
    const completion = { complete: vi.fn(fakeSiteSetup.complete) };

    completion.complete.mockRejectedValueOnce(new Error('Initial release unavailable'));
    const operation = new CreateSiteUseCase(f.repository, {
      nextSiteId: () => 'new-site', currentInstant: () => instant,
    }, f.access, undefined, fakeHookChanges, completion);

    await expect(operation.execute(siteInput())).rejects.toThrow('Initial release unavailable');
    const result = await operation.execute(siteInput());

    expect(result.siteId).toBe('new-site');
    expect(f.repository.records.size).toBe(1);
    expect(completion.complete).toHaveBeenCalledTimes(2);
  });
  it.each([SiteOriginMode.Local, SiteOriginMode.Public])(
    'rejects a development address already serving another site when choosing %s', async (originMode) => {
      const { repository, useCase } = setup();
      const other = siteFixture('other', 'Other', 'other.test');

      other.changeAddresses({
        publicOrigin: 'https://other.test', localOrigin: 'http://localhost:3000', originMode: SiteOriginMode.Local,
      });
      await repository.save(other);
      const save = vi.spyOn(repository, 'save');

      await expect(useCase.execute({
        ...siteInput(), onboarding: { localAddress: 'https://LOCALHOST:3000/', originMode },
      })).rejects.toMatchObject({ code: BusinessErrorCode.Conflict, name: 'SiteLocalAddressInUseError' });
      expect(save).not.toHaveBeenCalled();
    },
  );
  it('creates the domain directory only after saving and exposes storage failure without retrying', async () => {
    const { repository, access } = setup();
    const directory = {
      synchronize: vi.fn(async (siteId: string) => {
        expect((await repository.findById(siteId))?.primaryDomain).toBe('example.test');
      }),
    };
    const operation = new CreateSiteUseCase(repository, {
      nextSiteId: () => 'site-1',
      currentInstant: () =>
        new Date(instant),
    }, access, directory, fakeHookChanges, fakeSiteSetup);

    await operation.execute(siteInput());
    expect(directory.synchronize).toHaveBeenCalledExactlyOnceWith('site-1');
    repository.records.clear();
    directory.synchronize.mockRejectedValueOnce(new Error('Directory unavailable'));
    await expect(operation.execute(siteInput())).rejects.toThrow('Directory unavailable');
    expect(directory.synchronize).toHaveBeenCalledTimes(2);
    expect(repository.records.size).toBe(1);
  });

  it.each(['selected', 'legacy'])('rejects an origin owned by a %s site before saving', async (kind) => {
    const { repository, useCase } = setup();
    const other = siteFixture('other', 'Other', kind === 'legacy' ? 'localhost' : 'other.test');

    if (kind === 'selected') {
      other.changeAddresses({
        publicOrigin: 'https://other.test',
        localOrigin: 'http://localhost:3000',
        originMode: SiteOriginMode.Local,
      });
    }
    await repository.save(other);
    const save = vi.spyOn(repository, 'save');

    await expect(useCase.execute({
      ...siteInput(),
      onboarding: {
        localAddress: 'localhost:3000', originMode: SiteOriginMode.Local,
      },
    })).rejects.toMatchObject({ code: BusinessErrorCode.Conflict });
    expect(save).not.toHaveBeenCalled();
  });

  it('keeps the future domain for storage while configuring the chosen local origin', async () => {
    const { useCase } = setup();
    const site = await useCase.execute({
      ...siteInput(), onboarding: { localAddress: 'http://localhost:3000', originMode: SiteOriginMode.Local },
    });

    expect(site.primaryDomain).toBe('example.test');
    expect(site.toState().addresses).toEqual({
      publicOrigin: 'https://example.test', localOrigin: 'http://localhost:3000', originMode: SiteOriginMode.Local,
    });
  });
  it('persists a normalized ACTIVE site with explicit identity/time exactly once', async () => {
    const { repository, access, useCase } = setup();
    const save = vi.spyOn(repository, 'save');
    const result = await useCase.execute(siteInput());

    expect(access.assertCanCreateSite).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledOnce();
    expect(result.toState()).toMatchObject({
      siteId: 'site-1',
      name: 'Example',
      primaryDomain: 'example.test',
      languages: ['en', 'ru'],
      defaultLanguage: 'en',
      status: SiteStatus.ACTIVE,
      createdAt: instant,
      updatedAt: instant,
    });
    expect(await repository.findById(result.siteId)).not.toBe(result);
  });

  it.each(['mark', 'domain'])('rejects an occupied %s before saving', async (duplicate) => {
    const { repository, useCase } = setup();

    await repository.save(siteFixture('other', duplicate === 'mark' ? 'eXAMPLE' : 'Other',
      duplicate === 'domain' ? 'example.test' : 'other.test'));
    const save = vi.spyOn(repository, 'save');

    await expect(useCase.execute(siteInput())).rejects.toMatchObject({ code: BusinessErrorCode.Conflict });
    expect(save).not.toHaveBeenCalled();
    expect(repository.records.size).toBe(1);
  });

  it('denies access before reading or writing', async () => {
    const { repository, access, useCase } = setup();

    access.assertCanCreateSite.mockRejectedValue(new BusinessError(BusinessErrorCode.Forbidden, 'Denied'));
    const read = vi.spyOn(repository, 'findByMark');
    const save = vi.spyOn(repository, 'save');

    await expect(useCase.execute(siteInput())).rejects.toMatchObject({ code: BusinessErrorCode.Forbidden });
    expect(read).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects invalid configuration without a write', async () => {
    const { repository, useCase } = setup();
    const save = vi.spyOn(repository, 'save');

    await expect(useCase.execute({ ...siteInput(), defaultLanguage: 'de' })).rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
  });

  it('propagates technical/uncertain save failures without retrying', async () => {
    const { repository, useCase } = setup();
    const failure = new Error('Acknowledgement lost');
    const save = vi.spyOn(repository, 'save').mockRejectedValue(failure);

    await expect(useCase.execute(siteInput())).rejects.toBe(failure);
    expect(save).toHaveBeenCalledOnce();
  });

  it('rejects a persistence result with another identity', async () => {
    const { repository, useCase } = setup();

    vi.spyOn(repository, 'save').mockResolvedValue(siteFixture('foreign'));
    await expect(useCase.execute(siteInput())).rejects.toMatchObject({ code: BusinessErrorCode.Scope });
  });
});
