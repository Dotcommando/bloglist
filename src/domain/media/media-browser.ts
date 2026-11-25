import type { IMediaFile, IMediaFileView, IMediaFolder, MediaRoot } from './file-library.js';

export enum MediaSortField {
  Name = 'name',
  Created = 'created',
  Updated = 'updated',
  Type = 'type',
  Size = 'size',
}

export interface IMediaBrowseQuery {
  readonly siteId: string;
  readonly root: MediaRoot;
  readonly folderId: string | null;
  readonly search: string;
  readonly recursive: boolean;
  readonly sort: MediaSortField;
  readonly descending: boolean;
  readonly page: number;
  readonly pageSize: number;
  readonly mimeTypes?: readonly string[];
  readonly foldersOnly?: boolean;
}

export interface IMediaBrowsePage {
  readonly version: string;
  readonly pending: boolean;
  readonly total: number;
  readonly folderTotal: number;
  readonly fileTotal: number;
  readonly folders: readonly IMediaFolder[];
  readonly files: readonly IMediaFile[];
  readonly ancestry: readonly IMediaFolder[];
  readonly breadcrumbs: readonly IMediaFolder[];
}

export interface IMediaBrowseView extends Omit<IMediaBrowsePage, 'files' | 'ancestry'> {
  readonly files: readonly IMediaFileView[];
  readonly paths: Readonly<Record<string, string>>;
  readonly timeZone?: string;
}

export interface IMediaLocatedFile {
  readonly version: string;
  readonly file: IMediaFile;
  readonly ancestry: readonly IMediaFolder[];
  readonly guardFile?: boolean;
}
