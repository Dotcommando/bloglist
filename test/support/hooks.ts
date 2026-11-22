import type { Connection } from 'mongoose';

import { HookKind, HookScopeKind, type IHookHandler, type IHookHandlerVersion, type IHookSubscription } from
  '../../src/domain/hooks/hook.js';
import { BusinessError, BusinessErrorCode } from '../../src/domain/shared/business-error.js';
import type { IHookConfigurationStore } from '../../src/ports/outbound/hooks/hook-configuration.port.js';
import type { IHookChangesPort } from '../../src/ports/outbound/hooks/hook-execution.port.js';
import type { ISiteSetupPort } from '../../src/ports/outbound/sites/site-setup.port.js';

export const fakeSiteSetup: ISiteSetupPort = { complete: async (_previous, next) => next };

export const fakeHookChanges: IHookChangesPort = {
  prepare: async (change) => ({
    installationId: 'test-installation',
    scopeKey: change.siteId ?? 'installation',
    siteId: change.siteId,
    generation: 'test-generation',
    registryVersion: 'test-registry',
    recipients: [],
    operationId: 'test-operation',
    actorId: change.actorId,
    subject: change.subject,
    facts: [],
    occurredAt: new Date('2100-01-01T00:00:00Z'),
    chainId: 'test-chain',
    causalDepth: 0,
  }),
};

export class HookConfigurationFake implements IHookConfigurationStore {
  handlers = new Map<string, IHookHandler>();
  versions = new Map<string, IHookHandlerVersion>();
  subscriptions = new Map<string, IHookSubscription>();
  definitions = [{
    hookKey: 'cms.page.created',
    title: 'Page created',
    description: '',
    provider: 'cms',
    schemaVersion: 1,
    kind: HookKind.Event,
    scopeKind: HookScopeKind.Site,
  }];

  async tree(siteId: string): ReturnType<IHookConfigurationStore['tree']> {
    return {
      hooks: this.definitions.map((definition) => ({
        ...definition,
        registeredAt: new Date(0),
        available: true,
        subscriptions: [...this.subscriptions.values()].filter((item) => item.siteId === siteId
          && item.hookKey === definition.hookKey).sort((a, b) => a.priority - b.priority
            || a.subscriptionId.localeCompare(b.subscriptionId)),
      })),
      handlers: [...this.handlers.values()].filter((handler) => handler.siteId === siteId),
    };
  }

  async handler(siteId: string, handlerId: string): ReturnType<IHookConfigurationStore['handler']> {
    const handler = this.handlers.get(handlerId);

    return handler?.siteId === siteId ? handler : null;
  }

  async version(siteId: string, versionId: string): ReturnType<IHookConfigurationStore['version']> {
    const version = this.versions.get(versionId);

    return version?.siteId === siteId ? version : null;
  }

  async saveHandler(handler: IHookHandler,
    expectedVersion: string | null): ReturnType<IHookConfigurationStore['saveHandler']> {
    if ((this.handlers.get(handler.handlerId)?.version ?? null) !== expectedVersion) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Changed');
    }
    this.handlers.set(handler.handlerId, handler);
  }

  async apply(handler: IHookHandler, version: IHookHandlerVersion,
    expectedVersion: string): ReturnType<IHookConfigurationStore['apply']> {
    await this.saveHandler(handler, expectedVersion);
    this.versions.set(version.versionId, version);
  }

  async saveSubscription(subscription: IHookSubscription,
    expectedVersion: string | null): ReturnType<IHookConfigurationStore['saveSubscription']> {
    if ((this.subscriptions.get(subscription.subscriptionId)?.version ?? null) !== expectedVersion) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Changed');
    }
    this.subscriptions.set(subscription.subscriptionId, subscription);
  }

  async reorder(siteId: string, hookKey: string,
    ordered: readonly { id: string; version: string }[]): ReturnType<IHookConfigurationStore['reorder']> {
    const current = [...this.subscriptions.values()].filter((item) => item.siteId === siteId && item.hookKey
      === hookKey);

    if (
      current.length !== ordered.length
      || new Set(ordered.map((item) => item.id)).size !== ordered.length
      || ordered.some((item) => !current.some((row) => row.subscriptionId === item.id && row.version
        === item.version))
    ) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Changed');
    }
    ordered.forEach((item, priority) => {
      const subscription = this.subscriptions.get(item.id)!;

      this.subscriptions.set(item.id, { ...subscription, priority, version: item.version + '-next' });
    });
  }

  async register(definitions: typeof this.definitions): ReturnType<IHookConfigurationStore['register']> {
    this.definitions = [...definitions];
  }
}

export async function dropHookTestDatabase(connection: Connection, name: string): Promise<void> {
  if (connection.name !== name || !/^zarya_test_[a-f0-9]{32}$/.test(name)) {
    throw new Error('Unsafe test database cleanup');
  }
  await connection.dropDatabase();
  await connection.close();
}
