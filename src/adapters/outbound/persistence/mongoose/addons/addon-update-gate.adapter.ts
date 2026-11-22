import { randomUUID } from 'node:crypto';

import { type ClientSession, type Connection, type Model, Schema } from 'mongoose';

import { AddonUpdatePhase, type IAddonUpdateProposal, type IAddonUpdateState }
  from '../../../../../domain/addons/addon-update.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import { type ISiteAddonRecord, siteAddonSchema } from './site-addon-store.adapter.js';

interface IAddonRuntimeControl {
  readonly _id: string;
  readonly paused: boolean;
  readonly guard: number;
  readonly actorId: string | null;
  readonly state: IAddonUpdateState | null;
}

const stateSchema = new Schema<IAddonUpdateState>({
  updateId: { type: String, required: true },
  addonKey: { type: String, required: true },
  fromDigest: { type: String, required: true },
  toDigest: { type: String, required: true },
  fromVersion: { type: String, required: true },
  toVersion: { type: String, required: true },
  mode: { type: String, required: true },
  phase: { type: String, required: true },
  paused: { type: Boolean, required: true },
  forcedProcessCount: { type: Number, required: true },
  updatedAt: { type: Date, required: true },
}, { _id: false, versionKey: false, strict: 'throw' });

const controlSchema = new Schema<IAddonRuntimeControl>({
  _id: { type: String, required: true },
  paused: { type: Boolean, required: true },
  guard: { type: Number, required: true },
  actorId: { type: String, default: null },
  state: { type: stateSchema, default: null },
}, { collection: 'addon_runtime_controls', autoCreate: false, autoIndex: false, versionKey: false, strict: 'throw' });

/** Global technical admission; shared by all sites, processes and transactional writers. */
export class MongooseAddonUpdateGate {
  readonly model: Model<IAddonRuntimeControl>;
  private readonly connections: Model<ISiteAddonRecord>;

  constructor(private readonly connection: Connection) {
    this.model = connection.model<IAddonRuntimeControl>('AddonRuntimeControl', controlSchema);
    this.connections = connection.model<ISiteAddonRecord>('SiteAddon', siteAddonSchema);
  }

  async paused(addonKey: string): Promise<boolean> {
    return (await this.model.findById(addonKey).lean().exec())?.paused === true;
  }

  async requireActive(addonKey: string): Promise<void> {
    if (await this.paused(addonKey)) {
      throw new BusinessError(BusinessErrorCode.AddonUnavailable, 'Add-on update is in progress');
    }
  }

  async fence(addonKey: string, session: ClientSession): Promise<void> {
    try {
      await this.model.updateOne({ _id: addonKey, paused: false }, {
        $inc: { guard: 1 }, $setOnInsert: { paused: false, actorId: null, state: null },
      }, { session, upsert: true }).exec();
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 11000) {
        throw new BusinessError(BusinessErrorCode.AddonUnavailable, 'Add-on update is in progress');
      }
      throw error;
    }
  }

  async read(addonKey: string): Promise<IAddonUpdateState | null> {
    return (await this.model.findById(addonKey).lean().exec())?.state ?? null;
  }

  async begin(proposal: IAddonUpdateProposal, actorId: string): Promise<IAddonUpdateState> {
    return this.connection.transaction(async (session) => {
      const previous = await this.model.findById(proposal.addonKey).session(session).lean().exec();

      if (previous?.state?.updateId === proposal.updateId && previous.state.phase === AddonUpdatePhase.Completed) {
        return previous.state;
      }
      if (
        previous?.state
        && previous.state.updateId !== proposal.updateId
        && ![AddonUpdatePhase.Completed, AddonUpdatePhase.Failed].includes(previous.state.phase)
      ) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'Another update requires reconciliation');
      }

      const state: IAddonUpdateState = {
        ...proposal,
        phase: AddonUpdatePhase.Prepared,
        paused: previous?.paused ?? false,
        forcedProcessCount: previous?.state?.forcedProcessCount ?? 0,
        updatedAt: new Date(),
      };

      await this.model.updateOne({ _id: proposal.addonKey }, {
        $set: { paused: state.paused, actorId, state }, $inc: { guard: 1 },
      }, { session, upsert: true }).exec();

      return state;
    });
  }

  async invalidatePermits(proposal: IAddonUpdateProposal): Promise<void> {
    await this.connection.transaction(async session => {
      const control = await this.model.updateOne({
        _id: proposal.addonKey, paused: true, 'state.updateId': proposal.updateId,
      }, { $inc: { guard: 1 } }, { session }).exec();

      if (control.matchedCount !== 1) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'Add-on is not quiescent');
      }
      await this.connections.updateMany({ addonKey: proposal.addonKey }, {
        $set: { version: randomUUID() }, $inc: { operationGuard: 1 },
      }, { session }).exec();
    });
  }

  async change(proposal: IAddonUpdateProposal, phase: AddonUpdatePhase, paused?: boolean,
    forcedProcessCount?: number, confirm?: (session: ClientSession) => Promise<void>): Promise<IAddonUpdateState> {
    return this.connection.transaction(async (session) => {
      const previous = await this.model.findById(proposal.addonKey).session(session).lean().exec();

      if (previous?.state?.updateId !== proposal.updateId) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'Add-on update identity changed');
      }

      const state: IAddonUpdateState = {
        ...previous.state,
        phase,
        paused: paused ?? previous.paused,
        forcedProcessCount: forcedProcessCount ?? previous.state.forcedProcessCount,
        updatedAt: new Date(),
      };

      await confirm?.(session);
      await this.model.updateOne({ _id: proposal.addonKey, 'state.updateId': proposal.updateId }, {
        $set: { state, paused: state.paused }, $inc: { guard: 1 },
      }, { session }).exec();

      if (paused === false && previous.paused) {
        // Invalidate permits issued before either boundary, including retained administration permits.
        await this.connections.updateMany({ addonKey: proposal.addonKey }, {
          $set: { version: randomUUID() }, $inc: { operationGuard: 1 },
        }, { session }).exec();
      }

      return state;
    });
  }
}
