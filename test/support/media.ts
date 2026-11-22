import { Asset } from '../../src/domain/media/asset.js';
import type { IBinaryContent } from '../../src/domain/shared/binary-content.js';
import type { IAssetRepository } from '../../src/ports/outbound/media/asset.repository.js';
import type { IAssetAccessPort } from '../../src/ports/outbound/media/asset-access.port.js';
import type { IAssetInspectionPort } from '../../src/ports/outbound/media/asset-inspection.port.js';
import type { IAssetStoragePort, WriteAssetContent } from '../../src/ports/outbound/media/asset-storage.port.js';
import type { IAssetValuesPort } from '../../src/ports/outbound/media/asset-values.port.js';

export interface IMediaFixture {
  assets: Asset[];
  writes: WriteAssetContent[];
  repository: IAssetRepository;
  storage: IAssetStoragePort;
  inspection: IAssetInspectionPort;
  access: IAssetAccessPort;
  values: IAssetValuesPort;
}

import type { IFileLibraryOperations } from '../../src/ports/inbound/media/file-library.port.js';

export function libraryOperations(overrides: Partial<IFileLibraryOperations>): IFileLibraryOperations {
  const unavailable = {
    execute: async (): Promise<never> => {
      throw new Error('Unexpected file operation');
    },
  };

  return {
    list: unavailable,
    createFolder: unavailable,
    upload: unavailable,
    changeImage: unavailable,
    move: unavailable,
    delete: unavailable,
    usages: unavailable,
    reconcile: unavailable,
    readContent: unavailable,
    ...overrides,
  };
}

export function binary(value: string, mimeType = 'image/png'): IBinaryContent {
  const bytes = Buffer.from(value);

  return {
    bytes: (async function* () {
      yield bytes;
    })(),
    byteSize: bytes.length,
    mimeType,
  };
}

export function mediaFixture(): IMediaFixture {
  const assets: Asset[] = [];
  const writes: WriteAssetContent[] = [];
  let sequence = 0;
  const repository: IAssetRepository = {
    findVersion: async (siteId, assetId, assetVersion) => {
      const found = assets.find((asset) => {
        const s = asset.toState();

        return s.siteId === siteId && s.assetId === assetId && s.assetVersion === assetVersion;
      });

      return found ? new Asset(found.toState()) : null;
    },
    create: async (asset) => {
      assets.push(new Asset(asset.toState()));
    },
    commitProcessing: async (asset, expected) => {
      const i = assets.findIndex((a) => a.toState().assetVersion === asset.toState().assetVersion);

      if (i < 0 || assets[i]?.toState().version !== expected) {
        throw new Error('stale');
      }
      assets[i] = new Asset(asset.toState());
    },
  };
  const storage: IAssetStoragePort = {
    assertOwned: async () => {},
    write: async (input) => {
      writes.push(input);

      return { contentId: 'object-' + writes.length };
    },
    read: async () => binary('original'),
    delete: async () => {},
  };
  const inspection: IAssetInspectionPort = {
    inspect: async () => ({ content: binary('verified'), checksum: 'verified' }),
  };
  const access: IAssetAccessPort = { requirePermission: async () => {}, requireProcessing: async () => {} };
  const values = {
    nextId: () => 'asset',
    nextAssetVersion: () => 'immutable',
    nextMetadataVersion: () => 'v' + ++sequence,
    now: () => new Date('2026-10-25T10:00:00Z'),
  };

  return { assets, writes, repository, storage, inspection, access, values };
}
