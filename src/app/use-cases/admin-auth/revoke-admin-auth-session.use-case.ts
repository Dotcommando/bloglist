import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import { requireText } from '../../../domain/shared/validation.js';
import type {
  IRevokeAdminAuthSession, IRevokeAdminAuthSessionInput, IRevokeAdminAuthSessionResult,
} from '../../../ports/inbound/admin-auth/revoke-admin-auth-session.port.js';
import type { IAdminAuthUnitOfWorkPort } from '../../../ports/outbound/admin-auth/admin-auth-store.port.js';
import type { IAdminAuthValuesPort } from '../../../ports/outbound/admin-auth/admin-auth-values.port.js';
import type { AdminAuthContextService } from '../../services/admin-auth/admin-auth-context.service.js';

export class RevokeAdminAuthSessionUseCase implements IRevokeAdminAuthSession {
  constructor(private readonly work: IAdminAuthUnitOfWorkPort, private readonly context: AdminAuthContextService,
    private readonly values: IAdminAuthValuesPort) {}

  async execute(input: IRevokeAdminAuthSessionInput): Promise<IRevokeAdminAuthSessionResult> {
    requireText(input.sessionId, 'sessionId');

    return this.work.run(async (tx) => {
      const at = this.values.now();
      const { user, session: current } = await this.context.requireCurrent(tx, input.token, at);
      const target = await tx.findSessionById(input.sessionId);

      if (target?.toState().adminUserId !== user.toState().adminUserId) {
        throw new BusinessError(BusinessErrorCode.NotFound, 'Authentication session not found');
      }
      if (target.toState().revokedAt === null) {
        target.revoke(at);
        await tx.saveSession(target);
      }

      return { currentSessionRevoked: input.sessionId === current.toState().sessionId };
    });
  }
}
