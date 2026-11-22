import { randomUUID } from 'node:crypto';

import { createConnection } from 'mongoose';

import { HookPersistence } from '../../src/adapters/outbound/persistence/mongoose/hooks/hook.persistence.js';
import { MongooseHookConfiguration } from
  '../../src/adapters/outbound/persistence/mongoose/hooks/hook-configuration.adapter.js';
import { MongooseHookDeliveries } from
  '../../src/adapters/outbound/persistence/mongoose/hooks/hook-deliveries.adapter.js';
import { MongooseHookEvents } from '../../src/adapters/outbound/persistence/mongoose/hooks/hook-events.adapter.js';
import {
  MongooseHookRecipientSource,
} from '../../src/adapters/outbound/persistence/mongoose/hooks/hook-recipient-source.adapter.js';
import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { HookCompilerAdapter, HookScriptRuntime } from
  '../../src/adapters/outbound/runtime/hooks/hook-script.adapter.js';
import { HookChangesService } from '../../src/app/services/hooks/hook-changes.service.js';
import { HookRecipientsService } from '../../src/app/services/hooks/hook-recipients.service.js';
import { ApplyHookHandlerUseCase } from '../../src/app/use-cases/hooks/apply-hook-handler.use-case.js';
import { CreateHookHandlerUseCase } from '../../src/app/use-cases/hooks/create-hook-handler.use-case.js';
import { SaveHookSubscriptionUseCase } from '../../src/app/use-cases/hooks/save-hook-subscription.use-case.js';
import { SetHookHandlerEnabledUseCase } from '../../src/app/use-cases/hooks/set-hook-handler-enabled.use-case.js';
import { HookKind, HookScopeKind } from '../../src/domain/hooks/hook.js';
import { dropHookTestDatabase } from '../support/hooks.js';

describe('hook composition over isolated MongoDB', () => {
  it('commits events with source writes, freezes versions and preserves handler/entity order through disable',
    async () => {
      const uri = process.env.ZARYA_TEST_MONGO_URI;

      if (!uri) {
        throw new Error('Explicit test MongoDB required');
      }

      const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
      const connection = await createConnection(uri, {
        dbName: database,
        autoIndex: false,
        autoCreate: false,
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
        const values = { id: randomUUID, now: () => new Date() };
        const access = { requireAdministrator: async () => {} };
        const actor = { siteId: 'site-a', actorId: 'admin' };
        const handler = await new CreateHookHandlerUseCase(configuration, access, values).execute({
          ...actor,
          title: 'React',
          kind: HookKind.Event,
          draft: { source: 'return {commands: []};', capabilities: [] },
        });
        const applied = await new ApplyHookHandlerUseCase(configuration, access, values, new HookCompilerAdapter())
          .execute({ ...actor, handlerId: handler.handlerId, expectedVersion: handler.version });
        let current = (await configuration.handler(actor.siteId, handler.handlerId))!;
        const enable = new SetHookHandlerEnabledUseCase(configuration, access, values);

        current = await enable.execute({
          ...actor,
          handlerId: handler.handlerId,
          expectedVersion:
        current.version,
          enabled: true,
        });
        await new SaveHookSubscriptionUseCase(configuration, access, values).execute({
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
            retrySafe: true,
            deliveryMode: 'Event',
            manifestKey: null,
          },
        });
        const events = new MongooseHookEvents(persistence, configuration, (siteId, keys, candidate, session) =>
          new HookRecipientsService(new MongooseHookRecipientSource(configuration, async () => true,
            async () => [], session)).select(siteId, keys, candidate));
        const runtime = new HookScriptRuntime(async (recipient, siteId) => {
          const version = await configuration.version(siteId!, recipient.versionId);

          if (!version) {
            throw new Error('Missing version');
          }

          return version;
        }, async () => ({}));
        const changes = new HookChangesService(events, runtime, values);
        const first = await changes.prepare({
          ...actor,
          subject: 'page-a',
          checkKey: 'cms.page.create.check',
          candidate: {},
          facts: [{ hookKey: 'cms.page.created', payload: { n: 1 } }],
        });

        await persistence.transaction(async (session) => {
          await connection.db!.collection<{ _id: string }>('synthetic_changes')
            .insertOne({ _id: 'first' }, { session });
          await events.record(first, session);
        });
        const aborted = await changes.prepare({
          ...actor,
          subject: 'page-a',
          checkKey: 'cms.page.create.check',
          candidate: {},
          facts: [{ hookKey: 'cms.page.created', payload: { n: 999 } }],
        });

        await expect(persistence.transaction(async (session) => {
          await events.record(aborted, session);
          throw new Error('Synthetic source abort');
        })).rejects.toThrow('Synthetic source abort');
        expect(await connection.db!.collection('hook_events').countDocuments()).toBe(1);
        const second = await changes.prepare({
          ...actor,
          subject: 'page-a',
          checkKey: 'cms.page.create.check',
          candidate: {},
          facts: [{ hookKey: 'cms.page.created', payload: { n: 2 } }],
        });

        await persistence.transaction((session) => events.record(second, session));
        const deliveries = new MongooseHookDeliveries(persistence, configuration, async () => true);

        await deliveries.dispatch(20);
        const claimed = await deliveries.claim();

        expect(claimed?.recipient.versionId).toBe(applied.versionId);
        expect(claimed?.input.n).toBe(1);
        expect(await deliveries.claim()).toBeNull();
        await deliveries.complete(claimed!);
        current = await enable.execute({
          ...actor,
          handlerId: current.handlerId,
          expectedVersion:
        current.version,
          enabled: false,
        });
        expect(await deliveries.claim()).toBeNull();
        const disabled = await changes.prepare({
          ...actor,
          subject: 'page-a',
          checkKey: 'cms.page.create.check',
          candidate: {},
          facts: [{ hookKey: 'cms.page.created', payload: { n: 3 } }],
        });

        expect(disabled.recipients).toHaveLength(0);
        await enable.execute({
          ...actor,
          handlerId: current.handlerId,
          expectedVersion: current.version,
          enabled: true,
        });
        const resumed = await deliveries.claim();

        expect(resumed?.input.n).toBe(2);
        await deliveries.complete(resumed!);
        expect(await deliveries.claim()).toBeNull();
        const pending = await changes.prepare({
          ...actor,
          subject: 'page-b',
          checkKey: '',
          candidate: {},
          facts: [{ hookKey: 'cms.page.created', payload: { n: 4 } }],
        });

        await persistence.transaction((session) => events.record(pending, session));
        await deliveries.dispatch(20);
        const obsolete = await deliveries.claim();
        const command = { key: 'write', name: 'cms.page.update', arguments: {} };

        await deliveries.preparePlan(obsolete!, [command]);
        await connection.db!.collection('hook_command_executions').updateOne({
          deliveryId:
          obsolete!.deliveryId,
        }, { $set: { state: 'Running' } });
        const commandIntent = await changes.forCommand(obsolete!, command).prepare({
          ...actor,
          subject: 'page-c',
          checkKey: '',
          candidate: {},
          facts: [{ hookKey: 'cms.page.created', payload: {} }],
        });

        await connection.db!.collection<{ _id: string }>('hook_deliveries').updateOne({ _id: obsolete!.deliveryId },
          { $set: { leaseUntil: new Date(0) } });
        await expect(persistence.transaction((session) => events.record(commandIntent, session))).rejects.toThrow();
        await deliveries.fail(obsolete!, 'Unknown result', true);
        const uncertain = (await deliveries.history(actor.siteId)).find((item) => item.deliveryId
        === obsolete!.deliveryId)!;

        await deliveries.retry(actor.siteId, obsolete!.deliveryId, String(uncertain.version));
        expect(await connection.db!.collection('hook_command_executions').countDocuments({
          deliveryId:
        obsolete!.deliveryId,
          state: 'Failed',
        })).toBe(1);
        await connection.db!.collection('hook_command_executions').deleteMany({ deliveryId: obsolete!.deliveryId });
        const oldGeneration = pending.generation;

        await expect(persistence.transaction(async (session) => {
          await events.recordRestoration(pending, session);
          throw new Error('Restore aborted');
        })).rejects.toThrow('Restore aborted');
        expect((await persistence.scope(actor.siteId)).generation).toBe(oldGeneration);
        await persistence.transaction((session) => events.recordRestoration({
          ...pending,
          operationId:
        randomUUID(),
        }, session));
        expect((await persistence.scope(actor.siteId)).generation).not.toBe(oldGeneration);
        expect(await connection.db!.collection('hook_deliveries').countDocuments({ state: 'Superseded' })).toBe(1);
        const healthy = await new CreateHookHandlerUseCase(configuration, access, values).execute({
          ...actor,
          title: 'Healthy consumer',
          kind: HookKind.Event,
          draft: {
            source: 'return {commands: []};',
            capabilities: [],
          },
        });

        await new ApplyHookHandlerUseCase(configuration, access, values, new HookCompilerAdapter()).execute({
          ...actor,
          handlerId: healthy.handlerId,
          expectedVersion: healthy.version,
        });
        const ready = (await configuration.handler(actor.siteId, healthy.handlerId))!;

        await enable.execute({ ...actor, handlerId: ready.handlerId, expectedVersion: ready.version, enabled: true });
        const firstBinding = (await configuration.tree(actor.siteId)).hooks[0]!.subscriptions[0]!;

        await new SaveHookSubscriptionUseCase(configuration, access, values).execute({
          ...actor,
          expectedVersion: null,
          subscription: { ...firstBinding, subscriptionId: '', handlerId: healthy.handlerId, priority: 1 },
        });

        for (const n of [5, 6]) {
          const intent = await changes.prepare({
            ...actor,
            subject: 'isolated-page',
            checkKey: '',
            candidate: {},
            facts: [{ hookKey: 'cms.page.created', payload: { n } }],
          });

          await persistence.transaction((session) => events.record(intent, session));
        }
        await deliveries.dispatch(20);
        // Finish the restoration event before examining the two new events.
        const restoredDelivery = await deliveries.claim();

        await deliveries.complete(restoredDelivery!);
        const broken = await deliveries.claim();

        expect(broken?.recipient.consumerId).toBe(handler.handlerId);
        await deliveries.fail(broken!, 'Synthetic handler failure', false);
        const independent = await deliveries.claim();

        expect(independent?.recipient.consumerId).toBe(healthy.handlerId);
        expect(independent?.input.n).toBe(5);
        await deliveries.complete(independent!);
        const independentNext = await deliveries.claim();

        expect(independentNext?.recipient.consumerId).toBe(healthy.handlerId);
        expect(independentNext?.input.n).toBe(6);
        await deliveries.complete(independentNext!);
        expect(await deliveries.claim()).toBeNull();
      } finally {
        await dropHookTestDatabase(connection, database);
      }
    });
});
