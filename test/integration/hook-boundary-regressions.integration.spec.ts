import { randomUUID } from 'node:crypto';

import { createConnection } from 'mongoose';

import { HookPersistence } from '../../src/adapters/outbound/persistence/mongoose/hooks/hook.persistence.js';
import {
  MongooseHookConfiguration,
} from '../../src/adapters/outbound/persistence/mongoose/hooks/hook-configuration.adapter.js';
import {
  MongooseHookDeliveries,
} from '../../src/adapters/outbound/persistence/mongoose/hooks/hook-deliveries.adapter.js';
import { MongooseHookEvents } from '../../src/adapters/outbound/persistence/mongoose/hooks/hook-events.adapter.js';
import {
  MongooseHookRecipientSource,
} from '../../src/adapters/outbound/persistence/mongoose/hooks/hook-recipient-source.adapter.js';
import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { HookCommandAdapter } from '../../src/adapters/outbound/runtime/hooks/hook-command.adapter.js';
import { HookCompilerAdapter, HookScriptRuntime } from
  '../../src/adapters/outbound/runtime/hooks/hook-script.adapter.js';
import { HookChangesService } from '../../src/app/services/hooks/hook-changes.service.js';
import { HookRecipientsService } from '../../src/app/services/hooks/hook-recipients.service.js';
import { ApplyHookHandlerUseCase } from '../../src/app/use-cases/hooks/apply-hook-handler.use-case.js';
import { CreateHookHandlerUseCase } from '../../src/app/use-cases/hooks/create-hook-handler.use-case.js';
import { ProcessHookDeliveriesUseCase } from '../../src/app/use-cases/hooks/process-hook-deliveries.use-case.js';
import { ReorderHookSubscriptionsUseCase } from '../../src/app/use-cases/hooks/reorder-hook-subscriptions.use-case.js';
import { SaveHookSubscriptionUseCase } from '../../src/app/use-cases/hooks/save-hook-subscription.use-case.js';
import { SetHookHandlerEnabledUseCase } from '../../src/app/use-cases/hooks/set-hook-handler-enabled.use-case.js';
import { SkipHookDeliveryUseCase } from '../../src/app/use-cases/hooks/skip-hook-delivery.use-case.js';
import { HookKind, HookScopeKind, type IHookSubscription } from '../../src/domain/hooks/hook.js';
import { dropHookTestDatabase } from '../support/hooks.js';

const actor = { siteId: 'site-a', actorId: 'admin' };

const access = { requireAdministrator: async () => {} };

const values = { id: randomUUID, now: () => new Date() };

interface IHookBoundaryFixture {
  persistence: HookPersistence;
  configuration: MongooseHookConfiguration;
  binding: IHookSubscription;
  save: SaveHookSubscriptionUseCase;
}

async function withFixture(work: (fixture: IHookBoundaryFixture) => Promise<void>): Promise<void> {
  const uri = process.env.ZARYA_TEST_MONGO_URI;

  if (!uri) {
    throw new Error('Explicit test MongoDB required');
  }

  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  const connection = await createConnection(uri, {
    dbName: database,
    autoCreate: false,
    autoIndex: false,
  }).asPromise();

  try {
    await applyMigrations(connection, 'migrations');
    const persistence = new HookPersistence(connection);

    await persistence.initialize();
    const configuration = new MongooseHookConfiguration(persistence);

    await configuration.register([{
      hookKey: 'cms.page.created',
      title: 'Created',
      description: '',
      provider: 'cms',
      schemaVersion: 1,
      kind: HookKind.Event,
      scopeKind: HookScopeKind.Site,
    }]);
    const handler = await new CreateHookHandlerUseCase(configuration, access, values).execute({
      ...actor,
      title: 'Reject injected authority',
      kind: HookKind.Event,
      draft: {
        source: 'return {commands: [{key:"create", name:"cms.page.create", arguments:{siteId:"foreign"}}]};',
        capabilities: ['cms.page.create'],
      },
    });

    await new ApplyHookHandlerUseCase(configuration, access, values, new HookCompilerAdapter())
      .execute({ ...actor, handlerId: handler.handlerId, expectedVersion: handler.version });
    const applied = (await configuration.handler(actor.siteId, handler.handlerId))!;

    await new SetHookHandlerEnabledUseCase(configuration, access, values).execute({
      ...actor,
      handlerId: applied.handlerId,
      expectedVersion: applied.version,
      enabled: true,
    });
    const save = new SaveHookSubscriptionUseCase(configuration, access, values);
    const binding = await save.execute({
      ...actor,
      expectedVersion: null,
      subscription: {
        subscriptionId: '',
        hookKey: 'cms.page.created',
        schemaVersion: 1,
        title: 'React',
        kind: HookKind.Event,
        handlerId: handler.handlerId,
        addonKey: null,
        handlerKey: null,
        ownerKind: 'User',
        configuration: {},
        filters: {},
        enabled: true,
        priority: 0,
        retrySafe: false,
        deliveryMode: 'Event',
        manifestKey: null,
      },
    });

    await work({ persistence, configuration, binding, save });
  } finally {
    await dropHookTestDatabase(connection, database);
  }
}

it('rejects an incomplete reorder when a new binding commits before the ordering transaction', async () => {
  await withFixture(async f => {
    const transaction = f.persistence.transaction.bind(f.persistence);
    const interception = vi.spyOn(f.persistence, 'transaction').mockImplementationOnce(async work => {
      await f.save.execute({
        ...actor,
        expectedVersion: null,
        subscription: { ...f.binding, subscriptionId: '', priority: 1, title: 'Concurrent binding' },
      });

      return transaction(work);
    });

    try {
      await expect(new ReorderHookSubscriptionsUseCase(f.configuration, access).execute({
        ...actor,
        hookKey: f.binding.hookKey,
        ordered: [{ id: f.binding.subscriptionId, version: f.binding.version }],
      })).rejects.toMatchObject({ code: 'StaleWrite' });
      const bindings = (await f.configuration.tree(actor.siteId)).hooks[0]!.subscriptions;

      expect(bindings).toHaveLength(2);
      expect(bindings.find(binding => binding.subscriptionId === f.binding.subscriptionId))
        .toMatchObject({ priority: 0, version: f.binding.version });
      expect(bindings.find(binding => binding.title === 'Concurrent binding')).toMatchObject({ priority: 1 });
    } finally {
      interception.mockRestore();
    }
  });
});

it('allows safe skip after a command was rejected before effects, while retaining known failure evidence', async () => {
  await withFixture(async f => {
    const events = new MongooseHookEvents(f.persistence, f.configuration, (siteId, keys, candidate, session) =>
      new HookRecipientsService(new MongooseHookRecipientSource(f.configuration, async () => true,
        async () => [], session)).select(siteId, keys, candidate));
    const runtime = new HookScriptRuntime(async (recipient, siteId) => {
      const version = await f.configuration.version(siteId!, recipient.versionId);

      if (!version) {
        throw new Error('Missing version');
      }

      return version;
    }, async () => ({}));
    const changes = new HookChangesService(events, runtime, values);
    const deliveries = new MongooseHookDeliveries(f.persistence, f.configuration, async () => true);
    const effect = vi.fn(async () => ({ confirmed: true, retrySafe: false, result: {} }));
    const commands = new HookCommandAdapter(new Map([['cms.page.create', effect]]));
    const intent = await changes.prepare({
      ...actor,
      subject: 'page-a',
      checkKey: '',
      candidate: {},
      facts: [{ hookKey: f.binding.hookKey, payload: {} }],
    });

    await f.persistence.transaction(session => events.record(intent, session));
    await new ProcessHookDeliveriesUseCase(deliveries, runtime, commands).execute({ maximum: 1 });
    const failed = (await deliveries.history(actor.siteId))[0]!;

    expect(failed.state).toBe('Failed');
    expect(effect).not.toHaveBeenCalled();
    await new SkipHookDeliveryUseCase(deliveries, access).execute({
      ...actor,
      deliveryId: String(failed.deliveryId),
      version: String(failed.version),
      reason: 'Rejected authority injection; no effect',
    });
    expect((await deliveries.history(actor.siteId))[0]).toMatchObject({
      deliveryId: failed.deliveryId,
      state: 'Skipped',
    });
    const rows = await f.persistence.collection('hook_command_executions').find({}).toArray();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.state).toBe('Failed');
    const lane = await f.persistence.collection('hook_delivery_lanes').findOne({});

    expect(lane?.settled.toString()).toBe('1');
  });
});
