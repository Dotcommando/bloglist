import { createConnection, mongo } from 'mongoose';

import { HookPersistence } from '../../src/adapters/outbound/persistence/mongoose/hooks/hook.persistence.js';
import {
  MongooseHookConfiguration,
} from '../../src/adapters/outbound/persistence/mongoose/hooks/hook-configuration.adapter.js';
import { HookKind, HookScopeKind, type IHookSubscription } from '../../src/domain/hooks/hook.js';

it('rejects a reorder whose complete binding list changed before its transaction started', async () => {
  const connection = createConnection();
  const client = new mongo.MongoClient('mongodb://127.0.0.1:27017');
  const session = client.startSession();

  Object.defineProperty(connection, 'db', { value: client.db('zarya_test_00000000000000000000000000000000') });
  const persistence = new HookPersistence(connection);
  const configuration = new MongooseHookConfiguration(persistence);
  const binding: IHookSubscription = {
    subscriptionId: 'first',
    siteId: 'site',
    version: 'v1',
    hookKey: 'cms.page.created',
    schemaVersion: 1,
    kind: HookKind.Event,
    title: 'First',
    handlerId: 'handler',
    addonKey: null,
    handlerKey: null,
    ownerKind: 'User',
    configuration: {},
    filters: {},
    enabled: false,
    priority: 0,
    retrySafe: false,
    deliveryMode: 'Event',
    manifestKey: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    createdBy: 'admin',
    updatedBy: 'admin',
  };
  let current = [binding];

  vi.spyOn(persistence, 'transaction').mockImplementation(async work => {
    current = [binding, { ...binding, subscriptionId: 'added', version: 'v2', priority: 1 }];

    return work(session, vi.fn());
  });
  vi.spyOn(persistence, 'bump').mockResolvedValue(undefined);
  vi.spyOn(configuration, 'tree').mockImplementation(async () => ({
    hooks: [{
      hookKey: binding.hookKey,
      title: 'Created',
      description: '',
      provider: 'cms',
      schemaVersion: 1,
      kind: HookKind.Event,
      scopeKind: HookScopeKind.Site,
      registeredAt: new Date(0),
      available: true,
      subscriptions: [...current],
    }],
    handlers: [],
  }));
  const read = vi.spyOn(mongo.Collection.prototype, 'findOne').mockResolvedValue({ _id: 'first' });
  const write = vi.spyOn(mongo.Collection.prototype, 'updateOne').mockResolvedValue({
    acknowledged: true,
    matchedCount: 1,
    modifiedCount: 1,
    upsertedCount: 0,
    upsertedId: null,
  });

  try {
    await expect(configuration.reorder('site', binding.hookKey, [{ id: 'first', version: 'v1' }]))
      .rejects.toMatchObject({ code: 'StaleWrite' });
    expect(write).not.toHaveBeenCalled();
    expect(persistence.bump).not.toHaveBeenCalled();
  } finally {
    read.mockRestore();
    write.mockRestore();
    await session.endSession();
    await client.close();
    await connection.close();
  }
});
