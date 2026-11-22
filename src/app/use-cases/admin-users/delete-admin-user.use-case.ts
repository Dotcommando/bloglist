import {
  requireAdminUserForChange,
  requireAnotherActiveAdministrator,
} from '../../../domain/admin-users/admin-user.policy.js';
import type { IAdminUserDeletion } from '../../../domain/admin-users/admin-user-profile.js';
import { requireText } from '../../../domain/shared/validation.js';
import type {
  IDeleteAdminUser,
  IDeleteAdminUserInput,
} from '../../../ports/inbound/admin-users/delete-admin-user.port.js';
import type {
  IAdminUserAccessPort,
  IAdminUserValuesPort,
} from '../../../ports/outbound/admin-users/admin-user-capabilities.port.js';
import type { IAdminUserUnitOfWorkPort } from '../../../ports/outbound/admin-users/admin-user-store.port.js';

export class DeleteAdminUserUseCase implements IDeleteAdminUser {
  constructor(private readonly unitOfWork: IAdminUserUnitOfWorkPort, private readonly access: IAdminUserAccessPort,
    private readonly values: IAdminUserValuesPort) {}

  async execute(input: IDeleteAdminUserInput): Promise<IAdminUserDeletion> {
    await this.access.requireAdministrator(input.actorId);
    requireText(input.adminUserId, 'adminUserId');
    requireText(input.expectedVersion, 'expectedVersion');

    return this.unitOfWork.run(async (users) => {
      const user = requireAdminUserForChange(await users.findById(input.adminUserId),
        input.adminUserId, input.expectedVersion);

      if (user.active && (!users.readAuthority || (await users.readAuthority(input.adminUserId)).systemAdmin)) {
        requireAnotherActiveAdministrator(await users.countActive());
      }

      const deletedAt = this.values.now();
      const version = this.values.nextVersion();

      user.delete(deletedAt, version);
      await users.save(user, input.expectedVersion);

      return { adminUserId: input.adminUserId, deletedAt, version };
    });
  }
}
