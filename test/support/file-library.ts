import { type Mock } from 'vitest';

import { FileLibraryService } from '../../src/app/services/media/file-library.service.js';
import { AssetProcessingState, AssetVisibility, type IAssetState } from '../../src/domain/media/asset.js';
import {
  ImageUploadMode,
  type IMediaFile,
  type IMediaLibrary,
  type IMediaUsage,
  libraryView,
  mediaPath,
  mediaRoot,
  validateLibrary,
} from '../../src/domain/media/file-library.js';
import { BusinessError, BusinessErrorCode } from '../../src/domain/shared/business-error.js';
import type { IMediaLibraryStore } from '../../src/ports/outbound/media/file-library.port.js';

export function readyImageFixture(): IAssetState {
  return {
    siteId: 'site-1',
    assetId: 'asset',
    assetVersion: 'asset-v1',
    filename: 'photo.png',
    mimeType: 'image/png',
    mode: ImageUploadMode.Original,
    byteSize: 20,
    checksum: 'hash',
    original: { contentId: 'private/site-1/asset/asset-v1/original.png' },
    file: { contentId: 'private/site-1/asset/asset-v1/file.png' },
    visibility: AssetVisibility.Private,
    state: AssetProcessingState.Ready,
    failure: null,
    version: 'metadata-v1',
    createdAt: new Date('2026-10-27T00:00:00Z'),
    updatedAt: new Date('2026-10-27T00:00:00Z'),
    originalDimensions: { width: 20, height: 10, aspectRatio: 2 },
    profileVersion: null,
    variants: [],
    profileMappings: [],
  };
}

export function libraryFileFixture(): IMediaFile {
  const image = readyImageFixture();

  return {
    fileId: 'image',
    folderId: null,
    name: 'photo.png',
    mode: ImageUploadMode.Original,
    image,
    previousPaths: [],
    outputs: [{
      key: 'file',
      suffix: '',
      contentId: image.file!.contentId,
      mimeType: 'image/png',
      dimensions: image.originalDimensions!,
    }],
  };
}

export interface IFileLibraryFixture {
  readonly store: IMediaLibraryStore;
  readonly access: { readonly requireEditor: Mock<(siteId: string) => Promise<void>>; actorId(): Promise<string> };
  readonly usages: {
    readonly find: Mock<(siteId: string, paths: readonly string[]) => Promise<readonly IMediaUsage[]>>;
  };
  readonly service: FileLibraryService;
  set(value: IMediaLibrary): void;
  get(): IMediaLibrary;
}

export function fileLibraryFixture(): IFileLibraryFixture {
  let current: IMediaLibrary = { siteId: 'site-1', version: 'v1', folders: [], files: [] };
  let id = 1;
  const store: IMediaLibraryStore = {
    append: vi.fn(async (siteId, file, version, expected) => {
      if (expected !== undefined && current.version !== expected) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'stale');
      }

      const next = { siteId, version, folders: current.folders, files: [...current.files, file] };

      validateLibrary(next);
      current = next;

      return { version, file, ancestry: current.folders };
    }),
    ensureFolder: vi.fn(async (siteId, folder, version) => {
      const next = { ...current, siteId, version, folders: [...current.folders, folder] };

      validateLibrary(next);
      current = next;

      return folder;
    }),
    browse: vi.fn(),
    metadata: async (siteId, fileIds, publicPath) => {
      const results = siteId === current.siteId ? libraryView(current, publicPath, false).files : [];

      return fileIds.map((fileId) => results.find((file) => file.fileId === fileId) ?? null);
    },
    status: async () => ({ version: current.version, pending: false }),
    folder: async (siteId, id) =>
      siteId === current.siteId ? current.folders.find((folder) => folder.folderId === id) ?? null : null,
    checkName: vi.fn(),
    discard: vi.fn(),
    changeFile: vi.fn(async (siteId, before, file, version) => {
      if (current.version !== before.version) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'stale');
      }

      const files = current.files.flatMap((item) => item.fileId === before.file.fileId ? file ? [file] : [] : [item]);
      const next = { ...current, siteId, files, version };

      validateLibrary(next);
      current = next;

      return file ? { version, file, ancestry: current.folders } : null;
    }),
    withReferenceUpdate: async (siteId, fileId, action) => {
      const located = await store.locate(siteId, fileId);

      if (located && await action(located)) {
        const file = { ...located.file };

        delete file.pendingReferences;
        current = { ...current, files: current.files.map((item) => item.fileId === fileId ? file : item) };
      }
    },
    pathOwner: async (siteId, path) => siteId === current.siteId ? current.files.find((file) =>
      file.outputs.some((output) => mediaRoot(file) + '/' + mediaPath(current, file, output.suffix) === path))
      ?.fileId ?? null : null,
    locate: async (siteId, fileId) => {
      const file = siteId === current.siteId ? current.files.find((item) => item.fileId === fileId) : undefined;

      return file ? { version: current.version, file, ancestry: current.folders } : null;
    },
    read: vi.fn(async () => ({ library: structuredClone(current), pending: false })),
    publicOutput: async (siteId, path) => {
      if (siteId === current.siteId) {
        for (const file of current.files) {
          const output = file.outputs.find((output) => mediaRoot(file) + '/'
            + mediaPath(current, file, output.suffix) === path);

          if (output) {
            return { image: file.image, output };
          }
        }
      }

      return null;
    },
    reconcile: vi.fn(),
  };
  const access = { requireEditor: vi.fn<(siteId: string) => Promise<void>>(), actorId: async () => 'admin' };
  const usages = {
    find: vi.fn<(siteId: string, paths: readonly string[]) => Promise<readonly IMediaUsage[]>>(async () => []),
  };
  const service = new FileLibraryService(store, access, { nextId: () => 'id' + ++id, publicPath: '/media' }, usages);

  return {
    store,
    access,
    usages,
    service,
    set: (value: IMediaLibrary) => {
      current = value;
    },
    get: () => current,
  };
}
