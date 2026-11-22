import { SiteAddonStatus } from '@zarya/addon-contracts/addons';
import { createConnection, mongo } from 'mongoose';

import { MongooseAddonUpdateGate }
  from '../../src/adapters/outbound/persistence/mongoose/addons/addon-update-gate.adapter.js';
import {
  MongooseSiteAddonStore,
} from '../../src/adapters/outbound/persistence/mongoose/addons/site-addon-store.adapter.js';

describe('site add-on persistence translation', () => {
  it('preserves empty configuration objects required by the database validator', async () => {
    const connection = createConnection();
    const client = new mongo.MongoClient('mongodb://127.0.0.1:27017');
    const session = client.startSession();

    vi.spyOn(connection, 'transaction').mockImplementation(async work => work(session));
    const gate = new MongooseAddonUpdateGate(connection);

    vi.spyOn(gate.model.collection, 'updateOne').mockResolvedValue({
      acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0, upsertedId: null,
    });
    const store = new MongooseSiteAddonStore(connection);
    const state = {
      siteAddonId: 'connection-1',
      siteId: 'site-1',
      addonKey: 'example-addon',
      status: SiteAddonStatus.Enabled,
      configuration: { schemaVersion: 1, values: {} },
      version: 'v1',
      createdAt: new Date('2026-10-28T10:00:00Z'),
      updatedAt: new Date('2026-10-28T10:00:00Z'),
      createdBy: 'operator',
      updatedBy: 'operator',
    };
    const { siteAddonId, ...fields } = state;
    const document = new store.model({ ...fields, _id: siteAddonId, operationGuard: 0 });

    expect(document.toObject().configuration).toEqual({ schemaVersion: 1, values: {} });
    vi.spyOn(store.model, 'insertOne').mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: 11000 }));
    await expect(store.commit(state, null)).rejects.toMatchObject({ code: 'StaleWrite' });
    expect(connection.transaction).toHaveBeenCalledOnce();
    await session.endSession();
    await client.close();
    await connection.close();
  });
});
