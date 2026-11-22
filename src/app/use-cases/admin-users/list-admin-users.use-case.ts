import { adminUserProfile } from '../../../domain/admin-users/admin-user.js';
import {
  DEFAULT_ADMIN_USER_PAGE_SIZE,
  MAX_ADMIN_USER_PAGE_SIZE,
} from '../../../domain/admin-users/admin-user.policy.js';
import { AdminUserListStatus, type IAdminUserProfile } from '../../../domain/admin-users/admin-user-profile.js';
import type { ICursorPage } from '../../../domain/shared/cursor-page.js';
import { requireCondition, requireInteger } from '../../../domain/shared/validation.js';
import type {
  IListAdminUsers,
  IListAdminUsersInput,
} from '../../../ports/inbound/admin-users/list-admin-users.port.js';
import type { IAdminUserAccessPort } from '../../../ports/outbound/admin-users/admin-user-capabilities.port.js';
import type { IAdminUserReaderPort } from '../../../ports/outbound/admin-users/admin-user-store.port.js';

export class ListAdminUsersUseCase implements IListAdminUsers {
  constructor(private readonly reader: IAdminUserReaderPort, private readonly access: IAdminUserAccessPort) {}

  async execute(input: IListAdminUsersInput): Promise<ICursorPage<IAdminUserProfile>> {
    await this.access.requireAdministrator(input.actorId);
    const limit = input.limit ?? DEFAULT_ADMIN_USER_PAGE_SIZE;
    const status = input.status ?? AdminUserListStatus.All;

    requireInteger(limit, 1, 'limit');
    requireCondition(limit <= MAX_ADMIN_USER_PAGE_SIZE, 'Administrator page limit exceeds 100');
    requireCondition(Object.values(AdminUserListStatus).includes(status), 'Invalid administrator list status');
    requireCondition(input.cursor === undefined || input.cursor === null || typeof input.cursor === 'string',
      'Invalid administrator cursor');
    const page = await this.reader.list({ status, limit, cursor: input.cursor ?? null });

    return { items: page.items.map(adminUserProfile), nextCursor: page.nextCursor };
  }
}
