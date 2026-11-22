import {
  AddonOperationAccess, type IAddonOperationPermit, type IAddonOperationPolicyPort, SiteAddonStatus,
} from '@zarya/addon-contracts/addons';

import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { ISiteAddonStorePort } from '../../../ports/outbound/addons/site-addon-store.port.js';

export class AddonOperationService implements IAddonOperationPolicyPort {
  constructor(private readonly store: ISiteAddonStorePort, private readonly addonKey: string) {}

  async authorize(siteId: string, access: AddonOperationAccess): Promise<IAddonOperationPermit> {
    const connection = await this.store.find(siteId, this.addonKey);

    if (
      !connection
      || access !== AddonOperationAccess.AdministrationRetained
      && connection.status !== SiteAddonStatus.Enabled
    ) {
      throw new BusinessError(BusinessErrorCode.AddonDisabled, 'Add-on is disabled');
    }
    if (connection.siteId !== siteId || connection.addonKey !== this.addonKey) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Foreign connection');
    }

    return { siteId, addonKey: this.addonKey, access, version: connection.version };
  }
}
