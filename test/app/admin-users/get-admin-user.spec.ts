import { GetAdminUserUseCase } from '../../../src/app/use-cases/admin-users/get-admin-user.use-case.js';
import { adminFixture } from '../../support/admin-users.js';

describe('GetAdminUser', () => {
  it('returns safe active or blocked profiles and hides deleted/missing users', async () => {
    const f = adminFixture();
    const operation = new GetAdminUserUseCase(f.reader, f.access);
    const result = await operation.execute({ actorId: 'operator', adminUserId: 'user-1' });

    expect(result).toMatchObject({ email: 'user-1@example.test', allowedSiteIds: [], blocked: false });
    expect(result).not.toHaveProperty('passwordDigest');
    expect(await operation.execute({ actorId: 'operator', adminUserId: 'missing' })).toBeNull();
    const user = f.accounts.get('user-1');

    if (!user) {
      throw new Error('Fixture');
    }
    user.setBlocked(true, f.values.now(), 'blocked-v');
    expect((await operation.execute({ actorId: 'operator', adminUserId: 'user-1' }))?.blocked).toBe(true);
    user.delete(f.values.now(), 'deleted-v');
    expect(await operation.execute({ actorId: 'operator', adminUserId: 'user-1' })).toBeNull();
  });
  it('authorizes before reading and rejects inconsistent outbound identity', async () => {
    const f = adminFixture();

    f.reader.findById = async () => {
      throw new Error('must not read');
    };
    await expect(new GetAdminUserUseCase(f.reader, f.access).execute({ actorId: 'foreign', adminUserId: 'user-1' }))
      .rejects.toMatchObject({ code: 'Forbidden' });
    f.reader.findById = async () => f.accounts.get('user-1')?.profile() ?? null;
    await expect(new GetAdminUserUseCase(f.reader, f.access).execute({ actorId: 'operator', adminUserId: 'other' }))
      .rejects.toMatchObject({ code: 'Scope' });
  });
});
