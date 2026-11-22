import { AddonAdminSessionAdapter } from '../../src/adapters/inbound/rest/addons/addon-admin-session.adapter.js';
import { AdminAuthContextService } from '../../src/app/services/admin-auth/admin-auth-context.service.js';
import { GetCurrentAdminUserUseCase } from '../../src/app/use-cases/admin-auth/get-current-admin-user.use-case.js';
import { LoginAdminUserUseCase } from '../../src/app/use-cases/admin-auth/login-admin-user.use-case.js';
import { BusinessErrorCode } from '../../src/domain/shared/business-error.js';
import { authFixture, loginInput } from '../support/admin-auth.js';

it('accepts raw tokens and the current cookie envelope while preserving session checks', async () => {
  const f = authFixture();
  const context = new AdminAuthContextService(f.secrets);
  const current = new GetCurrentAdminUserUseCase(f.work, context, f.values);
  const login = await new LoginAdminUserUseCase(f.work, f.passwords, f.secrets, f.values).execute(loginInput);
  let version = 'installation-one';
  const adapter = new AddonAdminSessionAdapter(current, () => version);

  for (const token of [login.token, version + '.' + login.token]) {
    expect((await adapter.execute({ token })).user.adminUserId).toBe('user-1');
  }

  for (const token of [null, 'other.' + login.token, version + '.' + version + '.' + login.token,
    version + '.', version + '.unknown']) {
    await expect(adapter.execute({ token })).rejects.toMatchObject({ code: BusinessErrorCode.AuthenticationRequired });
  }
  const previous = version;

  version = 'installation-two';
  await expect(adapter.execute({ token: previous + '.' + login.token })).rejects.toMatchObject({
    code: BusinessErrorCode.AuthenticationRequired,
  });
  expect((await adapter.execute({ token: version + '.' + login.token })).user.adminUserId).toBe('user-1');
  const local = new AddonAdminSessionAdapter(current);

  expect((await local.execute({ token: login.token })).user.adminUserId).toBe('user-1');
  await expect(local.execute({ token: version + '.' + login.token })).rejects.toMatchObject({
    code: BusinessErrorCode.AuthenticationRequired,
  });
  const user = f.accounts.get('user-1')!;

  user.setBlocked(true, new Date('2026-10-25T11:01:00Z'), 'blocked-version');
  await expect(adapter.execute({ token: version + '.' + login.token })).rejects.toMatchObject({
    code: BusinessErrorCode.AuthenticationRequired,
  });
});
