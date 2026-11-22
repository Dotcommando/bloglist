import { createConnection, mongo } from 'mongoose';

import { HookPersistence } from '../../src/adapters/outbound/persistence/mongoose/hooks/hook.persistence.js';
import {
  MongooseHookDeliveries,
} from '../../src/adapters/outbound/persistence/mongoose/hooks/hook-deliveries.adapter.js';
import { HookDeliveryState, HookKind } from '../../src/domain/hooks/hook.js';
import type { IHookDelivery } from '../../src/domain/hooks/hook-execution.js';
import { HookConfigurationFake } from '../support/hooks.js';

const delivery: IHookDelivery = {
  deliveryId: 'delivery',
  siteId: 'site',
  generation: 'generation',
  eventId: 'event',
  hookKey: 'cms.page.created',
  actorId: 'admin',
  chainId: 'chain',
  causalDepth: 0,
  recipient: {
    subscriptionId: 'subscription',
    consumerId: 'handler',
    hookKey: 'cms.page.created',
    kind: HookKind.Event,
    priority: 0,
    versionId: 'applied',
    addonKey: null,
    configuration: {},
    capabilities: ['cms.page.create'],
    retrySafe: false,
    deliveryMode: 'Event',
  },
  input: {},
  state: HookDeliveryState.Running,
  attemptCount: 1,
  ownerToken: 'owner',
  plan: null,
};

it.each([
  { confirmed: true, retrySafe: false, rejected: false, state: 'Succeeded' },
  { confirmed: false, retrySafe: true, rejected: false, state: 'Failed' },
  { confirmed: false, retrySafe: false, rejected: true, state: 'Failed' },
  { confirmed: false, retrySafe: false, rejected: false, state: 'OutcomeUnknown' },
])('persists command outcome as $state (known rejection: $rejected)', async scenario => {
  const connection = createConnection();
  const client = new mongo.MongoClient('mongodb://127.0.0.1:27017');

  Object.defineProperty(connection, 'db', { value: client.db('zarya_test_00000000000000000000000000000000') });
  const update = vi.spyOn(mongo.Collection.prototype, 'updateOne').mockResolvedValue({
    acknowledged: true,
    matchedCount: 1,
    modifiedCount: 1,
    upsertedCount: 0,
    upsertedId: null,
  });

  try {
    const store = new MongooseHookDeliveries(new HookPersistence(connection),
      new HookConfigurationFake(), async () => true);

    await store.finishCommand(delivery, { key: 'create', name: 'cms.page.create', arguments: {} }, {
      confirmed: scenario.confirmed,
      retrySafe: scenario.retrySafe,
      rejected: scenario.rejected,
      result: {},
    });
    expect(update).toHaveBeenCalledWith({
      deliveryId: 'delivery',
      commandKey: 'create',
      state: 'Running',
    }, { $set: expect.objectContaining({ state: scenario.state, result: {} }) });
  } finally {
    update.mockRestore();
    await client.close();
    await connection.close();
  }
});
