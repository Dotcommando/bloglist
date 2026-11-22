import { vi } from 'vitest';

import { ResolveSiteUseCase } from '../../../src/app/use-cases/sites/resolve-site.use-case.js';
import { BusinessErrorCode } from '../../../src/domain/shared/business-error.js';
import { SiteOriginMode } from '../../../src/domain/sites/site-origin-mode.enum.js';
import { FakeSiteRepository, siteFixture } from '../../support/sites.js';

describe('ResolveSiteUseCase', () => {
  it('resolves an explicitly entered development port 80 with HTTPS', async () => {
    const repository = new FakeSiteRepository();
    const site = siteFixture();

    site.changeAddresses({
      publicOrigin: 'https://example.test',
      localOrigin: 'https://localhost:80',
      originMode: SiteOriginMode.Local,
    });
    await repository.save(site);

    const operation = new ResolveSiteUseCase(repository);

    expect((await operation.execute({ hostname: 'localhost', authority: 'localhost:80' }))?.siteId).toBe('site-1');
  });
  it('uses the chosen local host and port while keeping the future domain unavailable', async () => {
    const repository = new FakeSiteRepository();
    const site = siteFixture();

    site.changeAddresses({
      publicOrigin: 'https://example.test',
      localOrigin: 'http://localhost:3000',
      originMode: SiteOriginMode.Local,
    });
    await repository.save(site);
    const operation = new ResolveSiteUseCase(repository);

    expect((await operation.execute({ hostname: 'localhost', authority: 'localhost:3000' }))?.siteId).toBe('site-1');
    expect(await operation.execute({ hostname: 'localhost', authority: 'localhost:3001' })).toBeNull();
    expect(await operation.execute({ hostname: 'example.test' })).toBeNull();
  });
  it('resolves a normalized exact hostname without writing', async () => {
    const repository = new FakeSiteRepository();

    await repository.save(siteFixture());
    const find = vi.spyOn(repository, 'findByPrimaryDomain');
    const save = vi.spyOn(repository, 'save');
    const result = await new ResolveSiteUseCase(repository).execute({ hostname: ' EXAMPLE.TEST ' });

    expect(result?.siteId).toBe('site-1');
    expect(find).toHaveBeenCalledWith('example.test');
    expect(save).not.toHaveBeenCalled();
  });

  it('does not resolve an unknown or archived site', async () => {
    const repository = new FakeSiteRepository();
    const archived = siteFixture();

    archived.archive();
    await repository.save(archived);
    const useCase = new ResolveSiteUseCase(repository);

    expect(await useCase.execute({ hostname: 'example.test' })).toBeNull();
    expect(await useCase.execute({ hostname: 'unknown.test' })).toBeNull();
  });

  it.each(['', 'https://example.test', 'example.test/path', 'user@example.test',
    'example.test:443', 'example.test:80', 'example.test#x', 'exa\nmple.test',
  ])('rejects malformed hostname %j before querying', async (hostname) => {
    const repository = new FakeSiteRepository();
    const find = vi.spyOn(repository, 'findByPrimaryDomain');

    await expect(new ResolveSiteUseCase(repository).execute({ hostname })).rejects.toThrow();
    expect(find).not.toHaveBeenCalled();
  });

  it('rejects a repository result mapped to a different host', async () => {
    const repository = new FakeSiteRepository();

    vi.spyOn(repository, 'findByPrimaryDomain').mockResolvedValue(siteFixture('other', 'Other', 'other.test'));
    await expect(new ResolveSiteUseCase(repository).execute({ hostname: 'example.test' }))
      .rejects.toMatchObject({ code: BusinessErrorCode.Scope });
  });

  it('propagates dependency failure instead of falling back to another site', async () => {
    const repository = new FakeSiteRepository();
    const failure = new Error('Unavailable');

    vi.spyOn(repository, 'findByPrimaryDomain').mockRejectedValue(failure);
    await expect(new ResolveSiteUseCase(repository).execute({ hostname: 'example.test' })).rejects.toBe(failure);
  });
});
