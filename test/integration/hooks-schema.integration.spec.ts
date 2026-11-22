import { randomUUID } from 'node:crypto';

import { createConnection } from 'mongoose';

import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { dropHookTestDatabase } from '../support/hooks.js';

describe('hook persistence guarantees', () => {
  it('requires site ownership and rejects duplicate delivery positions and handler versions', async () => {
    const uri = process.env.ZARYA_TEST_MONGO_URI;

    if (!uri) {
      throw new Error('Explicit test MongoDB required');
    }

    const name = 'zarya_test_' + randomUUID().replaceAll('-', '');
    const connection = await createConnection(uri, { dbName: name, autoIndex: false, autoCreate: false }).asPromise();

    try {
      await applyMigrations(connection, 'migrations');
      const database = connection.db!;
      const version = {
        _id: 'version-1',
        siteId: 'site-a',
        handlerId: 'handler-a',
        sourceDraftVersion: 'draft-1',
        source: 'return { commands: [] };',
        compiledJavaScript: 'return { commands: [] };',
        digest: 'a'.repeat(64),
        kind: 'Event',
        capabilities: [],
        appliedAt: new Date(),
        appliedBy: 'operator',
      };

      await database.collection<{ _id: string }>('hook_handler_versions').insertOne(version);
      await expect(database.collection<{ _id: string }>('hook_handler_versions').insertOne({
        ...version,
        _id:
        'duplicate',
      }))
        .rejects.toMatchObject({ code: 11000 });
      const unscoped = Object.fromEntries(Object.entries(version).filter(([key]) => key !== 'siteId'));

      await expect(database.collection<{ _id: string }>('hook_handler_versions').insertOne({
        ...unscoped,
        _id:
        'unscoped',
      }))
        .rejects.toMatchObject({ code: 121 });
      const collections = await database.listCollections().toArray();

      expect(collections.some((item) => item.name === 'hook_deliveries')).toBe(true);
      expect((await database.collection('hook_deliveries').indexes())
        .find((index) => index.name === 'hook_delivery_lane_position')?.unique).toBe(true);
    } finally {
      await dropHookTestDatabase(connection, name);
    }
  });
});
