import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import sharp from 'sharp';

import { assetBinary } from '../../src/adapters/outbound/media/sharp/asset-bytes.js';
import { AssetInspectionAdapter } from '../../src/adapters/outbound/media/sharp/asset-inspection.adapter.js';
import { SharpImageProcessingAdapter } from '../../src/adapters/outbound/media/sharp/image-processing.adapter.js';
import { FileAssetStorageAdapter } from '../../src/adapters/outbound/storage/files/media/asset-storage.adapter.js';
import { AssetVisibility } from '../../src/domain/media/asset.js';
import { RESPONSIVE_IMAGE_PROFILE_VERSION, RESPONSIVE_IMAGE_PROFILES } from '../../src/domain/media/image-profile.js';
import { AssetContentRole } from '../../src/ports/outbound/media/asset-storage.port.js';

describe('bounded file streams', () => {
  const disposers: (() => Promise<void>)[] = [];

  afterEach(async () => {
    for (const dispose of disposers.splice(0)) {
      await dispose();
    }
  });

  it('stores many chunks without assembling the file and returns bounded lazy read chunks', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'zarya-stream-storage-'));
    const store = new FileAssetStorageAdapter(root, '/assets', { primaryDomain: async () => 'synthetic.test' });
    const concatenate = vi.spyOn(Buffer, 'concat');

    try {
      const reference = await store.write({
        siteId: 'site',
        assetId: 'asset',
        assetVersion: 'version',
        role: AssetContentRole.Original,
        visibility: AssetVisibility.Private,
        content: {
          byteSize: 2 * 1024 * 1024,
          mimeType: 'text/csv',
          bytes: (async function* () {
            for (let index = 0; index < 32; index++) {
              yield Buffer.alloc(64 * 1024, 65);
            }
          })(),
        },
      });

      expect(concatenate.mock.calls.every(([chunks]) =>
        chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0) <= 64 * 1024)).toBe(true);
      const content = await store.read('site', reference);

      expect(content?.byteSize).toBe(2 * 1024 * 1024);
      let read = 0;

      for await (const chunk of content!.bytes) {
        expect(chunk.byteLength).toBeLessThanOrEqual(64 * 1024);
        read += chunk.byteLength;
      }
      expect(read).toBe(2 * 1024 * 1024);
    } finally {
      concatenate.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('validates a large CSV without collecting its entire contents', async () => {
    const concatenate = vi.spyOn(Buffer, 'concat');

    try {
      const result = await new AssetInspectionAdapter().inspect('large.csv', {
        byteSize: 2 * 1024 * 1024,
        mimeType: 'application/octet-stream',
        bytes: (async function* () {
          for (let index = 0; index < 32; index++) {
            yield Buffer.alloc(64 * 1024, 65);
          }
        })(),
      });

      if (result.dispose) {
        disposers.push(result.dispose);
      }
      expect(result.content.byteSize).toBe(2 * 1024 * 1024);
      expect(concatenate.mock.calls.every(([chunks]) =>
        chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0) <= 64 * 1024)).toBe(true);

      for await (const chunk of result.content.bytes) {
        expect(chunk.byteLength).toBeLessThanOrEqual(64 * 1024);
      }
    } finally {
      concatenate.mockRestore();
    }
  });

  it('processes raster files using file-backed transforms rather than whole-file toBuffer', async () => {
    const bytes = await sharp({ create: { width: 100, height: 80, channels: 4, background: '#f005' } })
      .png().toBuffer();
    const buffer = vi.spyOn(sharp.prototype, 'toBuffer');

    try {
      const result = await new SharpImageProcessingAdapter().process(assetBinary(bytes, 'image/png'),
        RESPONSIVE_IMAGE_PROFILE_VERSION, RESPONSIVE_IMAGE_PROFILES);

      if (result.dispose) {
        disposers.push(result.dispose);
      }
      expect(result.originalDimensions).toMatchObject({ width: 100, height: 80 });
      expect(buffer).not.toHaveBeenCalled();

      for (const variant of result.variants) {
        for await (const chunk of variant.content.bytes) {
          expect(chunk.byteLength).toBeLessThanOrEqual(64 * 1024);
        }
      }
    } finally {
      buffer.mockRestore();
    }
  });
});
