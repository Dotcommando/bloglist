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
}

export interface IMediaLibrary {
  readonly siteId: string;
  readonly version: string;
  readonly folders: readonly IMediaFolder[];
  readonly files: readonly IMediaFile[];
}

export enum MediaUsageTargetKind {
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

export function folderPath(library: IMediaLibrary, folderId: string | null): string[] {
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

export function mediaPath(library: IMediaLibrary, file: IMediaFile, suffix: string): string {
  const stem = file.name.replace(/\.[^.]+$/, '');
  const filename = suffix === '' ? file.name : stem + suffix;

  return [...folderPath(library, file.folderId), filename].join('/');
}

export function validateLibrary(library: IMediaLibrary): void {
  fileRequirement(/^[A-Za-z0-9_-]{1,128}$/.test(library.siteId), 'Invalid site identity');
  fileRequirement(new Set(library.folders.map((folder) => folder.folderId)).size === library.folders.length,
    'Duplicate folder identity');
  fileRequirement(new Set(library.files.map((file) => file.fileId)).size === library.files.length,
    'Duplicate file identity');
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
    const parent = library.folders.find((item) => item.folderId === folder.parentId);

    fileRequirement(Object.values(MediaRoot).includes(root)
      && (!parent || (parent.root ?? MediaRoot.Images) === root), 'Foreign folder root');
    claim(root + '/' + folderPath(library, folder.folderId).join('/'));
  }

  for (const file of library.files) {
    new Asset(file.image);
    validateMediaName(file.name);
    fileRequirement(file.image.siteId === library.siteId, 'Foreign image');
    const root = mediaRoot(file);
    const folder = library.folders.find((item) => item.folderId === file.folderId);

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
    claim(root + '/' + [...folderPath(library, file.folderId), file.name].join('/'));

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
        claim(root + '/' + mediaPath(library, file, output.suffix));
      }
    }
  }
}

export function libraryView(library: IMediaLibrary, publicPath: string, pending: boolean): IMediaLibraryView {
  return {
    version: library.version,
    folders: library.folders,
    pending,
    files: library.files.map((file) => ({
      fileId: file.fileId,
      hasVariants: file.image.variants.length > 0,
      folderId: file.folderId,
      name: file.name,
      mode: file.mode,
      mimeType: file.image.mimeType,
      byteSize: file.image.byteSize,
      originalDimensions: file.image.originalDimensions,
      outputs: file.outputs.map((output) => {
        const byteSize = output.contentId === file.image.file?.contentId ? file.image.byteSize
          : file.image.variants.find((variant) => variant.content.contentId === output.contentId)?.byteSize;

        fileRequirement(byteSize !== undefined, 'Missing media output size');

        return {
          key: output.key,
          url: publicPath + '/' + mediaRoot(file) + '/' + mediaPath(library, file, output.suffix)
            .split('/').map(encodeURIComponent).join('/'),
          byteSize,
          mimeType: output.mimeType,
          dimensions: output.dimensions,
        };
      }),
    })),
  };
}
