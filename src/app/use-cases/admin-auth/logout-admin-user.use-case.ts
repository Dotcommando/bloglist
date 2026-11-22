import type {
  ILogoutAdminUser, ILogoutAdminUserInput,
} from '../../../ports/inbound/admin-auth/logout-admin-user.port.js';
import type { IAdminAuthUnitOfWorkPort } from '../../../ports/outbound/admin-auth/admin-auth-store.port.js';
import type {
  IAdminAuthSecretsPort, IAdminAuthValuesPort,
} from '../../../ports/outbound/admin-auth/admin-auth-values.port.js';

export class LogoutAdminUserUseCase implements ILogoutAdminUser {
  constructor(private readonly work: IAdminAuthUnitOfWorkPort, private readonly secrets: IAdminAuthSecretsPort,
    private readonly values: IAdminAuthValuesPort) {}

  async execute(input: ILogoutAdminUserInput): Promise<void> {
    const digest = input.token === null ? null : this.secrets.digest(input.token);

    if (!digest) {
      return;
    }
    await this.work.run(async (tx) => {
      const session = await tx.findSessionByDigest(digest);

      if (session?.toState().revokedAt === null) {
        session.revoke(this.values.now());
        await tx.saveSession(session);
      }
    });
  }
}
