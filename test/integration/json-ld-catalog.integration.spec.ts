import { randomUUID } from 'node:crypto';

import { createConnection } from 'mongoose';

import {
  type IJsonLdCatalogRecord,
  jsonLdCatalogSchema,
  MongooseJsonLdCatalog,
} from '../../src/adapters/outbound/persistence/mongoose/json-ld/json-ld-catalog.adapter.js';
import { applyMigrations, verifyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { JsonLdSourceKind } from '../../src/domain/json-ld/json-ld-catalog.js';

it('migrates and isolates JSON-LD catalogs and rejects concurrent stale writes', async () => {
  const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

  if (!mongoUri) {
    throw new Error('Explicit test MongoDB required');
  }

  const database = `zarya_test_${randomUUID().replaceAll('-', '')}`;

  if (!database.startsWith('zarya_test_')) {
    throw new Error('Unsafe test database cleanup');
  }

  const connection = await createConnection(mongoUri, {
    dbName: database, autoIndex: false, autoCreate: false,
  }).asPromise();

  try {
    await applyMigrations(connection, 'migrations');
    await verifyMigrations(connection, 'migrations');
    const store = new MongooseJsonLdCatalog(
      connection.model<IJsonLdCatalogRecord>('JsonLdCatalog', jsonLdCatalogSchema),
    );
    const initial = {
      siteId: 'site-1',
      version: 'v1',
      objects: [],
      profiles: [{
        profileId: 'article',
        name: 'Article',
        templateIds: ['Article'],
        nodes: [{
          role: 'article',
          type: 'Article',
          keySource: { kind: JsonLdSourceKind.Snippet as const, name: 'nearest', path: ['sessionId'] },
          presenceSource: { kind: JsonLdSourceKind.Snippet as const, name: 'nearest', path: ['present'] },
          mappings: [{
            property: 'headline', required: true, source: { kind: JsonLdSourceKind.PageField as const, name: 'title' },
          }],
        }],
      }],
    };

    await store.save(initial, '0');
    expect(await store.read('site-1')).toEqual(initial);
    expect(await store.read('site-2')).toEqual({ siteId: 'site-2', version: '0', profiles: [], objects: [] });
    const writes = await Promise.allSettled([
      store.save({ ...initial, version: 'v2' }, 'v1'),
      store.save({ ...initial, version: 'v3' }, 'v1'),
    ]);

    expect(writes.filter((write) => write.status === 'fulfilled')).toHaveLength(1);
    expect(writes.filter((write) => write.status === 'rejected')).toHaveLength(1);
  } finally {
    await connection.dropDatabase();
    await connection.close();
  }
});
