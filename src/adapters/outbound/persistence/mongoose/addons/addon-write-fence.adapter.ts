import { AddonOperationAccess, type IAddonOperationPermit, SiteAddonStatus } from '@zarya/addon-contracts/addons';
import type { ClientSession, Connection, Model } from 'mongoose';

import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import { type IMediaLibraryRecord, mediaLibraryModel, mediaRecords } from '../media/file-library-store.adapter.js';
import { MongooseAddonUpdateGate } from './addon-update-gate.adapter.js';
import { type ISiteAddonRecord, siteAddonSchema } from './site-addon-store.adapter.js';

export class MongooseAddonWriteFence {
  private readonly model: Model<ISiteAddonRecord>;

  private readonly updates: MongooseAddonUpdateGate;
  private readonly media: Model<IMediaLibraryRecord>;
  private readonly files: ReturnType<typeof mediaRecords>['files'];

  constructor(connection: Connection) {
    this.updates = new MongooseAddonUpdateGate(connection);
    this.model = connection.model<ISiteAddonRecord>('SiteAddon', siteAddonSchema);
    this.media = mediaLibraryModel(connection);
    this.files = mediaRecords(connection).files;
  }

  async check(permit: IAddonOperationPermit | undefined, transaction: ClientSession,
    fileIds?: readonly string[]): Promise<void> {
    if (!permit) {
      throw new BusinessError(BusinessErrorCode.AddonDisabled, 'Add-on access is required');
    }

    await this.updates.requireActive(permit.addonKey);
    const result = await this.model.updateOne({
      siteId: permit.siteId,
      addonKey: permit.addonKey,
      version: permit.version,
      ...(permit.access === AddonOperationAccess.AdministrationRetained ? {} : { status: SiteAddonStatus.Enabled }),
    }, { $inc: { operationGuard: 1 } }, { session: transaction }).exec();

    if (result.matchedCount !== 1) {
      throw new BusinessError(BusinessErrorCode.AddonDisabled, 'Add-on availability changed');
    }
    if (fileIds !== undefined) {
      if (
        !Array.isArray(fileIds)
        || fileIds.length > 100
        || fileIds.some((id) =>
          typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id))
      ) {
        throw new BusinessError(BusinessErrorCode.Validation, 'Invalid add-on file identities');
      }

      const { siteId } = permit;
      const ids = [...new Set(fileIds)];
      const scope = { _id: siteId, siteId };
      const current = await this.media.findOne(scope).session(transaction).lean().exec();

      if (current?.pending) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Retry after the pending media operation');
      }
      if (
        ids.length
        && await this.files.countDocuments({ siteId, fileId: { $in: ids } })
          .session(transaction).exec() !== ids.length
      ) {
        throw new BusinessError(BusinessErrorCode.NotFound, 'An add-on file does not exist');
      }
      await this.media.updateOne(scope, {
        $inc: { tvFence: 1 },
        $setOnInsert: { version: '0', pending: false },
      }, { upsert: !current, session: transaction }).exec();
    }
  }
}
