import { randomUUID } from 'node:crypto';
import { cp, link, lstat, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';

import {
  type IMediaLibrary, indexFolderPaths, mediaPath, mediaPathInFolder, MediaRoot, mediaRoot, validateLibrary,
  validateMediaName,
} from '../../../../../domain/media/file-library.js';
import { MAX_DOCUMENT_BYTES } from '../../../../../domain/media/media-policy.js';
import type { IAssetStoragePort } from '../../../../../ports/outbound/media/asset-storage.port.js';
import type {
  IMediaLibraryProjection, IMediaProjectionChange,
} from '../../../../../ports/outbound/media/file-library.port.js';
import type { ISiteStorageScope } from '../../../../../ports/outbound/sites/site-storage.port.js';
import { writeFileContent } from '../binary-file.js';
import { checkedStoragePath, SiteAssetDirectoryAdapter } from './site-asset-directory.adapter.js';

function missing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function moveDirectory(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to);

      return;
    } catch (error) {
      if (
        attempt >= 4
        || !(error instanceof Error && 'code' in error
        && ['EPERM', 'EBUSY'].includes(String(error.code)))
      ) {
        throw error;
      }
      await setTimeout(25 * 2 ** attempt);
    }
  }
}

/** Materializes named public files independently of the application HTTP server. */
export class FileLibraryProjectionAdapter implements IMediaLibraryProjection {
  private readonly directories: SiteAssetDirectoryAdapter;

  constructor(root: string, private readonly storage: IAssetStoragePort, sites: ISiteStorageScope) {
    this.directories = new SiteAssetDirectoryAdapter(root, sites);
  }

  withSiteWrite<T>(siteId: string, action: () => Promise<T>): Promise<T> {
    return this.directories.withWrite(siteId, action);
  }

  async install(library: IMediaLibrary, isCurrent: () => Promise<boolean>): Promise<boolean> {
    return this.directories.withWrite(library.siteId, async (root) => {
      if (!await isCurrent()) {
        return false;
      }
      await this.installAt(library, root);

      return true;
    });
  }

  async installChange(library: IMediaLibrary, change: IMediaProjectionChange,
    isCurrent: () => Promise<boolean>): Promise<boolean> {
    return this.directories.withWrite(library.siteId, async (root) => {
      if (!await isCurrent()) {
        return false;
      }

      const fileIds = new Set(change.fileIds);
      const paths = new Map<string, string>();
      const removals = [];

      for (const relative of change.removedPaths) {
        const [category, ...segments] = relative.split('/');

        if (category !== MediaRoot.Images && category !== MediaRoot.Files || !segments.length) {
          throw new RangeError('Invalid named media path');
        }

        for (const [index, name] of segments.entries()) {
          validateMediaName(name, index < segments.length - 1);
        }
        removals.push(await checkedStoragePath(root, relative));
      }

      if (!fileIds.size && !removals.length) {
        return true;
      }

      const stage = await checkedStoragePath(root, '.private/library-state/change-stage');
      const failures: unknown[] = [];

      try {
        // A previous process may have stopped while preparing the same journal.
        await rm(stage, { recursive: true, force: true });
        await mkdir(stage, { recursive: true });

        for (const file of library.files) {
          if (!fileIds.has(file.fileId)) {
            continue;
          }

          for (const output of file.outputs) {
            const relative = mediaRoot(file) + '/' + mediaPath(library, file, output.suffix);
            const target = await checkedStoragePath(root, relative);
            const staged = path.join(stage, String(paths.size));
            const reference = { contentId: output.contentId };

            await mkdir(path.dirname(target), { recursive: true });
            await this.storage.assertOwned(library.siteId, file.image.assetId, file.image.assetVersion, reference);
            const content = await this.storage.read(library.siteId, reference);

            if (!content) {
              throw new Error('Image output is unavailable');
            }
            await writeFileContent(staged, content, MAX_DOCUMENT_BYTES);
            paths.set(target, staged);
          }
          fileIds.delete(file.fileId);
        }

        if (fileIds.size) {
          throw new Error('Missing named media change');
        }

        // Remove old spelling first so case-only renames work on case-insensitive filesystems.
        for (const target of removals) {
          await rm(target, { force: true, maxRetries: 4, retryDelay: 25 });
        }

        for (const [target, staged] of paths) {
          await moveDirectory(staged, target);
        }
      } catch (error) {
        failures.push(error);
      } finally {
        try {
          await rm(stage, { recursive: true, force: true, maxRetries: 4, retryDelay: 25 });
        } catch (error) {
          failures.push(error);
        }
      }

      if (failures.length === 1) {
        throw failures[0];
      }
      if (failures.length > 1) {
        throw new AggregateError(failures, 'Media change and staging cleanup failed');
      }

      return true;
    });
  }

  private async installAt(library: IMediaLibrary, root: string): Promise<void> {
    validateLibrary(library);
    const safe = async (relative: string, create = false): Promise<string> => {
      const target = await checkedStoragePath(root, relative);

      if (create) {
        await mkdir(target, { recursive: true });
      }

      return target;
    };
    const stateRoot = await safe('.private/library-state', true);
    const stage = await safe('.private/library-state/stage-' + randomUUID());
    const previous = path.join(stateRoot, 'previous');
    const failures: unknown[] = [];

    try {
      // Recover a category moved aside before the old process could install its replacement.
      for (const category of Object.values(MediaRoot)) {
        const target = await safe(category);

        try {
          await lstat(target);
        } catch (error) {
          if (!missing(error)) {
            throw error;
          }
          await moveDirectory(await safe('.private/library-state/previous/' + category), target)
            .catch((restore: unknown) => {
              if (!missing(restore)) {
                throw restore;
              }
            });
        }
      }
      await mkdir(stage, { recursive: true });

      for (const category of Object.values(MediaRoot)) {
        await mkdir(path.join(stage, category));

        try {
          await cp(await safe(category + '/.objects'), path.join(stage, category, '.objects'), {
            recursive: true,
            filter: async (source) => {
              if ((await lstat(source)).isSymbolicLink()) {
                throw new RangeError('Symbolic links are forbidden in public objects');
              }

              return true;
            },
          });
        } catch (error) {
          if (!missing(error)) {
            throw error;
          }
        }
      }
      const installed = new Map<string, string>();
      const folder = indexFolderPaths(library.folders);

      for (const file of library.files) {
        const directory = folder(file.folderId);

        for (const output of file.outputs) {
          const reference = { contentId: output.contentId };

          await this.storage.assertOwned(library.siteId, file.image.assetId, file.image.assetVersion, reference);
          const content = await this.storage.read(library.siteId, reference);

          if (!content) {
            throw new Error('Image output is unavailable');
          }

          const filename = path.join(stage, mediaRoot(file), ...mediaPathInFolder(directory, file, output.suffix)
            .split('/'));

          await mkdir(path.dirname(filename), { recursive: true });
          const existing = installed.get(output.contentId);

          if (existing) {
            await link(existing, filename);
          } else {
            await writeFileContent(filename, content, MAX_DOCUMENT_BYTES);
            installed.set(output.contentId, filename);
          }
        }
      }
      // A failed/crashed swap is completed from the durable catalog on explicit reconciliation.
      await rm(previous, { recursive: true, force: true });

      await mkdir(previous, { recursive: true });

      for (const category of Object.values(MediaRoot)) {
        const target = await safe(category);
        const backup = path.join(previous, category);

        try {
          await moveDirectory(target, backup);
        } catch (error) {
          if (!missing(error)) {
            throw error;
          }
        }

        try {
          await moveDirectory(path.join(stage, category), target);
        } catch (error) {
          await moveDirectory(backup, target).catch((restore: unknown) => {
            if (!missing(restore)) {
              throw restore;
            }
          });
          throw error;
        }
      }
      await rm(previous, { recursive: true, force: true });
    } catch (error) {
      failures.push(error);
    } finally {
      try {
        await rm(stage, { recursive: true, force: true, maxRetries: 4, retryDelay: 25 });
      } catch (error) {
        failures.push(error);
      }
    }

    if (failures.length === 1) {
      throw failures[0];
    }
    if (failures.length > 1) {
      throw new AggregateError(failures, 'Media projection and resource cleanup failed');
    }
  }
}
