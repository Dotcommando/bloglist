import { UpdateAdminUserUseCase } from '../../../src/app/use-cases/admin-users/update-admin-user.use-case.js';
import { adminFixture } from '../../support/admin-users.js';

describe('UpdateAdminUser', () => {
  it('preserves the version for actual no-op edits so existing sessions remain valid', async () => {
    const f = adminFixture();
    const operation = new UpdateAdminUserUseCase(f.unitOfWork, f.access, f.passwords, f.values);
    const input = { actorId: 'operator', adminUserId: 'user-1', expectedVersion: 'user-1-v1' };
    const result = await operation.execute({ ...input, email: ' USER-1@EXAMPLE.TEST ', allowedSiteIds: [] });

    expect(result.version).toBe('user-1-v1');
    await expect(operation.execute(input)).rejects.toMatchObject({ code: 'Validation' });
  });
  it('updates email and password, keeps the reserved site list empty and returns only a profile', async () => {
    const f = adminFixture();
    const operation = new UpdateAdminUserUseCase(f.unitOfWork, f.access, f.passwords, f.values);
    const result = await operation.execute({
      actorId: 'operator',
      adminUserId: 'user-1',
      expectedVersion: 'user-1-v1',
      email: ' NEW@Example.TEST ',
      password: 'synthetic new password',
      allowedSiteIds: [],
    });

    expect(result).toMatchObject({ email: 'new@example.test', allowedSiteIds: [], blocked: false });
    expect(result).not.toHaveProperty('passwordDigest');
    expect(f.accounts.get('user-1')?.toState().passwordDigest).toBe('synthetic-hash-1');
  });
  it('rejects non-empty site assignments, duplicate email, stale versions and missing users atomically', async () => {
    const f = adminFixture();
    const operation = new UpdateAdminUserUseCase(f.unitOfWork, f.access, f.passwords, f.values);
    const input = {
      actorId: 'operator', adminUserId: 'user-1', expectedVersion: 'user-1-v1', email: 'new@example.test',
    };

    await expect(operation.execute({ ...input, allowedSiteIds: ['site'] }))
      .rejects.toMatchObject({ code: 'Validation' });
    await expect(operation.execute({ ...input, email: 'USER-2@EXAMPLE.TEST' }))
      .rejects.toMatchObject({ code: 'Conflict' });
    await expect(operation.execute({ ...input, expectedVersion: 'old' })).rejects.toMatchObject({ code: 'StaleWrite' });
    await expect(operation.execute({ ...input, adminUserId: 'missing' })).rejects.toMatchObject({ code: 'NotFound' });
    expect(f.accounts.get('user-1')?.profile().email).toBe('user-1@example.test');
  });
  it('rejects unauthorized and invalid password changes before hashing', async () => {
    const f = adminFixture();
    const operation = new UpdateAdminUserUseCase(f.unitOfWork, f.access, f.passwords, f.values);
    const input = { actorId: 'operator', adminUserId: 'user-1', expectedVersion: 'user-1-v1', password: 'short' };

    await expect(operation.execute({ ...input, actorId: 'foreign' })).rejects.toMatchObject({ code: 'Forbidden' });
    await expect(operation.execute(input)).rejects.toMatchObject({ code: 'Validation' });
    expect(f.hashCalls).toHaveLength(0);
  });
});
