import { ListSitesUseCase } from '../../../src/app/use-cases/sites/list-sites.use-case.js';
import { FakeSiteRepository, siteFixture } from '../../support/sites.js';

describe('ListSites', () => {
  it('returns the complete detached list including archived sites', async () => {
    const sites = new FakeSiteRepository();
    const archived = siteFixture('other', 'Other', 'other.test');

    archived.archive();
    sites.records.set('site-1', siteFixture());
    sites.records.set('other', archived);
    const access = {
      assertCanListSites: vi.fn(async () => {}),
      assertCanCreateSite: async () => {},
      assertCanReadSite: async () => {},
    };
    const result = await new ListSitesUseCase(sites, access).execute();

    expect(result).toHaveLength(2);
    expect(access.assertCanListSites).toHaveBeenCalledOnce();
    result[0]!.changeName('Local mutation');
    expect(sites.records.get('site-1')?.name).toBe('Example');
  });
  it('denies before querying persistence', async () => {
    const sites = new FakeSiteRepository();
    const query = vi.spyOn(sites, 'findAll');

    await expect(new ListSitesUseCase(sites, {
      assertCanListSites: async () => {
        throw new Error('Denied');
      },
      assertCanCreateSite: async () => {},
      assertCanReadSite: async () => {},
    }).execute()).rejects.toThrow('Denied');
    expect(query).not.toHaveBeenCalled();
  });
});
