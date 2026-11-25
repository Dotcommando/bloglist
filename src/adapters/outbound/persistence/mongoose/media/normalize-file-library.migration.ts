import type { Connection } from 'mongoose';

import type { IAssetState } from '../../../../../domain/media/asset.js';
import { type IMediaLibrary, validateLibrary } from '../../../../../domain/media/file-library.js';
import { fileRecord, folderRecord, type IMediaLibraryRecord, mediaRecords } from './file-library-store.adapter.js';

interface ILegacyMediaLibrary extends IMediaLibraryRecord, IMediaLibrary {
  readonly garbage: readonly IAssetState[];
}

/** The installation is offline. Each legacy catalog is split in a single transaction. */
export async function normalizeFileLibraries(connection: Connection): Promise<void> {
  const db = connection.db;

  if (!db) {
    throw new Error('MongoDB connection is not open');
  }

  const libraries = db.collection<ILegacyMediaLibrary>('media_libraries');
  const records = mediaRecords(connection);
  const session = await connection.startSession();

  try {
    for await (const candidate of libraries.find({ files: { $exists: true } }, { projection: { _id: 1, siteId: 1 } })) {
      const scope = { _id: candidate._id, siteId: candidate.siteId, files: { $exists: true } };

      await session.withTransaction(async () => {
        const library = await libraries.findOne(scope, { session });

        if (!library) {
          return;
        }
        validateLibrary(library);

        if (library.folders.length) {
          await records.folders.insertMany(library.folders.map((folder) => folderRecord(library, folder)),
            { session });
        }
        if (library.files.length) {
          await records.files.insertMany(library.files.map((file) => fileRecord(library, file)), { session });
        }
        if (library.pending) {
          const { _id, siteId, version, garbage } = library;

          await records.operations.create([{ _id, siteId, version, garbage }], { session });
        }
        await libraries.updateOne(scope, { $unset: { folders: '', files: '', garbage: '' } }, { session });
      }, { writeConcern: { w: 'majority' } });
    }
  } finally {
    await session.endSession();
  }
}
