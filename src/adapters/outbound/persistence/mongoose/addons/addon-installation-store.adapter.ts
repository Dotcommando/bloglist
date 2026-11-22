import { type Connection, type Model, Schema } from 'mongoose';

import {
  AddonInstallationStatus, type IAddonInstallation, requireAddonInstallation, sameAddonPackage,
} from '../../../../../domain/addons/addon-installation.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type { IAddonInstallationStore } from '../../../../../ports/outbound/addons/addon-installation-store.port.js';

export interface IAddonInstallationRecord extends Omit<IAddonInstallation, 'installationId'> {
  readonly _id: string;
}

export const addonInstallationSchema = new Schema<IAddonInstallationRecord>({
  _id: { type: String, required: true },
  repositoryUrl: { type: String, required: true },
  releaseTag: { type: String, required: true },
  sourceCommit: { type: String, required: true },
  artifactChecksum: { type: String, required: true },
  runtimeDigest: { type: String, required: true },
  addonKey: { type: String, required: true },
  implementationVersion: { type: String, required: true },
  cmsVersion: { type: String, required: true },
  status: { type: String, required: true },
  createdAt: { type: Date, required: true },
  installedAt: { type: Date, default: null },
  installedBy: { type: String, required: true },
}, {
  collection: 'addon_installations',
  autoCreate: false,
  autoIndex: false,
  versionKey: false,
  strict: 'throw',
  minimize: false,
});

function state(record: IAddonInstallationRecord): IAddonInstallation {
  const { _id, ...fields } = record;
  const result = { ...fields, installationId: _id };

  requireAddonInstallation(result);

  return result;
}

export class MongooseAddonInstallationStore implements IAddonInstallationStore {
  readonly model: Model<IAddonInstallationRecord>;

  constructor(connection: Connection) {
    this.model = connection.model<IAddonInstallationRecord>('AddonInstallation', addonInstallationSchema);
  }

  async findByRepository(repositoryUrl: string): Promise<IAddonInstallation | null> {
    const row = await this.model.findOne({ repositoryUrl }).lean().exec();

    return row ? state(row) : null;
  }

  async list(): Promise<readonly IAddonInstallation[]> {
    return (await this.model.find({}).sort({ addonKey: 1 }).lean().exec()).map(state);
  }

  async reserve(candidate: IAddonInstallation): Promise<IAddonInstallation> {
    requireAddonInstallation(candidate);
    const { installationId, ...fields } = candidate;

    try {
      await this.model.insertOne({ _id: installationId, ...fields });

      return structuredClone(candidate);
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 11000)) {
        throw error;
      }

      const existing = await this.findByRepository(candidate.repositoryUrl);

      if (!existing || !sameAddonPackage(existing, candidate)) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'A different package or source is already installed');
      }

      return existing;
    }
  }

  async complete(installationId: string, runtimeDigest: string, installedAt: Date): Promise<IAddonInstallation> {
    if (!Number.isFinite(installedAt.getTime())) {
      throw new BusinessError(BusinessErrorCode.Validation, 'Invalid installation time');
    }

    const record = await this.model.findOneAndUpdate({
      _id: installationId, runtimeDigest, status: AddonInstallationStatus.Pending, createdAt: { $lte: installedAt },
    }, { $set: { status: AddonInstallationStatus.Installed, installedAt } }, { returnDocument: 'after' })
      .lean().exec();

    if (record) {
      return state(record);
    }

    const existing = await this.model.findOne({
      _id: installationId, runtimeDigest, status: AddonInstallationStatus.Installed,
    }).lean().exec();

    if (!existing) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Installation metadata changed');
    }

    return state(existing);
  }
}
