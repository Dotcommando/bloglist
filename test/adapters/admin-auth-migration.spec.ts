import { readMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';

describe('administrator authentication migration', () => {
  it('defines global private sessions, unique token hashes and explicit expiry cleanup', async () => {
    const migration = (await readMigrations('migrations'))[0];

    expect(migration).toBeDefined();
    const sessions = migration?.collections.find((c) => c.name === 'admin_auth_sessions');

    expect(sessions?.indexes.find((i) => i.name === 'admin_auth_token_unique')).toMatchObject({
      key: { tokenDigest: 1 }, unique: true,
    });
    expect(sessions?.indexes.find((i) => i.name === 'admin_auth_expiry')).toHaveProperty('expireAfterSeconds', 0);
    expect(migration?.collections.find((c) => c.name === 'admin_login_attempts')?.indexes[0])
      .toHaveProperty('expireAfterSeconds', 0);
    expect(JSON.stringify(sessions?.validator)).not.toContain('siteId');
  });
});
