import {
  CreateAdminUserFromConsoleUseCase,
} from '../../../src/app/use-cases/admin-users/create-admin-user-from-console.use-case.js';
import { adminFixture } from '../../support/admin-users.js';
import { fakeHookChanges } from '../../support/hooks.js';

describe('console-only administrator creation', () => {
  it('creates an active global account with empty site assignments and a safe result', async () => {
    const f = adminFixture(0);
    const result = await new CreateAdminUserFromConsoleUseCase(f.unitOfWork, f.access, f.passwords, f.values,
      fakeHookChanges)
      .execute({ actorId: 'operator', email: ' New@EXAMPLE.TEST ', password: 'synthetic initial password' });

    expect(result).toMatchObject({ email: 'new@example.test', blocked: false, allowedSiteIds: [] });
    expect(result).not.toHaveProperty('passwordDigest');
    expect(f.accounts.get(result.adminUserId)?.toState()).toMatchObject({
      deletedAt: null, passwordDigest: 'synthetic-hash-1',
    });
  });
  it('leaves the first installation setup hook for SystemAdmin after scoped creation', async () => {
    const f = adminFixture(0);
    const prepare = vi.fn(fakeHookChanges.prepare);
    const create = new CreateAdminUserFromConsoleUseCase(f.unitOfWork, f.access, f.passwords, f.values, { prepare });

    await create.execute({
      actorId: 'operator',
      email: 'site-admin@example.test',
      password: 'synthetic initial password',
      assignment: { roleId: 'cms.system.site-admin', siteId: 'site-one' },
    });

    expect(prepare).not.toHaveBeenCalled();
  });

  it('rejects duplicate email without case, invalid input and untrusted actors', async () => {
    const f = adminFixture();
    const operation = new CreateAdminUserFromConsoleUseCase(f.unitOfWork, f.access, f.passwords, f.values,
      fakeHookChanges);
    const input = { actorId: 'operator', email: 'USER-1@EXAMPLE.TEST', password: 'synthetic initial password' };

    await expect(operation.execute(input)).rejects.toMatchObject({ code: 'Conflict' });
    await expect(operation.execute({ ...input, actorId: 'foreign' })).rejects.toMatchObject({ code: 'Forbidden' });
    await expect(operation.execute({ ...input, email: 'broken' })).rejects.toMatchObject({ code: 'Validation' });
    await expect(operation.execute({ ...input, password: 'short' })).rejects.toMatchObject({ code: 'Validation' });
    expect(f.accounts.size).toBe(2);
  });
});
