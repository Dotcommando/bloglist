import { type Mock } from 'vitest';

import { FileLibraryService } from '../../src/app/services/media/file-library.service.js';
import { AssetProcessingState, AssetVisibility, type IAssetState } from '../../src/domain/media/asset.js';
import {
  ImageUploadMode,
  type IMediaFile,
  type IMediaLibrary,
  type IMediaUsage,
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
    read: vi.fn(async () => ({ library: structuredClone(current), pending: false })),
    commit: vi.fn(async (next, expected) => {
      if (current.version !== expected) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'stale');
      }
      current = structuredClone(next);
    }),
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
