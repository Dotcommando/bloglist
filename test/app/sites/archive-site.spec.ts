import { vi } from 'vitest';

import { ArchiveSiteUseCase } from '../../../src/app/use-cases/sites/archive-site.use-case.js';
import type { ISiteUpdateStorePort } from '../../../src/ports/outbound/sites/site-update-store.port.js';
import { fakeHookChanges } from '../../support/hooks.js';
import { FakeSiteRepository, siteFixture } from '../../support/sites.js';

describe('ArchiveSite', () => {
  it('archives only the owned site and is repeatable without changing content/configuration', async () => {
    const sites = new FakeSiteRepository();
    const original = siteFixture();

    sites.records.set('site-1', original);
    const operation = new ArchiveSiteUseCase(sites, {
      saveUpdate: async (_previous,
        next) => sites.save(next),
    }, { assertCanArchiveSite: async () => {} }, fakeHookChanges);
    const archived = await operation.execute({ siteId: 'site-1' });

    expect(archived.toState()).toEqual({ ...original.toState(), status: 'ARCHIVED' });
    expect(original.status).toBe('ACTIVE');
    expect((await operation.execute({ siteId: 'site-1' })).status).toBe('ARCHIVED');
  });
  it('rejects denied, missing, foreign and dependency failures', async () => {
    const sites = new FakeSiteRepository();
    const access = { assertCanArchiveSite: vi.fn(async () => {}) };
    const updates: ISiteUpdateStorePort = { saveUpdate: async (_previous, next) => sites.save(next) };
    const operation = new ArchiveSiteUseCase(sites, updates, access, fakeHookChanges);

    await expect(operation.execute({ siteId: 'site-1' })).rejects.toMatchObject({ code: 'NotFound' });
    vi.spyOn(sites, 'findById').mockResolvedValueOnce(siteFixture('foreign'));
    await expect(operation.execute({ siteId: 'site-1' })).rejects.toMatchObject({ code: 'Scope' });
    access.assertCanArchiveSite.mockRejectedValueOnce(new Error('Denied'));
    await expect(operation.execute({ siteId: 'site-1' })).rejects.toThrow('Denied');
    sites.records.set('site-1', siteFixture());
    vi.spyOn(sites, 'save').mockRejectedValueOnce(new Error('Unavailable'));
    await expect(operation.execute({ siteId: 'site-1' })).rejects.toThrow('Unavailable');
    expect(sites.records.get('site-1')?.status).toBe('ACTIVE');
  });
});
