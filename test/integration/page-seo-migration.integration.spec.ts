import { randomUUID } from 'node:crypto';

import { createConnection } from 'mongoose';

import { applyMigrations, verifyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { pageFixture } from '../support/pages.js';
import { instant } from '../support/sites.js';

interface ILegacyRecord extends Record<string, unknown> {
  _id: string;
}

describe('page metadata baseline schema', () => {
  it('preserves legacy page/publication records and validates new social fields', async () => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

    if (!mongoUri) {
      throw new Error('Explicit test MongoDB required');
    }

    const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
    const connection = await createConnection(mongoUri, {
      dbName: database, autoIndex: false, autoCreate: false,
    }).asPromise();

    try {
      await applyMigrations(connection, 'migrations');
      const page = pageFixture();

      page.publish(instant);
      const legacy = Object.fromEntries(Object.entries(page.toState()).filter(([key]) =>
        !key.startsWith('og')));
      const record: ILegacyRecord = { ...legacy, _id: page.pageId, markKey: 'home' };

      delete record.pageId;
      const db = connection.db;

      if (!db) {
        throw new Error('Database connection required');
      }

      const pages = db.collection<ILegacyRecord>('pages');
      const publications = db.collection<ILegacyRecord>('page_publications');

      await pages.insertOne(record);
      await publications.insertOne({
        _id: page.pageId, siteId: page.siteId, versions: [{ publishedAt: instant, page: legacy }],
      });
      const beforePage = await pages.findOne({ _id: page.pageId });
      const beforeVersions = await publications.findOne({ _id: page.pageId });

      await applyMigrations(connection, 'migrations');
      await verifyMigrations(connection, 'migrations');
      expect(await pages.findOne({ _id: page.pageId })).toMatchObject(beforePage!);
      expect(await publications.findOne({ _id: page.pageId })).toMatchObject(beforeVersions!);
      await pages.updateOne({ _id: page.pageId }, { $set: { ogTitle: 'Social', ogType: 'article' } });
      await publications.updateOne({ _id: page.pageId }, {
        $set: { 'versions.0.page.ogTitle': 'Retained social', 'versions.0.page.ogImage': null },
      });
      await expect(pages.updateOne({ _id: page.pageId }, { $set: { ogType: 'unsupported' } }))
        .rejects.toMatchObject({ code: 121 });
      await expect(publications.updateOne({ _id: page.pageId }, { $set: { 'versions.0.page.ogTitle': 123 } }))
        .rejects.toMatchObject({ code: 121 });
      await verifyMigrations(connection, 'migrations');
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
