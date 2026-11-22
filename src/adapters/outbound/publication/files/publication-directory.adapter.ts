import { lstat, readdir, readFile, realpath, rename, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import type { IPublicationReleaseState } from '../../../../domain/publication/publication-release.js';
import { requireAssetPath, requireCondition } from '../../../../domain/shared/validation.js';
import type { ISiteAssetDirectory, ISiteStorageScope } from '../../../../ports/outbound/sites/site-storage.port.js';
import { digestFile } from '../../storage/files/binary-file.js';
import {
  checkedStoragePath, SiteAssetDirectoryAdapter,
} from '../../storage/files/media/site-asset-directory.adapter.js';

type ReleaseIdentity = Pick<IPublicationReleaseState, 'siteId' | 'siteKey' | 'releaseId'>;

export function legacyPublicationPath(release: ReleaseIdentity): string {
  const relative = 'sites/' + encodeURIComponent(release.siteKey ?? release.siteId)
    + '/' + encodeURIComponent(release.releaseId);

  requireAssetPath(relative);

  return relative;
}

function missing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export class PublicationDirectoryAdapter implements ISiteAssetDirectory {
  private readonly sites: SiteAssetDirectoryAdapter;

  constructor(private readonly root: string, scope: ISiteStorageScope) {
    this.sites = new SiteAssetDirectoryAdapter(path.join(root, 'sites'), scope, []);
  }

  async synchronize(siteId: string): Promise<void> {
    await this.sites.synchronize(siteId);
  }

  private async child(directory: string, releaseId: string): Promise<string> {
    const relative = encodeURIComponent(releaseId);

    requireAssetPath(relative);

    return checkedStoragePath(directory, relative);
  }

  async resolve(release: ReleaseIdentity): Promise<string> {
    const directory = await this.child(await this.sites.resolve(release.siteId), release.releaseId);

    try {
      requireCondition((await lstat(directory)).isDirectory(), 'Release is not a directory');

      if ((await readdir(directory)).length === 0) {
        return checkedStoragePath(this.root, legacyPublicationPath(release));
      }

      return directory;
    } catch (error) {
      if (!missing(error)) {
        throw error;
      }

      return checkedStoragePath(this.root, legacyPublicationPath(release));
    }
  }

  async withWrite<T>(release: ReleaseIdentity, action: (directory: string) => Promise<T>): Promise<T> {
    return this.sites.withWrite(release.siteId, async (directory) =>
      action(await this.child(directory, release.releaseId)));
  }

  private async verify(directory: string, release: IPublicationReleaseState): Promise<void> {
    requireCondition(release.manifest !== null, 'Missing publication manifest');
    requireCondition(isDeepStrictEqual(JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')),
      release.manifest), 'Legacy publication manifest mismatch');
    const canonical = await realpath(directory);

    for (const entry of release.manifest!.artifacts) {
      requireAssetPath(entry.path);
      const filename = await realpath(await checkedStoragePath(directory,
        (entry.public ? 'public/' : '') + entry.path));

      requireCondition(filename.startsWith(canonical + path.sep), 'Foreign publication file');
      const verified = await digestFile(filename);

      requireCondition(verified.byteSize === entry.byteSize && verified.checksum === entry.checksum,
        'Corrupt legacy publication artifact');
    }
  }

  /** Offline conversion preserves release identities, manifests and immutable bytes. */
  async migrate(release: IPublicationReleaseState): Promise<void> {
    await this.withWrite(release, async (destination) => {
      const previous = await checkedStoragePath(this.root, legacyPublicationPath(release));

      if (previous === destination) {
        await this.verify(destination, release);

        return;
      }

      let exists = await lstat(destination).then(() => true).catch((error: unknown) => {
        if (!missing(error)) {
          throw error;
        }

        return false;
      });

      if (exists && (await readdir(destination)).length === 0) {
        await rmdir(destination);
        exists = false;
      }
      if (exists) {
        await this.verify(destination, release);
        await lstat(previous).then(() => {
          throw new Error('Both legacy and domain release directories exist; reconcile explicitly');
        }).catch((error: unknown) => {
          if (!missing(error)) {
            throw error;
          }
        });

        return;
      }
      await this.verify(previous, release);
      await rename(previous, destination);
      await rmdir(path.dirname(previous)).catch((error: unknown) => {
        if (
          !(error instanceof Error && 'code' in error
          && ['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(String(error.code)))
        ) {
          throw error;
        }
      });
    });
  }
}
