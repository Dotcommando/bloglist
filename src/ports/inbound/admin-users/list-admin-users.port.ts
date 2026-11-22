import type { AdminUserListStatus, IAdminUserProfile } from '../../../domain/admin-users/admin-user-profile.js';
import type { ICursorPage } from '../../../domain/shared/cursor-page.js';

export interface IListAdminUsersInput {
  readonly actorId: string;
  readonly status?: AdminUserListStatus;
  readonly cursor?: string | null;
  readonly limit?: number;
}

export interface IListAdminUsers {
  execute(input: IListAdminUsersInput): Promise<ICursorPage<IAdminUserProfile>>;
}
