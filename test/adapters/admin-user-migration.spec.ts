import { readMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';

describe('administrator uniqueness migration', () => {
  it('preserves case-insensitive uniqueness among non-deleted accounts', async () => {
    const migration = (await readMigrations('migrations'))[0];
    const users = migration?.collections.find((c) => c.name === 'admin_users');

    expect(users?.indexes.find((i) => i.name === 'admin_users_live_email_unique')).toMatchObject({
      unique: true, partialFilterExpression: { deletedAt: null }, collation: { locale: 'en', strength: 2 },
    });
  });
});
