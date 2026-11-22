import { createConnection, mongo } from 'mongoose';

import { type IPageRecord, pageSchema } from '../../src/adapters/outbound/persistence/mongoose/pages/page.schema.js';
import { createRoutingModels } from '../../src/adapters/outbound/persistence/mongoose/routing/routing.models.js';
import {
  MongooseVirtualUrlStore,
} from '../../src/adapters/outbound/persistence/mongoose/routing/virtual-url-store.adapter.js';
import { urlFixture } from '../support/routing.js';

describe('virtual URL transaction boundary', () => {
  it('aborts and closes a failed transaction without acknowledging success', async () => {
    const connection = createConnection();
    const models = createRoutingModels(connection);
    const session = new mongo.MongoClient('mongodb://localhost:27017').startSession();
    const abort = vi.spyOn(session, 'abortTransaction').mockResolvedValue();
    const finish = vi.spyOn(session, 'endSession').mockResolvedValue();
    const commit = vi.spyOn(session, 'commitTransaction').mockResolvedValue();

    vi.spyOn(connection, 'startSession').mockResolvedValue(session);
    vi.spyOn(models.versions, 'updateOne').mockImplementation(() => {
      throw new Error('Unavailable');
    });
    const store = new MongooseVirtualUrlStore(models, connection.model<IPageRecord>('Page', pageSchema));

    await expect(store.commit({ siteId: 'site-1', urls: [], pages: [] }, urlFixture(), []))
      .rejects.toThrow('Unavailable');
    expect(abort).toHaveBeenCalledOnce();
    expect(commit).not.toHaveBeenCalled();
    expect(finish).toHaveBeenCalledOnce();
    await connection.close();
  });
});
