import { GetAssetUseCase } from '../../../src/app/use-cases/media/get-asset.use-case.js';
import { UploadAssetUseCase } from '../../../src/app/use-cases/media/upload-asset.use-case.js';
import { AssetVisibility } from '../../../src/domain/media/asset.js';
import { binary, mediaFixture } from '../../support/media.js';

describe('GetAsset', () => {
  it('returns an exact owned immutable version or null after authorization', async () => {
    const f = mediaFixture();

    await new UploadAssetUseCase(f.repository, f.storage, f.inspection, f.access, f.values).execute({
      siteId: 'site',
      actorId: 'operator',
      filename: 'photo.png',
      visibility: AssetVisibility.Public,
      content: binary('x'),
    });
    const operation = new GetAssetUseCase(f.repository, f.access, f.storage);
    const input = { siteId: 'site', actorId: 'operator', assetId: 'asset', assetVersion: 'immutable' };

    expect((await operation.execute(input))?.toState()).toEqual(f.assets[0]?.toState());
    expect(await operation.execute({ ...input, siteId: 'other' })).toBeNull();
    f.access.requirePermission = async () => {
      throw new Error('denied');
    };
    await expect(operation.execute(input)).rejects.toThrow('denied');
  });
  it('rejects inconsistent foreign metadata from a faulty outbound boundary', async () => {
    const f = mediaFixture();

    await new UploadAssetUseCase(f.repository, f.storage, f.inspection, f.access, f.values).execute({
      siteId: 'site',
      actorId: 'operator',
      filename: 'photo.png',
      visibility: AssetVisibility.Public,
      content: binary('x'),
    });
    f.repository.findVersion = async () => f.assets[0] ?? null;
    await expect(new GetAssetUseCase(f.repository, f.access, f.storage).execute({
      siteId: 'foreign',
      actorId: 'operator',
      assetId: 'asset',
      assetVersion: 'immutable',
    })).rejects.toMatchObject({ code: 'Scope' });
  });
});
