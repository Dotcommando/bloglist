import { type Mocked, vi } from 'vitest';

import { UpdateSiteUseCase } from '../../../src/app/use-cases/sites/update-site.use-case.js';
import type { Site } from '../../../src/domain/sites/site.js';
import { SiteOriginMode } from '../../../src/domain/sites/site-origin-mode.enum.js';
import type { ISiteEditingAccessPort } from '../../../src/ports/outbound/sites/site-access.port.js';
import type { ISiteUpdateStorePort } from '../../../src/ports/outbound/sites/site-update-store.port.js';
import { fakeHookChanges } from '../../support/hooks.js';
import { FakeSiteRepository, siteFixture } from '../../support/sites.js';

describe('UpdateSite', () => {
  interface IFixture {
    sites: FakeSiteRepository;
    access: Mocked<Pick<ISiteEditingAccessPort, 'assertCanUpdateSite'>>;
    store: Mocked<ISiteUpdateStorePort>;
    operation: UpdateSiteUseCase;
  }
  function fixture(): IFixture {
    const sites = new FakeSiteRepository();

    sites.records.set('site-1', siteFixture());
    const access = { assertCanUpdateSite: vi.fn(async () => {}) };
    const store = { saveUpdate: vi.fn(async (_previous, next: Site) => sites.save(next)) };

    return { sites, access, store, operation: new UpdateSiteUseCase(sites, store, access, undefined, fakeHookChanges) };
  }
  it('changes only the site display time zone with a captured guard', async () => {
    const f = fixture();
    const before = f.sites.records.get('site-1')!.toState();
    const saved = await f.operation.execute({ siteId: 'site-1', timeZone: 'Asia/Nicosia', expectedTimeZone: 'UTC' });

    expect(saved.toState()).toEqual({ ...before, timeZone: 'Asia/Nicosia' });
    await expect(f.operation.execute({ siteId: 'site-1', timeZone: 'Europe/London', expectedTimeZone: 'UTC' }))
      .rejects.toMatchObject({ code: 'StaleWrite' });
    await expect(f.operation.execute({ siteId: 'site-1', timeZone: 'Invalid/Zone', expectedTimeZone: 'Asia/Nicosia' }))
      .rejects.toThrow();
    await expect(f.operation.execute({ siteId: 'site-1', timeZone: '+02:00', expectedTimeZone: 'Asia/Nicosia' }))
      .rejects.toThrow();
    expect(f.store.saveUpdate).toHaveBeenCalledTimes(1);
  });
  it('orders language replacement and preserves identity and the original snapshot', async () => {
    const f = fixture();
    const before = f.sites.records.get('site-1')!.toState();
    const result = await f.operation.execute({
      siteId: 'site-1',
      name: 'Changed',
      primaryDomain: 'OTHER.TEST',
      addLanguages: ['fr'],
      defaultLanguage: 'FR',
      removeLanguages: ['en'],
    });

    expect(result.toState()).toMatchObject({
      name: 'Changed',
      primaryDomain: 'other.test',
      languages: ['ru', 'fr'],
      defaultLanguage: 'fr',
      mark: before.mark,
      createdAt: before.createdAt,
    });
    expect(f.store.saveUpdate.mock.calls[0]![0]).toEqual(before);
  });
  it('saves explicit site addresses, rejects stale settings and preserves other site fields', async () => {
    const f = fixture();
    const addresses = { publicOrigin: 'https://example.test', localOrigin: 'http://localhost:3100' };
    const expectedAddresses = { publicOrigin: null, localOrigin: null };
    const result = await f.operation.execute({ siteId: 'site-1', addresses, expectedAddresses });

    expect(result.toState()).toMatchObject({ addresses, primaryDomain: 'example.test' });
    await expect(f.operation.execute({ siteId: 'site-1', addresses, expectedAddresses }))
      .rejects.toMatchObject({ code: 'StaleWrite' });
    await expect(f.operation.execute({
      siteId: 'site-1',
      addresses: { ...addresses, publicOrigin: 'javascript:x' },
      expectedAddresses: addresses,
    })).rejects.toThrow();
    expect(f.store.saveUpdate).toHaveBeenCalledTimes(1);
  });
  it('compares the captured serving choice and rejects a conflicting origin without saving', async () => {
    const f = fixture();
    const addresses = {
      publicOrigin: 'https://example.test',
      localOrigin: 'http://localhost:3100',
      originMode: SiteOriginMode.Local,
    };
    const original = f.sites.records.get('site-1')!;

    original.changeAddresses(addresses);
    const desired = { ...addresses, originMode: SiteOriginMode.Public };

    await expect(f.operation.execute({ siteId: 'site-1', addresses: desired, expectedAddresses: desired }))
      .rejects.toMatchObject({ code: 'StaleWrite' });
    const other = siteFixture('other', 'Other', 'other.test');

    other.changeAddresses({ ...addresses, publicOrigin: 'https://other.test', localOrigin: 'http://localhost:3101' });
    f.sites.records.set('other', other);
    await expect(f.operation.execute({
      siteId: 'site-1',
      addresses: { ...addresses, localOrigin: 'http://localhost:3101' },
      expectedAddresses: addresses,
    }))
      .rejects.toMatchObject({ code: 'Conflict' });
    expect(f.store.saveUpdate).not.toHaveBeenCalled();
  });
  it('synchronizes site assets after saving the new domain and exposes relocation failures', async () => {
    const f = fixture();
    const directory = {
      synchronize: vi.fn(async () => {
        expect(f.sites.records.get('site-1')!.primaryDomain).toBe('new.test');
      }),
    };
    const operation = new UpdateSiteUseCase(f.sites, f.store, f.access, directory, fakeHookChanges);

    await operation.execute({ siteId: 'site-1', primaryDomain: 'new.test' });
    expect(directory.synchronize).toHaveBeenCalledWith('site-1');
    directory.synchronize.mockRejectedValueOnce(new Error('Relocation pending'));
    await expect(operation.execute({ siteId: 'site-1', primaryDomain: 'new.test' }))
      .rejects.toThrow('Relocation pending');
    await operation.execute({ siteId: 'site-1', primaryDomain: 'new.test' });
    expect(directory.synchronize).toHaveBeenCalledTimes(3);
  });
  it('rejects denied, missing, foreign, invalid, duplicate domains and used-language conflicts', async () => {
    const f = fixture();

    await expect(f.operation.execute({ siteId: 'missing' })).rejects.toMatchObject({ code: 'NotFound' });
    vi.spyOn(f.sites, 'findById').mockResolvedValueOnce(siteFixture('foreign'));
    await expect(f.operation.execute({ siteId: 'site-1' })).rejects.toMatchObject({ code: 'Scope' });
    await expect(f.operation.execute({ siteId: 'site-1', removeLanguages: ['en'] })).rejects.toThrow();
    f.sites.records.set('other', siteFixture('other', 'Other', 'other.test'));
    await expect(f.operation.execute({ siteId: 'site-1', primaryDomain: 'OTHER.TEST' }))
      .rejects.toMatchObject({ code: 'Conflict' });
    f.store.saveUpdate.mockRejectedValueOnce(Object.assign(new Error('Language has pages'), { code: 'Conflict' }));
    await expect(f.operation.execute({ siteId: 'site-1', removeLanguages: ['ru'] }))
      .rejects.toMatchObject({ code: 'Conflict' });
    expect(f.sites.records.get('site-1')!.languages).toEqual(['en', 'ru']);
    f.access.assertCanUpdateSite.mockRejectedValueOnce(new Error('Denied'));
    await expect(f.operation.execute({ siteId: 'site-1' })).rejects.toThrow('Denied');
  });
});
