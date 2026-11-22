import { LoginAdminUserUseCase } from '../../../src/app/use-cases/admin-auth/login-admin-user.use-case.js';
import { LogoutAdminUserUseCase } from '../../../src/app/use-cases/admin-auth/logout-admin-user.use-case.js';
import { authFixture, loginInput } from '../../support/admin-auth.js';

describe('LogoutAdminUser', () => {
  it('revokes the current session only and remains idempotent', async () => {
    const f = authFixture();
    const login = new LoginAdminUserUseCase(f.work, f.passwords, f.secrets, f.values);
    const first = await login.execute(loginInput);
    const second = await login.execute(loginInput);
    const logout = new LogoutAdminUserUseCase(f.work, f.secrets, f.values);

    await logout.execute({ token: first.token });
    await logout.execute({ token: first.token });
    await logout.execute({ token: null });
    await logout.execute({ token: 'malformed' });
    expect(f.sessions.get(first.session.sessionId)?.toState().revokedAt).toEqual(f.values.now());
    expect(f.sessions.get(second.session.sessionId)?.toState().revokedAt).toBeNull();
  });
});
