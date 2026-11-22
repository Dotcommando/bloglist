import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { type Connection, createConnection } from 'mongoose';

import { applyMigrations, verifyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import {
  elementKeySchema, type IElementKeyRecord, MongooseElementKeys,
} from '../../src/adapters/outbound/persistence/mongoose/rendering/element-keys.adapter.js';
import { TemplateSourceKind } from '../../src/domain/publication/render-plan.js';
import { elementFixture } from '../support/rendering.js';

describe('rendering names migration and atomic ordinal allocation', () => {
  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  let connection: Connection;
  let root = '';

  beforeAll(async () => {
    if (!process.env.ZARYA_TEST_MONGO_URI) {
      throw new Error('Explicit isolated test MongoDB required');
    }
    connection = await createConnection(process.env.ZARYA_TEST_MONGO_URI, {
      dbName: database, autoIndex: false, autoCreate: false,
    }).asPromise();
    root = await mkdtemp(path.resolve('.tmp/element-key-migrations-'));
  });
  afterAll(async () => {
    if (connection) {
      if (connection.name !== database || !/^zarya_test_[a-f0-9]{32}$/.test(database)) {
        throw new Error('Unsafe database cleanup');
      }
      await connection.dropDatabase();
      await connection.close();
    }
    if (root.startsWith(path.resolve('.tmp') + path.sep)) {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('upgrades old entities with names while preserving keys, identity, content and version', async () => {
    for (const file of (await readdir('migrations')).filter((name) => name.endsWith('.json') && name < '0014')) {
      await copyFile(path.join('migrations', file), path.join(root, file));
    }
    await applyMigrations(connection, root);
    const db = connection.db!;
    const { elementId, name, ...state } = elementFixture();
    const previous = { _id: elementId, ...state };

    expect(name).toBe('Home');
    await db.collection<{ _id: string }>('rendering_elements').insertOne(previous);
    await applyMigrations(connection, 'migrations');
    await verifyMigrations(connection, 'migrations');
    expect(await db.collection('rendering_elements').findOne({ siteId: state.siteId }))
      .toEqual({ ...previous, name: 'Home' });
    await applyMigrations(connection, 'migrations');
    expect(await db.collection('rendering_elements').countDocuments()).toBe(1);
  });

  it('allocates distinct consecutive keys under concurrency and isolates site and kind', async () => {
    const model = connection.model<IElementKeyRecord>('RenderingElementKeys', elementKeySchema);
    const keys = new MongooseElementKeys(model);
    const scope = { siteId: 'site-1', kind: TemplateSourceKind.Template, after: 0n };
    const results = await Promise.all(Array.from({ length: 16 }, () => keys.reserve(scope)));

    expect(new Set(results).size).toBe(16);
    expect(results.map(BigInt).sort((a, b) => a < b ? -1 : 1))
      .toEqual(Array.from({ length: 16 }, (_, index) => BigInt(index + 1)));
    expect(await keys.reserve({ ...scope, kind: TemplateSourceKind.Chunk })).toBe('1');
    expect(await keys.reserve({ ...scope, siteId: 'site-2' })).toBe('1');
    expect(await keys.reserve({ ...scope, after: 40n })).toBe('41');
    expect(await keys.reserve({ ...scope, after: 9007199254740992n })).toBe('9007199254740993');
    expect(await keys.reserve({ ...scope, after: 9223372036854775806n })).toBe('9223372036854775807');
    await expect(keys.reserve(scope)).rejects.toMatchObject({ code: 'Conflict' });
  });
});
