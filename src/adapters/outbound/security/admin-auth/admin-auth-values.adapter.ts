import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Temporal } from '@js-temporal/polyfill';

import { ADMIN_AUTH_SESSION_MONTHS } from '../../../../domain/admin-auth/admin-auth.policy.js';
import type {
  IAdminAuthSecretsPort, IAdminAuthValuesPort,
} from '../../../../ports/outbound/admin-auth/admin-auth-values.port.js';

export class AdminAuthSecretsAdapter implements IAdminAuthSecretsPort {
  issue(): { readonly token: string; readonly tokenDigest: string } {
    const token = randomBytes(32).toString('base64url');

    return { token, tokenDigest: createHash('sha256').update(token).digest('hex') };
  }

  digest(token: string): string | null {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token) || Buffer.from(token, 'base64url').toString('base64url') !== token) {
      return null;
    }

    return createHash('sha256').update(token).digest('hex');
  }

  sourceKey(clientAddress: string | null): string {
    return createHash('sha256').update(JSON.stringify(['login-source', clientAddress])).digest('hex');
  }

  loginKey(email: string): string {
    return createHash('sha256').update(email).digest('hex');
  }
}

export class AdminAuthValuesAdapter implements IAdminAuthValuesPort {
  nextSessionId(): string {
    return randomUUID();
  }

  now(): Date {
    return new Date();
  }

  sessionExpiresAt(at: Date): Date {
    const expiry = Temporal.Instant.fromEpochMilliseconds(at.getTime()).toZonedDateTimeISO('UTC')
      .add({ months: ADMIN_AUTH_SESSION_MONTHS }, { overflow: 'constrain' });

    return new Date(expiry.epochMilliseconds);
  }
}
