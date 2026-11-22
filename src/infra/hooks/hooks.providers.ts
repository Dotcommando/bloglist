import { randomUUID } from 'node:crypto';

import type { Provider } from '@nestjs/common';
import type { ClientSession, Connection } from 'mongoose';

import { AdminHooksController } from '../../adapters/inbound/rest/hooks/admin-hooks.controller.js';
import { HookAccessAdapter } from '../../adapters/outbound/access/hooks/hook-access.adapter.js';
import { HookExecutionAccessAdapter } from '../../adapters/outbound/access/hooks/hook-execution-access.adapter.js';
import type { DumpMaintenance } from '../../adapters/outbound/backup/files/dump-maintenance.js';
import { SharedDumpMaintenance } from '../../adapters/outbound/backup/files/shared-dump-maintenance.js';
import { PageSiteLookupAdapter } from '../../adapters/outbound/capabilities/sites/page-site-lookup.adapter.js';
import { MongooseSiteAddonStore } from
  '../../adapters/outbound/persistence/mongoose/addons/site-addon-store.adapter.js';
import { hookDigest, HookPersistence } from '../../adapters/outbound/persistence/mongoose/hooks/hook.persistence.js';
import { MongooseHookConfiguration } from
  '../../adapters/outbound/persistence/mongoose/hooks/hook-configuration.adapter.js';
import { MongooseHookDeliveries } from '../../adapters/outbound/persistence/mongoose/hooks/hook-deliveries.adapter.js';
import { MongooseHookEvents } from '../../adapters/outbound/persistence/mongoose/hooks/hook-events.adapter.js';
import {
  MongooseHookRecipientSource,
} from '../../adapters/outbound/persistence/mongoose/hooks/hook-recipient-source.adapter.js';
import { type ISiteRecord, siteSchema } from '../../adapters/outbound/persistence/mongoose/sites/site.schema.js';
import { MongooseSiteDocuments } from '../../adapters/outbound/persistence/mongoose/sites/site-documents.adapter.js';
import { MongooseSiteSetup } from '../../adapters/outbound/persistence/mongoose/sites/site-setup.adapter.js';
import { MarkdownConversionAdapter } from '../../adapters/outbound/rendering/html/markdown-conversion.adapter.js';
import { FrontendBuildAdapter } from '../../adapters/outbound/rendering/vite/frontend-build.adapter.js';
import { HookAddonRecipientsAdapter } from '../../adapters/outbound/runtime/hooks/hook-addon-recipients.adapter.js';
import { HookAddonRegistry } from '../../adapters/outbound/runtime/hooks/hook-addon-registry.js';
import { HookCommandAdapter, type HookCommandOperation } from
  '../../adapters/outbound/runtime/hooks/hook-command.adapter.js';
import { HookCompilerAdapter, HookScriptRuntime } from '../../adapters/outbound/runtime/hooks/hook-script.adapter.js';
import { PageLifecycleValuesAdapter } from '../../adapters/outbound/values/pages/page-lifecycle-values.adapter.js';
import { HookChangesService } from '../../app/services/hooks/hook-changes.service.js';
import { HookRecipientsService } from '../../app/services/hooks/hook-recipients.service.js';
import { CompleteSiteSetupService } from '../../app/services/sites/complete-site-setup.service.js';
import { ApplyHookHandlerUseCase } from '../../app/use-cases/hooks/apply-hook-handler.use-case.js';
import { CreateHookHandlerUseCase } from '../../app/use-cases/hooks/create-hook-handler.use-case.js';
import { GetHookHandlerUseCase } from '../../app/use-cases/hooks/get-hook-handler.use-case.js';
import { GetHookHistoryUseCase } from '../../app/use-cases/hooks/get-hook-history.use-case.js';
import { ListHooksUseCase } from '../../app/use-cases/hooks/list-hooks.use-case.js';
import { ProcessHookDeliveriesUseCase } from '../../app/use-cases/hooks/process-hook-deliveries.use-case.js';
import { ReorderHookSubscriptionsUseCase } from '../../app/use-cases/hooks/reorder-hook-subscriptions.use-case.js';
import { RetryHookDeliveryUseCase } from '../../app/use-cases/hooks/retry-hook-delivery.use-case.js';
import { SaveHookSubscriptionUseCase } from '../../app/use-cases/hooks/save-hook-subscription.use-case.js';
import { SetHookHandlerEnabledUseCase } from '../../app/use-cases/hooks/set-hook-handler-enabled.use-case.js';
import { SkipHookDeliveryUseCase } from '../../app/use-cases/hooks/skip-hook-delivery.use-case.js';
import { UpdateHookHandlerUseCase } from '../../app/use-cases/hooks/update-hook-handler.use-case.js';
import { CreatePageUseCase } from '../../app/use-cases/pages/create-page.use-case.js';
import { GetPageUseCase } from '../../app/use-cases/pages/get-page.use-case.js';
import { UpdatePageUseCase } from '../../app/use-cases/pages/update-page.use-case.js';
import { GetSiteUseCase } from '../../app/use-cases/sites/get-site.use-case.js';
import { coreHookDefinitions } from '../../domain/hooks/core-hook-definitions.js';
import {
  HookScopeKind, type IHookInvocation, type IHookSubscription,
  validateHookObject,
} from '../../domain/hooks/hook.js';
import { BusinessError, BusinessErrorCode } from '../../domain/shared/business-error.js';
import type { IGetCurrentAdminUser } from '../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { IHookConfigurationOperations } from '../../ports/inbound/hooks/hook-configuration.port.js';
import type { IProcessHookDeliveries } from '../../ports/inbound/hooks/hook-execution.port.js';
import type { IAdminUserReaderPort } from '../../ports/outbound/admin-users/admin-user-store.port.js';
import type { IHookAccessPort } from '../../ports/outbound/hooks/hook-configuration.port.js';
import type { IPageRepository } from '../../ports/outbound/pages/page.repository.js';
import type { IPublicationStorePort } from '../../ports/outbound/publication/publication-store.port.js';
import type { IReleaseActivationPort } from '../../ports/outbound/publication/release-activation.port.js';
import type { ISiteRepository } from '../../ports/outbound/sites/site.repository.js';
import { installedAddons } from '../addons/installed-addons.js';
import { GET_CURRENT_ADMIN_USER } from '../admin-auth/admin-auth.tokens.js';
import { ADMIN_USER_STORE } from '../admin-users/admin-users.tokens.js';
import { DUMP_MAINTENANCE } from '../dumps/dumps.tokens.js';
import type { ILocalApplicationSettings } from '../local-application.settings.js';
import { PAGE_REPOSITORY } from '../pages/pages.tokens.js';
import { MONGO_CONNECTION } from '../persistence/persistence.tokens.js';
import type { IPublicHttpSettings } from '../public-http.settings.js';
import { PUBLICATION_STORE, RELEASE_ACTIVATION } from '../publication/publication.tokens.js';
import { SITE_SETUP } from '../sites/sites.tokens.js';
import { SITE_REPOSITORY } from '../sites/sites.tokens.js';
import { HookWorkerLifecycle } from './hook-worker.lifecycle.js';
import {
  HOOK_ACCESS, HOOK_ADDON_REGISTRY, HOOK_CHANGES, HOOK_COMMANDS, HOOK_CONFIGURATION, HOOK_DELIVERIES,
  HOOK_EVENTS, HOOK_HISTORY, HOOK_OPERATIONS, HOOK_PERSISTENCE, HOOK_PROCESSOR, HOOK_RETRY, HOOK_RUNTIME, HOOK_SKIP,
} from './hooks.tokens.js';

function required(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BusinessError(BusinessErrorCode.Validation, 'Required command argument');
  }

  return value;
}

export function hooksProviders(settings: ILocalApplicationSettings | IPublicHttpSettings, setupOnly = false):
Provider[] {
  const administrative = !setupOnly && ('operator' in settings || settings.adminAuth !== undefined);
  const values = { id: randomUUID, now: () => new Date() };
  const compiler = new HookCompilerAdapter();

  return [
    {
      provide: HOOK_ADDON_REGISTRY,
      useFactory: async () => {
        const registry = new HookAddonRegistry();

        for (const addon of installedAddons) {
          if (addon.hooks) {
            await registry.register(addon.definition.addonKey,
              hookDigest([addon.definition.implementationVersion, addon.hooks]), addon.hooks);
          }
        }

        return registry;
      },
    },
    {
      provide: HOOK_PERSISTENCE,
      inject: [MONGO_CONNECTION],
      useFactory: async (connection: Connection) => {
        const persistence = new HookPersistence(connection);

        await persistence.initialize();

        return persistence;
      },
    },
    {
      provide: HOOK_CONFIGURATION,
      inject: [HOOK_PERSISTENCE, HOOK_ADDON_REGISTRY],
      useFactory: async (persistence: HookPersistence, addons: HookAddonRegistry) => {
        const connections = new MongooseSiteAddonStore(persistence.connection);
        const store = new MongooseHookConfiguration(persistence, async (siteId, session) => {
          const rows: IHookSubscription[] = [];

          for (const binding of addons.bindings()) {
            const connection = await connections.find(siteId, binding.addonKey, session);
            const definition = [...coreHookDefinitions, ...addons.definitions()].find((item) => item.hookKey
              === binding.handler.hookKey);

            if (!definition || definition.scopeKind === HookScopeKind.Site && !connection) {
              continue;
            }

            const id = hookDigest([definition.scopeKind === HookScopeKind.Site ? siteId : null,
              binding.addonKey, binding.handler.key]);

            rows.push({
              subscriptionId: id,
              siteId,
              hookKey: binding.handler.hookKey,
              schemaVersion: 1,
              kind: binding.handler.kind,
              title: binding.handler.title,
              handlerId: hookDigest([binding.addonKey, binding.handler.key]),
              addonKey: binding.addonKey,
              handlerKey: binding.handler.key,
              ownerKind: 'Addon',
              configuration: {},
              filters: {},
              enabled: definition.scopeKind === HookScopeKind.Installation || connection?.status === 'Enabled',
              priority: binding.handler.priority,
              retrySafe: binding.handler.retrySafe,
              deliveryMode: 'Event',
              manifestKey: binding.handler.key,
              version: binding.digest,
              createdAt: connection?.createdAt ?? new Date(0),
              updatedAt: connection?.updatedAt ?? new Date(0),
              createdBy: 'addon',
              updatedBy: 'addon',
            });
          }

          return rows;
        });
        const register = async (): Promise<void> => store.register([...coreHookDefinitions, ...addons.definitions()]);

        if (!('backgroundWork' in settings) || settings.backgroundWork !== false) {
          addons.onChange(register);
          await register();
        }

        return store;
      },
    },
    ...(!setupOnly ? [{
      provide: SITE_SETUP,
      inject: [MONGO_CONNECTION, HOOK_EVENTS, PUBLICATION_STORE, RELEASE_ACTIVATION],
      useFactory: (connection: Connection, events: MongooseHookEvents, store: IPublicationStorePort,
        activation: IReleaseActivationPort) => new CompleteSiteSetupService(
        new MongooseSiteSetup(connection.model<ISiteRecord>('Site', siteSchema), events),
        new MongooseSiteDocuments(connection),
        new FrontendBuildAdapter(undefined, undefined, new MarkdownConversionAdapter()), store, activation,
        { now: () => new Date(), nextPageId: randomUUID, nextUrlId: randomUUID }),
    }] : []),
    {
      provide: HOOK_EVENTS,
      inject: [HOOK_PERSISTENCE, HOOK_CONFIGURATION, HOOK_ADDON_REGISTRY],
      useFactory: (persistence: HookPersistence, store: MongooseHookConfiguration, addons: HookAddonRegistry) => {
        const connections = new MongooseSiteAddonStore(persistence.connection);
        const enabled = async (siteId: string, addonKey: string, session?: ClientSession): Promise<boolean> =>
          (await connections.find(siteId, addonKey, session))?.status === 'Enabled';
        const recipients = new HookAddonRecipientsAdapter(addons);

        return new MongooseHookEvents(persistence, store, (siteId, keys, candidate, session) =>
          new HookRecipientsService(new MongooseHookRecipientSource(store, enabled,
            (id) => recipients.read(id), session)).select(siteId, keys, candidate));
      },
    },
    {
      provide: HOOK_DELIVERIES,
      inject: [HOOK_PERSISTENCE, HOOK_CONFIGURATION],
      useFactory: (persistence: HookPersistence, configuration: MongooseHookConfiguration) => {
        const connections = new MongooseSiteAddonStore(persistence.connection);

        return new MongooseHookDeliveries(persistence, configuration,
          async (siteId, key) => (await connections.find(siteId, key))?.status === 'Enabled');
      },
    },
    {
      provide: HOOK_RUNTIME,
      inject: [HOOK_CONFIGURATION, HOOK_ADDON_REGISTRY, ...(administrative ? [PAGE_REPOSITORY] : [])],
      useFactory: (store: MongooseHookConfiguration, addons: HookAddonRegistry, pages?: IPageRepository) =>
        new HookScriptRuntime(async (recipient, siteId) => {
          if (recipient.addonKey) {
            return addons.artifact(recipient);
          }

          const version = siteId ? await store.version(siteId, recipient.versionId) : null;

          if (!version) {
            throw new BusinessError(BusinessErrorCode.HookUnavailable, 'Original hook source is unavailable');
          }

          return version;
        }, async (invocation: IHookInvocation, name, input) => {
          if (name !== 'cms.page.get' || !pages || !invocation.siteId) {
            throw new BusinessError(BusinessErrorCode.Forbidden, 'Query unavailable');
          }

          const query = new GetPageUseCase(pages, new HookExecutionAccessAdapter(invocation.siteId));
          const page = await query.execute({ siteId: invocation.siteId, pageId: required(input.pageId) });
          const result: unknown = JSON.parse(JSON.stringify({ page: page?.toState() ?? null }));

          validateHookObject(result, 2097152);

          return result;
        }),
    },
    {
      provide: HOOK_CHANGES,
      inject: [HOOK_EVENTS, HOOK_RUNTIME],
      useFactory: (events: MongooseHookEvents, runtime: HookScriptRuntime) => new HookChangesService(events,
        runtime, values),
    },
    {
      provide: HOOK_COMMANDS,
      inject: [HOOK_CHANGES, ...(administrative ? [PAGE_REPOSITORY, SITE_REPOSITORY] : [])],
      useFactory: (hooks: HookChangesService, pages?: IPageRepository, sites?: ISiteRepository) => {
        const operations = new Map<string, HookCommandOperation>();

        if (pages && sites) {
          operations.set('cms.page.create', async (delivery, command) => {
            const siteId = required(delivery.siteId);
            const access = new HookExecutionAccessAdapter(siteId);
            const getSite = new GetSiteUseCase(sites, access);
            const operation = new CreatePageUseCase(pages, new PageSiteLookupAdapter(getSite), new
            PageLifecycleValuesAdapter(),
            access, hooks.forCommand(delivery, command));
            const page = await operation.execute({
              siteId,
              mark: required(command.arguments.mark),
              title: required(command.arguments.title),
              language: required(command.arguments.language),
              ...(typeof command.arguments.contentMd === 'string' ? { contentMd: command.arguments.contentMd } : {}),
            });

            return { confirmed: true, retrySafe: true, result: { pageId: page.pageId } };
          });
          operations.set('cms.page.update', async (delivery, command) => {
            const siteId = required(delivery.siteId);
            const operation = new UpdatePageUseCase(pages, new HookExecutionAccessAdapter(siteId),
              hooks.forCommand(delivery, command));
            const page = await operation.execute({
              siteId,
              pageId: required(command.arguments.pageId),
              ...(typeof command.arguments.title === 'string' ? { title: command.arguments.title } : {}),
              ...(typeof command.arguments.contentMd === 'string' ? { contentMd: command.arguments.contentMd } : {}),
            });

            return { confirmed: true, retrySafe: true, result: { pageId: page.pageId } };
          });
        }

        return new HookCommandAdapter(operations);
      },
    },
    {
      provide: HOOK_PROCESSOR,
      inject: [HOOK_DELIVERIES, HOOK_RUNTIME, HOOK_COMMANDS],
      useFactory: (store: MongooseHookDeliveries, runtime: HookScriptRuntime, commands: HookCommandAdapter) =>
        new ProcessHookDeliveriesUseCase(store, runtime, commands),
    },
    ...(administrative ? [
      {
        provide: HOOK_ACCESS,
        inject: [SITE_REPOSITORY, ...('operator' in settings ? [] : [ADMIN_USER_STORE])],
        useFactory: (sites: ISiteRepository, users?: IAdminUserReaderPort) => new HookAccessAdapter(users ?? null,
          'operator' in settings ? settings.operator.operatorId : null, async (siteId) => !!await
          sites.findById(siteId)),
      },
      {
        provide: HOOK_OPERATIONS,
        inject: [HOOK_CONFIGURATION, HOOK_ACCESS],
        useFactory: (store: MongooseHookConfiguration, access: IHookAccessPort): IHookConfigurationOperations => ({
          get: new GetHookHandlerUseCase(store, access),
          list: new ListHooksUseCase(store, access),
          create: new CreateHookHandlerUseCase(store, access, values),
          update: new UpdateHookHandlerUseCase(store, access, values),
          apply: new ApplyHookHandlerUseCase(store, access, values, compiler),
          setEnabled: new SetHookHandlerEnabledUseCase(store, access, values),
          subscribe: new SaveHookSubscriptionUseCase(store, access, values),
          reorder: new ReorderHookSubscriptionsUseCase(store, access),
        }),
      },
      {
        provide: HOOK_HISTORY,
        inject: [HOOK_DELIVERIES, HOOK_ACCESS],
        useFactory: (store:
        MongooseHookDeliveries, access: IHookAccessPort) => new GetHookHistoryUseCase(store, access),
      },
      {
        provide: HOOK_RETRY,
        inject: [HOOK_DELIVERIES, HOOK_ACCESS],
        useFactory: (store:
        MongooseHookDeliveries, access: IHookAccessPort) => new RetryHookDeliveryUseCase(store, access),
      },
      {
        provide: HOOK_SKIP,
        inject: [HOOK_DELIVERIES, HOOK_ACCESS],
        useFactory: (store:
        MongooseHookDeliveries, access: IHookAccessPort) => new SkipHookDeliveryUseCase(store, access),
      },
      ...(!('backgroundWork' in settings) || settings.backgroundWork !== false ? [{
        provide: HookWorkerLifecycle,
        inject: [HOOK_PROCESSOR, DUMP_MAINTENANCE],
        useFactory: (processor: IProcessHookDeliveries, maintenance: DumpMaintenance) => new
        HookWorkerLifecycle(processor,
          () => maintenance instanceof SharedDumpMaintenance ? maintenance.enter(false, false) : maintenance.enter(),
          maintenance instanceof SharedDumpMaintenance ? () => maintenance.notifyMutation() : undefined),
      }] : []),
    ] : []),
    ...(!('operator' in settings) && settings.adminAuth ? [{
      provide: AdminHooksController,
      inject: [GET_CURRENT_ADMIN_USER, HOOK_OPERATIONS, HOOK_HISTORY, HOOK_RETRY, HOOK_SKIP],
      useFactory: (current: IGetCurrentAdminUser, operations: IHookConfigurationOperations, history:
      GetHookHistoryUseCase,
      retry: RetryHookDeliveryUseCase, skip: SkipHookDeliveryUseCase) => new
      AdminHooksController(settings.adminAuth!, current, operations, history, retry, skip),
    }] : []),
  ];
}
