import { AdminUser } from '../../src/domain/admin-users/admin-user.js';
import { AdminUserListStatus } from '../../src/domain/admin-users/admin-user-profile.js';
import { BusinessError, BusinessErrorCode } from '../../src/domain/shared/business-error.js';
import type {
  IAdminPasswordPort,
  IAdminUserAccessPort,
  IAdminUserValuesPort,
} from '../../src/ports/outbound/admin-users/admin-user-capabilities.port.js';
import type {
  IAdminUserReaderPort,
  IAdminUserTransaction,
  IAdminUserUnitOfWorkPort,
} from '../../src/ports/outbound/admin-users/admin-user-store.port.js';

export function account(id = 'user-1'): AdminUser {
  return new AdminUser({
    adminUserId: id,
    email: id + '@example.test',
    allowedSiteIds: [],
    blocked: false,
    passwordDigest: 'synthetic-opaque-digest',
    deletedAt: null,
    version: id + '-v1',
    createdAt: new Date('2026-10-24T10:00:00Z'),
    updatedAt: new Date('2026-10-24T10:00:00Z'),
  });
}

export interface IAdminFixture {
  accounts: Map<string, AdminUser>;
  reader: IAdminUserReaderPort;
  unitOfWork: IAdminUserUnitOfWorkPort;
  access: IAdminUserAccessPort;
  passwords: IAdminPasswordPort;
  values: IAdminUserValuesPort;
  hashCalls: string[];
}

export function adminFixture(count = 2): IAdminFixture {
  const accounts = new Map<string, AdminUser>();

  for (let i = 1; i <= count; i++) {
    accounts.set('user-' + i, account('user-' + i));
  }
  let sequence = 0;
  const hashCalls: string[] = [];
  const reader: IAdminUserReaderPort = {
    findById: async (id) => {
      const user = accounts.get(id);

      return user?.toState().deletedAt === null ? user.profile() : null;
    },
    list: async (query) => {
      const rows = [...accounts.values()].filter((u) => u.toState().deletedAt === null)
        .map((u) => u.profile()).filter((u) => query.status === AdminUserListStatus.All
          || u.blocked === (query.status === AdminUserListStatus.Blocked))
        .sort((a, b) => a.adminUserId.localeCompare(b.adminUserId))
        .filter((u) => query.cursor === null || u.adminUserId > query.cursor);
      const items = rows.slice(0, query.limit);

      return { items, nextCursor: rows.length > query.limit ? items.at(-1)?.adminUserId ?? null : null };
    },
  };
  const unitOfWork: IAdminUserUnitOfWorkPort = {
    run: async (work) => {
      const staged = new Map([...accounts].map(([key, user]) => [key, new AdminUser(user.toState())]));
      const transaction: IAdminUserTransaction = {
        findById: async (id) => {
          const user = staged.get(id);

          return user?.toState().deletedAt === null ? new AdminUser(user.toState()) : null;
        },
        countActive: async () => [...staged.values()].filter((u) => u.active).length,
        save: async (user, expectedVersion) => {
          const state = user.toState();
          const previous = staged.get(state.adminUserId);

          if (expectedVersion === null ? Boolean(previous) : previous?.toState().version !== expectedVersion) {
            throw new BusinessError(BusinessErrorCode.StaleWrite, 'Stale user');
          }
          if (
            state.deletedAt === null
            && [...staged.values()].some((other) => {
              const row = other.toState();

              return row.adminUserId !== state.adminUserId && row.deletedAt === null && row.email === state.email;
            })
          ) {
            throw new BusinessError(BusinessErrorCode.Conflict, 'Duplicate email');
          }
          staged.set(state.adminUserId, new AdminUser(state));
        },
      };
      const result = await work(transaction);

      accounts.clear();

      for (const [id, user] of staged) {
        accounts.set(id, user);
      }

      return result;
    },
  };

  return {
    accounts,
    reader,
    unitOfWork,
    hashCalls,
    access: {
      requireAdministrator: async (actorId) => {
        if (actorId !== 'operator') {
          throw new BusinessError(BusinessErrorCode.Forbidden, 'Untrusted actor');
        }
      },
    },
    passwords: {
      verify: async () => false,
      hash: async (password) => {
        hashCalls.push(password);

        return 'synthetic-hash-' + hashCalls.length;
      },
    },
    values: {
      nextId: () => 'new-user-' + ++sequence,
      nextVersion: () => 'next-v' + ++sequence,
      now: () => new Date('2026-10-25T11:00:00Z'),
    },
  };
}
