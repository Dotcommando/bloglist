import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createConnection, mongo } from 'mongoose';

import {
  applyMigrations, readMigrations, verifyMigrations,
} from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { pageFixture } from '../support/pages.js';

interface IRecord extends Record<string, unknown> { _id: string; }

describe('site-scoped page mark migration', () => {
  it('upgrades marks without rewriting content and verifies retirement recovery and drift', async () => {
    const uri = process.env.ZARYA_TEST_MONGO_URI;

    if (!uri) {
      throw new Error('Explicit isolated MongoDB required');
    }

    const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
    const connection = await createConnection(uri, {
      dbName: database, autoIndex: false, autoCreate: false,
    }).asPromise();

    await mkdir('.tmp', { recursive: true });
    const root = await mkdtemp(path.resolve('.tmp/page-marks-'));
    const legacy = path.join(root, 'legacy');

    try {
      await mkdir(legacy);

      const baseline = (await readMigrations('migrations'))[0]!;
      const currentPages = baseline.collections.find((collection) => collection.name === 'pages')!;

      await writeFile(path.join(legacy, '0000-legacy-page-marks.json'), JSON.stringify({
        id: '0000-legacy-page-marks',
        collections: baseline.collections.map((collection) => collection.name !== 'pages' ? collection : {
          ...collection,
          indexes: [
            ...collection.indexes.filter((index) => index.name !== 'pages_site_mark_unique'),
            { key: { markKey: 1 }, name: 'pages_mark_unique', unique: true },
          ],
        }),
      }));
      await copyFile(path.join(legacy, '0000-legacy-page-marks.json'), path.join(root, '0000-legacy-page-marks.json'));
      await writeFile(path.join(root, '0001-site-page-marks.json'), JSON.stringify({
        id: '0001-site-page-marks',
        collections: [{ ...currentPages, removedIndexes: ['pages_mark_unique'] }],
      }));
      await applyMigrations(connection, legacy);
      const db = connection.db!;
      const pages = db.collection<IRecord>('pages');
      const { pageId, ...state } = pageFixture('legacy', 'site-one', 'index').toState();
      const original = { ...state, _id: pageId, markKey: 'index', pageNumber: '1', sortOrder: 100 };

      await pages.insertOne(original);
      await expect(pages.insertOne({
        ...original, _id: 'other', siteId: 'site-two', mark: 'INDEX',
      })).rejects.toMatchObject({ code: 11000 });
      const before = mongo.BSON.serialize((await pages.findOne({ _id: pageId }, { promoteValues: false }))!);

      await applyMigrations(connection, root);
      const indexes = await pages.indexes();

      expect(indexes.some((index) => index.name === 'pages_mark_unique')).toBe(false);
      expect(indexes.find((index) => index.name === 'pages_site_mark_unique')).toMatchObject({
        key: { siteId: 1, markKey: 1 }, unique: true,
      });
      const after = mongo.BSON.serialize((await pages.findOne({ _id: pageId }, { promoteValues: false }))!);

      expect(Buffer.compare(before, after)).toBe(0);
      await pages.insertOne({ ...original, _id: 'other', siteId: 'site-two', mark: 'INDEX' });
      await expect(pages.insertOne({
        ...original, _id: 'duplicate', pageNumber: '2', mark: 'INDEX',
      })).rejects.toMatchObject({ code: 11000 });

      // Simulate a crash after retiring the old index but before recording completion.
      await db.collection<IRecord>('schema_migrations').deleteOne({ _id: '0001-site-page-marks' });
      await applyMigrations(connection, root);
      const receipts = await db.collection('schema_migrations').find({}).sort({ _id: 1 }).toArray();

      await applyMigrations(connection, root);
      await verifyMigrations(connection, root);
      expect(await db.collection('schema_migrations').find({}).sort({ _id: 1 }).toArray()).toEqual(receipts);

      await pages.createIndex({ markKey: 1 }, { name: 'pages_mark_unique' });
      await expect(verifyMigrations(connection, root)).rejects.toThrow('Retired index still exists');
    } finally {
      expect(connection.name).toBe(database);
      expect(database).toMatch(/^zarya_test_[a-f0-9]{32}$/);
      expect(root.startsWith(path.resolve('.tmp') + path.sep)).toBe(true);
      await connection.dropDatabase();
      await connection.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
