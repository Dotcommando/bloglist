import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import type { IAdminUserReaderPort } from '../../../../ports/outbound/admin-users/admin-user-store.port.js';
import type { IHookAccessPort } from '../../../../ports/outbound/hooks/hook-configuration.port.js';

export class HookAccessAdapter implements IHookAccessPort {
  constructor(private readonly users: IAdminUserReaderPort | null,
    private readonly localOperatorId: string | null, private readonly siteExists: (siteId: string) =>
    Promise<boolean>) {}

  async requireAdministrator(siteId: string, actorId: string): Promise<void> {
    if (this.localOperatorId !== null) {
      if (actorId !== this.localOperatorId) {
        throw new BusinessError(BusinessErrorCode.Forbidden, 'Trusted operator required');
      }
    } else {
      const user = await this.users?.findById(actorId);

      if (!user || user.blocked) {
        throw new BusinessError(BusinessErrorCode.Forbidden, 'Active administrator required');
      }
    }
    if (!await this.siteExists(siteId)) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Site not found');
    }
  }
}
