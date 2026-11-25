import type {
  ImageUploadMode, IMediaFileView, IMediaFolder, IMediaLibraryView, IMediaUsage, MediaRoot,
} from '../../../domain/media/file-library.js';
import type { IMediaBrowseQuery, IMediaBrowseView } from '../../../domain/media/media-browser.js';
import type { IBinaryContent } from '../../../domain/shared/binary-content.js';

export interface ILibraryScope { readonly siteId: string; }

export interface ILibraryChange extends ILibraryScope { readonly expectedVersion: string; }

export interface ILibraryFile extends ILibraryChange {
  readonly fileId: string;
  readonly expectedFileVersion?: string;
}

export interface ILibraryUpload extends ILibraryChange {
  readonly filename: string;
  readonly folderId: string | null;
  readonly mode: ImageUploadMode;
  readonly content: IBinaryContent;
  readonly mimeTypes?: readonly string[];
}

export interface ILibraryReview {
  readonly version: string;
  readonly usages: readonly IMediaUsage[];
}

export interface IStreamMediaUpload extends Omit<ILibraryUpload, 'expectedVersion' | 'mimeTypes'> {
  readonly idempotencyKey: string;
}

export type MediaUploadResult = { readonly ok: true; readonly file: IMediaFileView }
  | { readonly ok: false; readonly code: string };

export interface IProgrammaticFiles {
  readonly ensureFolder: { execute(input: ILibraryScope & { readonly parentId: string | null;
    readonly root: MediaRoot;
    readonly name: string }): Promise<IMediaFolder> };
  readonly uploadFile: { execute(input: IStreamMediaUpload): Promise<IMediaFileView> };
  readonly uploadBatch: {
    execute(input: ILibraryScope & { readonly files: readonly Omit<IStreamMediaUpload, 'siteId'>[] }):
    Promise<readonly MediaUploadResult[]>;
  };
}

export type ILibraryDelete = (ILibraryFile & { readonly force: false })
  | (ILibraryScope & { readonly fileId: string; readonly force: true; readonly expectedVersion?: string });

export interface IFileLibraryOperations {
  readonly readContent: { execute(input: ILibraryScope & { readonly fileId: string; readonly key: string }): Promise<{
    readonly content: IBinaryContent; readonly filename: string;
  }> };
  readonly list: { execute(input: ILibraryScope): Promise<IMediaLibraryView> };
  readonly browse: {
    execute(input: IMediaBrowseQuery): Promise<IMediaBrowseView>;
    file(input: ILibraryScope & { readonly fileId: string }): Promise<IMediaFileView>;
  };
  readonly createFolder: { execute(input: ILibraryChange & { readonly parentId: string | null;
    readonly name: string;
    readonly root?: MediaRoot }): Promise<IMediaLibraryView> };
  readonly upload: { execute(input: ILibraryUpload): Promise<IMediaLibraryView> };
  readonly changeImage: { execute(input: ILibraryFile & { readonly filename: string;
    readonly content: IBinaryContent }): Promise<IMediaLibraryView> };
  readonly move: {
    execute(input: ILibraryFile & {
      readonly folderId: string | null;
      readonly name: string;
      readonly updateReferences?: boolean;
    }): Promise<IMediaLibraryView>;
    retry?(input: ILibraryScope & { readonly fileId: string }): Promise<IMediaLibraryView>;
  };
  readonly usages: { execute(input: ILibraryFile): Promise<ILibraryReview> };
  readonly delete: { execute(input: ILibraryDelete): Promise<IMediaLibraryView> };
  readonly reconcile: { execute(input: ILibraryScope): Promise<IMediaLibraryView> };
}
