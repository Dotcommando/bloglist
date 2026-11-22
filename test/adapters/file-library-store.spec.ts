import { createConnection } from 'mongoose';

import {
  mediaLibraryModel,
  MongooseFileLibraryStore,
} from '../../src/adapters/outbound/persistence/mongoose/media/file-library-store.adapter.js';

describe('file library persistence', () => {
  it('returns an isolated empty library using a site-bound query', async () => {
    const model = mediaLibraryModel(createConnection());
    const query = model.findOne();
    const findOne = vi.spyOn(model, 'findOne').mockReturnValue(query);

    vi.spyOn(query, 'lean').mockReturnValue(query);
    vi.spyOn(query, 'exec').mockResolvedValue(null);
    const store = new MongooseFileLibraryStore(model, { install: vi.fn() }, { remove: vi.fn() });

    expect(await store.read('site-1')).toEqual({
      library: { siteId: 'site-1', version: '0', folders: [], files: [] }, pending: false,
    });
    expect(findOne).toHaveBeenCalledWith({ _id: 'site-1', siteId: 'site-1' });
  });
});
