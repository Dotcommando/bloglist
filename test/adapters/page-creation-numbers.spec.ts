import { createConnection, mongo } from 'mongoose';

import { type IPageRecord, pageSchema } from '../../src/adapters/outbound/persistence/mongoose/pages/page.schema.js';
import {
  MongoosePageCreationAdapter,
} from '../../src/adapters/outbound/persistence/mongoose/pages/page-creation.adapter.js';
import { Page } from '../../src/domain/pages/page.js';
import { pageFixture } from '../support/pages.js';

describe('page creation identity and sibling order boundary', () => {
  it('reserves one page number after retrying a write conflict before commit', async () => {
    const connection = createConnection();
    const model = connection.model<IPageRecord>('PageNumberedCreation', pageSchema);
    const client = new mongo.MongoClient('mongodb://localhost');
    const session = client.startSession();

    vi.spyOn(connection, 'startSession').mockResolvedValue(session);
    const commit = vi.spyOn(session, 'commitTransaction').mockResolvedValue();
    const pages = model.find();
    const lean = pages.lean();
    const { pageId, ...parent } = new Page({ ...pageFixture().toState(), pageNumber: '10', sortOrder: 300 }).toState();

    vi.spyOn(lean, 'exec').mockResolvedValue([{ ...parent, _id: pageId, markKey: 'home', __v: 0 }]);
    vi.spyOn(model, 'find').mockReturnValue(pages);
    const insert = vi.spyOn(model, 'insertOne').mockImplementation(async (value) => new model(value));
    const sequence = connection.collection('page_sequences');

    vi.spyOn(sequence, 'findOneAndUpdate').mockResolvedValue({
      _id: new mongo.ObjectId(),
      siteId: 'site-1',
      lastOrdinal: mongo.Long.fromString('11'),
    });
    const guard = {
      requireLanguage: vi.fn(async () => {}).mockRejectedValueOnce(Object.assign(new Error('Write conflict'), {
        code: 112,
      })),
    };
    const adapter = new MongoosePageCreationAdapter(model, () => guard);
    const created = await adapter.create(new Page({
      ...pageFixture('new').toState(),
      parentPageId: pageId,
      sortOrder: null,
    }));

    expect(created.toState()).toMatchObject({ pageNumber: '11', parentPageId: pageId, sortOrder: 100 });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ pageNumber: '11', sortOrder: 100 }), { session });
    expect(insert).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledOnce();
    expect(guard.requireLanguage).toHaveBeenCalledWith('site-1', 'en');
    expect(guard.requireLanguage).toHaveBeenCalledTimes(2);
    await client.close();
    await connection.close();
  });
});
