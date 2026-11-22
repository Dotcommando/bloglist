import { AdminAuthContextService } from '../../../src/app/services/admin-auth/admin-auth-context.service.js';
import { GetCurrentAdminUserUseCase } from '../../../src/app/use-cases/admin-auth/get-current-admin-user.use-case.js';
import { LoginAdminUserUseCase } from '../../../src/app/use-cases/admin-auth/login-admin-user.use-case.js';
import { authFixture, loginInput } from '../../support/admin-auth.js';

describe('GetCurrentAdminUser', () => {
  it('reads the safe account and updates last use without extending expiry', async () => {
    const f = authFixture();
    const login = await new LoginAdminUserUseCase(f.work, f.passwords, f.secrets, f.values).execute(loginInput);

    f.setTime(new Date('2026-10-26T11:00:00Z'));
    const current = new GetCurrentAdminUserUseCase(f.work, new AdminAuthContextService(f.secrets), f.values);
    const result = await current.execute({ token: login.token });

    expect(result.user).not.toHaveProperty('passwordDigest');
    expect(result.session.lastSeenAt).toEqual(f.values.now());
    expect(result.session.expiresAt).toEqual(login.session.expiresAt);
    expect(result.session.current).toBe(true);
  });
  it.each(['expired', 'revoked', 'changed', 'blocked', 'deleted', 'unknown'])('rejects %s sessions', async (mode) => {
    const f = authFixture();
    const login = await new LoginAdminUserUseCase(f.work, f.passwords, f.secrets, f.values).execute(loginInput);

    if (mode === 'expired') {
      f.setTime(login.session.expiresAt);
    }
    if (mode === 'revoked') {
      f.sessions.get(login.session.sessionId)?.revoke(f.values.now());
    }
    if (mode === 'changed') {
      f.accounts.get('user-1')?.update({ email: 'changed@example.test' }, f.values.now(), 'changed');
    }
    if (mode === 'blocked') {
      f.accounts.get('user-1')?.setBlocked(true, f.values.now(), 'blocked');
    }
    if (mode === 'deleted') {
      f.accounts.get('user-1')?.delete(f.values.now(), 'deleted');
    }

    const current = new GetCurrentAdminUserUseCase(f.work, new AdminAuthContextService(f.secrets), f.values);

    await expect(current.execute({ token: mode === 'unknown' ? 'malformed' : login.token }))
      .rejects.toMatchObject({ code: 'AuthenticationRequired' });
    await expect(current.execute({ token: null })).rejects.toMatchObject({ code: 'AuthenticationRequired' });
  });
});
