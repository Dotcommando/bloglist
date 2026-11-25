import {
  fileRequirement, ImageUploadMode, type IMediaFileView, type IMediaFolder, libraryView, mediaFilenameRoot,
  MediaRoot, validateMediaName,
} from '../../../domain/media/file-library.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type {
  IProgrammaticFiles, IStreamMediaUpload, MediaUploadResult,
} from '../../../ports/inbound/media/file-library.port.js';
import type {
  IMediaLibraryAccess, IMediaLibraryStore, IMediaLibraryValues,
} from '../../../ports/outbound/media/file-library.port.js';
import { discardRejectedMedia } from './file-library.service.js';
import type { PrepareLibraryImageService } from './prepare-library-image.service.js';

export class ProgrammaticFilesService {
  constructor(private readonly store: IMediaLibraryStore, private readonly access: IMediaLibraryAccess,
    private readonly values: IMediaLibraryValues, private readonly prepare: PrepareLibraryImageService,
    private readonly uploadIdentity: (siteId: string, actorId: string, key: string) => string) {}

  async ensureFolder(input: Parameters<IProgrammaticFiles['ensureFolder']['execute']>[0]): Promise<IMediaFolder> {
    await this.access.requireEditor(input.siteId);
    validateMediaName(input.name, true);
    this.folder(input.parentId);
    fileRequirement(Object.values(MediaRoot).includes(input.root), 'Invalid media root');

    return this.store.ensureFolder(input.siteId, {
      folderId: this.values.nextId(),
      parentId: input.parentId,
      root: input.root,
      name: input.name,
    }, this.values.nextId());
  }

  async uploadFile(input: IStreamMediaUpload): Promise<IMediaFileView> {
    const { siteId, folderId, filename, mode, idempotencyKey } = input;

    await this.access.requireEditor(siteId);
    validateMediaName(filename);
    this.folder(folderId);
    fileRequirement(Object.values(ImageUploadMode).includes(mode), 'Invalid upload mode');
    fileRequirement(typeof idempotencyKey === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(idempotencyKey),
      'Invalid media upload idempotency key');
    await this.store.reconcile(siteId);
    const fileId = this.uploadIdentity(siteId, await this.access.actorId(), idempotencyKey);
    const previous = await this.store.locate(siteId, fileId);
    let result = previous;

    if (!result) {
      try {
        await this.store.checkName(siteId, mediaFilenameRoot(filename), folderId, filename);
      } catch (error) {
        if (!(error instanceof BusinessError) || error.code !== BusinessErrorCode.Conflict) {
          throw error;
        }
        result = await this.store.locate(siteId, fileId);

        if (!result) {
          throw error;
        }
      }
    }
    if (!result) {
      const content = input.content;

      fileRequirement(content && Number.isSafeInteger(content.byteSize) && content.byteSize > 0
        && typeof content.mimeType === 'string' && typeof content.bytes?.[Symbol.asyncIterator] === 'function',
      'Expected a streamed file');
      const prepared = await this.prepare.prepare(input);

      try {
        result = await this.store.append(siteId, {
          ...prepared,
          fileId,
          name: filename,
          folderId,
          mode: prepared.image.mimeType.startsWith('image/') ? mode : ImageUploadMode.Original,
          previousPaths: [],
        }, this.values.nextId());
      } catch (error) {
        return discardRejectedMedia(this.store, prepared.image, error);
      }

      if (result.file.image.assetVersion !== prepared.image.assetVersion) {
        await this.store.discard(prepared.image);
      }
    }

    return libraryView({ siteId, version: result.version, folders: result.ancestry, files: [result.file] },
      this.values.publicPath, false).files[0]!;
  }

  async uploadBatch({ siteId, files }: Parameters<IProgrammaticFiles['uploadBatch']['execute']>[0]):
  Promise<readonly MediaUploadResult[]> {
    await this.access.requireEditor(siteId);
    fileRequirement(Array.isArray(files) && files.length > 0 && files.length <= 25, 'Invalid media batch size');
    const results: MediaUploadResult[] = [];

    for (let offset = 0; offset < files.length; offset += 4) {
      const batch = files.slice(offset, offset + 4);

      results.push(...await Promise.all(batch.map(async (file): Promise<MediaUploadResult> => {
        try {
          return { ok: true, file: await this.uploadFile({ ...file, siteId }) };
        } catch (error) {
          return { ok: false, code: error instanceof BusinessError ? error.code : 'Internal' };
        }
      })));
    }

    return results;
  }

  private folder(folderId: string | null): void {
    fileRequirement(
      folderId === null || typeof folderId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(folderId),
      'Invalid media folder identity',
    );
  }
}
