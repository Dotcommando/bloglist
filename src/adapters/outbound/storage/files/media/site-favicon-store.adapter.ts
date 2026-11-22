import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, unlink } from 'node:fs/promises';

import { fileTypeFromFile } from 'file-type';

import type { IImageDimensions } from '../../../../../domain/media/asset.js';
import { MAX_IMAGE_BYTES } from '../../../../../domain/media/media-policy.js';
import { type ISiteFavicon, SITE_FAVICON_MIME_TYPE } from '../../../../../domain/media/site-favicon.js';
import type { IBinaryContent } from '../../../../../domain/shared/binary-content.js';
import type {
  ISiteFaviconStore, IStoredSiteFavicon,
} from '../../../../../ports/outbound/media/site-favicon-store.port.js';
import type { ISiteStorageScope } from '../../../../../ports/outbound/sites/site-storage.port.js';
import { iconDimensions } from '../../../media/sharp/file-content-validation.js';
import { FILE_CHUNK_BYTES, fileContent, type IStagedFile, stageFile, writeFileContent } from '../binary-file.js';
import { checkedStoragePath, SiteAssetDirectoryAdapter } from './site-asset-directory.adapter.js';

function missing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export class FileSiteFaviconStore implements ISiteFaviconStore {
  private readonly directories: SiteAssetDirectoryAdapter;

  constructor(private readonly root: string, sites: ISiteStorageScope) {
    this.directories = new SiteAssetDirectoryAdapter(root, sites);
  }

  async read(siteId: string): Promise<IStoredSiteFavicon | null> {
    const directory = await this.directories.resolve(siteId);
    const filename = await checkedStoragePath(directory, '.private/favicon.ico');
    const file = await open(filename, 'r').catch((error: unknown) => {
      if (missing(error)) {
        return null;
      }
      throw error;
    });

    if (!file) {
      return null;
    }

    let staged: IStagedFile | undefined;

    try {
      try {
        const size = (await file.stat()).size;

        staged = await stageFile({
          byteSize: size,
          mimeType: SITE_FAVICON_MIME_TYPE,
          bytes: {
            async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
              let position = 0;

              while (true) {
                const buffer = new Uint8Array(FILE_CHUNK_BYTES);
                const { bytesRead } = await file.read(buffer, 0, buffer.length, position);

                if (!bytesRead) {
                  return;
                }
                position += bytesRead;
                yield buffer.subarray(0, bytesRead);
              }
            },
          },
        }, MAX_IMAGE_BYTES);
      } finally {
        await file.close();
      }

      if ((await fileTypeFromFile(staged.filename))?.ext !== 'ico') {
        throw new Error('Invalid stored favicon');
      }

      const dimensions = await iconDimensions(staged.filename, staged.byteSize);

      return {
        byteSize: staged.byteSize,
        width: dimensions.width,
        height: dimensions.height,
        version: staged.checksum,
        content: fileContent(staged.filename, staged.byteSize, SITE_FAVICON_MIME_TYPE),
        dispose: staged.dispose,
      };
    } catch (error) {
      await staged?.dispose();
      throw error;
    }
  }

  async remove(siteId: string): Promise<void> {
    await this.directories.withWrite(siteId, async (directory) => {
      const target = await checkedStoragePath(directory, '.private/favicon.ico');

      await unlink(target).catch((error: unknown) => {
        if (!missing(error)) {
          throw error;
        }
      });
    });
  }

  async replace(siteId: string, content: IBinaryContent, dimensions: IImageDimensions): Promise<ISiteFavicon> {
    return this.directories.withWrite(siteId, async (directory) => {
      const staging = await checkedStoragePath(this.root, '.favicon-staging');

      await mkdir(staging, { recursive: true });
      const temporary = await checkedStoragePath(staging, siteId + '.' + randomUUID() + '.ico');

      try {
        const digest = await writeFileContent(temporary, content, MAX_IMAGE_BYTES);
        const target = await checkedStoragePath(directory, '.private/favicon.ico');

        await rename(temporary, target);

        return {
          byteSize: digest.byteSize, width: dimensions.width, height: dimensions.height, version: digest.checksum,
        };
      } finally {
        await unlink(temporary).catch((error: unknown) => {
          if (!missing(error)) {
            throw error;
          }
        });
      }
    });
  }
}
