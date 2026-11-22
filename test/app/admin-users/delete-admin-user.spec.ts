import { DeleteAdminUserUseCase } from '../../../src/app/use-cases/admin-users/delete-admin-user.use-case.js';
import { account, adminFixture } from '../../support/admin-users.js';

describe('DeleteAdminUser', () => {
  it('soft-deletes without losing identity, hides the user and releases their email', async () => {
    const f = adminFixture();
    const result = await new DeleteAdminUserUseCase(f.unitOfWork, f.access, f.values).execute({
      actorId: 'operator', adminUserId: 'user-1', expectedVersion: 'user-1-v1',
    });

    expect(result).toMatchObject({ adminUserId: 'user-1', deletedAt: f.values.now() });
    expect(f.accounts.get('user-1')?.toState().deletedAt).toEqual(f.values.now());
    expect(await f.reader.findById('user-1')).toBeNull();
    const replacement = account('replacement');

    replacement.update({ email: 'user-1@example.test' }, f.values.now(), 'replacement-v2');
    await f.unitOfWork.run(async (users) => {
      await users.save(replacement, null);
    });
    expect((await f.reader.findById('replacement'))?.email).toBe('user-1@example.test');
  });
  it('rejects deleting the last active user but permits deleting a blocked user', async () => {
    const f = adminFixture(1);
    const operation = new DeleteAdminUserUseCase(f.unitOfWork, f.access, f.values);
    const input = { actorId: 'operator', adminUserId: 'user-1', expectedVersion: 'user-1-v1' };

    await expect(operation.execute(input)).rejects.toMatchObject({ code: 'LastAdministrator' });
    const blocked = account('blocked');

    blocked.setBlocked(true, f.values.now(), 'blocked-v2');
    f.accounts.set('blocked', blocked);
    await expect(operation.execute({ ...input, adminUserId: 'blocked', expectedVersion: 'blocked-v2' })).resolves
      .toMatchObject({ adminUserId: 'blocked' });
  });
  it('rejects unauthorized, stale and missing targets before mutation', async () => {
    const f = adminFixture();
    const operation = new DeleteAdminUserUseCase(f.unitOfWork, f.access, f.values);
    const input = { actorId: 'operator', adminUserId: 'user-1', expectedVersion: 'user-1-v1' };

    await expect(operation.execute({ ...input, actorId: 'other' })).rejects.toMatchObject({ code: 'Forbidden' });
    await expect(operation.execute({ ...input, expectedVersion: 'old' })).rejects.toMatchObject({ code: 'StaleWrite' });
    await expect(operation.execute({ ...input, adminUserId: 'missing' })).rejects.toMatchObject({ code: 'NotFound' });
    expect(f.accounts.get('user-1')?.toState().deletedAt).toBeNull();
  });
});
