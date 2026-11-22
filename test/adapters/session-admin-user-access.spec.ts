import {
  SessionAdminUserAccessAdapter,
} from '../../src/adapters/outbound/access/admin-users/session-admin-user-access.adapter.js';
import type { ICurrentAdminUser } from '../../src/domain/admin-auth/admin-auth-session.js';
import { account } from '../support/admin-users.js';

it('accepts only the authenticated active global actor and does not reuse another request session', async () => {
  const session = {
    sessionId: 'session',
    current: true,
    createdAt: new Date('2026-11-05T00:00:00Z'),
    lastSeenAt: new Date('2026-11-05T00:00:00Z'),
    expiresAt: new Date('2027-01-05T00:00:00Z'),
    clientAddress: null,
    userAgent: null,
  };
  const user = {
    ...account().profile(), authorization: { systemAdmin: true, siteIds: [], siteAdminSiteIds: [] },
  };
  const current = { execute: vi.fn(async (): Promise<ICurrentAdminUser> => ({ user, session })) };
  const access = new SessionAdminUserAccessAdapter(current, 'trusted');

  expect(await access.actorId()).toBe('user-1');
  await access.requireAdministrator('user-1');
  await expect(access.requireAdministrator('forged')).rejects.toMatchObject({ code: 'Forbidden' });
  expect(current.execute).toHaveBeenCalledTimes(1);
  expect(current.execute).toHaveBeenCalledWith({ token: 'trusted' });
  const blocked = new SessionAdminUserAccessAdapter({
    execute: async () => ({ user: { ...account().profile(), blocked: true }, session }),
  }, 'blocked');

  await expect(blocked.actorId()).rejects.toMatchObject({ code: 'Forbidden' });
});
