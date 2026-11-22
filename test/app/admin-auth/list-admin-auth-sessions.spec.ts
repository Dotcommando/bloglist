import { AdminAuthContextService } from '../../../src/app/services/admin-auth/admin-auth-context.service.js';
import {
  ListAdminAuthSessionsUseCase,
} from '../../../src/app/use-cases/admin-auth/list-admin-auth-sessions.use-case.js';
import { LoginAdminUserUseCase } from '../../../src/app/use-cases/admin-auth/login-admin-user.use-case.js';
import { authFixture, loginInput } from '../../support/admin-auth.js';

describe('ListAdminAuthSessions', () => {
  it('paginates only the owner active sessions and marks the current device without secrets', async () => {
    const f = authFixture();
    const login = new LoginAdminUserUseCase(f.work, f.passwords, f.secrets, f.values);
    const current = await login.execute(loginInput);
    const other = await login.execute(loginInput);
    const revoked = await login.execute(loginInput);

    await login.execute({ ...loginInput, email: 'user-2@example.test' });
    f.sessions.get(revoked.session.sessionId)?.revoke(f.values.now());
    const list = new ListAdminAuthSessionsUseCase(f.work, new AdminAuthContextService(f.secrets), f.values);
    const first = await list.execute({ token: current.token, limit: 1 });
    const second = await list.execute({ token: current.token, limit: 1, cursor: first.nextCursor });

    expect(first.items).toHaveLength(1);
    expect(first.items[0]).toMatchObject({ current: true, sessionId: current.session.sessionId });
    expect(second.items).toHaveLength(1);
    expect(second.items[0]).toMatchObject({ current: false, sessionId: other.session.sessionId });
    expect(second.nextCursor).toBeNull();
    expect(first.items[0]).not.toHaveProperty('tokenDigest');
    await expect(list.execute({ token: null })).rejects.toMatchObject({ code: 'AuthenticationRequired' });
    await expect(list.execute({ token: current.token, limit: 101 })).rejects.toMatchObject({ code: 'Validation' });
  });
});
