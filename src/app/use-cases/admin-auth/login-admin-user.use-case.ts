import { AdminLoginThrottledError, failedLogin, loginAttempt } from '../../../domain/admin-auth/admin-auth.policy.js';
import { AdminAuthSession, type IAdminLoginResult } from '../../../domain/admin-auth/admin-auth-session.js';
import { MAX_ADMIN_PASSWORD_LENGTH, normalizeAdminEmail } from '../../../domain/admin-users/admin-user.policy.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import { requireCondition } from '../../../domain/shared/validation.js';
import type { ILoginAdminUser, ILoginAdminUserInput } from '../../../ports/inbound/admin-auth/login-admin-user.port.js';
import type { IAdminAuthUnitOfWorkPort } from '../../../ports/outbound/admin-auth/admin-auth-store.port.js';
import type {
  IAdminAuthSecretsPort, IAdminAuthValuesPort,
} from '../../../ports/outbound/admin-auth/admin-auth-values.port.js';
import type { IAdminPasswordPort } from '../../../ports/outbound/admin-users/admin-user-capabilities.port.js';

export class LoginAdminUserUseCase implements ILoginAdminUser {
  constructor(private readonly work: IAdminAuthUnitOfWorkPort, private readonly passwords: IAdminPasswordPort,
    private readonly secrets: IAdminAuthSecretsPort, private readonly values: IAdminAuthValuesPort) {}

  async execute(input: ILoginAdminUserInput): Promise<IAdminLoginResult> {
    requireCondition(Array.from(input.password).length <= MAX_ADMIN_PASSWORD_LENGTH, 'Password exceeds its limit');
    let email: string;

    try {
      email = normalizeAdminEmail(input.email);
    } catch {
      throw new BusinessError(BusinessErrorCode.InvalidCredentials, 'Invalid email or password');
    }
    const key = this.secrets.loginKey(email);
    const sourceKey = this.secrets.sourceKey(input.clientAddress);
    const captured = await this.work.run(async (tx) => {
      loginAttempt(key, await tx.findLoginAttempt(key), this.values.now());
      loginAttempt(sourceKey, await tx.findLoginAttempt(sourceKey), this.values.now());

      return (await tx.findByEmail(email))?.toState() ?? null;
    });
    const verified = await this.passwords.verify(input.password,
      captured && !captured.blocked ? captured.passwordDigest : null);
    const result = await this.work.run(async (tx) => {
      const at = this.values.now();
      const attempt = loginAttempt(key, await tx.findLoginAttempt(key), at);
      const sourceAttempt = loginAttempt(sourceKey, await tx.findLoginAttempt(sourceKey), at);
      const user = captured ? await tx.findById(captured.adminUserId) : null;

      if (
        !verified
        || !user?.active
        || user.toState().version !== captured?.version
        || user.toState().email !== email
      ) {
        const failure = failedLogin(attempt, at);

        await tx.saveLoginAttempt(failure);
        const sourceFailure = failedLogin(sourceAttempt, at);

        await tx.saveLoginAttempt(sourceFailure);

        // Return the failure so the transaction commits the attempt before reporting it.
        return { failure: sourceFailure.blockedUntil ? sourceFailure : failure, login: null };
      }

      const issued = this.secrets.issue();
      const session = new AdminAuthSession({
        sessionId: this.values.nextSessionId(),
        adminUserId: user.toState().adminUserId,
        accountVersion: user.toState().version,
        tokenDigest: issued.tokenDigest,
        createdAt: at,
        lastSeenAt: at,
        expiresAt: this.values.sessionExpiresAt(at),
        revokedAt: null,
        clientAddress: input.clientAddress,
        userAgent: input.userAgent,
      });

      await tx.createSession(session);
      await tx.clearLoginAttempt(key);
      await tx.clearLoginAttempt(sourceKey);
      const profile = user.profile();
      const authorization = await tx.readAuthority?.(profile.adminUserId);

      return {
        failure: null,
        login: {
          token: issued.token,
          user: authorization ? { ...profile, authorization } : profile,
          session: session.profile(session.toState().sessionId),
        },
      };
    });

    if (result.login) {
      return result.login;
    }
    if (result.failure.blockedUntil) {
      const remaining = result.failure.blockedUntil.getTime() - this.values.now().getTime();

      throw new AdminLoginThrottledError(Math.max(1, Math.ceil(remaining / 1000)));
    }
    throw new BusinessError(BusinessErrorCode.InvalidCredentials, 'Invalid email or password');
  }
}
