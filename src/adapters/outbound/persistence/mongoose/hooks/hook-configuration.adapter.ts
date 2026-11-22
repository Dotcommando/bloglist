import { randomUUID } from 'node:crypto';

import { type ClientSession, Schema } from 'mongoose';

import {
  type IHookDefinition, type IHookHandler, type IHookHandlerVersion,
  type IHookSubscription, type IRegisteredHook,
} from '../../../../../domain/hooks/hook.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type { IHookConfigurationStore } from '../../../../../ports/outbound/hooks/hook-configuration.port.js';
import { hookDigest, type HookPersistence } from './hook.persistence.js';

type HandlerRecord = Omit<IHookHandler, 'handlerId'> & { readonly _id: string };

type VersionRecord = Omit<IHookHandlerVersion, 'versionId'> & { readonly _id: string };

type SubscriptionRecord = Omit<IHookSubscription, 'subscriptionId'> & { readonly _id: string };

interface IRegistration {
  readonly _id: string;
  readonly hookKey: string;
  readonly schemaVersion: number;
  readonly registeredAt: Date;
  readonly available: boolean;
  readonly definition: IHookDefinition;
}

export class MongooseHookConfiguration implements IHookConfigurationStore {
  constructor(private readonly persistence: HookPersistence,
    private readonly addonBindings: (siteId: string,
      session?: ClientSession) => Promise<readonly IHookSubscription[]> = async () => []) {
    persistence.connection.model('HookHandler', new Schema({
      _id: String,
      siteId: { type: String, required: true },
      title: String,
      kind: String,
      draft: Schema.Types.Mixed,
      activeVersionId: String,
      enabled: Boolean,
      version: String,
      createdAt: Date,
      updatedAt: Date,
      createdBy: String,
      updatedBy: String,
    }, { collection: 'hook_handlers', autoCreate: false, autoIndex: false, versionKey: false, strict: 'throw' }));
  }

  async tree(siteId: string, session?: ClientSession): ReturnType<IHookConfigurationStore['tree']> {
    const options = session ? { session } : {};
    const registrations = await this.persistence.collection<IRegistration>('hook_registrations').find({},
      options).sort({ hookKey: 1, schemaVersion: 1 }).toArray();
    const subscriptions = await this.persistence.collection<SubscriptionRecord>('hook_subscriptions')
      .find({ siteId }, options).sort({ priority: 1, _id: 1 }).toArray();
    const handlers = await this.persistence.collection<HandlerRecord>('hook_handlers').find({ siteId },
      options).sort({ title: 1, _id: 1 }).toArray();
    const virtual = await this.addonBindings(siteId, session);
    const allSubscriptions = [...subscriptions.map(({ _id, ...state }) => ({ ...state, subscriptionId: _id }))];

    for (const binding of virtual) {
      const existing = allSubscriptions.findIndex((item) => item.subscriptionId === binding.subscriptionId);

      if (existing < 0) {
        allSubscriptions.push(binding);
      } else {
        allSubscriptions[existing] = {
          ...binding,
          priority: allSubscriptions[existing]!.priority,
          version: allSubscriptions[existing]!.version,
        };
      }
    }
    allSubscriptions.sort((a, b) => a.priority - b.priority || a.subscriptionId.localeCompare(b.subscriptionId));
    const hooks: IRegisteredHook[] = registrations
      .map((row) => ({
        ...row.definition,
        registeredAt: row.registeredAt,
        available: row.available,
        subscriptions: allSubscriptions.filter((item) => item.hookKey === row.hookKey
          && item.schemaVersion === row.schemaVersion),
      }));

    return { hooks, handlers: handlers.map(({ _id, ...state }) => ({ ...state, handlerId: _id })) };
  }

  async handler(siteId: string, handlerId: string): Promise<IHookHandler | null> {
    const record = await this.persistence.collection<HandlerRecord>('hook_handlers').findOne({
      _id:
      handlerId,
      siteId,
    });

    if (!record) {
      return null;
    }

    const { _id, ...state } = record;

    return { ...state, handlerId: _id };
  }

  async version(siteId: string, versionId: string, session?: ClientSession): Promise<IHookHandlerVersion | null> {
    const collection = this.persistence.collection<VersionRecord>('hook_handler_versions');
    const record = await collection.findOne({ _id: versionId, siteId }, session ? { session } : {});

    if (!record) {
      return null;
    }

    const { _id, ...state } = record;

    return { ...state, versionId: _id };
  }

  private async writeHandler(handler: IHookHandler, expectedVersion: string | null,
    session: ClientSession): Promise<void> {
    const { handlerId, ...state } = handler;
    const collection = this.persistence.collection<HandlerRecord>('hook_handlers');

    if (expectedVersion === null) {
      await collection.insertOne({ ...state, _id: handlerId }, { session });
    } else {
      const result = await collection.replaceOne({ _id: handlerId, siteId: handler.siteId, version: expectedVersion },
        { ...state, _id: handlerId }, { session });

      if (result.matchedCount !== 1) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Handler changed');
      }
    }
    await this.persistence.bump(handler.siteId, session);
  }

  async saveHandler(handler: IHookHandler, expectedVersion: string | null): Promise<void> {
    await this.persistence.transaction((session) => this.writeHandler(handler, expectedVersion, session));
  }

  async apply(handler: IHookHandler, version: IHookHandlerVersion, expectedVersion: string): Promise<void> {
    await this.persistence.transaction(async (session) => {
      const { versionId, ...state } = version;

      await this.writeHandler(handler, expectedVersion, session);
      await this.persistence.collection<VersionRecord>('hook_handler_versions').insertOne({
        ...state,
        _id: versionId,
      }, { session });
    });
  }

  async saveSubscription(subscription: IHookSubscription, expectedVersion: string | null): Promise<void> {
    await this.persistence.transaction(async (session) => {
      const { subscriptionId, ...state } = subscription;
      const collection = this.persistence.collection<SubscriptionRecord>('hook_subscriptions');

      if (expectedVersion === null) {
        await collection.insertOne({ ...state, _id: subscriptionId }, { session });
      } else {
        const result = await collection.replaceOne({
          _id: subscriptionId,
          siteId: state.siteId,
          version: expectedVersion,
          ownerKind: state.ownerKind,
        }, { ...state, _id: subscriptionId }, { session });

        if (result.matchedCount !== 1) {
          throw new BusinessError(BusinessErrorCode.StaleWrite, 'Subscription changed');
        }
      }
      await this.persistence.bump(state.siteId, session);
    });
  }

  async reorder(siteId: string, hookKey: string,
    ordered: readonly { readonly id: string; readonly version: string }[]): Promise<void> {
    await this.persistence.transaction(async (session) => {
      const projected = (await this.tree(siteId, session)).hooks.find((item) => item.hookKey === hookKey)
        ?.subscriptions ?? [];
      const collection = this.persistence.collection<SubscriptionRecord>('hook_subscriptions');
      const current = projected.map(({ subscriptionId, ...state }) => ({ ...state, _id: subscriptionId }));

      if (
        current.length !== ordered.length
        || new Set(ordered.map((item) => item.id)).size !== ordered.length
        || ordered.some((item) => !current.some((row) => row._id === item.id && row.version === item.version))
      ) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Subscription order changed');
      }

      for (const [priority, item] of ordered.entries()) {
        const existing = await collection.findOne({ _id: item.id, siteId }, { session });

        if (!existing) {
          const row = current.find((entry) => entry._id === item.id)!;

          if (row.ownerKind !== 'Addon') {
            throw new BusinessError(BusinessErrorCode.StaleWrite, 'Binding removed');
          }
          await collection.insertOne({ ...row, priority, version: randomUUID(), updatedAt: new Date() }, { session });
        } else {
          const result = await collection.updateOne({ _id: item.id, siteId, version: item.version },
            { $set: { priority, version: randomUUID(), updatedAt: new Date() } }, { session });

          if (result.matchedCount !== 1) {
            throw new BusinessError(BusinessErrorCode.StaleWrite, 'Binding changed');
          }
        }
      }
      await this.persistence.bump(siteId, session);
    });
  }

  async register(definitions: readonly IHookDefinition[]): Promise<void> {
    const collection = this.persistence.collection<IRegistration>('hook_registrations');

    await this.persistence.transaction(async (session) => {
      const previous = await collection.find({}, { session }).toArray();
      const changed = previous.filter((item) => item.available).length !== definitions.length
      || definitions.some((definition) => !previous.some((item) => item.available && item.hookKey === definition.hookKey
        && item.schemaVersion === definition.schemaVersion && hookDigest(item.definition) === hookDigest(definition)));

      if (!changed) {
        return;
      }

      for (const definition of definitions) {
        if (
          !/^(cms|addon\.[a-z][a-z0-9-]*)\.[a-z][a-z0-9.-]*$/.test(definition.hookKey)
        || definition.provider !== 'cms'
          && !definition.hookKey.startsWith('addon.' + definition.provider + '.')
        ) {
          throw new BusinessError(BusinessErrorCode.Validation, 'Invalid hook owner');
        }
        await collection.updateOne({ _id: definition.hookKey + ':' + definition.schemaVersion }, {
          $setOnInsert: { registeredAt: new Date() },
          $set: {
            hookKey: definition.hookKey,
            schemaVersion: definition.schemaVersion,
            kind: definition.kind,
            provider: definition.provider,
            definition,
            definitionDigest: hookDigest(definition),
            available: true,
          },
        }, { upsert: true, session });
      }
      await collection.updateMany({
        _id: {
          $nin: definitions.map((definition) => definition.hookKey + ':'
        + definition.schemaVersion),
        },
      },
      { $set: { available: false } }, { session });
      await this.persistence.collection<{ _id: string }>('hook_scope_states').updateMany({},
        { $set: { registryVersion: randomUUID() }, $inc: { guard: 1 } }, { session });
    });
  }
}
