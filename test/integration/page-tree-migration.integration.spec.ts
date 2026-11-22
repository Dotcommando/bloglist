import { randomUUID } from 'node:crypto';

import { createConnection } from 'mongoose';

import { applyMigrations, verifyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import {
  migratePageTree,
} from '../../src/adapters/outbound/persistence/mongoose/pages/page-tree.migration.js';
import { pageFixture } from '../support/pages.js';
import { urlFixture } from '../support/routing.js';
import { instant } from '../support/sites.js';

interface IRecord extends Record<string, unknown> { _id: string; }

describe('legacy page tree migration', () => {
  it('backfills parents, per-parent order, exact numeric identities and preserves all original content', async () => {
    const uri = process.env.ZARYA_TEST_MONGO_URI;

    if (!uri) {
      throw new Error('Explicit test MongoDB required');
    }

    const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
    const connection = await createConnection(uri, {
      dbName: database, autoIndex: false, autoCreate: false,
    }).asPromise();

    try {
      const db = connection.db!;
      const pages = db.collection<IRecord>('pages');
      const urls = db.collection<IRecord>('urls');
      const publications = db.collection<IRecord>('page_publications');
      const originals: IRecord[] = [];
      const expectedPublications: IRecord[] = [];

      for (const [index, id] of ['folder', 'child', 'childtwo', 'root'].entries()) {
        const state = pageFixture(id, 'site-1', id).toState();
        const legacy = Object.fromEntries(Object.entries(state).filter(([key]) =>
          !['pageNumber', 'parentPageId', 'sortOrder'].includes(key)));
        const record: IRecord = {
          ...legacy, _id: id, markKey: id, createdAt: new Date(instant.getTime() + index),
        };

        delete record.pageId;
        originals.push(record);
        expectedPublications.push({
          _id: id,
          siteId: 'site-1',
          versions: [{ publishedAt: instant, page: { ...legacy, pageNumber: String(index + 1) } }],
        });
        await pages.insertOne(record);
        await publications.insertOne({
          _id: id, siteId: 'site-1', versions: [{ publishedAt: instant, page: legacy }],
        });
        const { urlId, ...address } = urlFixture({
          urlId: 'url-' + id,
          siteId: 'site-1',
          pageId: id,
          mark: 'Url' + id,
          parentUrlId: id.startsWith('child') ? 'url-folder' : null,
          path: id.startsWith('child') ? '/folder/' + id : '/' + id,
          segment: id,
        }).toState();

        await urls.insertOne({ ...address, _id: urlId, markKey: address.mark.toLowerCase() });
      }
      const beforeUrls = await urls.find({}).toArray();

      // Synthetic legacy collections exercise the retained transform independently of the fresh-install baseline.
      await migratePageTree(connection);
      await applyMigrations(connection, 'migrations');
      await verifyMigrations(connection, 'migrations');
      const migrated = await pages.find({}).sort({ createdAt: 1 }).toArray();

      expect(migrated.map((record) => [record.pageNumber, record.parentPageId, record.sortOrder]))
        .toEqual([['1', null, 100], ['2', 'folder', 100], ['3', 'folder', 200], ['4', null, 200]]);
      expect(migrated.map((record) => Object.fromEntries(Object.entries(record).filter(([key]) =>
        !['pageNumber', 'parentPageId', 'sortOrder'].includes(key)))))
        .toEqual(originals);
      expect(await urls.find({}).toArray()).toEqual(beforeUrls);
      const versions = await publications.find({}).sort({ _id: 1 }).toArray();

      expect(versions).toEqual(expectedPublications.sort((a, b) => a._id.localeCompare(b._id)));
      await migratePageTree(connection);
      expect(await pages.find({}).sort({ createdAt: 1 }).toArray()).toEqual(migrated);
      expect((await db.collection('page_sequences').findOne({ siteId: 'site-1' }))?.lastOrdinal).toBe(4);
      await expect(pages.updateOne({ _id: 'root' }, { $set: { pageNumber: '1' } }))
        .rejects.toMatchObject({ code: 11000 });
      await expect(pages.updateOne({ _id: 'root' }, { $set: { sortOrder: -1 } }))
        .rejects.toMatchObject({ code: 121 });
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
