import { type ClientSession, type Connection, type Model, Schema } from 'mongoose';

import { Asset, type IAssetState } from '../../../../../domain/media/asset.js';
import {
  type IMediaFile, type IMediaFolder, type IMediaLibrary, MediaRoot, mediaRoot, validateLibrary,
} from '../../../../../domain/media/file-library.js';
import { mediaFileRevision, mediaFileView } from '../../../../../domain/media/file-library.js';
import {
  type IMediaBrowseQuery, type IMediaLocatedFile, MediaSortField,
} from '../../../../../domain/media/media-browser.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type {
  IMediaImageRemoval,
  IMediaLibraryProjection,
  IMediaLibraryStore,
  IMediaProjectionChange,
} from '../../../../../ports/outbound/media/file-library.port.js';
import {
  fileRecord, folderRecord, type IMediaFileRecord, type IMediaFolderRecord, nameKey,
} from '../../media-records.js';
import type { MongooseAddonFileReferences } from './addon-file-references.adapter.js';

export { fileRecord, folderRecord } from '../../media-records.js';

export interface IMediaLibraryRecord {
  readonly tvFence?: number;
  readonly _id: string;
  readonly siteId: string;
  readonly version: string;
  readonly pending: boolean;
}

export interface IMediaOperationRecord {
  readonly _id: string;
  readonly siteId: string;
  readonly version: string;
  readonly garbage: readonly IAssetState[];
  readonly change?: IMediaProjectionChange;
  readonly staged?: {
    readonly fileId: string;
    readonly entry: IMediaFileRecord | null;
    readonly promoted: boolean;
  };
}

const modelOptions = { strict: 'throw', versionKey: false, autoIndex: false, autoCreate: false } as const;

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

const output = new Schema({
  key: String,
  suffix: String,
  mimeType: String,
  dimensions,
  contentId: String,
}, { _id: false });

const files = new Schema<IMediaFileRecord>({
  _id: String,
  siteId: String,
  fileId: String,
  folderId: { type: String, default: null },
  name: String,
  nameKey: String,
  scopePath: String,
  root: String,
  mode: String,
  image,
  outputs: [output],
  previousPaths: [String],
  publicPaths: [String],
  publicPathKeys: [String],
  createdAt: Date,
  updatedAt: Date,
  revision: { type: String, default: undefined },
  pendingReferences: {
    type: [new Schema({ from: String, key: String }, { _id: false })], default: undefined,
  },
}, { ...modelOptions, collection: 'media_files' });

const folders = new Schema<IMediaFolderRecord>({
  _id: String,
  siteId: String,
  root: String,
  folderId: String,
  parentId: { type: String, default: null },
  name: String,
  nameKey: String,
  scopePath: String,
}, { ...modelOptions, collection: 'media_folders' });

const operations = new Schema<IMediaOperationRecord>({
  _id: String,
  siteId: String,
  version: String,
  garbage: [image],
  change: { type: new Schema({ fileIds: [String], removedPaths: [String] }, { _id: false }), default: undefined },
  staged: {
    type: new Schema({ fileId: String, entry: { type: files, default: null }, promoted: Boolean }, { _id: false }),
    default: undefined,
  },
}, { ...modelOptions, collection: 'media_operations' });

const schema = new Schema<IMediaLibraryRecord>({
  tvFence: { type: Number, default: undefined },
  _id: { type: String, required: true },
  siteId: { type: String, required: true },
  version: { type: String, required: true },
  pending: Boolean,
}, { ...modelOptions, collection: 'media_libraries' });

export function mediaLibraryModel(connection: Connection): Model<IMediaLibraryRecord> {
  return connection.model<IMediaLibraryRecord>('MediaLibrary', schema);
}

interface IMediaRecords {
  readonly files: Model<IMediaFileRecord>;
  readonly folders: Model<IMediaFolderRecord>;
  readonly operations: Model<IMediaOperationRecord>;
}

export function mediaRecords(connection: Connection): IMediaRecords {
  return {
    files: connection.model<IMediaFileRecord>('MediaFile', files),
    folders: connection.model<IMediaFolderRecord>('MediaFolder', folders),
    operations: connection.model<IMediaOperationRecord>('MediaOperation', operations),
  };
}

export async function readMediaLibrary(model: Model<IMediaLibraryRecord>, siteId: string):
Promise<{ library: IMediaLibrary; pending: boolean }> {
  const scope = { _id: siteId, siteId };
  const records = mediaRecords(model.db);

  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await model.findOne(scope).lean().exec();

    if (!before) {
      return { library: { siteId, version: '0', folders: [], files: [] }, pending: false };
    }

    const [folders, files] = await Promise.all([
      records.folders.find({ siteId }).lean().exec(),
      records.files.find({ siteId }).sort({ createdAt: 1, _id: 1 }).lean().exec(),
    ]);
    const after = await model.findOne(scope).lean().exec();

    if (before.version !== after?.version || before.pending !== after.pending) {
      continue;
    }

    const library: IMediaLibrary = {
      siteId,
      version: before.version,
      folders: folders.map(mediaFolder),
      files: files.map(mediaFile),
    };

    return { library, pending: before.pending };
  }

  throw new BusinessError(BusinessErrorCode.StaleWrite, 'Media library changed during the read');
}

function mediaFolder({ name, root, folderId, parentId }: IMediaFolderRecord): IMediaFolder {
  return { name, root, folderId, parentId };
}

function mediaFile({ fileId, folderId, name, mode, image, outputs, previousPaths, createdAt, updatedAt,
  revision, pendingReferences }:
IMediaFileRecord): IMediaFile {
  return {
    fileId,
    folderId,
    name,
    mode,
    image,
    outputs,
    previousPaths,
    createdAt,
    updatedAt,
    ...(revision === undefined ? {} : { revision }),
    ...(pendingReferences === undefined ? {} : { pendingReferences }),
  };
}

const fileSortFields: Record<MediaSortField, string> = {
  [MediaSortField.Name]: 'nameKey',
  [MediaSortField.Created]: 'createdAt',
  [MediaSortField.Updated]: 'updatedAt',
  [MediaSortField.Type]: 'image.mimeType',
  [MediaSortField.Size]: 'image.byteSize',
};

function literalRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class MongooseFileLibraryStore implements IMediaLibraryStore {
  private readonly records;

  constructor(private readonly model: Model<IMediaLibraryRecord>, private readonly projection: IMediaLibraryProjection,
    private readonly removal: IMediaImageRemoval, private readonly addonReferences?: MongooseAddonFileReferences) {
    this.records = mediaRecords(model.db);
  }

  read(siteId: string): ReturnType<IMediaLibraryStore['read']> {
    return readMediaLibrary(this.model, siteId);
  }

  async browse(query: IMediaBrowseQuery): ReturnType<IMediaLibraryStore['browse']> {
    const { siteId, root, folderId, search, recursive, sort, descending, page, pageSize } = query;
    const scope = { _id: siteId, siteId };
    const direction = descending ? -1 : 1;

    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await this.model.findOne(scope).lean().exec();
      const ancestors = new Map<string, IMediaFolder>();
      const breadcrumbs = await this.ancestors(siteId, root, folderId, ancestors);
      const pathKey = nameKey(breadcrumbs.map((folder) => folder.name).join('/'));
      const filter = {
        siteId,
        root,
        ...(recursive && pathKey ? { scopePath: { $regex: '^' + literalRegex(pathKey) + '(?:/|$)' } } : {}),
        ...(search ? { nameKey: { $regex: literalRegex(nameKey(search)) } } : {}),
      };
      const folderFilter = { ...filter, ...(!recursive ? { parentId: folderId } : {}) };
      const fileFilter = {
        ...filter,
        ...(!recursive ? { folderId } : {}),
        ...(query.mimeTypes?.length ? { 'image.mimeType': { $in: query.mimeTypes } } : {}),
      };
      const offset = (page - 1) * pageSize;
      const [folderCount, fileCount] = await Promise.all([
        this.records.folders.countDocuments(folderFilter).exec(),
        query.foldersOnly ? 0 : this.records.files.countDocuments(fileFilter).exec(),
      ]);
      const foldersOnPage = Math.min(pageSize, Math.max(0, folderCount - offset));
      const [folders, files] = await Promise.all([
        foldersOnPage ? this.records.folders.find(folderFilter).sort({ nameKey: direction, _id: direction })
          .skip(offset).limit(foldersOnPage).lean().exec() : [],
        !query.foldersOnly && foldersOnPage < pageSize ? this.records.files.find(fileFilter)
          .sort({ [fileSortFields[sort]]: direction, _id: direction })
          .skip(Math.max(0, offset - folderCount)).limit(pageSize - foldersOnPage).lean().exec() : [],
      ]);

      for (const file of files) {
        await this.ancestors(siteId, root, file.folderId, ancestors);
      }

      for (const folder of folders) {
        await this.ancestors(siteId, root, folder.parentId, ancestors);
      }
      const after = await this.model.findOne(scope).lean().exec();

      if (before?.version === after?.version && before?.pending === after?.pending) {
        return {
          version: after?.version ?? '0',
          pending: after?.pending ?? false,
          total: folderCount + fileCount,
          folderTotal: folderCount,
          fileTotal: fileCount,
          folders: folders.map(mediaFolder),
          files: files.map(mediaFile),
          ancestry: [...ancestors.values()],
          breadcrumbs,
        };
      }
    }

    throw new BusinessError(BusinessErrorCode.StaleWrite, 'Media library changed during the read');
  }

  private async ancestors(siteId: string, root: MediaRoot, folderId: string | null, cache: Map<string, IMediaFolder>):
  Promise<IMediaFolder[]> {
    const ancestors: IMediaFolder[] = [];
    const visited = new Set<string>();

    for (let id = folderId; id !== null;) {
      if (visited.has(id)) {
        throw new Error('Cyclic media folder ancestry');
      }

      let folder = cache.get(id);

      if (!folder) {
        const record = await this.records.folders.findOne({ siteId, root, folderId: id }).lean().exec();

        if (!record) {
          throw new BusinessError(BusinessErrorCode.NotFound, 'Media folder not found');
        }
        folder = mediaFolder(record);
        cache.set(id, folder);
      }
      visited.add(id);
      ancestors.unshift(folder);
      id = folder.parentId;
    }

    return ancestors;
  }

  async metadata(siteId: string, fileIds: readonly string[], publicPath: string):
  ReturnType<IMediaLibraryStore['metadata']> {
    if (!fileIds.length) {
      return [];
    }

    const records = await this.records.files.find({ siteId, fileId: { $in: [...new Set(fileIds)] } }).lean().exec();
    const byId = new Map(records.map((row) => [row.fileId, mediaFileView(row, publicPath, row.publicPaths)]));

    return fileIds.map((fileId) => byId.get(fileId) ?? null);
  }

  async status(siteId: string): ReturnType<IMediaLibraryStore['status']> {
    const record = await this.model.findOne({ _id: siteId, siteId }).lean().exec();

    return { version: record?.version ?? '0', pending: record?.pending ?? false };
  }

  async folder(siteId: string, folderId: string): ReturnType<IMediaLibraryStore['folder']> {
    const record = await this.records.folders.findOne({ siteId, folderId }).lean().exec();

    return record ? mediaFolder(record) : null;
  }

  async checkName(siteId: string, root: MediaRoot, folderId: string | null, name: string): Promise<void> {
    const ancestry = await this.destination(siteId, root, folderId);
    const scopePath = nameKey(ancestry.map((folder) => folder.name).join('/'));

    await this.checkClaims(siteId, root, folderId, scopePath, [nameKey(name)]);
  }

  private async destination(siteId: string, root: MediaRoot, folderId: string | null): Promise<IMediaFolder[]> {
    try {
      return await this.ancestors(siteId, root, folderId, new Map());
    } catch (error) {
      if (error instanceof BusinessError && error.code === BusinessErrorCode.NotFound) {
        throw new BusinessError(BusinessErrorCode.Validation, 'Invalid destination folder');
      }
      throw error;
    }
  }

  private async checkClaims(siteId: string, root: MediaRoot, folderId: string | null, scopePath: string,
    names: readonly string[], fileId?: string, session?: ClientSession): Promise<void> {
    const claims = names.map((name) => [root, scopePath, name].filter(Boolean).join('/'));
    const folderScope = { siteId, root, parentId: folderId, nameKey: { $in: names } };

    if (
      await this.records.folders.exists(folderScope).session(session ?? null)
      || await this.records.files.exists({
        siteId,
        root,
        folderId,
        ...(fileId ? { fileId: { $ne: fileId } } : {}),
        $or: [{ nameKey: { $in: names } }, { publicPathKeys: { $in: claims } }],
      }).session(session ?? null)
    ) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'File or folder name is already in use');
    }
  }

  discard(image: IAssetState): Promise<void> {
    return this.removal.remove(image);
  }

  async changeFile(siteId: string, before: IMediaLocatedFile, file: IMediaFile | null, version: string, force = false):
  ReturnType<IMediaLibraryStore['changeFile']> {
    const ancestry = file ? await this.destination(siteId, mediaRoot(file), file.folderId) : [];
    const library = { siteId, version, folders: ancestry, files: file ? [file] : [] };
    const old = fileRecord({ ...library, folders: before.ancestry }, before.file);

    validateLibrary(library);
    const entry = file ? fileRecord(library, file) : null;
    const change = {
      fileIds: file ? [file.fileId] : [],
      removedPaths: old.publicPaths.filter((path) => !entry?.publicPaths.includes(path)),
    };
    const garbage = entry?.image.assetVersion === old.image.assetVersion ? [] : [old.image];
    const staged = { fileId: old.fileId, entry, promoted: false };
    const journal = { _id: siteId, siteId, version, change, garbage, staged };
    const write = async (session: ClientSession): Promise<void> => {
      const current = await this.records.files.findOne({ siteId, fileId: old.fileId }).session(session).lean().exec();

      if (!current || mediaFileRevision(current) !== mediaFileRevision(old)) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'Media file changed');
      }
      if (entry) {
        const names = [...new Set([entry.nameKey, ...entry.publicPathKeys.map((key) => key.split('/').at(-1)!)])];

        await this.checkClaims(siteId, entry.root, entry.folderId, entry.scopePath, names, entry.fileId, session);
      } else if (!force) {
        await this.addonReferences?.requireUnused(siteId, old.fileId, session);
      }
    };

    for (let attempt = 0; attempt < (before.guardFile ? 12 : 1); attempt++) {
      if (before.guardFile) {
        await this.reconcile(siteId);
      }
      if (await this.writeEntry(siteId, version, write, journal, before.guardFile ? undefined : before.version)) {
        await this.completeStaged(library);

        return entry ? { version, file: mediaFile(entry), ancestry } : null;
      }
    }

    throw new BusinessError(BusinessErrorCode.StaleWrite, 'Media library changed');
  }

  async withReferenceUpdate(siteId: string, fileId: string,
    action: (file: IMediaLocatedFile) => Promise<boolean>): Promise<void> {
    if (!this.projection.withSiteWrite) {
      throw new Error('Media writer is unavailable');
    }
    await this.projection.withSiteWrite(siteId, async () => {
      if ((await this.status(siteId)).pending) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Finish the pending media projection');
      }

      const entry = await this.locate(siteId, fileId);

      if (!entry) {
        throw new BusinessError(BusinessErrorCode.NotFound, 'Media file not found');
      }
      if (await action(entry) && entry.file.pendingReferences?.length) {
        await this.records.files.updateOne({ siteId, fileId, revision: entry.file.revision ?? { $exists: false } },
          { $unset: { pendingReferences: 1 } }).exec();
      }
    });
  }

  async pathOwner(siteId: string, path: string): Promise<string | null> {
    const record = await this.records.files.findOne({ siteId, publicPathKeys: nameKey(path) })
      .select({ fileId: 1 }).lean().exec();

    return record?.fileId ?? null;
  }

  private async completeStaged(library: IMediaLibrary): Promise<void> {
    try {
      await this.finish(library);
    } catch (cause) {
      throw new Error('Media operation is journaled and can be resumed', { cause });
    }
  }

  async locate(siteId: string, fileId: string): ReturnType<IMediaLibraryStore['locate']> {
    const scope = { _id: siteId, siteId };

    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await this.model.findOne(scope).lean().exec();
      const file = await this.records.files.findOne({ siteId, fileId }).lean().exec();

      if (!before || !file) {
        return null;
      }

      const operation = before.pending
        ? await this.records.operations.findOne({ ...scope, version: before.version }).lean().exec() : null;
      const ancestry = await this.ancestors(siteId, file.root, file.folderId, new Map());
      const after = await this.model.findOne(scope).lean().exec();

      if (before.version === after?.version && before.pending === after.pending) {
        if (before.pending && !operation?.staged && (!operation?.change || operation.change.fileIds.includes(fileId))) {
          throw new BusinessError(BusinessErrorCode.StaleWrite, 'Media update is pending');
        }

        return { version: before.version, file: mediaFile(file), ancestry };
      }
    }

    throw new BusinessError(BusinessErrorCode.StaleWrite, 'Media library changed during the read');
  }

  async append(siteId: string, file: IMediaFile, version: string, expectedVersion?: string):
  ReturnType<IMediaLibraryStore['append']> {
    const root = mediaRoot(file);
    const ancestry = await this.destination(siteId, root, file.folderId);
    const library = { siteId, version, folders: ancestry, files: [file] };

    validateLibrary(library);
    const record = fileRecord(library, file);
    const names = [...new Set([record.nameKey, ...record.publicPathKeys.map((key) => key.split('/').at(-1)!)])];
    const change = { fileIds: [file.fileId], removedPaths: [] };
    const staged = { fileId: file.fileId, entry: record, promoted: false };
    const journal = { _id: siteId, siteId, version, change, garbage: [], staged };

    for (let attempt = 0; attempt < (expectedVersion === undefined ? 12 : 1); attempt++) {
      if (expectedVersion === undefined) {
        await this.reconcile(siteId);
      }

      const current = await this.locate(siteId, file.fileId).catch((error: unknown) => {
        if (error instanceof BusinessError && error.code === BusinessErrorCode.StaleWrite) {
          return null;
        }
        throw error;
      });

      if (current) {
        return current;
      }
      if (
        await this.writeEntry(siteId, version, async (session) => {
          if (await this.records.files.exists({ siteId, fileId: file.fileId }).session(session)) {
            throw new BusinessError(BusinessErrorCode.StaleWrite, 'This upload already has a file');
          }

          await this.checkClaims(siteId, root, file.folderId, record.scopePath, names, undefined, session);
        }, journal, expectedVersion)
      ) {
        await this.completeStaged(library);

        return { version, file, ancestry };
      }
    }

    throw new BusinessError(BusinessErrorCode.StaleWrite, 'Media library changed during upload');
  }

  async ensureFolder(siteId: string, folder: IMediaFolder, version: string, expectedVersion?: string):
  Promise<IMediaFolder> {
    const root = folder.root ?? MediaRoot.Images;
    const ancestry = await this.destination(siteId, root, folder.parentId);
    const library = { siteId, version, folders: [...ancestry, folder], files: [] };

    validateLibrary(library);
    const record = folderRecord(library, folder);
    const scope = { siteId, root, parentId: folder.parentId, nameKey: record.nameKey };
    const relative = [root, record.scopePath, record.nameKey].filter(Boolean).join('/');

    for (let attempt = 0; attempt < (expectedVersion === undefined ? 12 : 1); attempt++) {
      if (expectedVersion === undefined) {
        await this.reconcile(siteId);
      }

      const existing = await this.records.folders.findOne(scope).lean().exec();

      if (existing) {
        if (expectedVersion !== undefined) {
          throw new BusinessError(BusinessErrorCode.Conflict, 'Folder name is already in use');
        }

        return mediaFolder(existing);
      }
      if (
        await this.writeEntry(siteId, version, async (session) => {
          if (await this.records.folders.exists(scope).session(session)) {
            throw new BusinessError(BusinessErrorCode.StaleWrite, 'This folder already exists');
          }
          if (
            await this.records.files.exists({
              siteId,
              root,
              folderId: folder.parentId,
              $or: [
                { nameKey: record.nameKey }, { publicPathKeys: relative },
              ],
            }).session(session)
          ) {
            throw new BusinessError(BusinessErrorCode.Conflict, 'File name is already in use');
          }
          await this.records.folders.create([record], { session });
        }, undefined, expectedVersion)
      ) {
        return folder;
      }
    }

    throw new BusinessError(BusinessErrorCode.StaleWrite, 'Media library changed during folder creation');
  }

  private async writeEntry(siteId: string, version: string, write: (session: ClientSession) => Promise<void>,
    journal?: IMediaOperationRecord, expectedVersion?: string): Promise<boolean> {
    const scope = { _id: siteId, siteId };
    const head = await this.model.findOne(scope).lean().exec();

    if (head?.pending || expectedVersion !== undefined && (head?.version ?? '0') !== expectedVersion) {
      return false;
    }

    try {
      let committed = false;

      await this.transaction(async (session) => {
        committed = false;
        const result = await this.model.updateOne({ ...scope, version: head?.version ?? '0', pending: false },
          { $set: { version, pending: !!journal } }, { session, upsert: !head }).exec();

        if (!result.matchedCount && !result.upsertedCount) {
          return;
        }
        await write(session);

        if (journal) {
          await this.records.operations.create([journal], { session });
        }
        committed = true;
      });

      return committed;
    } catch (error) {
      if (error instanceof BusinessError && error.code === BusinessErrorCode.StaleWrite) {
        return false;
      }
      if (error instanceof Error && 'code' in error && error.code === 11000) {
        const current = await this.model.findOne(scope).lean().exec();

        if (head?.version !== current?.version) {
          return false;
        }
        throw new BusinessError(BusinessErrorCode.Conflict, 'File or folder name is already in use');
      }
      throw error;
    }
  }

  async publicOutput(siteId: string, path: string): ReturnType<IMediaLibraryStore['publicOutput']> {
    const file = await this.records.files.findOne({ siteId, publicPathKeys: nameKey(path) }).lean().exec();
    const output = file?.outputs[file.publicPaths.indexOf(path)];

    return file && output ? { image: file.image, output } : null;
  }

  async reconcile(siteId: string): Promise<void> {
    const scope = { _id: siteId, siteId, pending: true };
    const head = await this.model.findOne(scope).lean().exec();

    if (!head) {
      return;
    }

    const operation = await this.records.operations.findOne({ _id: siteId, siteId, version: head.version })
      .lean().exec();

    if (!operation) {
      // Another writer can finish this operation between reading the head and its journal.
      if (await this.model.exists({ ...scope, version: head.version })) {
        throw new Error('Missing pending media operation');
      }

      return;
    }
    if (!operation.change) {
      const { library, pending } = await this.read(siteId);

      if (pending && library.version === head.version) {
        await this.finish(library);
      }

      return;
    }

    const files = operation.staged ? operation.staged.entry ? [operation.staged.entry] : []
      : await this.records.files.find({ siteId, fileId: { $in: operation.change.fileIds } }).lean().exec();
    const ancestors = new Map<string, IMediaFolder>();

    for (const file of files) {
      await this.ancestors(siteId, file.root, file.folderId, ancestors);
    }
    await this.finish({
      siteId, version: head.version, files: files.map(mediaFile), folders: [...ancestors.values()],
    });
  }

  private async transaction(work: (session: ClientSession) => Promise<void>): Promise<void> {
    const session = await this.model.db.startSession();

    try {
      await session.withTransaction(() => work(session), { writeConcern: { w: 'majority' } });
    } finally {
      await session.endSession();
    }
  }

  private async finish(library: IMediaLibrary): Promise<void> {
    const { siteId, version } = library;
    const scope = { _id: siteId, siteId, version };
    const operation = await this.records.operations.findOne(scope).lean().exec();

    if (!operation) {
      if (await this.model.exists({ ...scope, pending: true })) {
        throw new Error('Missing pending media operation');
      }

      return;
    }

    const isCurrent = async (): Promise<boolean> => Boolean(await this.model.exists({ ...scope, pending: true }));

    if (!operation.staged?.promoted) {
      const installed = operation.change
        ? await this.projection.installChange(library, operation.change, isCurrent)
        : await this.projection.install(library, isCurrent);

      if (!installed) {
        return;
      }
      if (operation.staged) {
        await this.promote(operation);
      }
    }

    for (const image of operation.garbage) {
      await this.removal.remove(new Asset(image).toState());
    }
    await this.transaction(async (session) => {
      const result = await this.model.updateOne({ ...scope, pending: true },
        { $set: { pending: false } }, { session }).exec();

      if (result.matchedCount) {
        await this.records.operations.deleteOne(scope, { session }).exec();
      }
    });
  }

  private async promote({ _id, siteId, version, staged }: IMediaOperationRecord): Promise<void> {
    if (!staged) {
      return;
    }
    await this.transaction(async (session) => {
      const result = await this.records.operations.updateOne({ _id, siteId, version, 'staged.promoted': false },
        { $set: { 'staged.promoted': true } }, { session }).exec();

      if (result.matchedCount) {
        const scope = { siteId, fileId: staged.fileId };

        if (staged.entry) {
          await this.records.files.replaceOne(scope, staged.entry, { session, upsert: true }).exec();
        } else {
          await this.records.files.deleteOne(scope, { session }).exec();
        }
      }
    });
  }
}
