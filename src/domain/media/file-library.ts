import { BusinessError, BusinessErrorCode } from '../shared/business-error.js';
import { Asset, AssetProcessingState, type IAssetState, type IImageDimensions } from './asset.js';
import { RESPONSIVE_IMAGE_PROFILES } from './image-profile.js';
import type { ImageUploadMode } from './image-upload-mode.enum.js';
import { MediaValidationError, MediaValidationIssue } from './media-validation.error.js';

export { ImageUploadMode } from './image-upload-mode.enum.js';

export enum MediaUsageGroup { Content = 'Content', OpenGraph = 'OpenGraph', Templates = 'Templates' }

export enum MediaRoot { Images = 'images', Files = 'files' }

export function mediaRoot(file: Pick<IMediaFile, 'image'>): MediaRoot {
  return file.image.mimeType.startsWith('image/') ? MediaRoot.Images : MediaRoot.Files;
}

export function mediaFilenameRoot(filename: string): MediaRoot {
  return /\.(?:jpe?g|png|webp|avif|svg|ico)$/i.test(filename) ? MediaRoot.Images : MediaRoot.Files;
}

export interface IMediaFolder {
  readonly root?: MediaRoot;
  readonly folderId: string;
  readonly parentId: string | null;
  readonly name: string;
}

export interface IMediaPublicFile {
  readonly key: string;
  readonly suffix: string;
  readonly mimeType: string;
  readonly dimensions: IImageDimensions | null;
  readonly contentId: string;
}

export interface IMediaFile {
  readonly fileId: string;
  readonly folderId: string | null;
  readonly name: string;
  readonly mode: ImageUploadMode;
  readonly image: IAssetState;
  readonly outputs: readonly IMediaPublicFile[];
  readonly previousPaths: readonly string[];
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
  readonly revision?: string;
  readonly pendingReferences?: readonly { readonly from: string; readonly key: string }[];
}

export function mediaFileRevision(file: IMediaFile): string {
  return file.revision ?? file.image.assetVersion + ':' + (file.updatedAt ?? file.image.updatedAt).toISOString();
}

export interface IMediaLibrary {
  readonly siteId: string;
  readonly version: string;
  readonly folders: readonly IMediaFolder[];
  readonly files: readonly IMediaFile[];
}

export enum MediaUsageTargetKind {
  Addon = 'Addon',
  TemplateVariable = 'TemplateVariable',
  Page = 'Page',
  Template = 'Template',
  Chunk = 'Chunk',
  Snippet = 'Snippet',
  Site = 'Site',
}

export interface IMediaUsageTarget {
  readonly kind: MediaUsageTargetKind;
  readonly id: string;
}

export interface IMediaUsage {
  readonly group: MediaUsageGroup;
  readonly title: string;
  readonly field: string;
  readonly target: IMediaUsageTarget;
  readonly state: string;
}

export interface IMediaFileView {
  readonly hasVariants: boolean;
  readonly fileId: string;
  readonly folderId: string | null;
  readonly name: string;
  readonly mode: ImageUploadMode;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly assetVersion?: string;
  readonly revision?: string;
  readonly referencesPending?: boolean;
  readonly originalDimensions: IImageDimensions | null;
  readonly outputs: readonly { readonly key: string;
    readonly url: string;
    readonly byteSize: number;
    readonly mimeType: string;
    readonly dimensions: IImageDimensions | null }[];
}

export interface IMediaLibraryView {
  readonly version: string;
  readonly folders: readonly IMediaFolder[];
  readonly files: readonly IMediaFileView[];
  readonly pending: boolean;
  readonly referenceUpdate?: 'Pending' | 'AddressInUse';
}

export function fileRequirement(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new BusinessError(BusinessErrorCode.Validation, message);
  }
}

export function validateMediaName(value: string, folder = false): void {
  if (typeof value === 'string' && value.length > 180) {
    throw new MediaValidationError(MediaValidationIssue.NameTooLong);
  }

  const allowed = /^[\p{L}\p{N}][\p{L}\p{N} ()._-]*$/u;

  if (
    typeof value !== 'string'
    || !value.length
    || value !== value.trim()
    || !allowed.test(value)
    || value.endsWith('.')
    || value.includes('..')
    || !folder
    && !/\.[A-Za-z0-9]+$/.test(value)
  ) {
    throw new MediaValidationError(MediaValidationIssue.InvalidName);
  }
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) {
    throw new MediaValidationError(MediaValidationIssue.ReservedName);
  }
}

export function folderPath(library: Pick<IMediaLibrary, 'folders'>, folderId: string | null): string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  let id = folderId;

  while (id !== null) {
    const folder = library.folders.find((item) => item.folderId === id);

    fileRequirement(folder && !visited.has(id), 'Missing or cyclic media folder');
    visited.add(id);
    result.unshift(folder.name);
    id = folder.parentId;
  }

  return result;
}

export function mediaPath(library: Pick<IMediaLibrary, 'folders'>, file: IMediaFile, suffix: string): string {
  return mediaPathInFolder(folderPath(library, file.folderId), file, suffix);
}

export function mediaPathInFolder(folder: readonly string[], file: IMediaFile, suffix: string): string {
  const stem = file.name.replace(/\.[^.]+$/, '');
  const filename = suffix === '' ? file.name : stem + suffix;

  return [...folder, filename].join('/');
}

export function indexFolderPaths(folders: readonly IMediaFolder[]):
(folderId: string | null) => readonly string[] {
  const byId = new Map(folders.map((folder) => [folder.folderId, folder]));
  const cached = new Map<string | null, readonly string[]>([[null, []]]);

  return (folderId) => {
    const pending: IMediaFolder[] = [];
    const visited = new Set<string>();
    let id = folderId;

    while (id !== null && !cached.has(id)) {
      const folder = byId.get(id);

      fileRequirement(folder && !visited.has(id), 'Missing or cyclic media folder');
      pending.push(folder);
      visited.add(id);
      id = folder.parentId;
    }
    let resolved = cached.get(id)!;

    for (const folder of pending.reverse()) {
      resolved = [...resolved, folder.name];
      cached.set(folder.folderId, resolved);
    }

    return resolved;
  };
}

export function validateLibrary(library: IMediaLibrary): void {
  fileRequirement(/^[A-Za-z0-9_-]{1,128}$/.test(library.siteId), 'Invalid site identity');
  fileRequirement(new Set(library.folders.map((folder) => folder.folderId)).size === library.folders.length,
    'Duplicate folder identity');
  fileRequirement(new Set(library.files.map((file) => file.fileId)).size === library.files.length,
    'Duplicate file identity');
  const folders = new Map(library.folders.map((folder) => [folder.folderId, folder]));
  const path = indexFolderPaths(library.folders);
  const paths = new Set<string>();
  const claim = (value: string): void => {
    const key = value.normalize('NFC').toLowerCase();

    if (paths.has(key)) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'File or folder name is already in use');
    }
    paths.add(key);
  };

  for (const folder of library.folders) {
    validateMediaName(folder.name, true);
    const root = folder.root ?? MediaRoot.Images;
    const parent = folder.parentId === null ? undefined : folders.get(folder.parentId);

    fileRequirement(Object.values(MediaRoot).includes(root)
      && (!parent || (parent.root ?? MediaRoot.Images) === root), 'Foreign folder root');
    claim(root + '/' + path(folder.folderId).join('/'));
  }

  for (const file of library.files) {
    new Asset(file.image);
    validateMediaName(file.name);
    fileRequirement(file.image.siteId === library.siteId, 'Foreign image');
    const root = mediaRoot(file);
    const folder = file.folderId === null ? undefined : folders.get(file.folderId);

    fileRequirement(file.image.state === AssetProcessingState.Ready
      && (root === MediaRoot.Files || file.image.originalDimensions), 'Library files require ready metadata');
    fileRequirement(!folder || (folder.root ?? MediaRoot.Images) === root, 'File belongs to another root');
    const keys = new Set(file.outputs.map((output) => output.key));

    fileRequirement(file.outputs.length > 0 && keys.size === file.outputs.length,
      'Missing or duplicate image outputs');
    const sources = new Map<string, { mimeType: string; dimensions: IImageDimensions | null }>(
      file.image.variants.map((variant) => [variant.content.contentId, {
        mimeType: variant.mimeType, dimensions: variant.dimensions,
      }]));

    if (file.image.file) {
      sources.set(file.image.file.contentId, {
        mimeType: file.image.mimeType,
        dimensions: file.image.originalDimensions,
      });
    }

    const directory = path(file.folderId);

    claim(root + '/' + mediaPathInFolder(directory, file, ''));

    for (const output of file.outputs) {
      const profile = RESPONSIVE_IMAGE_PROFILES.find((profile) => profile.profileId === output.key);

      fileRequirement(output.key === 'file' && output.suffix === ''
        || profile && output.suffix === '--' + profile.profileId + '.webp', 'Invalid public image suffix');
      const source = sources.get(output.contentId);

      fileRequirement(source?.mimeType === output.mimeType
        && source.dimensions?.width === output.dimensions?.width
        && source.dimensions?.height === output.dimensions?.height
        && source.dimensions?.aspectRatio === output.dimensions?.aspectRatio,
      'Image output differs from prepared metadata');

      if (output.suffix !== '') {
        claim(root + '/' + mediaPathInFolder(directory, file, output.suffix));
      }
    }
  }
}

export function mediaFileView(file: IMediaFile, publicPath: string, paths: readonly string[]): IMediaFileView {
  return {
    fileId: file.fileId,
    hasVariants: file.image.variants.length > 0,
    folderId: file.folderId,
    name: file.name,
    mode: file.mode,
    mimeType: file.image.mimeType,
    byteSize: file.image.byteSize,
    createdAt: (file.createdAt ?? file.image.createdAt).toISOString(),
    updatedAt: (file.updatedAt ?? file.image.updatedAt).toISOString(),
    assetVersion: file.image.assetVersion,
    revision: mediaFileRevision(file),
    ...(file.pendingReferences?.length ? { referencesPending: true } : {}),
    originalDimensions: file.image.originalDimensions,
    outputs: file.outputs.map((output, index) => {
      const byteSize = output.contentId === file.image.file?.contentId ? file.image.byteSize
        : file.image.variants.find((variant) => variant.content.contentId === output.contentId)?.byteSize;

      fileRequirement(byteSize !== undefined, 'Missing media output size');

      return {
        key: output.key,
        url: publicPath + '/' + paths[index]!.split('/').map(encodeURIComponent).join('/'),
        byteSize,
        mimeType: output.mimeType,
        dimensions: output.dimensions,
      };
    }),
  };
}

export function libraryView(library: IMediaLibrary, publicPath: string, pending: boolean): IMediaLibraryView {
  const paths = indexFolderPaths(library.folders);

  return {
    version: library.version,
    folders: library.folders,
    pending,
    files: library.files.map((file) => {
      const prefix = mediaRoot(file) + '/';
      const directory = paths(file.folderId);

      return mediaFileView(file, publicPath,
        file.outputs.map((output) => prefix + mediaPathInFolder(directory, file, output.suffix)));
    }),
  };
}
