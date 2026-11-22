import { type ClientSession, type Connection, type Model, Schema } from 'mongoose';

import { type ISiteAddonState, SiteAddon, SiteAddonStatus } from '../../../../../domain/addons/site-addon.js';
import type { IHookCommitIntent } from '../../../../../domain/hooks/hook-execution.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type { ISiteAddonStorePort } from '../../../../../ports/outbound/addons/site-addon-store.port.js';
import type { MongooseHookEvents } from '../hooks/hook-events.adapter.js';
import { persistHookChange } from '../hooks/hook-mutation.js';
import { MongooseAddonUpdateGate } from './addon-update-gate.adapter.js';

export interface ISiteAddonRecord extends Omit<ISiteAddonState, 'siteAddonId'> {
  readonly _id: string;
  readonly operationGuard: number;
}

export const siteAddonSchema = new Schema<ISiteAddonRecord>({
  _id: { type: String, required: true },
  siteId: { type: String, required: true },
  addonKey: { type: String, required: true },
  status: { type: String, required: true },
  configuration: { type: Schema.Types.Mixed, required: true },
  version: { type: String, required: true },
  operationGuard: { type: Number, required: true },
  createdAt: { type: Date, required: true },
  updatedAt: { type: Date, required: true },
  createdBy: { type: String, required: true },
  updatedBy: { type: String, required: true },
}, {
  collection: 'site_addons',
  autoCreate: false,
  autoIndex: false,
  versionKey: false,
  strict: 'throw',
  minimize: false,
});

export function addonState(record: ISiteAddonRecord): ISiteAddonState {
  return new SiteAddon({
    siteAddonId: record._id,
    siteId: record.siteId,
    addonKey: record.addonKey,
    status: record.status,
    configuration: record.configuration,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    createdBy: record.createdBy,
    updatedBy: record.updatedBy,
  }).toState();
}

export class MongooseSiteAddonStore implements ISiteAddonStorePort {
  readonly model: Model<ISiteAddonRecord>;

  private readonly updates: MongooseAddonUpdateGate;

  constructor(private readonly connection: Connection, private readonly hookEvents?: MongooseHookEvents) {
    this.updates = new MongooseAddonUpdateGate(connection);
    this.model = connection.model<ISiteAddonRecord>('SiteAddon', siteAddonSchema);
  }

  async find(siteId: string, addonKey: string, session?: ClientSession): Promise<ISiteAddonState | null> {
    await this.updates.requireActive(addonKey);
    const row = await this.model.findOne({ siteId, addonKey }).session(session ?? null).lean().exec();

    return row ? addonState(row) : null;
  }

  async list(siteId: string): Promise<readonly ISiteAddonState[]> {
    return (await this.model.find({ siteId }).sort({ addonKey: 1 }).lean().exec()).map(addonState);
  }

  async listEnabled(): Promise<readonly ISiteAddonState[]> {
    const records = await this.model.find({ status: SiteAddonStatus.Enabled }).sort({ siteId: 1, addonKey: 1 })
      .lean().exec();
    const active: ISiteAddonState[] = [];

    for (const record of records) {
      if (!await this.updates.paused(record.addonKey)) {
        active.push(addonState(record));
      }
    }

    return active;
  }

  async commit(next: ISiteAddonState, expectedVersion: string | null, hookChange?: IHookCommitIntent):
  Promise<ISiteAddonState> {
    const mutate = async (session: ClientSession): Promise<ISiteAddonState> => {
      await this.updates.fence(next.addonKey, session);
      const { siteAddonId, ...state } = new SiteAddon(next).toState();

      try {
        if (expectedVersion === null) {
          await this.model.insertOne({ ...state, _id: siteAddonId, operationGuard: 0 }, { session });
        } else {
          const result = await this.model.updateOne({
            _id: siteAddonId, siteId: state.siteId, addonKey: state.addonKey, version: expectedVersion,
          }, { $set: state, $inc: { operationGuard: 1 } }, { session }).exec();

          if (result.matchedCount !== 1) {
            throw new BusinessError(BusinessErrorCode.StaleWrite, 'Connection changed');
          }
        }
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 11000) {
          throw new BusinessError(BusinessErrorCode.StaleWrite, 'Connection already exists');
        }
        throw error;
      }

      return new SiteAddon(next).toState();
    };

    return persistHookChange(this.hookEvents, hookChange, (session) =>
      session ? mutate(session) : this.connection.transaction(mutate), true);
  }
}
