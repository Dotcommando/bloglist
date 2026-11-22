import { UploadAssetUseCase } from '../../../src/app/use-cases/media/upload-asset.use-case.js';
import { AssetProcessingState, AssetVisibility } from '../../../src/domain/media/asset.js';
import { binary, mediaFixture } from '../../support/media.js';

describe('UploadAsset', () => {
  it.each([false, true])('releases inspected temporary content after success or storage failure: %s', async (fail) => {
    const f = mediaFixture();
    const dispose = vi.fn(async () => {});

    f.inspection.inspect = async () => ({ content: binary('verified'), checksum: 'verified', dispose });

    if (fail) {
      f.storage.write = async () => {
        throw new Error('storage failed');
      };
    }

    const result = new UploadAssetUseCase(f.repository, f.storage, f.inspection, f.access, f.values).execute({
      siteId: 'site',
      actorId: 'operator',
      filename: 'photo.png',
      visibility: AssetVisibility.Public,
      content: binary('untrusted'),
    });

    if (fail) {
      await expect(result).rejects.toThrow('storage failed');
    } else {
      await result;
    }
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('stores a private verified original and returns a Processing receipt', async () => {
    const f = mediaFixture();
    const result = await new UploadAssetUseCase(f.repository, f.storage, f.inspection, f.access, f.values)
      .execute({
        siteId: 'site',
        actorId: 'operator',
        filename: 'photo.png',
        visibility: AssetVisibility.Public,
        content: binary('untrusted', 'text/plain'),
      });

    expect(result.state).toBe(AssetProcessingState.Processing);
    expect(f.writes[0]).toMatchObject({ role: 'Original', visibility: 'Private', siteId: 'site' });
    expect(f.assets[0]?.toState()).toMatchObject({ mimeType: 'image/png', byteSize: 8, checksum: 'verified' });
  });
  it('authorizes before consuming content and writes nothing on inspection failure', async () => {
    const f = mediaFixture();

    f.access.requirePermission = async () => {
      throw new Error('denied');
    };
    await expect(new UploadAssetUseCase(f.repository, f.storage, f.inspection, f.access, f.values)
      .execute({
        siteId: 'site',
        actorId: 'foreign',
        filename: 'photo.png',
        visibility: AssetVisibility.Public,
        content: binary('x'),
      })).rejects.toThrow('denied');
    expect(f.writes).toHaveLength(0);
    f.access.requirePermission = async () => {};
    f.inspection.inspect = async () => {
      throw new Error('unsupported');
    };
    await expect(new UploadAssetUseCase(f.repository, f.storage, f.inspection, f.access, f.values)
      .execute({
        siteId: 'site',
        actorId: 'operator',
        filename: 'photo.png',
        visibility: AssetVisibility.Public,
        content: binary('x'),
      })).rejects.toThrow('unsupported');
    expect(f.writes).toHaveLength(0);
  });
  it('reports metadata failure without deleting a possibly acknowledged original', async () => {
    const f = mediaFixture();

    f.repository.create = async () => {
      throw new Error('write failed');
    };
    await expect(new UploadAssetUseCase(f.repository, f.storage, f.inspection, f.access, f.values)
      .execute({
        siteId: 'site',
        actorId: 'operator',
        filename: 'photo.png',
        visibility: AssetVisibility.Public,
        content: binary('x'),
      })).rejects.toThrow('write failed');
    expect(f.writes).toHaveLength(1);
  });
});
