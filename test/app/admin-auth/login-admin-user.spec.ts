import { describe, expect, it, vi } from 'vitest';

import { LoginAdminUserUseCase } from '../../../src/app/use-cases/admin-auth/login-admin-user.use-case.js';
import { BusinessErrorCode } from '../../../src/domain/shared/business-error.js';
import { authFixture, loginInput } from '../../support/admin-auth.js';

describe('LoginAdminUser', () => {
  it('stops password work when an attacker rotates unknown emails from one client', async () => {
    const f = authFixture();
    const verify = vi.spyOn(f.passwords, 'verify');
    const login = new LoginAdminUserUseCase(f.work, f.passwords, f.secrets, f.values);

    for (let index = 0; index < 12; index++) {
      await expect(login.execute({ ...loginInput, email: 'attack' + index + '@example.test', password: 'wrong' }))
        .rejects.toMatchObject({
          code: index < 9 ? BusinessErrorCode.InvalidCredentials : BusinessErrorCode.TooManyAttempts,
        });
    }
    expect(verify).toHaveBeenCalledTimes(10);
    await expect(login.execute({ ...loginInput, clientAddress: '127.0.0.2' })).resolves.toHaveProperty('token');
    f.setTime(new Date('2026-10-25T11:15:00Z'));
    await expect(login.execute(loginInput)).resolves.toHaveProperty('token');
  });

  it('normalizes email, creates separate persistent sessions and returns a safe profile', async () => {
    const f = authFixture();
    const login = new LoginAdminUserUseCase(f.work, f.passwords, f.secrets, f.values);
    const first = await login.execute({ ...loginInput, email: ' USER-1@EXAMPLE.TEST ' });
    const second = await login.execute(loginInput);

    expect(first.session.expiresAt).toEqual(new Date('2026-12-25T11:00:00Z'));
    expect(first.user).not.toHaveProperty('passwordDigest');
    expect(first.session).not.toHaveProperty('tokenDigest');
    expect(first.token).not.toBe(second.token);
    expect(f.sessions.size).toBe(2);
  });
  it('commits ten failures, pauses for fifteen minutes and then allows a new login', async () => {
    const f = authFixture();
    const login = new LoginAdminUserUseCase(f.work, f.passwords, f.secrets, f.values);

    for (let attempt = 1; attempt <= 10; attempt++) {
      await expect(login.execute({ ...loginInput, password: 'wrong' })).rejects.toMatchObject({
        code: attempt < 10 ? BusinessErrorCode.InvalidCredentials : BusinessErrorCode.TooManyAttempts,
      });
    }
    expect([...f.attempts.values()][0]?.failures).toBe(10);
    await expect(login.execute(loginInput)).rejects.toMatchObject({ code: BusinessErrorCode.TooManyAttempts });
    f.setTime(new Date('2026-10-25T11:15:00Z'));
    await expect(login.execute(loginInput)).resolves.toHaveProperty('token');
    expect(f.attempts.size).toBe(0);
  });
  it('resets an old failure window and counts unknown and blocked users without disclosing them', async () => {
    const f = authFixture();
    const login = new LoginAdminUserUseCase(f.work, f.passwords, f.secrets, f.values);

    await expect(login.execute({ ...loginInput, email: 'missing@example.test' })).rejects.toMatchObject({
      code: BusinessErrorCode.InvalidCredentials,
    });
    f.accounts.get('user-1')?.setBlocked(true, f.values.now(), 'blocked');
    await expect(login.execute(loginInput)).rejects.toMatchObject({ code: BusinessErrorCode.InvalidCredentials });
    f.setTime(new Date('2026-10-25T11:15:00Z'));
    await expect(login.execute(loginInput)).rejects.toMatchObject({ code: BusinessErrorCode.InvalidCredentials });
    expect(f.attempts.get(f.secrets.loginKey(loginInput.email))?.failures).toBe(1);
    expect(f.sessions.size).toBe(0);
  });
  it('cannot authenticate captured credentials after a concurrent account change', async () => {
    const f = authFixture();

    f.passwords.verify = vi.fn(async () => {
      f.accounts.get('user-1')?.setBlocked(true, f.values.now(), 'blocked');

      return true;
    });
    const login = new LoginAdminUserUseCase(f.work, f.passwords, f.secrets, f.values);

    await expect(login.execute(loginInput)).rejects.toMatchObject({ code: BusinessErrorCode.InvalidCredentials });
    expect(f.sessions.size).toBe(0);
  });
});
