import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { createConnection } from 'mongoose';

import {
  mediaLibraryModel, MongooseFileLibraryStore,
} from '../../src/adapters/outbound/persistence/mongoose/media/file-library-store.adapter.js';
import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import {
  FileLibraryProjectionAdapter,
} from '../../src/adapters/outbound/storage/files/media/file-library-projection.adapter.js';
import { libraryFileFixture } from '../support/file-library.js';
import { binary } from '../support/media.js';

function assertDatabase(actual: string, expected: string): void {
  if (actual !== expected || !/^zarya_test_[0-9a-f]{32}$/.test(expected)) {
    throw new Error('Unsafe database cleanup');
  }
}

async function removeFixture(root: string): Promise<void> {
  if (!root.startsWith(path.resolve('.tmp') + path.sep)) {
    throw new Error('Unsafe filesystem cleanup');
  }
  await rm(root, { recursive: true, force: true });
}

it('does not let a delayed reconciler replace a newer acknowledged named-media projection', async () => {
  const uri = process.env.ZARYA_TEST_MONGO_URI;

  if (!uri) {
    throw new Error('Explicit isolated MongoDB required');
  }

  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  const root = await mkdtemp(path.resolve('.tmp/media-reconcile-fence-'));
  const connection = createConnection(uri, { dbName: database, autoCreate: false, autoIndex: false });
  let release = (): void => {};
  let entered = (): void => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const paused = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let delayed: Promise<PromiseSettledResult<void>[]> | undefined;

  try {
    await connection.asPromise();
    await applyMigrations(connection, 'migrations');
    const model = mediaLibraryModel(connection);
    const projection = new FileLibraryProjectionAdapter(root, {
      read: async () => binary('owned bytes'),
      assertOwned: vi.fn(),
      write: vi.fn(),
      delete: vi.fn(),
    }, { primaryDomain: async () => 'example.test' });
    const file = libraryFileFixture();
    const first = { siteId: 'site-1', version: 'v1', folders: [], files: [file] };

    await model.create({ ...first, _id: first.siteId, pending: true, garbage: [] });
    const store = new MongooseFileLibraryStore(model, projection, { remove: vi.fn() });
    const install = projection.install.bind(projection);

    vi.spyOn(projection, 'install').mockImplementationOnce(async (...args) => {
      entered();
      await waiting;

      return install(...args);
    });
    delayed = Promise.allSettled([store.reconcile(first.siteId)]);
    await paused;
    await store.reconcile(first.siteId);
    const next = { ...first, version: 'v2', files: [{ ...file, name: 'current.png' }] };

    await store.commit(next, first.version);
    release();
    expect(await delayed).toEqual([{ status: 'fulfilled', value: undefined }]);
    expect(await store.read(first.siteId)).toMatchObject({ library: { version: 'v2' }, pending: false });
    await expect(readFile(path.join(root, 'example.test/images/current.png'), 'utf8')).resolves.toBe('owned bytes');
    await expect(readFile(path.join(root, 'example.test/images/photo.png'))).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    release();
    await delayed;

    try {
      assertDatabase(connection.name, database);
      await connection.dropDatabase();
    } finally {
      await connection.close();

      await removeFixture(root);
    }
  }
});
