import { randomUUID } from 'node:crypto';

import { type ClientSession, type Connection, mongo } from 'mongoose';

import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';

export interface IHookScopeRecord {
  readonly _id: string;
  readonly installationId: string;
  readonly scopeKey: string;
  readonly scopeKind: 'Site' | 'Installation';
  readonly siteId?: string;
  readonly generation: string;
  readonly registryVersion: string;
  readonly lastSequence: mongo.Long;
  readonly dispatchedSequence: mongo.Long;
  readonly mode: 'Active' | 'Maintenance' | 'RecoveryRequired';
  readonly guard: number;
}

interface IHookDocument extends mongo.Document { readonly _id: string; }

export { hookDigest } from '../../../shared/hook-digest.js';

export class HookPersistence {
  private installationId = '';

  constructor(readonly connection: Connection) {}

  collection<T extends mongo.Document = mongo.Document>(name: string): mongo.Collection<T & IHookDocument> {
    const database = this.connection.db;

    if (!database) {
      throw new Error('Hook database is not open');
    }

    return database.collection<T & IHookDocument>(name, { promoteLongs: false });
  }

  async initialize(): Promise<void> {
    const installations = this.collection<{ _id: string; singletonKey: string }>('cms_installations');
    const at = new Date();

    await installations.updateOne({ singletonKey: 'Local' }, {
      $setOnInsert: {
        _id: randomUUID(),
        singletonKey: 'Local',
        setupState: 'Pending',
        setupContractVersion: 1,
        setupCompletedAt: null,
        setupCompletedBy: null,
        version: randomUUID(),
        createdAt: at,
        updatedAt: at,
      },
    }, { upsert: true });
    this.installationId = (await installations.findOne({ singletonKey: 'Local' }))!._id;
    await this.scope(null);
  }

  async scope(siteId: string | null, session?: ClientSession): Promise<IHookScopeRecord> {
    if (!this.installationId) {
      throw new Error('Hook installation not initialized');
    }

    const scopeKey = siteId === null ? 'installation' : 'site:' + siteId;
    const collection = this.collection<IHookScopeRecord>('hook_scope_states');

    await collection.updateOne({ _id: scopeKey }, {
      $setOnInsert: {
        _id: scopeKey,
        installationId: this.installationId,
        scopeKey,
        scopeKind: siteId === null ? 'Installation' : 'Site',
        ...(siteId === null ? {} : { siteId }),
        generation: randomUUID(),
        registryVersion: randomUUID(),
        lastSequence: mongo.Long.ZERO,
        dispatchedSequence: mongo.Long.ZERO,
        mode: 'Active',
        guard: 0,
      },
    }, { upsert: true, ...(session ? { session } : {}) });

    return (await collection.findOne({ _id: scopeKey }, { ...(session ? { session } : {}) }))!;
  }

  async bump(siteId: string | null, session: ClientSession): Promise<void> {
    const scope = await this.scope(siteId, session);

    await this.collection<IHookScopeRecord>('hook_scope_states').updateOne({ _id: scope._id },
      { $set: { registryVersion: randomUUID() }, $inc: { guard: 1 } }, { session });
  }

  async transaction<T>(operation: (session: ClientSession, preventRetry: () => void) => Promise<T>,
    writeConflictRetries = 2): Promise<T> {
    const session = await this.connection.startSession();

    try {
      for (let attempt = 0; ; attempt++) {
        let committing = false;
        let retryable = true;

        try {
          session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
          const result = await operation(session, () => {
            retryable = false;
          });

          committing = true;
          await session.commitTransaction();

          return result;
        } catch (error) {
          if (!committing) {
            try {
              await session.abortTransaction();
            } catch (abort) {
              throw new AggregateError([error, abort], 'Hook transaction and abort failed');
            }

            // Replay only aborted database writes, with the original captured predicates.
            if (
              retryable
              && error instanceof Error
              && 'code' in error
              && error.code === 112
              && attempt < writeConflictRetries
            ) {
              await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** Math.min(attempt, 2)));
              continue;
            }
          }
          if (error instanceof Error && 'code' in error && [11000, 112, 244].includes(Number(error.code))) {
            throw new BusinessError(BusinessErrorCode.StaleWrite, 'Concurrent hook configuration or execution');
          }
          throw error;
        }
      }
    } finally {
      await session.endSession();
    }
  }
}
