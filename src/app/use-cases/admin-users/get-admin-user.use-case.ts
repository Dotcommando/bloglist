import { adminUserProfile } from '../../../domain/admin-users/admin-user.js';
import type { IAdminUserProfile } from '../../../domain/admin-users/admin-user-profile.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import { requireText } from '../../../domain/shared/validation.js';
import type { IGetAdminUser, IGetAdminUserInput } from '../../../ports/inbound/admin-users/get-admin-user.port.js';
import type { IAdminUserAccessPort } from '../../../ports/outbound/admin-users/admin-user-capabilities.port.js';
import type { IAdminUserReaderPort } from '../../../ports/outbound/admin-users/admin-user-store.port.js';

export class GetAdminUserUseCase implements IGetAdminUser {
  constructor(private readonly reader: IAdminUserReaderPort, private readonly access: IAdminUserAccessPort) {}

  async execute(input: IGetAdminUserInput): Promise<IAdminUserProfile | null> {
    await this.access.requireAdministrator(input.actorId);
    requireText(input.adminUserId, 'adminUserId');
    const profile = await this.reader.findById(input.adminUserId);

    if (profile && profile.adminUserId !== input.adminUserId) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Inconsistent administrator identity');
    }

    return profile ? adminUserProfile(profile) : null;
  }
}
