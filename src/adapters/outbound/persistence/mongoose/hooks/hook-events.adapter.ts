import { randomUUID } from 'node:crypto';

import type { IAddonObject } from '@zarya/addon-contracts/addons';
import { type ClientSession, mongo } from 'mongoose';

import { HookKind, type IHookEvaluation } from '../../../../../domain/hooks/hook.js';
import type { IHookCommitIntent, IHookRecipient, IHookSnapshot } from '../../../../../domain/hooks/hook-execution.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type { IHookEventStorePort } from '../../../../../ports/outbound/hooks/hook-execution.port.js';
import { hookDigest, type HookPersistence, type IHookScopeRecord } from './hook.persistence.js';
import type { MongooseHookConfiguration } from './hook-configuration.adapter.js';

export interface IHookEventRecord {
  readonly _id: string;
  readonly installationId: string;
  readonly scopeKey: string;
  readonly scopeKind: 'Site' | 'Installation';
  readonly siteId?: string;
  readonly generation: string;
  readonly hookKey: string;
  readonly schemaVersion: number;
  readonly operationId: string;
  readonly factKey: string;
  readonly subject: string;
  readonly producer: string;
  readonly actorId: string;
  readonly occurredAt: Date;
  readonly payload: IAddonObject;
  readonly recipients: readonly IHookRecipient[];
  readonly sequence: mongo.Long;
  readonly dispatchState: 'Pending' | 'Complete';
  readonly detailCount: number;
  readonly chainId: string;
  readonly causalDepth: number;
}

export function hookScopeFields(scope: IHookScopeRecord | IHookEventRecord): { installationId: string;
  scopeKey: string;
  scopeKind: 'Site' | 'Installation';
  siteId?: string;
  generation: string } {
  return {
    installationId: scope.installationId,
    scopeKey: scope.scopeKey,
    scopeKind: scope.scopeKind,
    ...(scope.siteId ? { siteId: scope.siteId } : {}),
    generation: scope.generation,
  };
}

export class MongooseHookEvents implements IHookEventStorePort {
  constructor(readonly persistence: HookPersistence, private readonly configuration: MongooseHookConfiguration,
    private readonly selectRecipients: (siteId: string | null, keys: readonly string[], candidate: IAddonObject,
      session?: ClientSession) => Promise<readonly IHookRecipient[]>) {}

  async capture(siteId: string | null, hookKeys: readonly string[], candidate: IAddonObject, session?:
  ClientSession): Promise<IHookSnapshot> {
    const scope = await this.persistence.scope(siteId, session);

    if (scope.mode !== 'Active') {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Hooks are in maintenance');
    }

    const recipients = await this.selectRecipients(siteId, hookKeys, candidate, session);

    return {
      installationId: scope.installationId,
      scopeKey: scope.scopeKey,
      siteId,
      generation: scope.generation,
      registryVersion: scope.registryVersion,
      recipients,
    };
  }

  async recordCheck(snapshot: IHookSnapshot, recipient: IHookRecipient, operationId: string,
    result: IHookEvaluation | null, error: string | null): Promise<void> {
    await this.persistence.collection<{ _id: string }>('hook_executions').insertOne({
      _id: randomUUID(),
      installationId: snapshot.installationId,
      scopeKey: snapshot.scopeKey,
      scopeKind: snapshot.siteId ? 'Site' : 'Installation',
      ...(snapshot.siteId ? { siteId: snapshot.siteId } : {}),
      generation: snapshot.generation,
      kind: 'Check',
      operationId,
      subscriptionId: recipient.subscriptionId,
      attemptNumber: 1,
      implementation: { versionId: recipient.versionId },
      startedAt: new Date(),
      finishedAt: new Date(),
      outcome: error ? 'Failed' : result?.allow ? 'Allowed' : 'Denied',
      result: result ?? {},
      error,
    });
  }

  async record(intent: IHookCommitIntent, session: ClientSession): Promise<void> {
    const scopes = this.persistence.collection<IHookScopeRecord>('hook_scope_states');
    const scope = await scopes.findOneAndUpdate({
      _id: intent.scopeKey,
      generation: intent.generation,
      registryVersion: intent.registryVersion,
      mode: 'Active',
    }, {
      $inc: { lastSequence: mongo.Long.fromString(intent.facts.length.toString()), guard: 1 },
    }, { session, returnDocument: 'after' });

    if (!scope) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Hook registry changed before commit');
    }

    const fields = hookScopeFields(scope);
    const first = BigInt(scope.lastSequence.toString()) - BigInt(intent.facts.length) + 1n;

    await this.persistence.collection<{ _id: string }>('hook_execution_chains').updateOne({ _id: intent.chainId }, {
      $setOnInsert: {
        _id: intent.chainId,
        ...fields,
        rootOperationId: intent.chainId,
        reservedCommands: 0,
        maximumDepth: 16,
        version: randomUUID(),
        createdAt: intent.occurredAt,
        updatedAt: intent.occurredAt,
      },
    }, { session, upsert: true });

    for (const [position, fact] of intent.facts.entries()) {
      const eventId = hookDigest([intent.installationId, intent.scopeKey, intent.generation,
        intent.operationId, position, fact.hookKey]);
      const recipients = intent.recipients.filter((item) => item.kind === HookKind.Event && item.hookKey
        === fact.hookKey);
      const event: IHookEventRecord = {
        _id: eventId,
        ...fields,
        hookKey: fact.hookKey,
        schemaVersion: 1,
        operationId: intent.operationId,
        factKey: position + ':' + fact.hookKey,
        subject: intent.subject,
        producer: fact.hookKey.startsWith('cms.') ? 'cms' : fact.hookKey.split('.')[1]!,
        actorId: intent.actorId,
        occurredAt: intent.occurredAt,
        payload: fact.payload,
        recipients,
        sequence: mongo.Long.fromString((first + BigInt(position)).toString()),
        dispatchState: 'Pending',
        detailCount: fact.details?.length ?? 0,
        chainId: intent.chainId,
        causalDepth: intent.causalDepth,
      };

      await this.persistence.collection<IHookEventRecord>('hook_events').insertOne(event, { session });

      if (fact.details?.length) {
        const details = this.persistence.collection<{ _id: string }>('hook_event_details');

        await details.insertMany(fact.details.map((value, ordinal) => ({
          _id: eventId + ':' + ordinal,
          ...fields,
          eventId,
          ordinal: mongo.Long.fromString(ordinal.toString()),
          value,
          digest: hookDigest(value),
        })), { session });
      }
    }

    if (intent.commandReceipt) {
      const origin = await this.persistence.collection<{ _id: string;
        consumerId: string;
        subscriberId:
        string;
        recipient: IHookRecipient }>('hook_deliveries').findOne({
        _id: intent.commandReceipt.deliveryId,
        ownerToken: intent.commandReceipt.ownerToken,
        state: 'Running',
        generation: intent.generation,
        scopeKey: intent.scopeKey,
        leaseUntil: { $gt: new Date() },
      }, { session });

      if (!origin?.recipient.capabilities.includes(intent.commandReceipt.commandName)) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Hook command ownership expired');
      }
      if (intent.siteId && !origin.recipient.addonKey) {
        const tree = await this.configuration.tree(intent.siteId, session);
        const handler = tree.handlers.find((item) => item.handlerId === origin.consumerId);
        const binding = tree.hooks.flatMap((item) => item.subscriptions).find((item) => item.subscriptionId
          === origin.subscriberId);
        const active = handler?.activeVersionId ? await this.configuration.version(intent.siteId,
          handler.activeVersionId, session) : null;

        if (
          !handler?.enabled
          || !binding?.enabled
          || !active?.capabilities.includes(intent.commandReceipt.commandName)
        ) {
          throw new BusinessError(BusinessErrorCode.Forbidden, 'Hook command capability revoked');
        }
      }

      const receipt = await this.persistence.collection<{ _id: string }>('hook_command_executions').updateOne({
        deliveryId: intent.commandReceipt.deliveryId,
        commandKey: intent.commandReceipt.commandKey,
        generation: intent.generation,
        state: 'Running',
      }, {
        $set: {
          state: 'Succeeded',
          result: { subject: intent.subject, operationId: intent.operationId },
          updatedAt: new Date(),
        },
      }, { session });

      if (receipt.matchedCount !== 1) {
        throw new BusinessError(BusinessErrorCode.IdempotencyConflict, 'Command receipt already committed or changed');
      }
    }
  }

  async assertRestorationSafe(siteId: string, session: ClientSession): Promise<void> {
    const unknown = await this.persistence.collection<{ _id: string }>('hook_command_executions').countDocuments({
      siteId, state: { $in: ['Running', 'OutcomeUnknown'] },
    }, { session });

    if (unknown) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Resolve pending hook effects before restoration');
    }
  }

  async recordRestoration(intent: IHookCommitIntent, session: ClientSession): Promise<void> {
    const generation = randomUUID();
    const scope = await this.persistence.scope(intent.siteId, session);

    await this.persistence.collection<IHookScopeRecord>('hook_scope_states').updateOne({ _id: scope._id }, {
      $set: {
        generation, registryVersion: randomUUID(), lastSequence: mongo.Long.ZERO, dispatchedSequence: mongo.Long.ZERO,
      },
      $inc: { guard: 1 },
    }, { session });
    await this.persistence.collection<{ _id: string }>('hook_deliveries').updateMany({
      siteId: intent.siteId,
      state: { $nin: ['Succeeded', 'Skipped', 'Superseded'] },
    }, {
      $set: {
        state: 'Superseded', ownerToken: null, leaseUntil: null, version: randomUUID(), updatedAt: new Date(),
      },
    }, { session });
    const captured = await this.capture(intent.siteId, intent.facts.map((fact) => fact.hookKey), {}, session);

    await this.record({ ...intent, ...captured }, session);
  }
}
