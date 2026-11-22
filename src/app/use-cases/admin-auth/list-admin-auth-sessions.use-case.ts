import { requireAuthListLimit } from '../../../domain/admin-auth/admin-auth.policy.js';
import type { IAdminAuthSessionProfile } from '../../../domain/admin-auth/admin-auth-session.js';
import type { ICursorPage } from '../../../domain/shared/cursor-page.js';
import type {
  IListAdminAuthSessions, IListAdminAuthSessionsInput,
} from '../../../ports/inbound/admin-auth/list-admin-auth-sessions.port.js';
import type { IAdminAuthUnitOfWorkPort } from '../../../ports/outbound/admin-auth/admin-auth-store.port.js';
import type { IAdminAuthValuesPort } from '../../../ports/outbound/admin-auth/admin-auth-values.port.js';
import type { AdminAuthContextService } from '../../services/admin-auth/admin-auth-context.service.js';

export class ListAdminAuthSessionsUseCase implements IListAdminAuthSessions {
  constructor(private readonly work: IAdminAuthUnitOfWorkPort, private readonly context: AdminAuthContextService,
    private readonly values: IAdminAuthValuesPort) {}

  async execute(input: IListAdminAuthSessionsInput): Promise<ICursorPage<IAdminAuthSessionProfile>> {
    const limit = input.limit ?? 20;

    requireAuthListLimit(limit);

    return this.work.run(async (tx) => {
      const at = this.values.now();
      const { user, session } = await this.context.requireCurrent(tx, input.token, at);
      const state = user.toState();
      const page = await tx.listActiveSessions(state.adminUserId, state.version, at, limit, input.cursor ?? null);

      return {
        items: page.items.map((item) => item.profile(session.toState().sessionId)),
        nextCursor: page.nextCursor,
      };
    });
  }
}
