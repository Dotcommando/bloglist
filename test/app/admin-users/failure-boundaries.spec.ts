import { BlockAdminUserUseCase } from '../../../src/app/use-cases/admin-users/block-admin-user.use-case.js';
import { CreateAdminUserUseCase } from '../../../src/app/use-cases/admin-users/create-admin-user.use-case.js';
import { DeleteAdminUserUseCase } from '../../../src/app/use-cases/admin-users/delete-admin-user.use-case.js';
import { GetAdminUserUseCase } from '../../../src/app/use-cases/admin-users/get-admin-user.use-case.js';
import { ListAdminUsersUseCase } from '../../../src/app/use-cases/admin-users/list-admin-users.use-case.js';
import { UpdateAdminUserUseCase } from '../../../src/app/use-cases/admin-users/update-admin-user.use-case.js';
import type { IAdminUserUnitOfWorkPort } from '../../../src/ports/outbound/admin-users/admin-user-store.port.js';
import { adminFixture } from '../../support/admin-users.js';
import { fakeHookChanges } from '../../support/hooks.js';

describe('administrator operation failure boundaries', () => {
  it.each(['create', 'update', 'block', 'delete'] as const)('%s rolls back a failed mutation', async (action) => {
    const fixture = adminFixture();
    const before = [...fixture.accounts.values()].map((user) => user.toState());
    const failure = new Error('Account persistence failed');
    const work: IAdminUserUnitOfWorkPort = {
      run: (callback) => fixture.unitOfWork.run((transaction) => callback({
        ...transaction,
        save: async (...args) => {
          await transaction.save(...args);
          throw failure;
        },
      })),
    };
    const target = { actorId: 'operator', adminUserId: 'user-2', expectedVersion: 'user-2-v1' };
    let result: Promise<unknown>;

    if (action === 'create') {
      result = new CreateAdminUserUseCase(work, fixture.access, fixture.passwords, fixture.values, fakeHookChanges)
        .execute({ actorId: 'operator', email: 'new@example.test', password: 'synthetic new password' });
    } else if (action === 'update') {
      result = new UpdateAdminUserUseCase(work, fixture.access, fixture.passwords, fixture.values)
        .execute({ ...target, email: 'changed@example.test' });
    } else if (action === 'block') {
      result = new BlockAdminUserUseCase(work, fixture.access, fixture.values).execute({ ...target, blocked: true });
    } else {
      result = new DeleteAdminUserUseCase(work, fixture.access, fixture.values).execute(target);
    }

    await expect(result).rejects.toBe(failure);
    expect([...fixture.accounts.values()].map((user) => user.toState())).toEqual(before);
  });

  it.each(['create', 'update'] as const)('%s fails hashing before starting a transaction', async (action) => {
    const fixture = adminFixture();
    const failure = new Error('Password derivation failed');
    const run = vi.spyOn(fixture.unitOfWork, 'run');
    const passwords = {
      ...fixture.passwords,
      hash: async () => {
        throw failure;
      },
    };
    const result = action === 'create'
      ? new CreateAdminUserUseCase(fixture.unitOfWork, fixture.access, passwords, fixture.values, fakeHookChanges)
        .execute({ actorId: 'operator', email: 'new@example.test', password: 'synthetic new password' })
      : new UpdateAdminUserUseCase(fixture.unitOfWork, fixture.access, passwords, fixture.values).execute({
        actorId: 'operator', adminUserId: 'user-2', expectedVersion: 'user-2-v1', password: 'synthetic new password',
      });

    await expect(result).rejects.toBe(failure);
    expect(run).not.toHaveBeenCalled();
    expect(fixture.accounts.size).toBe(2);
  });

  it.each(['get', 'list'] as const)('%s strips extra provider credential fields', async (action) => {
    const fixture = adminFixture();
    const profile = fixture.accounts.get('user-1')!.profile();
    const reader = {
      ...fixture.reader,
      findById: async () => ({ ...profile, passwordDigest: 'private-digest', token: 'private-token' }),
      list: async () => ({
        items: [{ ...profile, passwordDigest: 'private-digest', token: 'private-token' }],
        nextCursor: null,
      }),
    };
    const result = action === 'get'
      ? await new GetAdminUserUseCase(reader, fixture.access).execute({ actorId: 'operator', adminUserId: 'user-1' })
      : (await new ListAdminUsersUseCase(reader, fixture.access).execute({ actorId: 'operator' })).items[0];

    expect(result).toEqual(profile);
    expect(result).not.toHaveProperty('passwordDigest');
    expect(result).not.toHaveProperty('token');
  });
});
