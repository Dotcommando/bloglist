import { AddonOperationAccess, type IAddonOperationPermit, SiteAddonStatus } from '@zarya/addon-contracts/addons';
import type { ClientSession, Connection, Model } from 'mongoose';

import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import { MongooseAddonUpdateGate } from './addon-update-gate.adapter.js';
import { type ISiteAddonRecord, siteAddonSchema } from './site-addon-store.adapter.js';

export class MongooseAddonWriteFence {
  private readonly model: Model<ISiteAddonRecord>;

  private readonly updates: MongooseAddonUpdateGate;

  constructor(connection: Connection) {
    this.updates = new MongooseAddonUpdateGate(connection);
    this.model = connection.model<ISiteAddonRecord>('SiteAddon', siteAddonSchema);
  }

  async check(permit: IAddonOperationPermit | undefined, transaction: ClientSession): Promise<void> {
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
  }
}
