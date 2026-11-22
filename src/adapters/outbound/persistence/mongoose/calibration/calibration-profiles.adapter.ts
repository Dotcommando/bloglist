import { type Connection, type Model, Schema } from 'mongoose';

import { CalibrationPageReferenceKind, CalibrationScope, type ICalibrationProfile } from
  '../../../../../domain/calibration/calibration-profile.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type { ICalibrationProfileQuery, ICalibrationProfilesPort } from
  '../../../../../ports/outbound/calibration/calibration-profiles.port.js';

export interface ICalibrationProfileRecord extends Omit<ICalibrationProfile, 'profileId'> {
  readonly _id: string;
}

const nested: { _id: false; strict: 'throw' } = { _id: false, strict: 'throw' };

const schema = new Schema<ICalibrationProfileRecord>({
  _id: { type: String, required: true },
  version: { type: String, required: true },
  name: { type: String, required: true },
  scope: { type: String, enum: Object.values(CalibrationScope), required: true },
  siteId: { type: String, default: null },
  distributedCpu: { type: Number, required: true },
  targets: {
    type: [new Schema({
      siteId: { type: String, required: true },
      kind: { type: String, enum: Object.values(CalibrationPageReferenceKind), required: true },
      reference: { type: String, required: true },
      share: { type: Number, required: true },
      apiSteps: {
        type: [new Schema({
          addonKey: { type: String, required: true },
          queryId: { type: String, required: true },
        }, nested)],
        default: undefined,
      },
    }, nested)],
    required: true,
  },
  criteria: {
    type: new Schema({
      averageMs: { type: Number, default: null },
      medianMs: { type: Number, default: null },
      p95Ms: { type: Number, default: null },
      p99Ms: { type: Number, default: null },
    }, nested),
    required: true,
  },
  search: {
    type: new Schema({
      concurrencyLevels: { type: [Number], required: true },
      processCounts: { type: [Number], required: true },
      poolSizes: { type: [Number], required: true },
      databaseCpuStep: { type: Number, required: true },
      warmupSeconds: { type: Number, required: true },
      probeSeconds: { type: Number, required: true },
      confirmationSeconds: { type: Number, required: true },
      maximumSeconds: { type: Number, required: true },
    }, nested),
    required: true,
  },
  createdAt: { type: Date, required: true },
  updatedAt: { type: Date, required: true },
  deletedAt: { type: Date, default: null },
}, { collection: 'calibration_profiles', versionKey: false, autoIndex: false, autoCreate: false, strict: 'throw' });

function record(profile: ICalibrationProfile): ICalibrationProfileRecord {
  const { profileId, ...fields } = profile;

  return { _id: profileId, ...fields };
}

function profile(row: ICalibrationProfileRecord): ICalibrationProfile {
  return {
    profileId: row._id,
    version: row.version,
    name: row.name,
    scope: row.scope,
    siteId: row.siteId,
    distributedCpu: row.distributedCpu,
    targets: row.targets.map(target => ({
      siteId: target.siteId,
      kind: target.kind,
      reference: target.reference,
      share: target.share,
      ...(target.apiSteps === undefined ? {} : {
        apiSteps: target.apiSteps.map(step => ({
          addonKey: step.addonKey, queryId: step.queryId,
        })),
      }),
    })),
    criteria: {
      averageMs: row.criteria.averageMs,
      medianMs: row.criteria.medianMs,
      p95Ms: row.criteria.p95Ms,
      p99Ms: row.criteria.p99Ms,
    },
    search: {
      concurrencyLevels: [...row.search.concurrencyLevels],
      processCounts: [...row.search.processCounts],
      poolSizes: [...row.search.poolSizes],
      databaseCpuStep: row.search.databaseCpuStep,
      warmupSeconds: row.search.warmupSeconds,
      probeSeconds: row.search.probeSeconds,
      confirmationSeconds: row.search.confirmationSeconds,
      maximumSeconds: row.search.maximumSeconds,
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export class MongooseCalibrationProfiles implements ICalibrationProfilesPort {
  private readonly model: Model<ICalibrationProfileRecord>;

  constructor(connection: Connection) {
    this.model = connection.model<ICalibrationProfileRecord>('CalibrationProfile', schema);
  }

  async create(value: ICalibrationProfile): Promise<void> {
    await this.model.insertOne(record(value));
  }

  async get(profileId: string): Promise<ICalibrationProfile | null> {
    const row = await this.model.findOne({ _id: profileId, deletedAt: null }).lean().exec();

    return row ? profile(row) : null;
  }

  async list(query: ICalibrationProfileQuery): Promise<{ items: ICalibrationProfile[]; nextCursor: string | null }> {
    const rows = await this.model.find({
      deletedAt: null,
      ...(query.siteId === null ? {} : { $or: [{ siteId: query.siteId }, { scope: CalibrationScope.Installation }] }),
      ...(query.cursor === null ? {} : { _id: { $gt: query.cursor } }),
    }).sort({ _id: 1 }).limit(query.limit + 1).lean().exec();
    const items = rows.slice(0, query.limit).map(profile);

    return { items, nextCursor: rows.length > query.limit ? items.at(-1)?.profileId ?? null : null };
  }

  async replace(value: ICalibrationProfile, expectedVersion: string): Promise<void> {
    const result = await this.model.replaceOne({ _id: value.profileId, version: expectedVersion, deletedAt: null },
      record(value), { runValidators: true }).exec();

    if (result.matchedCount !== 1) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Calibration profile changed');
    }
  }

  async remove(profileId: string, expectedVersion: string, deletedAt: Date): Promise<void> {
    const result = await this.model.updateOne({ _id: profileId, version: expectedVersion, deletedAt: null },
      { $set: { deletedAt, updatedAt: deletedAt } }, { runValidators: true }).exec();

    if (result.matchedCount !== 1) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Calibration profile changed');
    }
  }
}
