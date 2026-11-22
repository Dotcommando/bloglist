import type { ICurrentAdminUser } from '../../../domain/admin-auth/admin-auth-session.js';
import type { IAdminSessionInput } from '../../../ports/inbound/admin-auth/admin-session.dto.js';
import type { IGetCurrentAdminUser } from '../../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { IAdminAuthUnitOfWorkPort } from '../../../ports/outbound/admin-auth/admin-auth-store.port.js';
import type { IAdminAuthValuesPort } from '../../../ports/outbound/admin-auth/admin-auth-values.port.js';
import type { AdminAuthContextService } from '../../services/admin-auth/admin-auth-context.service.js';

export class GetCurrentAdminUserUseCase implements IGetCurrentAdminUser {
  constructor(private readonly work: IAdminAuthUnitOfWorkPort, private readonly context: AdminAuthContextService,
    private readonly values: IAdminAuthValuesPort) {}

  async execute(input: IAdminSessionInput): Promise<ICurrentAdminUser> {
    return this.work.run(async (tx) => {
      const { user, session } = await this.context.requireCurrent(tx, input.token, this.values.now());
      const profile = user.profile();
      const authorization = await tx.readAuthority?.(profile.adminUserId);

      return {
        user: authorization ? { ...profile, authorization } : profile,
        session: session.profile(session.toState().sessionId),
      };
    });
  }
}
