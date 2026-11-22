import type { AdminUser } from '../../../domain/admin-users/admin-user.js';
import type { IAdminUserListQuery, IAdminUserProfile } from '../../../domain/admin-users/admin-user-profile.js';
import type { IAdminAuthorization, IInitialAdminRole } from '../../../domain/authorization/admin-authorization.js';
import type { IHookCommitIntent } from '../../../domain/hooks/hook-execution.js';
import type { ICursorPage } from '../../../domain/shared/cursor-page.js';

export interface IAdminUserReaderPort {
  findById(adminUserId: string): Promise<IAdminUserProfile | null>;
  list(query: IAdminUserListQuery): Promise<ICursorPage<IAdminUserProfile>>;
}

export interface IAdminUserTransaction {
  findById(adminUserId: string): Promise<AdminUser | null>;
  countActive(): Promise<number>;
  readAuthority?(actorId: string): Promise<IAdminAuthorization>;
  save(user: AdminUser, expectedVersion: string | null, hookChange?: IHookCommitIntent,
    role?: IInitialAdminRole): Promise<void>;
}

export interface IAdminUserUnitOfWorkPort {
  run<TResult>(work: (users: IAdminUserTransaction) => Promise<TResult>): Promise<TResult>;
}
