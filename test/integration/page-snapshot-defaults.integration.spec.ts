import { randomUUID } from 'node:crypto';

import { type Connection, createConnection, type Model } from 'mongoose';

import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { MongoosePageRepository } from '../../src/adapters/outbound/persistence/mongoose/pages/page.repository.js';
import { type IPageRecord, pageSchema } from '../../src/adapters/outbound/persistence/mongoose/pages/page.schema.js';
import {
  MongoosePageArchivalAdapter,
} from '../../src/adapters/outbound/persistence/mongoose/pages/page-archival.adapter.js';
import {
  MongoosePageTreeStore,
} from '../../src/adapters/outbound/persistence/mongoose/pages/page-tree-store.adapter.js';
import type { IPageState, Page } from '../../src/domain/pages/page.js';
import { pageFixture } from '../support/pages.js';

describe('page snapshot guards over admitted optional-field defaults', () => {
  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  let connection: Connection;
  let pages: Model<IPageRecord>;
  const at = new Date('2026-11-18T12:00:00Z');

  beforeAll(async () => {
    const uri = process.env.ZARYA_TEST_MONGO_URI;

    if (!uri) {
      throw new Error('Explicit isolated MongoDB URI required');
    }
    connection = await createConnection(uri, { dbName: database, autoCreate: false, autoIndex: false }).asPromise();
    await applyMigrations(connection, 'migrations');
    pages = connection.model<IPageRecord>('Page', pageSchema);
  });

  afterAll(async () => {
    if (connection) {
      try {
        if (connection.name !== database || !/^zarya_test_[a-f0-9]{32}$/.test(database)) {
          throw new Error('Refusing unrelated database cleanup');
        }
        await connection.dropDatabase();
      } finally {
        await connection.close();
      }
    }
  });

  it.each(['archive', 'move'] as const)(
    'allows %s when persisted optional MIME fields are absent and still rejects an actual concurrent edit',
    async (operation) => {
      const { pageId, ...fields } = pageFixture('page-' + operation, 'site-1', operation).toState();
      const row = { ...fields, _id: pageId, markKey: operation };

      delete row.mimeType;
      delete row.excludeFromSitemap;
      await connection.collection<{ _id: string }>('pages').insertOne(row);
      const repository = new MongoosePageRepository(pages, () => at, {
        create: async () => {
          throw new Error('Must update an existing page');
        },
      });
      const captured = (await repository.findById(pageId))!.toState();

      expect(captured).toMatchObject({ mimeType: 'text/html', excludeFromSitemap: false });
      const mutate = (snapshot: IPageState): Promise<Page> => operation === 'archive'
        ? new MongoosePageArchivalAdapter(pages, () => at).archive(snapshot)
        : new MongoosePageTreeStore(pages, () => at).move(snapshot, null);
      const changed = await mutate(captured);

      expect(changed.toState()).toMatchObject({
        pageId,
        siteId: 'site-1',
        status: operation === 'archive' ? 'ARCHIVED' : captured.status,
      });
      const next = (await repository.findById(pageId))!.toState();

      await connection.collection<{ _id: string }>('pages').updateOne(
        { _id: pageId }, { $set: { title: 'Concurrent edit' } },
      );
      const stale = mutate(next);

      await expect(stale).rejects.toMatchObject({ name: 'PageConflictError' });
      expect((await repository.findById(pageId))!.title).toBe('Concurrent edit');
    },
  );
});
