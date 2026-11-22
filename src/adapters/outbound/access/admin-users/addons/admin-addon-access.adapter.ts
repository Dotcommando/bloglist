import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type { ISiteAddonAccessPort } from '../../../../../ports/outbound/addons/site-addon-access.port.js';
import type { IAdminUserReaderPort } from '../../../../../ports/outbound/admin-users/admin-user-store.port.js';

export class AdminAddonAccessAdapter implements ISiteAddonAccessPort {
  constructor(private readonly users: IAdminUserReaderPort,
    private readonly siteExists: (siteId: string) => Promise<boolean>) {}

  async requireAdministrator(siteId: string, actorId: string): Promise<void> {
    const user = await this.users.findById(actorId);

    if (user?.adminUserId !== actorId || user.blocked) {
      throw new BusinessError(BusinessErrorCode.Forbidden, 'Active administrator required');
    }
    if (!await this.siteExists(siteId)) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Site not found');
    }
  }
}
