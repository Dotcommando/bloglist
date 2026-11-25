import type { IAssetState } from '../../../domain/media/asset.js';
import type {
  IMediaFile, IMediaFileView, IMediaFolder, IMediaLibrary, IMediaPublicFile, IMediaUsage, MediaRoot,
} from '../../../domain/media/file-library.js';
import type { IMediaBrowsePage, IMediaBrowseQuery, IMediaLocatedFile } from '../../../domain/media/media-browser.js';

export interface IMediaLibraryStore {
  read(siteId: string): Promise<{ readonly library: IMediaLibrary; readonly pending: boolean }>;
  browse(query: IMediaBrowseQuery): Promise<IMediaBrowsePage>;
  locate(siteId: string, fileId: string): Promise<IMediaLocatedFile | null>;
  metadata(siteId: string, fileIds: readonly string[], publicPath: string): Promise<readonly (IMediaFileView | null)[]>;
  status(siteId: string): Promise<{ readonly version: string; readonly pending: boolean }>;
  folder(siteId: string, folderId: string): Promise<IMediaFolder | null>;
  checkName(siteId: string, root: MediaRoot, folderId: string | null, name: string): Promise<void>;
  discard(image: IAssetState): Promise<void>;
  append(siteId: string, file: IMediaFile, version: string, expectedVersion?: string): Promise<IMediaLocatedFile>;
  ensureFolder(siteId: string, folder: IMediaFolder, version: string, expectedVersion?: string): Promise<IMediaFolder>;
  changeFile(siteId: string, before: IMediaLocatedFile, file: IMediaFile | null, version: string, force?: boolean):
  Promise<IMediaLocatedFile | null>;
  withReferenceUpdate?(siteId: string, fileId: string,
    action: (file: IMediaLocatedFile) => Promise<boolean>): Promise<void>;
  pathOwner?(siteId: string, path: string): Promise<string | null>;
  publicOutput(siteId: string, path: string): Promise<{
    readonly image: IAssetState;
    readonly output: IMediaPublicFile;
  } | null>;
  /** Explicitly finish a journaled filesystem projection; never reprocess an image. */
  reconcile(siteId: string): Promise<void>;
}

export interface IMediaProjectionChange {
  readonly fileIds: readonly string[];
  readonly removedPaths: readonly string[];
}

export interface IMediaLibraryProjection {
  withSiteWrite?<T>(siteId: string, action: () => Promise<T>): Promise<T>;
  /** Check the pending version under the writer lock; false leaves named output unchanged. */
  install(library: IMediaLibrary, isCurrent: () => Promise<boolean>): Promise<boolean>;
  /** Apply only the desired outputs and obsolete paths recorded by the committed version. */
  installChange(library: IMediaLibrary, change: IMediaProjectionChange,
    isCurrent: () => Promise<boolean>): Promise<boolean>;
}

export interface IMediaImageRemoval {
  remove(image: IAssetState): Promise<void>;
}

export interface IMediaLibraryAccess {
  requireEditor(siteId: string): Promise<void>;
  actorId(): Promise<string>;
}

export interface IMediaLibraryValues {
  nextId(): string;
  readonly publicPath: string;
}

export interface IMediaUsages {
  find(siteId: string, paths: readonly string[], fileId?: string): Promise<readonly IMediaUsage[]>;
}

export interface IMediaReferenceSource extends IMediaUsage {
  readonly fileIds?: readonly string[];
  readonly text: string;
}

export interface IMediaReferenceSources {
  read(siteId: string): Promise<readonly IMediaReferenceSource[]>;
}

