import { createConnection, mongo } from 'mongoose';

import { type IPageRecord, pageSchema } from '../../src/adapters/outbound/persistence/mongoose/pages/page.schema.js';
import {
  MongoosePageTreeStore,
} from '../../src/adapters/outbound/persistence/mongoose/pages/page-tree-store.adapter.js';
import { Page } from '../../src/domain/pages/page.js';
import { pageFixture } from '../support/pages.js';

describe('page tree persistence boundary', () => {
  it('rechecks the owned graph and captured page inside a transaction and changes only its parent', async () => {
    const connection = createConnection();
    const model = connection.model<IPageRecord>('PageTree', pageSchema);
    const client = new mongo.MongoClient('mongodb://localhost');
    const session = client.startSession();

    vi.spyOn(connection, 'startSession').mockResolvedValue(session);
    vi.spyOn(session, 'commitTransaction').mockResolvedValue();
    const state = new Page({ ...pageFixture().toState(), pageNumber: '2', parentPageId: 'parent', sortOrder: 200 })
      .toState();
    const { pageId, ...fields } = state;
    const record = { ...fields, _id: pageId, markKey: 'home', __v: 0 };
    const find = model.find();
    const lean = find.lean();

    vi.spyOn(lean, 'exec').mockResolvedValue([record]);
    vi.spyOn(model, 'find').mockReturnValue(find);
    const update = model.updateOne({}, {});

    vi.spyOn(update, 'exec').mockResolvedValue({
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
      upsertedCount: 0,
      upsertedId: null,
    });
    const write = vi.spyOn(model, 'updateOne').mockReturnValue(update);
    const now = new Date('2026-10-27T00:00:00Z');
    const lock = vi.fn(async () => {});
    const adapter = new MongoosePageTreeStore(model, () => now, lock);
    const saved = await adapter.move(state, null);

    expect(saved.toState()).toMatchObject({ pageNumber: '2', sortOrder: 200, parentPageId: null });
    expect(lock).toHaveBeenCalledWith(session, 'site-1');
    expect(write).toHaveBeenCalledWith(expect.objectContaining({
      _id: pageId,
      parentPageId: 'parent',
      mimeType: { $in: [null, 'text/html'] },
      excludeFromSitemap: { $in: [null, false] },
    }),
    { $set: { parentPageId: null, updatedAt: now } }, { session });
    await client.close();
    await connection.close();
  });
});
