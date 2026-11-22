import { ListAdminUsersUseCase } from '../../../src/app/use-cases/admin-users/list-admin-users.use-case.js';
import { AdminUserListStatus } from '../../../src/domain/admin-users/admin-user-profile.js';
import { adminFixture } from '../../support/admin-users.js';

describe('ListAdminUsers', () => {
  it('lists active/blocked safe profiles with explicit paging and hides deleted accounts', async () => {
    const f = adminFixture(3);

    f.accounts.get('user-2')?.setBlocked(true, f.values.now(), 'blocked-v');
    f.accounts.get('user-3')?.delete(f.values.now(), 'deleted-v');
    const operation = new ListAdminUsersUseCase(f.reader, f.access);
    const first = await operation.execute({ actorId: 'operator', limit: 1 });

    expect(first.items.map((u) => u.adminUserId)).toEqual(['user-1']);
    expect(first.nextCursor).not.toBeNull();
    const second = await operation.execute({ actorId: 'operator', limit: 1, cursor: first.nextCursor });

    expect(second.items.map((u) => u.adminUserId)).toEqual(['user-2']);
    expect(second.nextCursor).toBeNull();
    expect(second.items[0]).not.toHaveProperty('passwordDigest');
    const active = await operation.execute({ actorId: 'operator', status: AdminUserListStatus.Active });

    expect(active.items.map((u) => u.adminUserId)).toEqual(['user-1']);
    const blocked = await operation.execute({ actorId: 'operator', status: AdminUserListStatus.Blocked });

    expect(blocked.items.map((u) => u.adminUserId)).toEqual(['user-2']);
  });
  it('rejects unauthorized calls and invalid counts without silently truncating', async () => {
    const f = adminFixture();
    const operation = new ListAdminUsersUseCase(f.reader, f.access);

    await expect(operation.execute({ actorId: 'foreign' })).rejects.toMatchObject({ code: 'Forbidden' });

    for (const limit of [0, -1, 101, 1.5]) {
      await expect(operation.execute({ actorId: 'operator', limit })).rejects.toMatchObject({ code: 'Validation' });
    }
  });
});
