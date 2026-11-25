import {
  folderPath, type IMediaFile, type IMediaFolder, type IMediaLibrary, mediaPathInFolder, MediaRoot, mediaRoot,
} from '../../../domain/media/file-library.js';

export interface IMediaFolderRecord extends IMediaFolder {
  readonly _id: string;
  readonly siteId: string;
  readonly root: MediaRoot;
  readonly nameKey: string;
  readonly scopePath: string;
}

export interface IMediaFileRecord extends IMediaFile {
  readonly _id: string;
  readonly siteId: string;
  readonly root: MediaRoot;
  readonly nameKey: string;
  readonly scopePath: string;
  readonly publicPaths: readonly string[];
  readonly publicPathKeys: readonly string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function nameKey(value: string): string {
  return value.normalize('NFC').toLowerCase();
}

export function folderRecord(library: IMediaLibrary, folder: IMediaFolder,
  parent: readonly string[] = folderPath(library, folder.parentId)): IMediaFolderRecord {
  const { siteId } = library;

  return {
    ...folder,
    _id: JSON.stringify([siteId, folder.folderId]),
    siteId,
    root: folder.root ?? MediaRoot.Images,
    nameKey: nameKey(folder.name),
    scopePath: nameKey(parent.join('/')),
  };
}

export function fileRecord(library: IMediaLibrary, file: IMediaFile,
  parent: readonly string[] = folderPath(library, file.folderId)): IMediaFileRecord {
  const root = mediaRoot(file);
  const publicPaths = file.outputs.map((output) => root + '/' + mediaPathInFolder(parent, file, output.suffix));

  return {
    ...file,
    _id: JSON.stringify([library.siteId, file.fileId]),
    siteId: library.siteId,
    root,
    nameKey: nameKey(file.name),
    scopePath: nameKey(parent.join('/')),
    publicPaths,
    publicPathKeys: publicPaths.map(nameKey),
    createdAt: file.createdAt ?? file.image.createdAt,
    updatedAt: file.updatedAt ?? file.image.updatedAt,
  };
}
