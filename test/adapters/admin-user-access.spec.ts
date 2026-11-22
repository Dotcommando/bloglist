import {
  LocalAdminUserAccessAdapter,
} from '../../src/adapters/outbound/access/local/admin-users/local-admin-user-access.adapter.js';

describe('local administrator-management access', () => {
  it('requires the configured trusted local actor', async () => {
    const access = new LocalAdminUserAccessAdapter({ operatorId: 'operator', platformAdministrator: true });

    await expect(access.requireAdministrator('operator')).resolves.toBeUndefined();
    await expect(access.requireAdministrator('other')).rejects.toMatchObject({ code: 'Forbidden' });
    await expect(new LocalAdminUserAccessAdapter({ operatorId: 'operator', platformAdministrator: false })
      .requireAdministrator('operator')).rejects.toMatchObject({ code: 'Forbidden' });
  });
});
