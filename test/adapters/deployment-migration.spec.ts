import { readMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';

it('ships site and destination uniqueness in a new versioned migration', async () => {
  const migrations = await readMigrations('migrations');
  const migration = migrations.find((item) => item.id === '0001-deployment-targets');

  expect(migration).toBeDefined();
  expect(migration?.collections[0]).toMatchObject({
    name: 'deployment_targets',
    indexes: expect.arrayContaining([
      expect.objectContaining({ key: { siteId: 1 }, unique: true }),
      expect.objectContaining({ key: { 'target.providerKey': 1, 'target.destinationName': 1 }, unique: true }),
    ]),
  });
});
