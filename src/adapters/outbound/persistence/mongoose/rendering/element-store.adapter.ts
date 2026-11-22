import { randomUUID } from 'node:crypto';

import type { Model } from 'mongoose';

import type { IContentAccess, IContentCreationAccess } from
  '../../../../../domain/authorization/content-access.js';
import type { IHookCommitIntent } from '../../../../../domain/hooks/hook-execution.js';
import type { TemplateSourceKind } from '../../../../../domain/publication/render-plan.js';
import {
  ElementBackupState, type IElementIdentity, type IRenderingElementState, RenderingElement,
} from '../../../../../domain/rendering/rendering-element.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type { IElementStore } from '../../../../../ports/outbound/rendering/element-store.port.js';
import { readElement } from '../../../rendering/files/element-codec.js';
import { contentAccessMatch, createContentAttributes, lockContentWrite } from
  '../authorization/content-access.adapter.js';
import { HookPersistence } from '../hooks/hook.persistence.js';
import type { MongooseHookEvents } from '../hooks/hook-events.adapter.js';
import { persistHookChange } from '../hooks/hook-mutation.js';
import type { IElementRecord } from './element.schema.js';

// Independent creations reserve different keys but still compete for the actor authorization guard.
const elementWriteConflictRetries = 7;

function identity(input: IElementIdentity): IElementIdentity {
  return { siteId: input.siteId, kind: input.kind, key: input.key };
}

function toElement(record: IElementRecord): IRenderingElementState {
  return readElement({ ...record, elementId: record._id });
}

export class MongooseElementStore implements IElementStore {
  constructor(private readonly model: Model<IElementRecord>, private readonly hookEvents?: MongooseHookEvents) {}

  async find(input: IElementIdentity, access?: IContentAccess): Promise<IRenderingElementState | null> {
    const entity = identity(input);
    const record = await this.model.findOne(access ? { $and: [entity, contentAccessMatch(access)] } : entity)
      .lean().exec();

    return record ? toElement(record) : null;
  }

  async list(siteId: string, kind?: TemplateSourceKind, access?: IContentAccess):
  Promise<readonly IRenderingElementState[]> {
    const entity = { siteId, ...(kind ? { kind } : {}) };
    const records = await this.model.find(access ? { $and: [entity, contentAccessMatch(access)] } : entity)
      .sort({ key: 1 }).lean().exec();

    return records.map(toElement);
  }

  async save(input: IRenderingElementState, expectedVersion: string | null, hookChange?: IHookCommitIntent,
    access: IContentCreationAccess = {}):
  Promise<void> {
    return persistHookChange(this.hookEvents, hookChange, async (session) => {
      const { elementId, ...state } = new RenderingElement(input).toState();
      const record = { _id: elementId, ...state };

      try {
        if (expectedVersion === null) {
          const ownership = session ? await createContentAttributes(this.model.db.db!, input.siteId, access, session)
            : {};

          await this.model.insertOne({ ...record, ...ownership }, { ...(session ? { session } : {}) });
        } else {
          const initial = access.authority;
          const current = initial && await lockContentWrite(this.model.db.db!, initial, session);
          const result = await this.model.updateOne({
            ...identity(input),
            version: expectedVersion,
            backupState: ElementBackupState.Ready,
            ...(initial && current ? { $and: [contentAccessMatch(initial), contentAccessMatch(current)] } : {}),
          }, { $set: state }, { ...(session ? { session } : {}) }).exec();

          if (result.matchedCount !== 1) {
            throw new BusinessError(BusinessErrorCode.Conflict, 'Stale rendering element');
          }
        }
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 11000) {
          throw new BusinessError(BusinessErrorCode.Conflict, 'Element already exists');
        }
        throw error;
      }
    }, false, access.authority !== undefined || access.accessGroupId !== undefined,
    expectedVersion === null ? elementWriteConflictRetries : undefined);
  }

  async synchronizeBackup(input: IElementIdentity, version: string,
    write: (element: IRenderingElementState) => Promise<void>, access?: IContentAccess):
  Promise<IRenderingElementState> {
    const transactions = this.hookEvents?.persistence ?? new HookPersistence(this.model.db);

    return transactions.transaction(async (session, preventRetry) => {
      const current = access && await lockContentWrite(this.model.db.db!, access, session);
      const locked = await this.model.findOneAndUpdate({
        ...identity(input),
        version,
        ...(access && current ? { $and: [contentAccessMatch(access), contentAccessMatch(current)] } : {}),
      },
      { $set: { backupGuard: randomUUID() } }, { returnDocument: 'after', session }).lean().exec();

      if (!locked) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'Backup version changed');
      }

      const element = toElement(locked);

      if (element.backupState === ElementBackupState.Pending) {
        preventRetry();
        await write(element);
      }
      await this.model.updateOne({ ...identity(input), version },
        { $set: { backupState: ElementBackupState.Ready }, $unset: { backupGuard: '' } }, { session }).exec();

      return { ...element, backupState: ElementBackupState.Ready };
    }, elementWriteConflictRetries);
  }
}
