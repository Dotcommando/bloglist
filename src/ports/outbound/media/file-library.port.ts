import type { IAssetState } from '../../../domain/media/asset.js';
import type { IMediaLibrary, IMediaUsage } from '../../../domain/media/file-library.js';

export interface IMediaLibraryStore {
  read(siteId: string): Promise<{ readonly library: IMediaLibrary; readonly pending: boolean }>;
  /** Guard the catalog version, journal desired output, install it and acknowledge. */
  commit(library: IMediaLibrary, expectedVersion: string): Promise<void>;
  /** Explicitly finish a journaled filesystem projection; never reprocess an image. */
  reconcile(siteId: string): Promise<void>;
}

export interface IMediaLibraryProjection {
  /** Check the pending version under the writer lock; false leaves named output unchanged. */
  install(library: IMediaLibrary, isCurrent: () => Promise<boolean>): Promise<boolean>;
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

