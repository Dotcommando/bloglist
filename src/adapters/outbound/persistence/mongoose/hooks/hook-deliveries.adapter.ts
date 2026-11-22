import { randomUUID } from 'node:crypto';

import type { IAddonObject } from '@zarya/addon-contracts/addons';
import { type ClientSession, mongo } from 'mongoose';

import { HookDeliveryState, type IHookCommand } from '../../../../../domain/hooks/hook.js';
import type { IHookCommandOutcome, IHookDelivery, IHookRecipient } from '../../../../../domain/hooks/hook-execution.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type { IHookConfigurationStore } from '../../../../../ports/outbound/hooks/hook-configuration.port.js';
import type { IHookDeliveryStorePort } from '../../../../../ports/outbound/hooks/hook-execution.port.js';
import { hookDigest, type HookPersistence, type IHookScopeRecord } from './hook.persistence.js';
import { hookScopeFields, type IHookEventRecord } from './hook-events.adapter.js';

interface IDeliveryRecord {
  readonly _id: string;
  readonly installationId: string;
  readonly scopeKey: string;
  readonly scopeKind: 'Site' | 'Installation';
  readonly siteId?: string;
  readonly generation: string;
  readonly eventId: string;
  readonly subscriberId: string;
  readonly consumerId: string;
  readonly unitKey: string;
  readonly laneId: string;
  readonly laneSequence: mongo.Long;
  readonly eventPosition: number;
  readonly recipient: IHookRecipient;
  readonly payload: IAddonObject;
  readonly hookKey: string;
  readonly chainId: string;
  readonly causalDepth: number;
  readonly state: HookDeliveryState;
  readonly attemptCount: number;
  readonly nextAttemptAt: Date;
  readonly ownerToken: string | null;
  readonly leaseUntil: Date | null;
  readonly plan: readonly IHookCommand[] | null;
  readonly version: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface ILaneRecord { readonly _id: string;
  readonly assigned: mongo.Long;
  readonly settled: mongo.Long;
  readonly guard: number; }

export class MongooseHookDeliveries implements IHookDeliveryStorePort {
  constructor(private readonly persistence: HookPersistence, private readonly configuration: IHookConfigurationStore,
    private readonly addonEnabled: (siteId: string, addonKey: string) => Promise<boolean>) {}

  async dispatch(maximum: number): Promise<number> {
    let dispatched = 0;
    const scopes = await this.persistence.collection<IHookScopeRecord>('hook_scope_states').find({
      mode:
      'Active',
    }).toArray();

    for (const scope of scopes) {
      if (dispatched >= maximum) {
        break;
      }

      const pending = await this.persistence.collection<IHookEventRecord>('hook_events').find({
        scopeKey: scope.scopeKey, generation: scope.generation, dispatchState: 'Pending',
      }).sort({ sequence: 1 }).limit(maximum - dispatched).toArray();

      for (const event of pending) {
        await this.persistence.transaction(async (session) => {
          const updated = await this.persistence.collection<IHookScopeRecord>('hook_scope_states').updateOne({
            _id: scope._id,
            generation: scope.generation,
            dispatchedSequence:
              mongo.Long.fromString((BigInt(event.sequence.toString()) - 1n).toString()),
            mode: 'Active',
          }, { $set: { dispatchedSequence: event.sequence }, $inc: { guard: 1 } }, { session });

          if (updated.matchedCount !== 1) {
            throw new BusinessError(BusinessErrorCode.StaleWrite, 'Event dispatcher changed');
          }

          for (const [eventPosition, recipient] of event.recipients.entries()) {
            const units = recipient.deliveryMode === 'Detail'
              ? await this.persistence.collection<{ _id: string;
                ordinal: mongo.Long;
                value: IAddonObject }>('hook_event_details')
                .find({ eventId: event._id }, { session }).sort({ ordinal: 1 }).toArray()
              : [{ _id: 'event', ordinal: mongo.Long.ZERO, value: event.payload }];

            for (const unit of units) {
              await this.insertDelivery(event, recipient, unit._id, unit.value, session, eventPosition);
            }
          }
          await this.persistence.collection<IHookEventRecord>('hook_events').updateOne({ _id: event._id },
            { $set: { dispatchState: 'Complete' } }, { session });
        });
        dispatched++;
      }
    }

    return dispatched;
  }

  private async insertDelivery(event: IHookEventRecord, recipient: IHookRecipient, unitKey: string,
    payload: IAddonObject, session: ClientSession, eventPosition: number): Promise<void> {
    const scope = hookScopeFields(event);
    const laneId = hookDigest([event.scopeKey, event.generation, recipient.consumerId, event.subject]);
    const lanes = this.persistence.collection<ILaneRecord>('hook_delivery_lanes');
    const lane = await lanes.findOneAndUpdate({ _id: laneId }, {
      $setOnInsert: {
        ...scope, consumerId: recipient.consumerId, subject: event.subject, settled: mongo.Long.ZERO, guard: 0,
      },
      $inc: { assigned: mongo.Long.ONE },
    }, { session, upsert: true, returnDocument: 'after' });
    const at = new Date();

    await this.persistence.collection<IDeliveryRecord>('hook_deliveries').insertOne({
      _id: hookDigest([event._id, recipient.subscriptionId, unitKey]),
      ...scope,
      eventId: event._id,
      subscriberId: recipient.subscriptionId,
      consumerId: recipient.consumerId,
      unitKey,
      laneId,
      laneSequence: lane!.assigned,
      eventPosition,
      recipient,
      payload,
      hookKey: event.hookKey,
      chainId: event.chainId,
      causalDepth: event.causalDepth,
      state: HookDeliveryState.Pending,
      attemptCount: 0,
      nextAttemptAt: at,
      ownerToken: null,
      leaseUntil: null,
      resumeState: null,
      error: null,
      plan: null,
      completedAt: null,
      version: randomUUID(),
      createdAt: at,
      updatedAt: at,
    }, { session });
  }

  private async available(record: IDeliveryRecord): Promise<boolean> {
    if (record.recipient.addonKey) {
      return record.siteId ? this.addonEnabled(record.siteId, record.recipient.addonKey) : true;
    }
    if (!record.siteId) {
      return false;
    }

    const tree = await this.configuration.tree(record.siteId);
    const handler = tree.handlers.find((item) => item.handlerId === record.consumerId);
    const subscription = tree.hooks.flatMap((item) => item.subscriptions).find((item) => item.subscriptionId
      === record.subscriberId);

    return !!handler?.enabled && !!subscription?.enabled;
  }

  async claim(): Promise<IHookDelivery | null> {
    const collection = this.persistence.collection<IDeliveryRecord>('hook_deliveries');
    const at = new Date();
    const abandoned = await collection.find({
      state: HookDeliveryState.Running,
      leaseUntil: { $lte: at },
    }).limit(20).toArray();

    for (const record of abandoned) {
      const commands = await this.persistence.collection<{ _id: string;
        state: string }>('hook_command_executions')
        .find({ deliveryId: record._id, state: { $in: ['Running', 'OutcomeUnknown'] } }).toArray();

      await collection.updateOne({ _id: record._id, ownerToken: record.ownerToken, state: HookDeliveryState.Running }, {
        $set: {
          state: commands.length ? HookDeliveryState.OutcomeUnknown : HookDeliveryState.Pending,
          ownerToken: null,
          leaseUntil: null,
          version: randomUUID(),
          error: commands.length ? 'Command outcome requires reconciliation' : null,
        },
      });
    }
    const records = await collection.find({
      state: { $in: [HookDeliveryState.Pending, HookDeliveryState.RetryScheduled, HookDeliveryState.Paused] },
      nextAttemptAt: { $lte: at },
    }).sort({ createdAt: 1, _id: 1 }).batchSize(100);

    for await (const record of records) {
      const scope = await this.persistence.scope(record.siteId ?? null);

      if (scope.generation !== record.generation) {
        await collection.updateOne({ _id: record._id, version: record.version }, {
          $set: {
            state:
          HookDeliveryState.Superseded,
            version: randomUUID(),
          },
        });
        continue;
      }
      if (scope.mode !== 'Active') {
        continue;
      }
      if (!await this.available(record)) {
        if (record.state !== HookDeliveryState.Paused) {
          await collection.updateOne({ _id: record._id, version: record.version }, {
            $set: {
              state: HookDeliveryState.Paused,
              resumeState: record.state,
              version: randomUUID(),
              error:
                'Consumer disabled',
            },
          });
        }
        continue;
      }

      const lane = await this.persistence.collection<ILaneRecord>('hook_delivery_lanes').findOne({
        _id:
        record.laneId,
      });

      if (!lane || BigInt(lane.settled.toString()) + 1n !== BigInt(record.laneSequence.toString())) {
        continue;
      }

      const preceding = await collection.find({
        eventId: record.eventId,
        eventPosition: { $lt: record.eventPosition },
        state: { $in: [HookDeliveryState.Pending, HookDeliveryState.Running] },
      }).toArray();
      let precedingActive = false;

      for (const prior of preceding) {
        if (prior.state === HookDeliveryState.Running) {
          precedingActive = true;
          break;
        }

        const priorLane = await this.persistence.collection<ILaneRecord>('hook_delivery_lanes').findOne({
          _id:
          prior.laneId,
        });

        if (
          prior.attemptCount === 0
          && priorLane
          && BigInt(priorLane.settled.toString()) + 1n
          === BigInt(prior.laneSequence.toString())
          && await this.available(prior)
        ) {
          precedingActive = true;
          break;
        }
      }

      if (precedingActive) {
        continue;
      }

      const ownerToken = randomUUID();
      const claimed = await this.persistence.transaction(async (session) => {
        const guard = await this.persistence.collection<IHookScopeRecord>('hook_scope_states').updateOne({
          _id: scope._id, generation: scope.generation, registryVersion: scope.registryVersion, mode: 'Active',
        }, { $inc: { guard: 1 } }, { session });

        if (guard.matchedCount !== 1) {
          throw new BusinessError(BusinessErrorCode.StaleWrite, 'Availability changed');
        }

        const fenced = await this.persistence.collection<ILaneRecord>('hook_delivery_lanes').updateOne({
          _id: lane._id, settled: lane.settled, guard: lane.guard,
        }, { $inc: { guard: 1 } }, { session });

        if (fenced.matchedCount !== 1) {
          throw new BusinessError(BusinessErrorCode.StaleWrite, 'Lane claimed');
        }

        return collection.findOneAndUpdate({ _id: record._id, version: record.version }, {
          $set: {
            state: HookDeliveryState.Running,
            ownerToken,
            leaseUntil: new Date(at.getTime() + 60000),
            version: randomUUID(),
            updatedAt: at,
            error: null,
          },
          $inc: { attemptCount: 1 },
        }, { session, returnDocument: 'after' });
      });

      if (!claimed) {
        continue;
      }

      const event = await this.persistence.collection<IHookEventRecord>('hook_events').findOne({ _id: record.eventId });

      await this.persistence.collection<{ _id: string }>('hook_executions').insertOne({
        _id: ownerToken,
        ...hookScopeFields(scope),
        kind: 'Event',
        operationId: event!.operationId,
        subscriptionId: claimed.subscriberId,
        deliveryId: claimed._id,
        attemptNumber: claimed.attemptCount,
        implementation: { versionId: claimed.recipient.versionId },
        startedAt: at,
        outcome: 'Running',
      });

      return {
        deliveryId: claimed._id,
        siteId: claimed.siteId ?? null,
        generation: claimed.generation,
        eventId: claimed.eventId,
        hookKey: claimed.hookKey,
        actorId: event!.actorId,
        recipient: claimed.recipient,
        chainId: claimed.chainId,
        causalDepth: claimed.causalDepth,
        input: claimed.payload,
        state: claimed.state,
        attemptCount: claimed.attemptCount,
        ownerToken,
        plan: claimed.plan,
      };
    }

    return null;
  }

  private async live(delivery: IHookDelivery, session?: ClientSession): Promise<IDeliveryRecord> {
    const record = await this.persistence.collection<IDeliveryRecord>('hook_deliveries').findOne({
      _id: delivery.deliveryId,
      ownerToken: delivery.ownerToken,
      state: HookDeliveryState.Running,
      generation: delivery.generation,
      leaseUntil: { $gt: new Date() },
    }, { ...(session ? { session } : {}) });

    if (!record) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Hook execution ownership expired');
    }

    return record;
  }

  async preparePlan(delivery: IHookDelivery, commands: readonly IHookCommand[]): Promise<readonly IHookCommand[]> {
    return this.persistence.transaction(async (session) => {
      const record = await this.live(delivery, session);

      if (record.plan) {
        if (hookDigest(record.plan) !== hookDigest(commands)) {
          throw new BusinessError(BusinessErrorCode.IdempotencyConflict, 'Command plan differs');
        }

        return record.plan;
      }

      const reserved = await this.persistence.collection<{ _id: string }>('hook_execution_chains').updateOne({
        _id: record.chainId, reservedCommands: { $lte: 256 - commands.length },
      }, {
        $inc: { reservedCommands: commands.length },
        $set: {
          updatedAt: new Date(),
          version: randomUUID(),
        },
      }, { session });

      if (reserved.matchedCount !== 1 || record.causalDepth >= 16 && commands.length > 0) {
        throw new BusinessError(BusinessErrorCode.Validation, 'Hook causal budget exceeded');
      }

      for (const command of commands) {
        await this.persistence.collection<{ _id: string }>('hook_command_executions').insertOne({
          _id: hookDigest([record._id, command.key]),
          installationId: record.installationId,
          scopeKey: record.scopeKey,
          scopeKind: record.scopeKind,
          ...(record.siteId ? { siteId: record.siteId } : {}),
          generation: record.generation,
          deliveryId: record._id,
          commandKey: command.key,
          commandName: command.name,
          arguments: command.arguments,
          digest: hookDigest(command.arguments),
          idempotencyKey: record._id + ':' + command.key,
          state: 'Prepared',
          result: {},
          error: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }, { session });
      }
      await this.persistence.collection<IDeliveryRecord>('hook_deliveries').updateOne({
        _id: record._id,
        ownerToken: delivery.ownerToken,
      },
      { $set: { plan: commands, updatedAt: new Date() } }, { session });

      return commands;
    });
  }

  async commandSucceeded(delivery: IHookDelivery, command: IHookCommand): Promise<boolean> {
    return !!await this.persistence.collection<{ _id: string }>('hook_command_executions')
      .findOne({ deliveryId: delivery.deliveryId, commandKey: command.key, state: 'Succeeded' });
  }

  async beginCommand(delivery: IHookDelivery, command: IHookCommand): Promise<void> {
    const record = await this.live(delivery);

    if (!await this.available(record)) {
      throw new BusinessError(BusinessErrorCode.Forbidden, 'Hook consumer disabled');
    }
    if (delivery.siteId && !delivery.recipient.addonKey) {
      const current = await this.configuration.handler(delivery.siteId, delivery.recipient.consumerId);
      const version = current?.activeVersionId ? await this.configuration.version(delivery.siteId,
        current.activeVersionId) : null;

      if (!version?.capabilities.includes(command.name)) {
        throw new BusinessError(BusinessErrorCode.Forbidden, 'Capability revoked');
      }
    }

    const result = await this.persistence.collection<{ _id: string }>('hook_command_executions').updateOne({
      deliveryId: delivery.deliveryId, commandKey: command.key, state: { $in: ['Prepared', 'Failed'] },
    }, { $set: { state: 'Running', updatedAt: new Date() } });

    if (result.matchedCount !== 1) {
      throw new BusinessError(BusinessErrorCode.HookOutcomeUnknown, 'Command outcome requires reconciliation');
    }
  }

  async finishCommand(delivery: IHookDelivery, command: IHookCommand, outcome: IHookCommandOutcome): Promise<void> {
    await this.persistence.collection<{ _id: string }>('hook_command_executions').updateOne({
      deliveryId: delivery.deliveryId, commandKey: command.key, state: 'Running',
    }, {
      $set: {
        state: outcome.confirmed ? 'Succeeded' : outcome.retrySafe || outcome.rejected ? 'Failed' : 'OutcomeUnknown',
        result: outcome.result,
        updatedAt: new Date(),
      },
    });
  }

  async complete(delivery: IHookDelivery): Promise<void> {
    await this.persistence.transaction(async (session) => {
      const record = await this.live(delivery, session);
      const unfinished = await this.persistence.collection<{ _id: string }>('hook_command_executions')
        .countDocuments({ deliveryId: record._id, state: { $ne: 'Succeeded' } }, { session });

      if (unfinished) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'Command effects are unfinished');
      }
      await this.settle(record, HookDeliveryState.Succeeded, session);
      await this.persistence.collection<{ _id: string }>('hook_executions').updateOne({ _id: delivery.ownerToken },
        { $set: { outcome: 'Succeeded', finishedAt: new Date() } }, { session });
    });
  }

  private async settle(record: IDeliveryRecord, state: HookDeliveryState, session: ClientSession, error:
    string | null = null): Promise<void> {
    const lane = await this.persistence.collection<ILaneRecord>('hook_delivery_lanes').updateOne({
      _id: record.laneId, settled: mongo.Long.fromString((BigInt(record.laneSequence.toString()) - 1n).toString()),
    }, { $set: { settled: record.laneSequence }, $inc: { guard: 1 } }, { session });

    if (lane.matchedCount !== 1) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Lane changed');
    }
    await this.persistence.collection<IDeliveryRecord>('hook_deliveries').updateOne({
      _id: record._id,
      version: record.version,
    }, {
      $set: {
        state,
        completedAt: new Date(),
        updatedAt: new Date(),
        version: randomUUID(),
        ownerToken: null,
        leaseUntil: null,
        error,
      },
    }, { session });
  }

  async fail(delivery: IHookDelivery, error: string, unknown: boolean): Promise<void> {
    if (
      unknown
      && !await this.persistence.collection<{ _id: string }>('hook_command_executions')
        .countDocuments({ deliveryId: delivery.deliveryId, state: { $in: ['Running', 'OutcomeUnknown'] } })
    ) {
      unknown = false;
    }

    const retry = !unknown && delivery.recipient.retrySafe && delivery.attemptCount < 5;
    const delays = [10000, 60000, 300000, 1800000];

    await this.persistence.collection<IDeliveryRecord>('hook_deliveries').updateOne({
      _id: delivery.deliveryId,
      ownerToken: delivery.ownerToken,
      state: HookDeliveryState.Running,
    }, {
      $set: {
        state: unknown ? HookDeliveryState.OutcomeUnknown : retry ? HookDeliveryState.RetryScheduled
          : HookDeliveryState.Failed,
        error: error.slice(0, 500),
        ownerToken: null,
        leaseUntil: null,
        version: randomUUID(),
        updatedAt: new Date(),
        nextAttemptAt: new Date(Date.now() + (delays[delivery.attemptCount - 1] ?? 1800000)),
      },
    });
    await this.persistence.collection<{ _id: string }>('hook_executions').updateOne({
      _id:
      delivery.ownerToken,
      outcome: 'Running',
    },
    { $set: { outcome: unknown ? 'OutcomeUnknown' : 'Failed', finishedAt: new Date(), error: error.slice(0, 500) } });
  }

  async history(siteId: string): Promise<readonly IAddonObject[]> {
    const records = await this.persistence.collection<IDeliveryRecord>('hook_deliveries').find({ siteId })
      .sort({ createdAt: -1, _id: -1 }).limit(200).toArray();

    return records.map((row) => ({
      deliveryId: row._id,
      eventId: row.eventId,
      hookKey: row.hookKey,
      handlerId: row.consumerId,
      state: row.state,
      version: row.version,
      attempts: row.attemptCount,
      createdAt: row.createdAt.toISOString(),
      lanePosition: row.laneSequence.toString(),
      error: row.error ?? null,
    }));
  }

  async retry(siteId: string, deliveryId: string, version: string): Promise<void> {
    await this.persistence.transaction(async (session) => {
      const record = await this.persistence.collection<IDeliveryRecord>('hook_deliveries').findOne({
        _id:
        deliveryId,
        siteId,
        version,
      }, { session });

      if (record?.state === HookDeliveryState.OutcomeUnknown) {
        const commands = await this.persistence.collection<{ _id: string;
          commandName: string;
          state: string }>('hook_command_executions')
          .find({ deliveryId }, { session }).toArray();

        if (
          commands.some((item) => item.state !== 'Succeeded' && !['cms.page.create',
            'cms.page.update'].includes(item.commandName))
        ) {
          throw new BusinessError(BusinessErrorCode.HookOutcomeUnknown, 'Provider reconciliation is required');
        }
        await this.persistence.collection<{ _id: string }>('hook_command_executions').updateMany({
          deliveryId,
          state: { $in: ['Running', 'OutcomeUnknown'] },
        }, {
          $set: {
            state: 'Failed',
            updatedAt: new Date(),
            error: 'No atomic source receipt; fenced for retry',
          },
        }, { session });
      }

      const result = await this.persistence.collection<IDeliveryRecord>('hook_deliveries').updateOne({
        _id: deliveryId, siteId, version, state: { $in: [HookDeliveryState.Failed, HookDeliveryState.OutcomeUnknown] },
      }, {
        $set: {
          state: HookDeliveryState.Pending,
          nextAttemptAt: new Date(),
          version: randomUUID(),
          updatedAt: new Date(),
        },
      }, { session });

      if (result.matchedCount !== 1) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Delivery cannot be retried');
      }
    });
  }

  async skip(siteId: string, deliveryId: string, version: string, reason: string): Promise<void> {
    await this.persistence.transaction(async (session) => {
      const record = await this.persistence.collection<IDeliveryRecord>('hook_deliveries').findOne({
        _id: deliveryId,
        siteId,
        version,
        state: {
          $in: [HookDeliveryState.Failed, HookDeliveryState.Paused,
            HookDeliveryState.Pending, HookDeliveryState.RetryScheduled],
        },
      }, { session });

      if (
        !record
        || await this.persistence.collection<{ _id: string }>('hook_command_executions').countDocuments({
          deliveryId, state: { $in: ['Running', 'OutcomeUnknown'] },
        }, { session })
      ) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'Unresolved effects prevent skipping');
      }
      await this.settle(record, HookDeliveryState.Skipped, session, reason);
    });
  }
}
