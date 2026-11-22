import { createConnection } from 'mongoose';

import { createRoutingModels } from '../../src/adapters/outbound/persistence/mongoose/routing/routing.models.js';
import {
  MongooseUrlSearchAdapter,
} from '../../src/adapters/outbound/persistence/mongoose/routing/url-search.adapter.js';

describe('URL suggestions persistence', () => {
  it('filters, sorts, skips and limits in MongoDB and projects only suggestion fields', async () => {
    const models = createRoutingModels(createConnection());
    const query = models.urls.find();
    const record = { _id: 'url-1', siteId: 'site-1', path: '/games/a.b/', kind: 'PAGE' };

    vi.spyOn(query, 'exec').mockResolvedValue([models.urls.hydrate(record)]);
    const find = vi.spyOn(models.urls, 'find').mockReturnValue(query);
    const adapter = new MongooseUrlSearchAdapter(models.urls);

    expect(await adapter.search({
      siteId: 'site-1', query: 'a.b', limit: 10, offset: 20, excludeUrlId: 'self', pagesOnly: true,
    })).toEqual([{ siteId: 'site-1', urlId: 'url-1', path: record.path, kind: 'PAGE' }]);
    expect(find).toHaveBeenCalledWith({
      siteId: 'site-1', kind: 'PAGE', _id: { $ne: 'self' }, path: { $regex: 'a\\.b', $options: 'i' },
    }, { _id: 1, siteId: 1, path: 1, kind: 1 });
    expect(query.getOptions()).toMatchObject({ sort: { path: 1 }, skip: 20, limit: 10 });
    expect(query.getOptions().hint).toBe('urls_site_kind_path');
  });
  it('excludes parent descendants in the database and propagates failures', async () => {
    const models = createRoutingModels(createConnection());
    const query = models.urls.find();

    vi.spyOn(query, 'exec').mockRejectedValue(new Error('Unavailable'));
    const find = vi.spyOn(models.urls, 'find').mockReturnValue(query);
    const adapter = new MongooseUrlSearchAdapter(models.urls);

    await expect(adapter.search({
      siteId: 'site-1',
      query: '',
      limit: 10,
      offset: 0,
      excludeUrlId: 'self',
      excludePathPrefix: '/games/a.b/',
      pagesOnly: false,
    })).rejects.toThrow('Unavailable');
    expect(find).toHaveBeenCalledWith(expect.objectContaining({
      path: { $not: { $regex: '^/games/a\\.b/' } },
    }), expect.any(Object));
    expect(query.getOptions().hint).toBe('urls_site_path_unique');
  });
});
