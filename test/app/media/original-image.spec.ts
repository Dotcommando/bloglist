import { ProcessAssetUseCase } from '../../../src/app/use-cases/media/process-asset.use-case.js';
import { UploadAssetUseCase } from '../../../src/app/use-cases/media/upload-asset.use-case.js';
import { AssetVisibility } from '../../../src/domain/media/asset.js';
import { ImageUploadMode } from '../../../src/domain/media/image-upload-mode.enum.js';
import { binary, mediaFixture } from '../../support/media.js';

describe('original image uploads', () => {
  it('retains dimensions and bytes without calling the responsive processor', async () => {
    const f = mediaFixture();

    f.inspection.inspect = async () => ({
      content: binary('verified'),
      checksum: 'verified',
      dimensions: { width: 20, height: 10, aspectRatio: 2 },
    });
    const uploaded = await new UploadAssetUseCase(f.repository, f.storage, f.inspection, f.access, f.values).execute({
      siteId: 'site',
      actorId: 'admin',
      filename: 'small.png',
      visibility: AssetVisibility.Private,
      mode: ImageUploadMode.Original,
      content: binary('original'),
    });
    const images = { process: vi.fn() };
    const processed = await new ProcessAssetUseCase(f.repository, f.storage, images, f.access, f.values).execute({
      siteId: 'site', ...uploaded, expectedVersion: 'v1',
    });

    expect(images.process).not.toHaveBeenCalled();
    expect(processed.toState()).toMatchObject({
      state: 'Ready',
      mode: 'Original',
      originalDimensions: { width: 20, height: 10 },
      file: { contentId: 'object-2' },
      variants: [],
    });
  });
});
