import { type Connection, type Model, Schema } from 'mongoose';

import { Asset, type IAssetState } from '../../../../../domain/media/asset.js';
import { type IMediaLibrary, validateLibrary } from '../../../../../domain/media/file-library.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type {
  IMediaImageRemoval,
  IMediaLibraryProjection,
  IMediaLibraryStore,
} from '../../../../../ports/outbound/media/file-library.port.js';

export interface IMediaLibraryRecord extends IMediaLibrary {
  readonly tvFence?: number;
  readonly _id: string;
  readonly pending: boolean;
  readonly garbage: readonly IAssetState[];
}

const dimensions = new Schema({ width: Number, height: Number, aspectRatio: Number }, { _id: false });

const reference = new Schema({ contentId: String }, { _id: false });

const variant = new Schema({
  variantId: String,
  content: reference,
  mimeType: String,
  byteSize: Number,
  checksum: String,
  dimensions,
}, { _id: false });

const image = new Schema({
  assetId: String,
  assetVersion: String,
  siteId: String,
  filename: String,
  mimeType: String,
  byteSize: Number,
  checksum: String,
  original: reference,
  file: { type: reference, default: undefined },
  visibility: String,
  state: String,
  failure: { type: String, default: null },
  version: String,
  mode: String,
  originalDimensions: dimensions,
  profileVersion: { type: String, default: null },
  variants: [variant],
  profileMappings: [new Schema({ profileId: String, variantIds: [String] }, { _id: false })],
  createdAt: Date,
  updatedAt: Date,
}, { _id: false, strict: 'throw' });

const folder = new Schema({
  root: { type: String, default: 'images' },
  folderId: String,
  parentId: { type: String, default: null },
  name: String,
}, { _id: false });

const output = new Schema({
  key: String,
  suffix: String,
  mimeType: String,
  dimensions,
  contentId: String,
}, { _id: false });

const file = new Schema({
  fileId: String,
  folderId: { type: String, default: null },
  name: String,
  mode: String,
  image,
  outputs: [output],
  previousPaths: [String],
}, { _id: false, strict: 'throw' });

const schema = new Schema<IMediaLibraryRecord>({
  tvFence: { type: Number, default: undefined },
  _id: { type: String, required: true },
  siteId: { type: String, required: true },
  version: { type: String, required: true },
  folders: [folder],
  files: [file],
  pending: Boolean,
  garbage: [image],
}, { collection: 'media_libraries', strict: 'throw', versionKey: false, autoIndex: false, autoCreate: false });

export function mediaLibraryModel(connection: Connection): Model<IMediaLibraryRecord> {
  return connection.model<IMediaLibraryRecord>('MediaLibrary', schema);
}

export class MongooseFileLibraryStore implements IMediaLibraryStore {
  constructor(private readonly model: Model<IMediaLibraryRecord>, private readonly projection: IMediaLibraryProjection,
    private readonly removal: IMediaImageRemoval) {}

  async read(siteId: string): Promise<{ library: IMediaLibrary; pending: boolean }> {
    const record = await this.model.findOne({ _id: siteId, siteId }).lean().exec();

    if (!record) {
      return { library: { siteId, version: '0', folders: [], files: [] }, pending: false };
    }

    const { _id, pending } = record;
    const library: IMediaLibrary = {
      siteId: record.siteId,
      version: record.version,
      folders: record.folders,
      files: record.files,
    };

    if (_id !== siteId || library.siteId !== siteId) {
      throw new Error('Foreign media library');
    }
    validateLibrary(library);

    return { library, pending };
  }

  async commit(library: IMediaLibrary, expectedVersion: string): Promise<void> {
    validateLibrary(library);
    const before = await this.read(library.siteId);
    const retained = new Set(library.files.map((file) => file.image.assetVersion));
    const removed = before.library.files.filter((file) => !retained.has(file.image.assetVersion));
    const garbage = removed.map((file) => file.image);

    if (expectedVersion === '0') {
      try {
        await this.model.create({ ...library, _id: library.siteId, pending: true, garbage });
      } catch (error) {
        const found = await this.read(library.siteId);

        if (found.library.version !== library.version) {
          if (found.library.version === '0') {
            throw error;
          }
          throw new BusinessError(BusinessErrorCode.StaleWrite, 'Media library changed');
        }
        if (!found.pending) {
          return;
        }
        if (!(error instanceof Error)) {
          throw error;
        }
      }
    } else {
      const result = await this.model.updateOne({
        _id: library.siteId,
        siteId: library.siteId,
        version: expectedVersion,
        pending: false,
      }, { $set: { ...library, pending: true, garbage } }).exec();

      if (result.matchedCount !== 1) {
        const found = await this.read(library.siteId);

        if (found.library.version !== library.version) {
          throw new BusinessError(BusinessErrorCode.StaleWrite, 'Media library changed or has pending output');
        }
        if (!found.pending) {
          return;
        }
      }
    }
    await this.finish(library);
  }

  async reconcile(siteId: string): Promise<void> {
    const { library, pending } = await this.read(siteId);

    if (pending) {
      await this.finish(library);
    }
  }

  private async finish(library: IMediaLibrary): Promise<void> {
    let garbage: IMediaLibraryRecord['garbage'] = [];
    const installed = await this.projection.install(library, async () => {
      // Reload only after the projection owns its site writer lock.
      const record = await this.model.findOne({
        _id: library.siteId,
        siteId: library.siteId,
        version: library.version,
        pending: true,
      }).lean().exec();

      if (!record) {
        return false;
      }
      garbage = record.garbage;

      return true;
    });

    if (!installed) {
      return;
    }

    for (const image of garbage) {
      await this.removal.remove(new Asset(image).toState());
    }
    await this.model.updateOne({ _id: library.siteId, siteId: library.siteId, version: library.version, pending: true },
      { $set: { pending: false, garbage: [] } }).exec();
  }
}
