import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

import { Test, type TestingModule } from '@nestjs/testing';
import { createConnection } from 'mongoose';

import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { HookKind } from '../../src/domain/hooks/hook.js';
import { AppModule } from '../../src/infra/app.module.js';
import { HookWorkerLifecycle } from '../../src/infra/hooks/hook-worker.lifecycle.js';
import { HOOK_OPERATIONS, HOOK_PROCESSOR } from '../../src/infra/hooks/hooks.tokens.js';
import { CREATE_PAGE } from '../../src/infra/pages/pages.tokens.js';
import { CREATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import type { IHookConfigurationOperations } from '../../src/ports/inbound/hooks/hook-configuration.port.js';
import type { IProcessHookDeliveries } from '../../src/ports/inbound/hooks/hook-execution.port.js';
import type { ICreatePage } from '../../src/ports/inbound/pages/create-page.port.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import { dropHookTestDatabase } from '../support/hooks.js';
import { pageInput } from '../support/pages.js';
import { siteInput } from '../support/sites.js';

describe('CMS operations and extension hooks', () => {
  it('denies before page insertion and executes a permitted command with a source-atomic receipt', async () => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

    if (!mongoUri) {
      throw new Error('Explicit isolated MongoDB required');
    }

    const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
    const connection = await createConnection(mongoUri, {
      dbName: database,
      autoCreate: false,
      autoIndex:
      false,
    }).asPromise();

    await mkdir('.tmp', { recursive: true });
    const fixtureRoot = await mkdtemp(path.resolve('.tmp/hook-core-'));
    const dumpsRoot = path.join(fixtureRoot, 'dumps');
    let application: TestingModule | undefined;

    try {
      await applyMigrations(connection, 'migrations');
      application = await Test.createTestingModule({
        imports: [AppModule.forLocalOperator({
          mongoUri,
          database,
          dumpsRoot,
          rendering: {
            sourcesRoot: path.join(fixtureRoot, 'sources'),
            artifactsRoot: path.join(fixtureRoot, 'artifacts'),
          },
          operator: { operatorId: 'operator', platformAdministrator: true },
        })],
      })
        .overrideProvider(HookWorkerLifecycle).useValue({}).compile();

      await application.init();
      const site = await application.get<ICreateSite>(CREATE_SITE).execute(siteInput());

      expect(site.toState()).toMatchObject({ setupState: 'Completed', setupCompletedAt: expect.any(Date) });
      expect(await connection.db!.collection('hook_events').countDocuments({
        siteId: site.siteId, hookKey: 'cms.site.setup.completed',
      })).toBe(1);
      const operations = application.get<IHookConfigurationOperations>(HOOK_OPERATIONS);
      const actor = { siteId: site.siteId, actorId: 'operator' };
      const create = application.get<ICreatePage>(CREATE_PAGE);
      const prepareHandler = async (kind: HookKind, hookKey: string, source: string,
        capabilities: string[]): ReturnType<IHookConfigurationOperations['subscribe']['execute']> => {
        const handler = await operations.create.execute({
          ...actor,
          title: hookKey,
          kind,
          draft: {
            source,
            capabilities,
          },
        });

        await operations.apply.execute({ ...actor, handlerId: handler.handlerId, expectedVersion: handler.version });
        const current = await operations.get.execute({ ...actor, handlerId: handler.handlerId });

        await operations.setEnabled.execute({
          ...actor,
          handlerId: handler.handlerId,
          expectedVersion:
          current.version,
          enabled: true,
        });
        const subscription = await operations.subscribe.execute({
          ...actor,
          expectedVersion: null,
          subscription: {
            subscriptionId: '',
            title: hookKey,
            hookKey,
            schemaVersion: 1,
            kind,
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

        return subscription;
      };
      const check = await prepareHandler(HookKind.Check, 'cms.page.create.check',
        'return {allow:false,reason:"Denied by test"};', []);

      await expect(create.execute({
        ...pageInput(),
        siteId: site.siteId,
        mark: 'Denied',
      })).rejects.toMatchObject({ code: 'HookDenied' });
      expect(await connection.db!.collection('pages').countDocuments({ siteId: site.siteId, mark: 'Denied' })).toBe(0);

      await operations.subscribe.execute({
        ...actor,
        expectedVersion: check.version,
        subscription: {
          ...check,
          enabled: false,
        },
      });
      await prepareHandler(HookKind.Event, 'cms.page.created',
        'if(input.title !== "Root") return {commands:[]}; return {commands:[{key:"create",name:"cms.page.create",arguments:{mark:"Generated",title:"Generated",language:"en"}}]};',
        ['cms.page.create']);
      await create.execute({ ...pageInput(), siteId: site.siteId, mark: 'Root', title: 'Root' });
      const processor = application.get<IProcessHookDeliveries>(HOOK_PROCESSOR);

      await processor.execute({ maximum: 20 });
      await processor.execute({ maximum: 20 });
      expect(await connection.db!.collection('pages').countDocuments({
        siteId: site.siteId, mark: { $in: ['Root', 'Generated'] },
      })).toBe(2);
      const receipts = await connection.db!.collection('hook_command_executions').find({}).toArray();

      expect(receipts).toHaveLength(1);
      expect(receipts[0]?.state).toBe('Succeeded');
      expect(await connection.db!.collection('hook_deliveries').countDocuments({ state: 'Succeeded' })).toBe(2);
    } finally {
      await application?.close();

      await dropHookTestDatabase(connection, database);
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
});
