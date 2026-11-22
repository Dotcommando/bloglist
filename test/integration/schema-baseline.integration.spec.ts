import { randomUUID } from 'node:crypto';

import { createConnection } from 'mongoose';

import {
  applyMigrations, readMigrations, verifyMigrations,
} from '../../src/adapters/outbound/persistence/mongoose/migrations.js';

describe('fresh-install schema baseline', () => {
  it('creates exactly the final collections and indexes and can be reapplied without changing receipts', async () => {
    const uri = process.env.ZARYA_TEST_MONGO_URI;

    if (!uri) {
      throw new Error('Explicit test MongoDB required');
    }

    const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
    const connection = await createConnection(uri, {
      dbName: database, autoIndex: false, autoCreate: false,
    }).asPromise();

    try {
      const migrations = await readMigrations('migrations');

      expect(migrations.map((migration) => migration.id)).toEqual(['0000-schema-migrations']);
      await applyMigrations(connection, 'migrations');
      const db = connection.db!;
      const baseline = migrations[0]!;

      expect((await db.listCollections().toArray()).map((collection) => collection.name).sort())
        .toEqual(baseline.collections.map((collection) => collection.name).sort());

      for (const collection of baseline.collections) {
        const actual = await db.listCollections({ name: collection.name }).next();

        if (!actual || !('options' in actual)) {
          throw new Error('Expected collection metadata: ' + collection.name);
        }
        expect(actual.options).toMatchObject({
          validator: collection.validator, validationLevel: 'strict', validationAction: 'error',
        });
        const indexes = await db.collection(collection.name).indexes();

        expect(indexes.map((index) => index.name).sort())
          .toEqual(['_id_', ...collection.indexes.map((index) => index.name)].sort());

        for (const index of collection.indexes) {
          const stored = indexes.find((candidate) => candidate.name === index.name)!;

          expect(Object.entries(stored.key)).toEqual(Object.entries(index.key));
          expect(stored.unique === true).toBe(index.unique);
          expect(stored.expireAfterSeconds).toBe(index.expireAfterSeconds);
          expect(stored.partialFilterExpression).toEqual(index.partialFilterExpression);

          if (index.collation) {
            expect(stored.collation).toMatchObject(index.collation);
          } else {
            expect(stored.collation).toBeUndefined();
          }
        }

        if (collection.name !== 'schema_migrations') {
          expect(await db.collection(collection.name).countDocuments()).toBe(0);
        }
      }
      const receipts = await db.collection('schema_migrations').find({}).toArray();

      expect(receipts).toEqual([{
        _id: baseline.id, checksum: baseline.checksum, appliedAt: expect.any(Date),
      }]);
      await applyMigrations(connection, 'migrations');
      await verifyMigrations(connection, 'migrations');
      expect(await db.collection('schema_migrations').find({}).toArray()).toEqual(receipts);
    } finally {
      try {
        expect(connection.name).toBe(database);
        expect(database).toMatch(/^zarya_test_[a-f0-9]{32}$/);
        await connection.dropDatabase();
      } finally {
        await connection.close();
      }
    }
  });
});
