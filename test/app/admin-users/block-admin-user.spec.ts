import { BlockAdminUserUseCase } from '../../../src/app/use-cases/admin-users/block-admin-user.use-case.js';
import { adminFixture } from '../../support/admin-users.js';

describe('BlockAdminUser', () => {
  it('rejects self-blocking even when another active administrator exists', async () => {
    const f = adminFixture();
    const operation = new BlockAdminUserUseCase(f.unitOfWork, {
      requireAdministrator: async (actorId) => {
        expect(actorId).toBe('user-1');
      },
    }, f.values);

    await expect(operation.execute({
      actorId: 'user-1', adminUserId: 'user-1', expectedVersion: 'user-1-v1', blocked: true,
    })).rejects.toMatchObject({ code: 'Forbidden' });
    expect(f.accounts.get('user-1')?.toState()).toMatchObject({ blocked: false, version: 'user-1-v1' });
  });
  it('blocks and unblocks while retaining identity, credentials and empty site assignments', async () => {
    const f = adminFixture();
    const operation = new BlockAdminUserUseCase(f.unitOfWork, f.access, f.values);
    const blocked = await operation.execute({
      actorId: 'operator',
      adminUserId: 'user-1',
      expectedVersion: 'user-1-v1',
      blocked: true,
    });

    expect(blocked).toMatchObject({ blocked: true, allowedSiteIds: [], adminUserId: 'user-1' });
    const unblocked = await operation.execute({
      actorId: 'operator',
      adminUserId: 'user-1',
      expectedVersion: blocked.version,
      blocked: false,
    });

    expect(unblocked.blocked).toBe(false);
    expect(f.accounts.get('user-1')?.toState().passwordDigest).toBe('synthetic-opaque-digest');
    expect(unblocked).not.toHaveProperty('passwordDigest');
  });
  it('rejects blocking the last active administrator and preserves its version', async () => {
    const f = adminFixture(1);

    await expect(new BlockAdminUserUseCase(f.unitOfWork, f.access, f.values).execute({
      actorId: 'operator', adminUserId: 'user-1', expectedVersion: 'user-1-v1', blocked: true,
    })).rejects.toMatchObject({ code: 'LastAdministrator' });
    expect(f.accounts.get('user-1')?.toState()).toMatchObject({ blocked: false, version: 'user-1-v1' });
  });
  it('rejects untrusted, stale or missing targets and treats a matching existing state as a no-op', async () => {
    const f = adminFixture();
    const operation = new BlockAdminUserUseCase(f.unitOfWork, f.access, f.values);
    const input = { actorId: 'operator', adminUserId: 'user-1', expectedVersion: 'user-1-v1', blocked: false };

    await expect(operation.execute({ ...input, actorId: 'other' })).rejects.toMatchObject({ code: 'Forbidden' });
    await expect(operation.execute({ ...input, expectedVersion: 'old' })).rejects.toMatchObject({ code: 'StaleWrite' });
    await expect(operation.execute({ ...input, adminUserId: 'missing' })).rejects.toMatchObject({ code: 'NotFound' });
    expect((await operation.execute(input)).version).toBe(input.expectedVersion);
  });
});
