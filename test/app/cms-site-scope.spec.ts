import { ListSitesUseCase } from '../../src/app/use-cases/sites/list-sites.use-case.js';
import { ResolveSiteUseCase } from '../../src/app/use-cases/sites/resolve-site.use-case.js';
import { FakeSiteRepository, siteFixture } from '../support/sites.js';

function fixture(): { sites: FakeSiteRepository;
  access: {
    assertCanListSites: ReturnType<typeof vi.fn<() => Promise<void>>>;
    assertCanReadSite: ReturnType<typeof vi.fn<() => Promise<void>>>;
    assertCanCreateSite(): Promise<void>;
  } } {
  const sites = new FakeSiteRepository();

  sites.records.set('site-1', siteFixture());
  sites.records.set('other', siteFixture('other', 'Other', 'other.test'));
  const access = {
    assertCanListSites: vi.fn(async () => {}),
    assertCanReadSite: vi.fn(async () => {}),
    assertCanCreateSite: async () => {},
  };

  return { sites, access };
}

describe('CMS contextual site reads', () => {
  it('lists only the captured site, including archives, without enumerating other tenants', async () => {
    const { sites, access } = fixture();

    sites.records.get('site-1')!.archive();
    const all = vi.spyOn(sites, 'findAll');
    const list = new ListSitesUseCase(sites, access, 'site-1');

    expect((await list.execute()).map((site) => site.siteId)).toEqual(['site-1']);
    expect(all).not.toHaveBeenCalled();
    expect(access.assertCanListSites).toHaveBeenCalledOnce();
    sites.records.delete('site-1');
    expect(await list.execute()).toEqual([]);
  });
  it('resolves active own domains but returns null for foreign, unknown and archived domains', async () => {
    const { sites, access } = fixture();
    const resolve = new ResolveSiteUseCase(sites, { siteId: 'site-1', access });

    expect((await resolve.execute({ hostname: 'EXAMPLE.TEST' }))?.siteId).toBe('site-1');
    expect(await resolve.execute({ hostname: 'other.test' })).toBeNull();
    expect(await resolve.execute({ hostname: 'unknown.test' })).toBeNull();
    sites.records.get('site-1')!.archive();
    expect(await resolve.execute({ hostname: 'example.test' })).toBeNull();
    expect(access.assertCanReadSite).toHaveBeenCalledWith('site-1');
  });
  it('denies before domain validation or repository access and keeps unscoped lists complete', async () => {
    const { sites, access } = fixture();

    expect(await new ListSitesUseCase(sites, access).execute()).toHaveLength(2);
    access.assertCanListSites.mockRejectedValueOnce(new Error('Denied'));
    const find = vi.spyOn(sites, 'findById');

    await expect(new ListSitesUseCase(sites, access, 'site-1').execute()).rejects.toThrow('Denied');
    expect(find).not.toHaveBeenCalled();
    access.assertCanReadSite.mockRejectedValueOnce(new Error('Denied'));
    await expect(new ResolveSiteUseCase(sites, { siteId: 'site-1', access })
      .execute({ hostname: 'invalid host' })).rejects.toThrow('Denied');
  });
});
