import { AdminAuthContextService } from '../../../src/app/services/admin-auth/admin-auth-context.service.js';
import { LoginAdminUserUseCase } from '../../../src/app/use-cases/admin-auth/login-admin-user.use-case.js';
import {
  RevokeAdminAuthSessionUseCase,
} from '../../../src/app/use-cases/admin-auth/revoke-admin-auth-session.use-case.js';
import { authFixture, loginInput } from '../../support/admin-auth.js';

describe('RevokeAdminAuthSession', () => {
  it('revokes an owned device idempotently, hides foreign sessions and can revoke itself', async () => {
    const f = authFixture();
    const login = new LoginAdminUserUseCase(f.work, f.passwords, f.secrets, f.values);
    const current = await login.execute(loginInput);
    const other = await login.execute(loginInput);
    const foreign = await login.execute({ ...loginInput, email: 'user-2@example.test' });
    const revoke = new RevokeAdminAuthSessionUseCase(f.work, new AdminAuthContextService(f.secrets), f.values);
    const input = { token: current.token, sessionId: other.session.sessionId };

    expect(await revoke.execute(input)).toEqual({ currentSessionRevoked: false });
    expect(await revoke.execute(input)).toEqual({ currentSessionRevoked: false });
    expect(f.sessions.get(other.session.sessionId)?.toState().revokedAt).not.toBeNull();
    await expect(revoke.execute({ ...input, sessionId: foreign.session.sessionId }))
      .rejects.toMatchObject({ code: 'NotFound' });
    await expect(revoke.execute({ ...input, sessionId: 'missing' })).rejects.toMatchObject({ code: 'NotFound' });
    expect(f.sessions.get(foreign.session.sessionId)?.toState().revokedAt).toBeNull();
    expect(await revoke.execute({ ...input, sessionId: current.session.sessionId }))
      .toEqual({ currentSessionRevoked: true });
    await expect(revoke.execute(input)).rejects.toMatchObject({ code: 'AuthenticationRequired' });
  });
});
