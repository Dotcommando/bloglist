import type {
  ImageUploadMode, IMediaLibraryView, IMediaUsage, MediaRoot,
} from '../../../domain/media/file-library.js';
import type { IBinaryContent } from '../../../domain/shared/binary-content.js';

export interface ILibraryScope { readonly siteId: string; }

export interface ILibraryChange extends ILibraryScope { readonly expectedVersion: string; }

export interface ILibraryFile extends ILibraryChange { readonly fileId: string; }

export interface ILibraryUpload extends ILibraryChange {
  readonly filename: string;
  readonly folderId: string | null;
  readonly mode: ImageUploadMode;
  readonly content: IBinaryContent;
}

export interface ILibraryReview {
  readonly version: string;
  readonly usages: readonly IMediaUsage[];
}

export type ILibraryDelete = (ILibraryFile & { readonly force: false })
  | (ILibraryScope & { readonly fileId: string; readonly force: true; readonly expectedVersion?: string });

export interface IFileLibraryOperations {
  readonly readContent: { execute(input: ILibraryScope & { readonly fileId: string; readonly key: string }): Promise<{
    readonly content: IBinaryContent; readonly filename: string;
  }> };
  readonly list: { execute(input: ILibraryScope): Promise<IMediaLibraryView> };
  readonly createFolder: { execute(input: ILibraryChange & { readonly parentId: string | null;
    readonly name: string;
    readonly root?: MediaRoot }): Promise<IMediaLibraryView> };
  readonly upload: { execute(input: ILibraryUpload): Promise<IMediaLibraryView> };
  readonly changeImage: { execute(input: ILibraryFile & { readonly filename: string;
    readonly content: IBinaryContent }): Promise<IMediaLibraryView> };
  readonly move: { execute(input: ILibraryFile & { readonly folderId: string | null;
    readonly name: string;
    readonly updateReferences?: boolean }): Promise<IMediaLibraryView> };
  readonly usages: { execute(input: ILibraryFile): Promise<ILibraryReview> };
  readonly delete: { execute(input: ILibraryDelete): Promise<IMediaLibraryView> };
  readonly reconcile: { execute(input: ILibraryScope): Promise<IMediaLibraryView> };
}
