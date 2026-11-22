import { AdminUser } from '../../../domain/admin-users/admin-user.js';
import { normalizeAdminEmail, validateAdminPassword } from '../../../domain/admin-users/admin-user.policy.js';
import type { IAdminUserProfile } from '../../../domain/admin-users/admin-user-profile.js';
import { BuiltInRoleId } from '../../../domain/authorization/built-in-roles.js';
import type {
  ICreateAdminUser,
  ICreateAdminUserInput,
} from '../../../ports/inbound/admin-users/create-admin-user.port.js';
import type {
  IAdminPasswordPort,
  IAdminUserAccessPort,
  IAdminUserValuesPort,
} from '../../../ports/outbound/admin-users/admin-user-capabilities.port.js';
import type { IAdminUserUnitOfWorkPort } from '../../../ports/outbound/admin-users/admin-user-store.port.js';
import type { IHookChangesPort } from '../../../ports/outbound/hooks/hook-execution.port.js';
import { prepareCoreHook } from '../../services/hooks/core-hook-change.service.js';

export class CreateAdminUserUseCase implements ICreateAdminUser {
  constructor(private readonly unitOfWork: IAdminUserUnitOfWorkPort, private readonly access:
  IAdminUserAccessPort, private readonly passwords: IAdminPasswordPort, private readonly values:
  IAdminUserValuesPort, private readonly hooks: IHookChangesPort) {}

  async execute(input: ICreateAdminUserInput): Promise<IAdminUserProfile> {
    await this.access.requireAdministrator(input.actorId);
    const email = normalizeAdminEmail(input.email);

    validateAdminPassword(input.password);
    const passwordDigest = await this.passwords.hash(input.password);
    const at = this.values.now();
    const user = new AdminUser({
      adminUserId: this.values.nextId(),
      email,
      passwordDigest,
      allowedSiteIds: [],
      blocked: false,
      deletedAt: null,
      version: this.values.nextVersion(),
      createdAt: at,
      updatedAt: at,
    });
    const systemAdministrator = !input.assignment || input.assignment.roleId === BuiltInRoleId.SystemAdmin;

    return this.unitOfWork.run(async (users) => {
      const intent = systemAdministrator && await users.countActive() === 0
        ? await prepareCoreHook(this.hooks, null, 'installation',
          'cms.installation.setup.complete.check', { adminUserId: user.profile().adminUserId },
          'cms.installation.setup.completed', input.actorId)
        : undefined;

      if (input.assignment) {
        await users.save(user, null, intent, { ...input.assignment, grantedBy: input.actorId });
      } else {
        await users.save(user, null, intent);
      }

      return user.profile();
    });
  }
}
