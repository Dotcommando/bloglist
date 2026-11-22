import {
  normalizeAdminEmail,
  requireAdminUserForChange,
  requireEmptySiteAssignments,
  validateAdminPassword,
} from '../../../domain/admin-users/admin-user.policy.js';
import type { IAdminUserProfile } from '../../../domain/admin-users/admin-user-profile.js';
import { requireCondition, requireText } from '../../../domain/shared/validation.js';
import type {
  IUpdateAdminUser,
  IUpdateAdminUserInput,
} from '../../../ports/inbound/admin-users/update-admin-user.port.js';
import type {
  IAdminPasswordPort,
  IAdminUserAccessPort,
  IAdminUserValuesPort,
} from '../../../ports/outbound/admin-users/admin-user-capabilities.port.js';
import type { IAdminUserUnitOfWorkPort } from '../../../ports/outbound/admin-users/admin-user-store.port.js';

export class UpdateAdminUserUseCase implements IUpdateAdminUser {
  constructor(private readonly unitOfWork: IAdminUserUnitOfWorkPort, private readonly access: IAdminUserAccessPort,
    private readonly passwords: IAdminPasswordPort, private readonly values: IAdminUserValuesPort) {}

  async execute(input: IUpdateAdminUserInput): Promise<IAdminUserProfile> {
    await this.access.requireAdministrator(input.actorId);
    requireText(input.adminUserId, 'adminUserId');
    requireText(input.expectedVersion, 'expectedVersion');
    requireCondition(input.email !== undefined || input.password !== undefined || input.allowedSiteIds !== undefined,
      'No account changes supplied');
    const email = input.email === undefined ? undefined : normalizeAdminEmail(input.email);

    if (input.allowedSiteIds !== undefined) {
      requireEmptySiteAssignments(input.allowedSiteIds);
    }
    if (input.password !== undefined) {
      validateAdminPassword(input.password);
    }

    const passwordDigest = input.password === undefined ? undefined : await this.passwords.hash(input.password);

    return this.unitOfWork.run(async (users) => {
      const user = requireAdminUserForChange(await users.findById(input.adminUserId),
        input.adminUserId, input.expectedVersion);

      if (passwordDigest === undefined && (email === undefined || email === user.toState().email)) {
        return user.profile();
      }

      user.update({
        ...(email === undefined ? {} : { email }),
        ...(passwordDigest === undefined ? {} : { passwordDigest }),
        ...(input.allowedSiteIds === undefined ? {} : { allowedSiteIds: input.allowedSiteIds }),
      },
      this.values.now(), this.values.nextVersion());
      await users.save(user, input.expectedVersion);

      return user.profile();
    });
  }
}
