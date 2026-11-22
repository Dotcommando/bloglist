import { LocalSiteAccessAdapter } from '../../src/adapters/outbound/access/local/sites/local-site-access.adapter.js';

describe('local site listing access', () => {
  it('requires the explicit platform administrator context', async () => {
    await expect(new LocalSiteAccessAdapter({
      operatorId: 'operator',
      platformAdministrator:
true,
    }).assertCanListSites())
      .resolves.toBeUndefined();
    await expect(new LocalSiteAccessAdapter({
      operatorId: 'operator',
      platformAdministrator:
false,
    }).assertCanListSites())
      .rejects.toMatchObject({ code: 'Forbidden' });
  });
});
