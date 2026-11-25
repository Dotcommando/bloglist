import path from 'node:path';

import { createConnection } from 'mongoose';

import { assetModel } from '../../adapters/outbound/persistence/mongoose/media/asset.repository.js';
import {
  mediaLibraryModel, readMediaLibrary,
} from '../../adapters/outbound/persistence/mongoose/media/file-library-store.adapter.js';
import { verifyMigrations } from '../../adapters/outbound/persistence/mongoose/migrations.js';
import { type ISiteRecord, siteSchema } from '../../adapters/outbound/persistence/mongoose/sites/site.schema.js';
import {
  MongooseSiteStorageScope,
} from '../../adapters/outbound/persistence/mongoose/sites/site-storage-scope.adapter.js';
import { digestContent, digestFile, fileContent } from '../../adapters/outbound/storage/files/binary-file.js';
import { FileAssetStorageAdapter } from '../../adapters/outbound/storage/files/media/asset-storage.adapter.js';
import {
  FileLibraryProjectionAdapter,
} from '../../adapters/outbound/storage/files/media/file-library-projection.adapter.js';
import { checkedStoragePath } from '../../adapters/outbound/storage/files/media/site-asset-directory.adapter.js';
import { AssetVisibility } from '../../domain/media/asset.js';
import { AssetContentRole } from '../../ports/outbound/media/asset-storage.port.js';
import type { ILocalApplicationSettings } from '../local-application.settings.js';

/** Explicit offline migration. The old tree is retained until the operator archives it. */
export async function migrateMediaLayout(settings: ILocalApplicationSettings, from: string): Promise<number> {
  if (
    !settings.media
    || !settings.operator.platformAdministrator
    || path.resolve(from) === path.resolve(settings.media.root)
  ) {
    throw new RangeError('Distinct media roots and an explicit local administrator are required');
  }

  const connection = await createConnection(settings.mongoUri, {
    dbName: settings.database, autoIndex: false, autoCreate: false,
  }).asPromise();

  try {
    await verifyMigrations(connection, 'migrations');
    const sites = connection.model<ISiteRecord>('Site', siteSchema);
    const scope = new MongooseSiteStorageScope(sites);
    const storage = new FileAssetStorageAdapter(settings.media.root, settings.media.publicBaseUrl, scope);
    const projection = new FileLibraryProjectionAdapter(settings.media.root, storage, scope);
    const assets = assetModel(connection);
    let copied = 0;

    for (const site of await sites.find({}).lean().exec()) {
      for (const asset of await assets.find({ siteId: site._id }).lean().exec()) {
        const references = [
          { reference: asset.original, mimeType: asset.mimeType, checksum: asset.checksum },
          ...(asset.file ? [{ reference: asset.file, mimeType: asset.mimeType, checksum: asset.checksum }] : []),
          ...asset.variants.map((variant) => ({
            reference: variant.content, mimeType: variant.mimeType, checksum: variant.checksum,
          })),
        ];

        for (const entry of references) {
          await storage.assertOwned(site._id, asset.assetId, asset._id, entry.reference);
          const existing = await storage.read(site._id, entry.reference);

          if (existing) {
            if ((await digestContent(existing)).checksum !== entry.checksum) {
              throw new Error('Migrated object checksum differs from metadata');
            }
            continue;
          }

          const filename = await checkedStoragePath(from, entry.reference.contentId);
          const verified = await digestFile(filename);

          if (verified.checksum !== entry.checksum) {
            throw new Error('Legacy object checksum differs from metadata');
          }

          const original = entry.reference.contentId === asset.original.contentId;
          const migrated = await storage.write({
            siteId: site._id,
            assetId: asset.assetId,
            assetVersion: asset._id,
            ...(original ? { role: AssetContentRole.Original, visibility: AssetVisibility.Private } : {
              role: AssetContentRole.Derivative,
              variantId: path.basename(entry.reference.contentId, path.extname(entry.reference.contentId)),
              visibility: entry.reference.contentId.startsWith('public/')
                ? AssetVisibility.Public : AssetVisibility.Private,
            }),
            content: fileContent(filename, verified.byteSize, entry.mimeType),
          });

          if (migrated.contentId !== entry.reference.contentId) {
            throw new Error('Migration changed an immutable object identity');
          }
          copied++;
        }
      }
    }

    const libraries = mediaLibraryModel(connection);

    for await (const entry of libraries.find({}).select({ siteId: 1 }).lean().cursor()) {
      const { library, pending } = await readMediaLibrary(libraries, entry.siteId);

      if (pending) {
        throw new Error('Finish pending file updates before migrating storage');
      }

      const installed = await projection.install(library, async () => Boolean(await libraries.exists({
        _id: library.siteId,
        siteId: library.siteId,
        version: library.version,
        pending: false,
      })));

      if (!installed) {
        throw new Error('Media library changed during offline migration; stop writers and retry');
      }
    }

    return copied;
  } finally {
    await connection.close();
  }
}
