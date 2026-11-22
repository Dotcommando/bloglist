import {
  randomBytes, randomUUID,
} from 'node:crypto';

import {
  type Connection, type Model, Schema,
} from 'mongoose';

import type {
  IInstallationSettings,
} from '../../../../../domain/installation/installation-settings.js';
import {
  BusinessError, BusinessErrorCode,
} from '../../../../../domain/shared/business-error.js';
import type {
  IInstallationSettingsStore,
} from '../../../../../ports/outbound/installation/installation-settings-store.port.js';

interface IInstallationSettingsRecord extends IInstallationSettings {
  readonly _id: string;
  readonly probeKey: string;
}

const schema = new Schema<IInstallationSettingsRecord>({
  _id: { type: String, required: true, enum: ['installation'] },
  adminOrigin: { type: String, required: true },
  previousOrigin: { type: String, default: null },
  version: { type: String, required: true },
  probeKey: { type: String, required: true },
}, { collection: 'installation_settings', versionKey: false, autoIndex: false, autoCreate: false, strict: 'throw' });

function settings(record: IInstallationSettingsRecord): IInstallationSettings {
  return { adminOrigin: record.adminOrigin, previousOrigin: record.previousOrigin, version: record.version };
}

export class MongooseInstallationSettingsStore implements IInstallationSettingsStore {
  private readonly model: Model<IInstallationSettingsRecord>;

  constructor(connection: Connection) {
    this.model = connection.model<IInstallationSettingsRecord>('InstallationSettings', schema);
  }

  async initialize(origin: string): Promise<void> {
    try {
      await this.model.updateOne({ _id: 'installation' }, {
        $setOnInsert: {
          adminOrigin: origin, previousOrigin: null, version: randomUUID(), probeKey: randomBytes(32).toString('hex'),
        },
      }, { upsert: true, runValidators: true }).exec();
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 11000)) {
        throw error;
      }
    }
    await this.read();
  }

  private async record(): Promise<IInstallationSettingsRecord> {
    const record = await this.model.findById('installation').read('primary').readConcern('linearizable').lean().exec();

    if (!record) {
      throw new Error('Installation settings have not been initialized');
    }

    return record;
  }

  async read(): Promise<IInstallationSettings> {
    return settings(await this.record());
  }

  async probeKey(): Promise<string> {
    return (await this.record()).probeKey;
  }

  async changeAdminOrigin(origin: string, expectedVersion: string): Promise<IInstallationSettings> {
    const previous = await this.record();

    if (previous.version !== expectedVersion) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Installation settings changed');
    }

    const changed = await this.model.findOneAndUpdate({ _id: 'installation', version: expectedVersion }, {
      $set: {
        adminOrigin: origin, previousOrigin: previous.adminOrigin, version: randomUUID(),
      },
    }, { returnDocument: 'after', runValidators: true }).lean().exec();

    if (!changed) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Installation settings changed');
    }

    return settings(changed);
  }
}
