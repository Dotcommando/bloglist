import { ProcessAssetUseCase } from '../../../src/app/use-cases/media/process-asset.use-case.js';
import { UploadAssetUseCase } from '../../../src/app/use-cases/media/upload-asset.use-case.js';
import { AssetVisibility } from '../../../src/domain/media/asset.js';
import { RESPONSIVE_IMAGE_PROFILES } from '../../../src/domain/media/image-profile.js';
import type { IImageProcessingPort } from '../../../src/ports/outbound/media/image-processing.port.js';
import { binary, type IMediaFixture, mediaFixture } from '../../support/media.js';

export async function uploaded(): Promise<IMediaFixture> {
  const f = mediaFixture();

  await new UploadAssetUseCase(f.repository, f.storage, f.inspection, f.access, f.values).execute({
    siteId: 'site',
    actorId: 'operator',
    filename: 'photo.png',
    visibility: AssetVisibility.Public,
    content: binary('x'),
  });

  return f;
}

function imageProcessor(): IImageProcessingPort {
  return {
    process: async () => ({
      originalDimensions: { width: 1440, height: 720, aspectRatio: 2 },
      profileVersion: '2',
      variants: RESPONSIVE_IMAGE_PROFILES.map((p) => ({
        variantId: p.profileId,
        content: binary('variant', 'image/webp'),
        checksum: 'hash',
        dimensions: { width: p.targetWidth, height: p.targetWidth / 2, aspectRatio: 2 },
      })),
      profileMappings: RESPONSIVE_IMAGE_PROFILES.map((p) => ({ profileId: p.profileId, variantIds: [p.profileId] })),
    }),
  };
}

describe('ProcessAsset', () => {
  const input = { siteId: 'site', assetId: 'asset', assetVersion: 'immutable', expectedVersion: 'v1' };

  it.each([false, true])('releases every prepared variant after success or an interrupted write: %s', async (fail) => {
    const f = await uploaded();
    const dispose = vi.fn(async () => {});
    const output = await imageProcessor().process(binary('x'), '2', RESPONSIVE_IMAGE_PROFILES);

    if (fail) {
      f.storage.write = async () => {
        throw new Error('interrupted');
      };
    }

    const operation = new ProcessAssetUseCase(f.repository, f.storage, {
      process: async () => ({ ...output, dispose }),
    }, f.access, f.values);
    const result = operation.execute(input);

    if (fail) {
      await expect(result).rejects.toThrow('Asset processing failed');
    } else {
      await result;
    }
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('commits all prepared derivatives and replays Ready without processing again', async () => {
    const f = await uploaded();
    const processor = imageProcessor();
    const operation = new ProcessAssetUseCase(f.repository, f.storage, processor, f.access, f.values);
    const result = await operation.execute(input);

    expect(result.toState()).toMatchObject({ state: 'Ready', profileVersion: '2' });
    expect(f.writes).toHaveLength(7);
    processor.process = async () => {
      throw new Error('must not rerun');
    };
    expect((await operation.execute(input)).toState()).toEqual(result.toState());
  });
  it('rejects stale/missing records before any derivative writes', async () => {
    const f = await uploaded();
    const operation = new ProcessAssetUseCase(f.repository, f.storage, imageProcessor(), f.access, f.values);

    await expect(operation.execute({ ...input, expectedVersion: 'old' })).rejects.toMatchObject({ code: 'StaleWrite' });
    await expect(operation.execute({ ...input, siteId: 'other' })).rejects.toMatchObject({ code: 'NotFound' });
    expect(f.writes).toHaveLength(1);
  });
  it('performs one attempt, records Failed and propagates a sanitized processing error', async () => {
    const f = await uploaded();
    let calls = 0;
    const processor = {
      process: async (): Promise<never> => {
        calls++;
        throw new Error('private storage detail');
      },
    };
    const operation = new ProcessAssetUseCase(f.repository, f.storage, processor, f.access, f.values);

    await expect(operation.execute(input)).rejects.toThrow('Asset processing failed');
    expect(calls).toBe(1);
    expect(f.assets[0]?.toState()).toMatchObject({ state: 'Failed', failure: 'Asset processing failed' });
    await expect(operation.execute(input)).rejects.toThrow();
    expect(calls).toBe(1);
  });
});
