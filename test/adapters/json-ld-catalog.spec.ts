import { createConnection, Query } from 'mongoose';

import {
  type IJsonLdCatalogRecord,
  jsonLdCatalogSchema,
  MongooseJsonLdCatalog,
} from '../../src/adapters/outbound/persistence/mongoose/json-ld/json-ld-catalog.adapter.js';

describe('MongoDB JSON-LD catalog reader', () => {
  afterEach(() => vi.restoreAllMocks());

  it('scopes queries by site and returns an empty initial catalog', async () => {
    const connection = createConnection();
    const model = connection.model<IJsonLdCatalogRecord>('JsonLdCatalog', jsonLdCatalogSchema);
    const find = vi.spyOn(model, 'findOne');

    vi.spyOn(Query.prototype, 'exec').mockResolvedValue(null);
    expect(await new MongooseJsonLdCatalog(model).read('site-1')).toEqual({
      siteId: 'site-1', version: '0', profiles: [], objects: [],
    });
    expect(find).toHaveBeenCalledWith({ _id: 'site-1', siteId: 'site-1' });
    await connection.close();
  });

  it('saves only the expected site version and reports stale writes', async () => {
    const connection = createConnection();
    const model = connection.model<IJsonLdCatalogRecord>('JsonLdCatalog', jsonLdCatalogSchema);
    const update = vi.spyOn(model, 'updateOne');
    const exec = vi.spyOn(Query.prototype, 'exec').mockResolvedValue({ matchedCount: 1, upsertedCount: 0 });
    const catalog = { siteId: 'site-1', version: 'next', profiles: [], objects: [] };
    const store = new MongooseJsonLdCatalog(model);

    await store.save(catalog, 'previous');
    expect(update).toHaveBeenCalledWith(
      { _id: 'site-1', siteId: 'site-1', version: 'previous' },
      { $set: catalog },
      { upsert: false, runValidators: true },
    );
    exec.mockResolvedValue({ matchedCount: 0, upsertedCount: 0 });
    await expect(store.save(catalog, 'previous')).rejects.toMatchObject({ code: 'Conflict' });
    await connection.close();
  });

  it('propagates storage failures without returning an empty catalog', async () => {
    const connection = createConnection();
    const model = connection.model<IJsonLdCatalogRecord>('JsonLdCatalog', jsonLdCatalogSchema);

    vi.spyOn(Query.prototype, 'exec').mockRejectedValue(new Error('storage unavailable'));
    await expect(new MongooseJsonLdCatalog(model).read('site-1')).rejects.toThrow('storage unavailable');
    await connection.close();
  });
});
