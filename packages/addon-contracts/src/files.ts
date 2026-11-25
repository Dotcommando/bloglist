import type { ICmsfileslistResultitemsItem184 } from './cms.js';

export type MediaRoot = 'images' | 'files';

export type MediaSort = 'name' | 'created' | 'updated' | 'type' | 'size';

export interface ICmsFile extends ICmsfileslistResultitemsItem184 {
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly assetVersion?: string;
}

export interface ICmsMediaFolder {
  readonly folderId: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly root?: MediaRoot;
}

export interface ICmsBrowseMedia {
  readonly root: MediaRoot;
  readonly folderId: string | null;
  readonly search: string;
  readonly recursive: boolean;
  readonly sort: MediaSort;
  readonly descending: boolean;
  readonly page: number;
  readonly pageSize: number;
  readonly mimeTypes?: readonly string[];
}

export interface ICmsMediaPage {
  readonly version: string;
  readonly pending: boolean;
  readonly total: number;
  readonly folderTotal: number;
  readonly fileTotal: number;
  readonly folders: readonly ICmsMediaFolder[];
  readonly files: readonly ICmsFile[];
  readonly breadcrumbs: readonly ICmsMediaFolder[];
  readonly paths: Readonly<Record<string, string>>;
}

export interface ICmsStreamMediaUpload {
  readonly filename: string;
  readonly folderId: string | null;
  readonly mode: 'Original' | 'Responsive';
  readonly idempotencyKey: string;
  readonly content: {
    readonly mimeType: string;
    readonly byteSize: number;
    readonly bytes: AsyncIterable<Uint8Array>;
  };
}

export type CmsStreamMediaResult = { readonly ok: true; readonly file: ICmsFile }
  | { readonly ok: false; readonly code: string };

export interface ICmsProgrammaticFiles {
  browse(input: ICmsBrowseMedia): Promise<ICmsMediaPage>;
  getFile(input: { readonly fileId: string }): Promise<ICmsFile>;
  getFiles(input: { readonly fileIds: readonly string[] }): Promise<readonly (ICmsFile | null)[]>;
  ensureFolder(input: {
    readonly name: string;
    readonly parentId: string | null;
    readonly root: MediaRoot;
  }): Promise<ICmsMediaFolder>;
  uploadFile(input: ICmsStreamMediaUpload): Promise<ICmsFile>;
  uploadBatch(input: { readonly files: readonly ICmsStreamMediaUpload[] }): Promise<readonly CmsStreamMediaResult[]>;
}
