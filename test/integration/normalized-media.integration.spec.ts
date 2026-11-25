import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { createConnection } from 'mongoose';

import {
  fileRecord, folderRecord, mediaLibraryModel, mediaRecords, MongooseFileLibraryStore,
} from '../../src/adapters/outbound/persistence/mongoose/media/file-library-store.adapter.js';
import {
  normalizeFileLibraries,
} from '../../src/adapters/outbound/persistence/mongoose/media/normalize-file-library.migration.js';
import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import {
  FileAssetStorageAdapter,
} from '../../src/adapters/outbound/storage/files/media/asset-storage.adapter.js';
import {
  FileLibraryProjectionAdapter,
} from '../../src/adapters/outbound/storage/files/media/file-library-projection.adapter.js';
import { BrowseMediaFolderUseCase } from '../../src/app/use-cases/media/browse-media-folder.use-case.js';
import { type IMediaLibrary, MediaRoot } from '../../src/domain/media/file-library.js';
import { MediaSortField } from '../../src/domain/media/media-browser.js';
import { AssetContentRole } from '../../src/ports/outbound/media/asset-storage.port.js';
import { libraryFileFixture } from '../support/file-library.js';
import { binary } from '../support/media.js';

it('migrates pending legacy metadata and queries a 100,000-file library using bounded result pages', async () => {
  const uri = process.env.ZARYA_TEST_MONGO_URI;

  if (!uri) {
    throw new Error('Explicit isolated MongoDB required');
  }

  const dbName = 'zarya_test_' + randomUUID().replaceAll('-', '');
  const root = await mkdtemp(path.resolve('.tmp/normalized-media-'));
  const connection = createConnection(uri, { dbName, autoIndex: false, autoCreate: false });

  try {
    await connection.asPromise();
    await applyMigrations(connection, 'migrations');
    const db = connection.db!;
    const siteId = 'site-1';
    const oldFile = libraryFileFixture();
    const folder = { name: 'Pictures', folderId: 'images-child', root: MediaRoot.Images, parentId: null };
    const legacy: IMediaLibrary = { siteId, version: 'legacy', files: [oldFile], folders: [folder] };

    await db.collection<IMediaLibrary & { _id: string; pending: boolean; garbage: [] }>('media_libraries').insertOne(
      { ...legacy, pending: true, garbage: [], _id: siteId }, { bypassDocumentValidation: true },
    );
    await normalizeFileLibraries(connection);
    await normalizeFileLibraries(connection);
    const install = vi.fn(async () => true);
    const sites = { primaryDomain: async () => 'normalized.test' };
    const storage = new FileAssetStorageAdapter(root, '/assets', sites);
    const projection = new FileLibraryProjectionAdapter(root, storage, sites);
    const installChange = vi.fn(projection.installChange.bind(projection));
    const store = new MongooseFileLibraryStore(mediaLibraryModel(connection), {
      install, installChange,
    }, { remove: vi.fn() });
    const records = mediaRecords(connection);

    expect(await records.operations.countDocuments({ siteId })).toBe(1);
    expect(await records.files.countDocuments({ siteId })).toBe(1);
    expect(await records.folders.countDocuments({ siteId })).toBe(1);
    expect(await db.collection('media_libraries').countDocuments({ siteId, files: { $exists: true } })).toBe(0);
    await store.reconcile(siteId);
    expect(install).toHaveBeenCalledOnce();
    expect(await records.operations.countDocuments({ siteId })).toBe(0);
    expect((await store.locate(siteId, oldFile.fileId))?.file).toMatchObject({
      fileId: oldFile.fileId, name: oldFile.name, createdAt: oldFile.image.createdAt,
    });

    const bulkSite = 'site-bulk';
    const library: IMediaLibrary = { siteId: bulkSite, version: 'synthetic', folders: [folder], files: [] };
    const bytes = 'real projection bytes';
    const reference = await storage.write({
      siteId: bulkSite,
      assetId: oldFile.image.assetId,
      assetVersion: oldFile.image.assetVersion,
      variantId: 'file',
      role: AssetContentRole.Derivative,
      visibility: oldFile.image.visibility,
      content: binary(bytes),
    });
    const fixture = {
      ...oldFile,
      image: { ...oldFile.image, siteId: bulkSite, file: reference },
      outputs: oldFile.outputs.map((output) => ({ ...output, contentId: reference.contentId })),
    };

    await mediaLibraryModel(connection).create({
      _id: bulkSite, siteId: bulkSite, version: library.version, pending: false,
    });
    await records.folders.create(folderRecord(library, folder));
    const browse = new BrowseMediaFolderUseCase(store, { requireEditor: vi.fn() },
      { nextId: randomUUID, publicPath: '/assets' });
    const query = {
      siteId: bulkSite,
      folderId: folder.folderId,
      root: MediaRoot.Images,
      search: '',
      recursive: false,
      sort: MediaSortField.Name,
      descending: false,
      page: 2,
      pageSize: 25,
    };
    let seeded = 0;

    for (const size of [1_000, 10_000, 50_000, 100_000]) {
      for (; seeded < size; seeded += 1_000) {
        await records.files.insertMany(Array.from({ length: 1_000 }, (_, offset) => {
          const id = String(seeded + offset).padStart(6, '0');

          return fileRecord(library, {
            ...fixture, fileId: 'file-' + id, name: id + '.png', folderId: folder.folderId,
          });
        }));
      }
      const started = performance.now();
      const page = await browse.execute(query);
      const pageMs = Math.round(performance.now() - started);
      const searchStarted = performance.now();
      const search = await browse.execute({
        ...query, folderId: null, recursive: true, page: 1, search: '000555',
      });
      const searchMs = Math.round(performance.now() - searchStarted);
      const lookupStarted = performance.now();
      const lookup = await store.publicOutput(bulkSite, 'images/Pictures/000555.png');
      const lookupMs = Math.round(performance.now() - lookupStarted);
      const addStarted = performance.now();
      const added = await store.append(bulkSite, {
        ...fixture,
        fileId: 'new-' + size,
        name: 'new-' + size + '.png',
        folderId: null,
      }, randomUUID());
      const addMs = Math.round(performance.now() - addStarted);
      const responseBytes = Buffer.byteLength(JSON.stringify(page));

      expect(page.total).toBe(size);
      expect(page.files.map((file) => file.name)).toEqual(Array.from({ length: 25 }, (_, i) =>
        String(25 + i).padStart(6, '0') + '.png'));
      expect(page.breadcrumbs).toEqual([folder]);
      expect(search.files.map((file) => file.name)).toEqual(['000555.png']);
      expect(search.paths['file-000555']).toBe('Pictures');
      expect(lookup?.output.mimeType).toBe('image/png');
      expect(added.file.fileId).toBe('new-' + size);
      expect(await readFile(path.join(root, 'normalized.test/images/new-' + size + '.png'), 'utf8')).toBe(bytes);
      const [match, missing, repeated] = await store.metadata(
        bulkSite, ['file-000555', 'missing', 'file-000555'], '/assets',
      );

      expect(match?.outputs[0]?.url).toBe('/assets/images/Pictures/000555.png');
      expect(missing).toBeNull();
      expect(repeated).toEqual(match);
      expect(responseBytes).toBeLessThan(30_000);
      console.info(JSON.stringify({ size, pageMs, searchMs, lookupMs, addMs, responseBytes }));
    }
    expect(installChange).toHaveBeenCalledTimes(4);
  } finally {
    try {
      if (connection.name === dbName && /^zarya_test_[a-f0-9]{32}$/.test(dbName)) {
        await connection.dropDatabase();
      }
    } finally {
      await connection.close();
      await rm(root, { recursive: true, force: true });
    }
  }
}, 120_000);
