import type { AdminAuthSession } from '../../../domain/admin-auth/admin-auth-session.js';
import type { AdminUser } from '../../../domain/admin-users/admin-user.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IAdminAuthTransaction } from '../../../ports/outbound/admin-auth/admin-auth-store.port.js';
import type { IAdminAuthSecretsPort } from '../../../ports/outbound/admin-auth/admin-auth-values.port.js';

export class AdminAuthContextService {
  constructor(private readonly secrets: IAdminAuthSecretsPort) {}

  async requireCurrent(tx: IAdminAuthTransaction, token: string | null, at: Date):
  Promise<{ readonly user: AdminUser; readonly session: AdminAuthSession }> {
    const digest = token === null ? null : this.secrets.digest(token);
    const session = digest ? await tx.findSessionByDigest(digest) : null;
    const user = session ? await tx.findById(session.toState().adminUserId) : null;

    if (!session || !user?.active || !session.active(at, user.toState().version)) {
      throw new BusinessError(BusinessErrorCode.AuthenticationRequired, 'Administrator authentication required');
    }
    session.touch(at);
    await tx.saveSession(session);

    return { user, session };
  }
}
