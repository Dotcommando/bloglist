import { randomUUID } from 'node:crypto';
import { cp, mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Asset, AssetProcessingState, AssetVisibility, type IAssetState, type IImageDimensions }
  from '../../../../domain/media/asset.js';
import { type IMediaFile, type IMediaLibrary, mediaPath, MediaRoot, mediaRoot, validateLibrary }
  from '../../../../domain/media/file-library.js';
import { ImageProfileId } from '../../../../domain/media/image-profile.js';
import { ImageUploadMode } from '../../../../domain/media/image-upload-mode.enum.js';
import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import { databaseRecords, encodeDocument } from '../mongoose/dump-database.adapter.js';
import { checked, child } from './dump-files.js';
import { dumpObject } from './partial-dump-archive.js';

function text(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Invalid media string');
  }

  return value;
}

function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Invalid media number');
  }

  return value;
}

function entries(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid media array');
  }

  return value;
}

function choice<T extends string>(value: unknown, allowed: readonly T[]): T {
  const result = allowed.find((item) => item === value);

  if (!result) {
    throw new Error('Invalid media choice');
  }

  return result;
}

function dimensions(value: unknown): IImageDimensions | null {
  if (value === null) {
    return null;
  }

  const item = dumpObject(value);

  return { width: number(item.width), height: number(item.height), aspectRatio: number(item.aspectRatio) };
}

function instant(value: unknown): Date {
  const result = value instanceof Date ? value : new Date(text(value));

  if (!Number.isFinite(result.getTime())) {
    throw new Error('Invalid media instant');
  }

  return result;
}

export function readDumpAsset(value: unknown): IAssetState {
  const item = dumpObject(value);
  const reference = (value: unknown): { contentId: string } => ({ contentId: text(dumpObject(value).contentId) });

  return new Asset({
    assetId: text(item.assetId),
    assetVersion: text(item.assetVersion ?? item._id),
    siteId: text(item.siteId),
    filename: text(item.filename),
    mimeType: text(item.mimeType),
    byteSize: number(item.byteSize),
    checksum: text(item.checksum),
    original: reference(item.original),
    visibility: choice(item.visibility, Object.values(AssetVisibility)),
    state: choice(item.state, Object.values(AssetProcessingState)),
    failure: item.failure === null ? null : text(item.failure),
    version: text(item.version),
    createdAt: instant(item.createdAt),
    updatedAt: instant(item.updatedAt),
    originalDimensions: dimensions(item.originalDimensions),
    profileVersion: item.profileVersion === null ? null : text(item.profileVersion),
    variants: entries(item.variants).map((value) => {
      const variant = dumpObject(value);
      const size = dimensions(variant.dimensions);

      if (!size) {
        throw new Error('Missing variant dimensions');
      }

      return {
        variantId: text(variant.variantId),
        content: reference(variant.content),
        mimeType: text(variant.mimeType),
        byteSize: number(variant.byteSize),
        checksum: text(variant.checksum),
        dimensions: size,
      };
    }),
    profileMappings: entries(item.profileMappings).map((value) => {
      const mapping = dumpObject(value);

      return {
        profileId: choice(mapping.profileId, Object.values(ImageProfileId)),
        variantIds: entries(mapping.variantIds).map(text),
      };
    }),
    ...(item.mode === undefined ? {} : { mode: choice(item.mode, Object.values(ImageUploadMode)) }),
    ...(item.file === undefined ? {} : { file: reference(item.file) }),
  }).toState();
}

export function readDumpLibrary(value: unknown): IMediaLibrary {
  const item = dumpObject(value);

  if (item.pending === true) {
    throw new BusinessError(BusinessErrorCode.Conflict, 'Media projection is pending');
  }

  const library: IMediaLibrary = {
    siteId: text(item.siteId),
    version: text(item.version),
    folders: entries(item.folders).map((value) => {
      const folder = dumpObject(value);

      return {
        folderId: text(folder.folderId),
        parentId: folder.parentId === null ? null : text(folder.parentId),
        name: text(folder.name),
        root: folder.root === undefined ? MediaRoot.Images
          : choice(folder.root, Object.values(MediaRoot)),
      };
    }),
    files: entries(item.files).map((value) => {
      const file = dumpObject(value);

      return {
        fileId: text(file.fileId),
        folderId: file.folderId === null ? null : text(file.folderId),
        name: text(file.name),
        mode: choice(file.mode, Object.values(ImageUploadMode)),
        image: readDumpAsset(file.image),
        outputs: entries(file.outputs).map((value) => {
          const output = dumpObject(value);

          return {
            key: text(output.key),
            suffix: text(output.suffix),
            mimeType: text(output.mimeType),
            dimensions: dimensions(output.dimensions),
            contentId: text(output.contentId),
          };
        }),
        previousPaths: entries(file.previousPaths).map(text),
      };
    }),
  };

  validateLibrary(library);

  return library;
}

export interface IMergedDumpMedia {
  readonly rows: readonly { readonly collection: string; readonly bytes: string; readonly id: string }[];
}

/** Merge named library entries, retain existing identities and every unmentioned file/version. */
export async function mergeDumpMedia(siteId: string, sourceSiteId: string, currentDocuments: string,
  importedDocuments: string, incoming: string, staged: string): Promise<IMergedDumpMedia> {
  let current: IMediaLibrary = { siteId, version: '0', folders: [], files: [] };
  let imported: IMediaLibrary = { siteId: sourceSiteId, version: '0', folders: [], files: [] };
  const sourceAssets: IAssetState[] = [];

  for await (const row of databaseRecords(currentDocuments)) {
    if (row.collection === 'media_libraries') {
      current = readDumpLibrary(row.document);
    }
  }

  for await (const row of databaseRecords(importedDocuments)) {
    if (row.collection === 'media_libraries') {
      imported = readDumpLibrary(row.document);
    } else if (row.collection === 'assets') {
      sourceAssets.push(readDumpAsset(row.document));
    }
  }
  const ids = new Map<string, string>();
  const versions = new Map<string, string>();
  const identity = (value: string, map: Map<string, string>): string => {
    let target = map.get(value);

    if (!target) {
      target = randomUUID();
      map.set(value, target);
    }

    return target;
  };
  const contentId = (value: string): string => {
    const parts = value.split('/');

    if (
      parts.length !== 5
      || !['public', 'private'].includes(parts[0] ?? '')
      || parts[1] !== sourceSiteId
      || parts.slice(2).some((part) => !/^[A-Za-z0-9_.-]+$/.test(part))
    ) {
      throw new Error('Foreign media content');
    }

    return [parts[0], siteId, identity(parts[2]!, ids), identity(parts[3]!, versions), parts[4]].join('/');
  };
  const mappedAssets = new Map<string, IAssetState>();
  const asset = (value: IAssetState): IAssetState => {
    const cached = mappedAssets.get(value.assetVersion);

    if (cached) {
      return cached;
    }

    const result = new Asset({
      ...value,
      siteId,
      assetId: identity(value.assetId, ids),
      assetVersion: identity(value.assetVersion, versions),
      version: randomUUID(),
      original: { contentId: contentId(value.original.contentId) },
      variants: value.variants.map((variant) => ({
        ...variant,
        content: {
          contentId: contentId(variant.content.contentId),
        },
      })),
      ...(value.file ? { file: { contentId: contentId(value.file.contentId) } } : {}),
    }).toState();

    mappedAssets.set(value.assetVersion, result);

    return result;
  };
  const folders = [...current.folders];
  const folderIds = new Map<string, string>();
  const pathKey = (value: string): string => value.normalize('NFC').toLowerCase();
  const pending = [...imported.folders];

  while (pending.length) {
    const index = pending.findIndex((folder) => folder.parentId === null || folderIds.has(folder.parentId));

    if (index < 0) {
      throw new Error('Cyclic imported folders');
    }

    const source = pending.splice(index, 1)[0]!;
    const parentId = source.parentId === null ? null : folderIds.get(source.parentId)!;
    const existing = folders.find((folder) => (folder.root ?? MediaRoot.Images) === (source.root ?? MediaRoot.Images)
      && folder.parentId === parentId && pathKey(folder.name) === pathKey(source.name));
    const target = existing ?? { ...source, folderId: randomUUID(), parentId };

    folderIds.set(source.folderId, target.folderId);

    if (!existing) {
      folders.push(target);
    }
  }
  const files: IMediaFile[] = [...current.files];
  const namedPaths = new Map<string, string>();

  for (const source of imported.files) {
    if (!sourceAssets.some((item) => item.assetVersion === source.image.assetVersion)) {
      throw new Error('Library image version is missing from the asset catalogue');
    }

    const folderId = source.folderId === null ? null : folderIds.get(source.folderId)!;
    const existing = files.find((file) => file.folderId === folderId && mediaRoot(file) === mediaRoot(source)
      && pathKey(file.name) === pathKey(source.name));

    if (existing) {
      ids.set(source.image.assetId, existing.image.assetId);
    }

    const next: IMediaFile = {
      ...source,
      fileId: existing?.fileId ?? randomUUID(),
      folderId,
      name: existing?.name ?? source.name,
      image: asset(source.image),
      previousPaths: [],
      outputs: source.outputs.map((output) => ({ ...output, contentId: contentId(output.contentId) })),
    };

    if (existing) {
      files.splice(files.indexOf(existing), 1, next);
    } else {
      files.push(next);
    }

    for (const output of source.outputs) {
      const target = next.outputs.find((item) => item.key === output.key)!;

      namedPaths.set(mediaRoot(source) + '/' + mediaPath(imported, source, output.suffix),
        mediaRoot(next) + '/' + mediaPath({ ...current, folders, files }, next, target.suffix));
    }
  }
  const library: IMediaLibrary = { siteId, version: randomUUID(), folders, files };

  validateLibrary(library);
  const walk = async (relative: string): Promise<void> => {
    const root = relative ? await checked(incoming, relative) : incoming;

    for (const entry of await readdir(root, { withFileTypes: true })) {
      const source = relative ? relative + '/' + entry.name : entry.name;

      if (source === '.site.json') {
        continue;
      }

      const parts = source.split('/');
      let destination = namedPaths.get(source) ?? source;

      if (parts.length >= 4 && (parts[1] === '.objects' || parts[0] === '.private' && parts[1] === 'objects')) {
        parts[2] = identity(parts[2]!, ids);
        parts[3] = identity(parts[3]!, versions);
        destination = parts.join('/');
      }

      const target = await checked(staged, destination);

      if (entry.isDirectory()) {
        await mkdir(target, { recursive: true });
        await walk(source);
      } else {
        if (!entry.isFile()) {
          throw new Error('Invalid media file');
        }
        await mkdir(path.dirname(target), { recursive: true });
        await cp(await checked(incoming, source), target);
      }
    }
  };

  await mkdir(staged, { recursive: true });
  await walk('');
  await writeFile(child(staged, '.site.json'), JSON.stringify({ siteId }));
  const rows = sourceAssets.map(asset).map(({ assetVersion, ...value }) => ({
    collection: 'assets', id: assetVersion, bytes: encodeDocument({ _id: assetVersion, ...value }),
  }));

  rows.push({
    collection: 'media_libraries',
    id: siteId,
    bytes: encodeDocument({ _id: siteId, ...library, pending: false, garbage: [] }),
  });

  return { rows };
}
