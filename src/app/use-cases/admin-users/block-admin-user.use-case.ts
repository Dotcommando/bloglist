import {
  requireAdminUserForChange,
  requireAnotherActiveAdministrator,
} from '../../../domain/admin-users/admin-user.policy.js';
import type { IAdminUserProfile } from '../../../domain/admin-users/admin-user-profile.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import { requireCondition, requireText } from '../../../domain/shared/validation.js';
import type {
  IBlockAdminUser,
  IBlockAdminUserInput,
} from '../../../ports/inbound/admin-users/block-admin-user.port.js';
import type {
  IAdminUserAccessPort,
  IAdminUserValuesPort,
} from '../../../ports/outbound/admin-users/admin-user-capabilities.port.js';
import type { IAdminUserUnitOfWorkPort } from '../../../ports/outbound/admin-users/admin-user-store.port.js';

export class BlockAdminUserUseCase implements IBlockAdminUser {
  constructor(private readonly unitOfWork: IAdminUserUnitOfWorkPort, private readonly access: IAdminUserAccessPort,
    private readonly values: IAdminUserValuesPort) {}

  async execute(input: IBlockAdminUserInput): Promise<IAdminUserProfile> {
    await this.access.requireAdministrator(input.actorId);
    requireText(input.adminUserId, 'adminUserId');
    requireText(input.expectedVersion, 'expectedVersion');
    requireCondition(typeof input.blocked === 'boolean', 'blocked must be boolean');

    if (input.blocked && input.actorId === input.adminUserId) {
      throw new BusinessError(BusinessErrorCode.Forbidden, 'Cannot block the current administrator');
    }

    return this.unitOfWork.run(async (users) => {
      const user = requireAdminUserForChange(await users.findById(input.adminUserId),
        input.adminUserId, input.expectedVersion);

      if (user.toState().blocked === input.blocked) {
        return user.profile();
      }
      if (
        input.blocked
        && user.active
        && (
          !users.readAuthority
        || (await users.readAuthority(input.adminUserId)).systemAdmin
        )
      ) {
        requireAnotherActiveAdministrator(await users.countActive());
      }
      user.setBlocked(input.blocked, this.values.now(), this.values.nextVersion());
      await users.save(user, input.expectedVersion);

      return user.profile();
    });
  }
}
