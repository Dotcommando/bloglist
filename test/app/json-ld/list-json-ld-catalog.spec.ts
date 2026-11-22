import { ListJsonLdCatalogUseCase } from '../../../src/app/use-cases/json-ld/list-json-ld-catalog.use-case.js';
import { siteFixture } from '../../support/sites.js';

describe('list JSON-LD catalog', () => {
  it('returns only the authorized site catalog', async () => {
    const catalog = { siteId: 'site-1', version: 'v1', profiles: [], objects: [] };
    const store = { read: vi.fn(async () => catalog) };
    const sites = { execute: vi.fn(async () => siteFixture()) };

    expect(await new ListJsonLdCatalogUseCase(sites, store).execute({ siteId: 'site-1' })).toEqual(catalog);
    expect(store.read).toHaveBeenCalledWith('site-1');
  });

  it('does not read a site the actor cannot access and rejects foreign data', async () => {
    const store = { read: vi.fn(async () => ({ siteId: 'other', version: '0', profiles: [], objects: [] })) };

    await expect(new ListJsonLdCatalogUseCase({ execute: async () => null }, store)
      .execute({ siteId: 'site-1' })).rejects.toMatchObject({ code: 'NotFound' });
    expect(store.read).not.toHaveBeenCalled();
    await expect(new ListJsonLdCatalogUseCase({ execute: async () => siteFixture() }, store)
      .execute({ siteId: 'site-1' })).rejects.toMatchObject({ code: 'NotFound' });
  });
});
