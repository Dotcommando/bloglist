import { ContentRequestError, request } from '../../shared/api/content-api';
import type { IFileDimensions, IFileLibrary, IFileOutput, IFileReview, ISiteFile } from './files.types';
import { FileUsageGroup, FileValidationIssue, ImageUploadMode, MediaRoot } from './files.types';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid file response');
  }

  return Object.fromEntries(Object.entries(value));
}

function text(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Invalid file text');
  }

  return value;
}

function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}

function dimensions(value: unknown): IFileDimensions {
  const row = record(value);
  const width = row.width;
  const height = row.height;

  if (
    typeof width !== 'number'
    || typeof height !== 'number'
    || !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width < 1
    || height < 1
  ) {
    throw new Error('Invalid image dimensions');
  }

  return { width, height, aspectRatio: width / height };
}

function fileOutput(value: unknown): IFileOutput {
  const row = record(value);

  if (
    row.byteSize !== undefined
    && (typeof row.byteSize !== 'number'
    || !Number.isSafeInteger(row.byteSize)
    || row.byteSize < 0)
  ) {
    throw new Error('Invalid output size');
  }

  return {
    byteSize: typeof row.byteSize === 'number' ? row.byteSize : null,
    key: text(row.key),
    url: text(row.url),
    mimeType: text(row.mimeType),
    dimensions: row.dimensions === null ? null : dimensions(row.dimensions),
  };
}

function siteFile(value: unknown): ISiteFile {
  const row = record(value);

  if (
    typeof row.hasVariants !== 'boolean'
    || typeof row.byteSize !== 'number'
    || !Array.isArray(row.outputs)
    || row.mode !== ImageUploadMode.Original
    && row.mode !== ImageUploadMode.Responsive
  ) {
    throw new Error('Invalid file metadata');
  }

  return {
    fileId: text(row.fileId),
    folderId: nullableText(row.folderId),
    name: text(row.name),
    mode: row.mode,
    hasVariants: row.hasVariants,
    byteSize: row.byteSize,
    mimeType: text(row.mimeType),
    originalDimensions: row.originalDimensions === null ? null : dimensions(row.originalDimensions),
    outputs: row.outputs.map(fileOutput),
  };
}

function library(value: unknown): IFileLibrary {
  const row = record(value);

  if (
    typeof row.version !== 'string'
    || typeof row.pending !== 'boolean'
    || !Array.isArray(row.folders)
    || !Array.isArray(row.files)
  ) {
    throw new Error('Invalid library');
  }

  return {
    version: row.version,
    pending: row.pending,
    files: row.files.map(siteFile),
    folders: row.folders.map((value) => {
      const folder = record(value);

      if (folder.root !== undefined && folder.root !== MediaRoot.Images && folder.root !== MediaRoot.Files) {
        throw new Error('Invalid folder root');
      }

      return {
        folderId: text(folder.folderId),
        parentId: nullableText(folder.parentId),
        name: text(folder.name),
        root: folder.root ?? MediaRoot.Images,
      };
    }),
  };
}

export function filesBase(siteId: string): string {
  return '/' + encodeURIComponent(siteId) + '/files';
}

export async function listFiles(siteId: string): Promise<IFileLibrary> {
  return library(await request(filesBase(siteId)));
}

export async function fileCommand(siteId: string, path: string, body: unknown): Promise<IFileLibrary> {
  return library(await request(filesBase(siteId) + path, body, 120000));
}

export async function imageUsages(siteId: string, fileId: string, version: string): Promise<IFileReview> {
  const route = filesBase(siteId) + '/' + fileId + '/usages?expectedVersion=' + encodeURIComponent(version);
  const value = record(await request(route));

  if (typeof value.version !== 'string' || !Array.isArray(value.usages)) {
    throw new Error('Invalid usages');
  }

  return {
    version: value.version,
    usages: value.usages.map((item) => {
      const row = record(item);
      const group = row.group;

      if (
        group !== FileUsageGroup.Content
        && group !== FileUsageGroup.OpenGraph
        && group !== FileUsageGroup.Templates
      ) {
        throw new Error('Invalid usage group');
      }

      const editorPath = text(row.editorPath);

      if (!editorPath.startsWith('/admin/sites/' + siteId + '/')) {
        throw new Error('Foreign image usage');
      }

      return {
        group,
        editorPath,
        title: text(row.title),
        field: text(row.field),
        state: text(row.state),
        readable: row.readable === true,
      };
    }),
  };
}

export function fileContentUrl(siteId: string, fileId: string, key = 'original'): string {
  return '/api/admin/sites' + filesBase(siteId) + '/' + fileId + '/content?key=' + encodeURIComponent(key);
}

function validateUpload(file: File): void {
  const image = /\.(?:jpe?g|png|webp|avif|svg|ico)$/i.test(file.name);

  if (!file.size) {
    throw new ContentRequestError(400, FileValidationIssue.Empty);
  }
  if (file.size > (image ? 20 : 64) * 1024 * 1024) {
    throw new ContentRequestError(413,
      image ? FileValidationIssue.ImageTooLarge : FileValidationIssue.DocumentTooLarge);
  }

}

export async function changeImage(siteId: string, fileId: string, version: string, file: File): Promise<IFileLibrary> {
  validateUpload(file);

  return library(await request(filesBase(siteId) + '/' + fileId + '/change', {
    expectedVersion: version, filename: file.name,
  }, 120000, undefined, file));
}

export async function uploadImage(siteId: string, version: string, folderId: string | null,
  file: File, mode: ImageUploadMode): Promise<IFileLibrary> {
  validateUpload(file);

  return library(await request(filesBase(siteId), {
    expectedVersion: version, folderId, mode, filename: file.name,
  }, 120000, undefined, file));
}
