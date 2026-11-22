import type { IAdminLoginAttempt } from '../../../domain/admin-auth/admin-auth.policy.js';
import type { AdminAuthSession } from '../../../domain/admin-auth/admin-auth-session.js';
import type { AdminUser } from '../../../domain/admin-users/admin-user.js';
import type { ICursorPage } from '../../../domain/shared/cursor-page.js';
import type { IAdminUserTransaction } from '../admin-users/admin-user-store.port.js';

export interface IAdminAuthTransaction extends IAdminUserTransaction {
  findByEmail(email: string): Promise<AdminUser | null>;
  findSessionByDigest(tokenDigest: string): Promise<AdminAuthSession | null>;
  findSessionById(sessionId: string): Promise<AdminAuthSession | null>;
  createSession(session: AdminAuthSession): Promise<void>;
  saveSession(session: AdminAuthSession): Promise<void>;
  listActiveSessions(adminUserId: string, accountVersion: string, at: Date,
    limit: number, cursor: string | null): Promise<ICursorPage<AdminAuthSession>>;
  findLoginAttempt(loginKey: string): Promise<IAdminLoginAttempt | null>;
  saveLoginAttempt(attempt: IAdminLoginAttempt): Promise<void>;
  clearLoginAttempt(loginKey: string): Promise<void>;
}

export interface IAdminAuthUnitOfWorkPort {
  run<TResult>(work: (auth: IAdminAuthTransaction) => Promise<TResult>): Promise<TResult>;
}
