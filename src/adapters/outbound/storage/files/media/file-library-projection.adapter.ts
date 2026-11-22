import { randomUUID } from 'node:crypto';
import { cp, link, lstat, mkdir, open, readFile, rename, rm, unlink } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';

import {
  type IMediaLibrary, mediaPath, MediaRoot, mediaRoot, validateLibrary,
} from '../../../../../domain/media/file-library.js';
import { MAX_DOCUMENT_BYTES } from '../../../../../domain/media/media-policy.js';
import type { IAssetStoragePort } from '../../../../../ports/outbound/media/asset-storage.port.js';
import type { IMediaLibraryProjection } from '../../../../../ports/outbound/media/file-library.port.js';
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

  async install(library: IMediaLibrary, isCurrent: () => Promise<boolean>): Promise<boolean> {
    return this.directories.withWrite(library.siteId, async (root) => {
      if (!await isCurrent()) {
        return false;
      }
      await this.installAt(library, root);

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
    const lockPath = path.join(stateRoot, 'writer.lock');
    let lock;

    try {
      lock = await open(lockPath, 'wx');
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) {
        throw error;
      }

      const pid = Number(await readFile(lockPath, 'utf8'));

      if (!Number.isInteger(pid) || pid <= 0) {
        throw new Error('A media projection writer is active; retry reconciliation');
      }

      try {
        process.kill(pid, 0);
        throw new Error('A media projection writer is active');
      } catch (probe) {
        if (!(probe instanceof Error && 'code' in probe && probe.code === 'ESRCH')) {
          throw probe;
        }
      }
      await unlink(lockPath);
      lock = await open(lockPath, 'wx');
    }

    const previous = path.join(stateRoot, 'previous');
    const failures: unknown[] = [];

    try {
      await mkdir(stage, { recursive: true });
      await lock.writeFile(String(process.pid));

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

      for (const file of library.files) {
        for (const output of file.outputs) {
          const reference = { contentId: output.contentId };

          await this.storage.assertOwned(library.siteId, file.image.assetId, file.image.assetVersion, reference);
          const content = await this.storage.read(library.siteId, reference);

          if (!content) {
            throw new Error('Image output is unavailable');
          }

          const filename = path.join(stage, mediaRoot(file), ...mediaPath(library, file, output.suffix).split('/'));

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
      const cleanup = await Promise.allSettled([
        rm(stage, { recursive: true, force: true, maxRetries: 4, retryDelay: 25 }),
        lock.close(),
      ]);

      for (const result of cleanup) {
        if (result.status === 'rejected') {
          failures.push(result.reason);
        }
      }

      try {
        await unlink(lockPath);
      } catch (error) {
        if (!missing(error)) {
          failures.push(error);
        }
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
