import type { ICurrentAdminUser } from '../../../../domain/admin-auth/admin-auth-session.js';
import { hasAdministratorGrant } from '../../../../domain/authorization/admin-authorization.js';
import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import type { IGetCurrentAdminUser } from '../../../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { IAdminUserAccessPort } from '../../../../ports/outbound/admin-users/admin-user-capabilities.port.js';

export class SessionAdminUserAccessAdapter implements IAdminUserAccessPort {
  private authorization: Promise<ICurrentAdminUser> | undefined;

  constructor(private readonly current: IGetCurrentAdminUser, private readonly token: string | null) {}

  async actorId(actionId?: string): Promise<string> {
    this.authorization ??= this.current.execute({ token: this.token });
    const { user } = await this.authorization;

    if (user.blocked || user.authorization?.systemAdmin !== true) {
      throw new BusinessError(BusinessErrorCode.Forbidden, 'Active global administrator required');
    }
    if (actionId && !hasAdministratorGrant(user.authorization, actionId)) {
      throw new BusinessError(BusinessErrorCode.Forbidden, 'Installation action permission required');
    }

    return user.adminUserId;
  }

  async requireAdministrator(actorId: string): Promise<void> {
    if (actorId !== await this.actorId()) {
      throw new BusinessError(BusinessErrorCode.Forbidden, 'Actor does not match the session');
    }
  }
}
