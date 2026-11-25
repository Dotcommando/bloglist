import { fileRequirement, folderPath, libraryView, MediaRoot } from '../../../domain/media/file-library.js';
import { type IMediaBrowseQuery, type IMediaBrowseView, MediaSortField } from '../../../domain/media/media-browser.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IFileLibraryOperations } from '../../../ports/inbound/media/file-library.port.js';
import type {
  IMediaLibraryAccess, IMediaLibraryStore, IMediaLibraryValues,
} from '../../../ports/outbound/media/file-library.port.js';

export class BrowseMediaFolderUseCase {
  constructor(private readonly store: IMediaLibraryStore,
    private readonly access: Pick<IMediaLibraryAccess, 'requireEditor'>,
    private readonly values: IMediaLibraryValues,
    private readonly siteTimeZone?: (siteId: string) => Promise<string>) {}

  async execute(input: IMediaBrowseQuery): Promise<IMediaBrowseView> {
    await this.access.requireEditor(input.siteId);
    fileRequirement(input.folderId === null || typeof input.folderId === 'string'
      && /^[A-Za-z0-9_-]{1,128}$/.test(input.folderId), 'Invalid media folder identity');
    fileRequirement(typeof input.recursive === 'boolean' && typeof input.descending === 'boolean',
      'Invalid media browse flags');
    fileRequirement(Object.values(MediaRoot).includes(input.root), 'Invalid media root');
    fileRequirement(Object.values(MediaSortField).includes(input.sort), 'Invalid media sort');
    fileRequirement(Number.isSafeInteger(input.page) && input.page >= 1 && input.page <= 100_000, 'Invalid page');
    fileRequirement(Number.isSafeInteger(input.pageSize) && input.pageSize >= 1 && input.pageSize <= 100,
      'Invalid page size');
    fileRequirement(typeof input.search === 'string' && input.search.length <= 180, 'Invalid media search');
    fileRequirement(input.mimeTypes === undefined || Array.isArray(input.mimeTypes) && input.mimeTypes.length <= 16
      && input.mimeTypes.every((type) => typeof type === 'string' && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(type)
        && type.length <= 100), 'Invalid media types');
    const { version, pending, total, folderTotal, fileTotal, folders, files, ancestry, breadcrumbs } =
      await this.store.browse(input);
    const library = { siteId: input.siteId, version, folders: ancestry, files };
    const view = libraryView(library, this.values.publicPath, pending);
    const paths = Object.fromEntries([
      ...folders.map((folder) => [folder.folderId, folderPath(library, folder.parentId).join('/')]),
      ...files.map((file) => [file.fileId, folderPath(library, file.folderId).join('/')]),
    ]);
    const timeZone = await this.siteTimeZone?.(input.siteId);

    return {
      version,
      pending,
      total,
      folderTotal,
      fileTotal,
      folders,
      files: view.files,
      breadcrumbs,
      paths,
      ...(timeZone ? { timeZone } : {}),
    };
  }

  async file({ siteId, fileId }: { siteId: string; fileId: string }):
  ReturnType<IFileLibraryOperations['browse']['file']> {
    await this.access.requireEditor(siteId);
    fileRequirement(typeof fileId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(fileId), 'Invalid media file identity');
    const [file] = await this.store.metadata(siteId, [fileId], this.values.publicPath);

    if (!file) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Media file not found');
    }

    return file;
  }
}
