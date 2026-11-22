import type { ICurrentAdminUser } from '../../../../domain/admin-auth/admin-auth-session.js';
import type { IAdminSessionInput } from '../../../../ports/inbound/admin-auth/admin-session.dto.js';
import type { IGetCurrentAdminUser } from '../../../../ports/inbound/admin-auth/get-current-admin-user.port.js';

// Older immutable runtime bundles forward the cookie envelope; newer callers pass the raw session token.
export class AddonAdminSessionAdapter implements IGetCurrentAdminUser {
  constructor(private readonly current: IGetCurrentAdminUser, private readonly cookieVersion?: () => string) {}

  execute(input: IAdminSessionInput): Promise<ICurrentAdminUser> {
    let token = input.token;

    if (token?.includes('.')) {
      const version = this.cookieVersion?.();

      token = version && token.startsWith(version + '.') ? token.slice(version.length + 1) : null;
    }

    return this.current.execute({ token });
  }
}
