import { AdminAuthContextService } from '../../../src/app/services/admin-auth/admin-auth-context.service.js';
import { GetCurrentAdminUserUseCase } from '../../../src/app/use-cases/admin-auth/get-current-admin-user.use-case.js';
import {
  ListAdminAuthSessionsUseCase,
} from '../../../src/app/use-cases/admin-auth/list-admin-auth-sessions.use-case.js';
import { LoginAdminUserUseCase } from '../../../src/app/use-cases/admin-auth/login-admin-user.use-case.js';
import { LogoutAdminUserUseCase } from '../../../src/app/use-cases/admin-auth/logout-admin-user.use-case.js';
import {
  RevokeAdminAuthSessionUseCase,
} from '../../../src/app/use-cases/admin-auth/revoke-admin-auth-session.use-case.js';
import type {
  IAdminAuthTransaction, IAdminAuthUnitOfWorkPort,
} from '../../../src/ports/outbound/admin-auth/admin-auth-store.port.js';
import { authFixture, loginInput } from '../../support/admin-auth.js';

function failingWork(work: IAdminAuthUnitOfWorkPort,
  change: (transaction: IAdminAuthTransaction) => IAdminAuthTransaction): IAdminAuthUnitOfWorkPort {
  return { run: (callback) => work.run((transaction) => callback(change(transaction))) };
}

describe('authentication failures preserve committed state', () => {
  it('propagates password-provider failure without recording bad credentials or creating a session', async () => {
    const fixture = authFixture();
    const failure = new Error('Password provider failed');
    const login = new LoginAdminUserUseCase(fixture.work, {
      ...fixture.passwords,
      verify: async () => {
        throw failure;
      },
    }, fixture.secrets, fixture.values);

    await expect(login.execute(loginInput)).rejects.toBe(failure);
    expect(fixture.sessions.size).toBe(0);
    expect(fixture.attempts.size).toBe(0);
  });

  it('rolls back session insertion without clearing failures or retrying password work', async () => {
    const fixture = authFixture();
    const login = new LoginAdminUserUseCase(fixture.work, fixture.passwords, fixture.secrets, fixture.values);

    await expect(login.execute({ ...loginInput, password: 'wrong' }))
      .rejects.toMatchObject({ code: 'InvalidCredentials' });
    const before = structuredClone(fixture.attempts);
    const failure = new Error('Session insertion failed');
    const verify = vi.fn(fixture.passwords.verify);
    const work = failingWork(fixture.work, (transaction) => ({
      ...transaction,
      createSession: async (session) => {
        await transaction.createSession(session);
        throw failure;
      },
    }));

    await expect(new LoginAdminUserUseCase(work, { ...fixture.passwords, verify }, fixture.secrets, fixture.values)
      .execute(loginInput)).rejects.toBe(failure);
    expect(fixture.sessions.size).toBe(0);
    expect(fixture.attempts).toEqual(before);
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it.each(['current', 'list', 'logout', 'revoke'] as const)(
    'rolls back touched/revoked sessions when %s persistence fails', async (operation) => {
      const fixture = authFixture();
      const login = new LoginAdminUserUseCase(fixture.work, fixture.passwords, fixture.secrets, fixture.values);
      const current = await login.execute(loginInput);
      const target = await login.execute(loginInput);
      const before = [...fixture.sessions.values()].map((session) => session.toState());
      const failure = new Error('Session write failed');

      fixture.setTime(new Date('2026-10-26T11:00:00Z'));
      const work = failingWork(fixture.work, (transaction) => ({
        ...transaction,
        saveSession: async (session) => {
          await transaction.saveSession(session);

          if (operation !== 'revoke' || session.toState().sessionId === target.session.sessionId) {
            throw failure;
          }
        },
      }));
      const context = new AdminAuthContextService(fixture.secrets);
      let result: Promise<unknown>;

      if (operation === 'current') {
        result = new GetCurrentAdminUserUseCase(work, context, fixture.values).execute({ token: current.token });
      } else if (operation === 'list') {
        result = new ListAdminAuthSessionsUseCase(work, context, fixture.values).execute({ token: current.token });
      } else if (operation === 'logout') {
        result = new LogoutAdminUserUseCase(work, fixture.secrets, fixture.values).execute({ token: current.token });
      } else {
        result = new RevokeAdminAuthSessionUseCase(work, context, fixture.values).execute({
          token: current.token,
          sessionId: target.session.sessionId,
        });
      }

      await expect(result).rejects.toBe(failure);
      expect([...fixture.sessions.values()].map((session) => session.toState())).toEqual(before);
    },
  );

  it('rolls back last-seen changes when session enumeration fails', async () => {
    const fixture = authFixture();
    const current = await new LoginAdminUserUseCase(fixture.work, fixture.passwords, fixture.secrets, fixture.values)
      .execute(loginInput);
    const before = fixture.sessions.get(current.session.sessionId)!.toState();
    const failure = new Error('Enumeration failed');

    fixture.setTime(new Date('2026-10-26T11:00:00Z'));
    const work = failingWork(fixture.work, (transaction) => ({
      ...transaction,
      listActiveSessions: async () => {
        throw failure;
      },
    }));

    await expect(new ListAdminAuthSessionsUseCase(work, new AdminAuthContextService(fixture.secrets), fixture.values)
      .execute({ token: current.token })).rejects.toBe(failure);
    expect(fixture.sessions.get(current.session.sessionId)!.toState()).toEqual(before);
  });
});
