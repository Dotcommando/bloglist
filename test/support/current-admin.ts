import type { ICurrentAdminUser } from '../../src/domain/admin-auth/admin-auth-session.js';
import { account } from './admin-users.js';

export function currentAdmin(): ICurrentAdminUser {
  return {
    user: { ...account().profile(), authorization: { systemAdmin: true, siteIds: [], siteAdminSiteIds: [] } },
    session: {
      sessionId: 'session',
      createdAt: new Date(),
      lastSeenAt: new Date(),
      expiresAt: new Date('2030-01-01T00:00:00Z'),
      clientAddress: null,
      userAgent: null,
      current: true,
    },
  };
}
