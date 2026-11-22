import { randomUUID } from 'node:crypto';
import { link, lstat, mkdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

import { AssetVisibility } from '../../../../../domain/media/asset.js';
import { MAX_DOCUMENT_BYTES } from '../../../../../domain/media/media-policy.js';
import type { IBinaryContent, IContentReference } from '../../../../../domain/shared/binary-content.js';
import type { IAssetDeliveryPort } from '../../../../../ports/outbound/media/asset-delivery.port.js';
import {
  AssetContentRole,
  type IAssetStoragePort,
  type WriteAssetContent,
} from '../../../../../ports/outbound/media/asset-storage.port.js';
import type { ISiteStorageScope } from '../../../../../ports/outbound/sites/site-storage.port.js';
import { ASSET_MIME_TYPES } from '../../../media/sharp/asset-inspection.adapter.js';
import { digestFile, fileContent, writeFileContent } from '../binary-file.js';
import { SiteAssetDirectoryAdapter } from './site-asset-directory.adapter.js';

function safeKey(value: string): string {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(value)) {
    throw new RangeError('Invalid object identity');
  }

  return value;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export class FileAssetStorageAdapter implements IAssetStoragePort, IAssetDeliveryPort {
  private readonly directories: SiteAssetDirectoryAdapter;

  constructor(root: string, private readonly publicBaseUrl: string, sites: ISiteStorageScope) {
    this.directories = new SiteAssetDirectoryAdapter(root, sites);
  }

  async assertOwned(siteId: string, assetId: string, assetVersion: string,
    reference: IContentReference): Promise<void> {
    await this.resolve(siteId, reference);
    const parts = reference.contentId.split('/');

    if (parts[2] !== assetId || parts[3] !== assetVersion) {
      throw new RangeError('Object belongs to another asset version');
    }
  }

  async write(input: WriteAssetContent): Promise<IContentReference> {
    return this.directories.withWrite(input.siteId, () => this.writeOwned(input));
  }

  private async writeOwned(input: WriteAssetContent): Promise<IContentReference> {
    const ext = Object.entries(ASSET_MIME_TYPES).find(([, mime]) => mime === input.content.mimeType)?.[0];

    if (!ext) {
      throw new RangeError('Unsupported storage content type');
    }

    const visibility = input.role === AssetContentRole.Original ? 'private'
      : input.visibility === AssetVisibility.Public ? 'public' : 'private';
    const name = input.role === AssetContentRole.Original ? 'original' : safeKey(input.variantId);
    const contentId = [visibility, safeKey(input.siteId), safeKey(input.assetId),
      safeKey(input.assetVersion), name + '.' + ext].join('/');
    const target = await this.resolve(input.siteId, { contentId }, true);
    const temporary = target + '.' + randomUUID() + '.tmp';

    try {
      const written = await writeFileContent(temporary, input.content, MAX_DOCUMENT_BYTES);

      try {
        await link(temporary, target);
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) {
          throw error;
        }

        const existing = await digestFile(target);

        if (existing.byteSize !== written.byteSize || existing.checksum !== written.checksum) {
          throw new Error('Immutable object write conflict');
        }
      }
    } finally {
      await unlink(temporary).catch((error: unknown) => {
        if (!isMissing(error)) {
          throw error;
        }
      });
    }

    return { contentId };
  }

  async read(siteId: string, reference: IContentReference): Promise<IBinaryContent | null> {
    const target = await this.resolve(siteId, reference);

    try {
      const ext = path.extname(target).slice(1);
      const mimeType = ASSET_MIME_TYPES[ext];

      if (!mimeType) {
        throw new RangeError('Unknown object type');
      }

      return fileContent(target, (await stat(target)).size, mimeType);
    } catch (error) {
      if (isMissing(error)) {
        return null;
      }
      throw error;
    }
  }

  async delete(siteId: string, reference: IContentReference): Promise<void> {
    await this.directories.withWrite(siteId, () => this.deleteOwned(siteId, reference));
  }

  private async deleteOwned(siteId: string, reference: IContentReference): Promise<void> {
    const target = await this.resolve(siteId, reference);

    try {
      await unlink(target);
    } catch (error) {
      if (!isMissing(error)) {
        throw error;
      }
    }
  }

  async publicUrl(siteId: string, reference: IContentReference): Promise<string> {
    await this.resolve(siteId, reference);

    if (!reference.contentId.startsWith('public/')) {
      throw new RangeError('Private object has no public URL');
    }

    const parts = reference.contentId.split('/');
    const mime = ASSET_MIME_TYPES[path.extname(reference.contentId).slice(1)]!;

    return this.publicBaseUrl.replace(/\/$/, '') + '/' + (mime.startsWith('image/') ? 'images' : 'files')
      + '/.objects/' + parts.slice(2).join('/');
  }

  private async resolve(siteId: string, reference: IContentReference, create = false): Promise<string> {
    const parts = reference.contentId.split('/');

    if (
      parts.length !== 5
      || !['private', 'public'].includes(parts[0] ?? '')
      || parts[1] !== safeKey(siteId)
      || !parts.slice(1, 4).every((part) => /^[A-Za-z0-9_-]{1,160}$/.test(part))
      || !/^[A-Za-z0-9_-]{1,160}\.[a-z0-9]+$/.test(parts[4] ?? '')
    ) {
      throw new RangeError('Foreign or invalid object reference');
    }

    const root = await this.directories.resolve(siteId);
    const mime = ASSET_MIME_TYPES[path.extname(reference.contentId).slice(1)];
    const physical = parts[0] === 'private' ? ['.private', 'objects', ...parts.slice(2)]
      : [mime?.startsWith('image/') ? 'images' : 'files', '.objects', ...parts.slice(2)];

    if (create) {
      await mkdir(root, { recursive: true });
    }

    let current = root;
    const checked = [root, ...physical.map((part) => {
      current = path.join(current, part);

      return current;
    })];

    for (let i = 0; i < checked.length; i++) {
      const item = checked[i];

      if (!item) {
        throw new Error('Missing checked path');
      }

      try {
        if (create && i < checked.length - 1) {
          await mkdir(item, { recursive: true });
        }
        if ((await lstat(item)).isSymbolicLink()) {
          throw new RangeError('Symbolic links are forbidden in object storage');
        }
      } catch (error) {
        if (!isMissing(error)) {
          throw error;
        }
      }
    }

    return path.join(root, ...physical);
  }
}
