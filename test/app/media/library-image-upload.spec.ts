import { ChangeMediaImageUseCase } from '../../../src/app/use-cases/media/change-media-image.use-case.js';
import { UploadMediaFileUseCase } from '../../../src/app/use-cases/media/upload-media-file.use-case.js';
import { ImageUploadMode } from '../../../src/domain/media/file-library.js';
import { fileLibraryFixture, libraryFileFixture } from '../../support/file-library.js';
import { binary } from '../../support/media.js';

describe('library upload and Change image', () => {
  it('adds a fully prepared image and preserves names, folder and public paths on replacement', async () => {
    const f = fileLibraryFixture();
    const { image, outputs } = libraryFileFixture();
    const prepared = { image, outputs };
    const preparation = { prepare: vi.fn(async () => prepared) };
    const uploaded = await new UploadMediaFileUseCase(f.service, preparation).execute({
      siteId: 'site-1',
      expectedVersion: 'v1',
      filename: 'old.png',
      folderId: null,
      mode: ImageUploadMode.Original,
      content: binary('input'),
    });
    const file = uploaded.files[0]!;

    preparation.prepare.mockResolvedValue({ ...prepared, image: { ...image, byteSize: 30 } });
    const changed = await new ChangeMediaImageUseCase(f.service, preparation).execute({
      siteId: 'site-1',
      expectedVersion: uploaded.version,
      fileId: file.fileId,
      filename: 'different.png',
      content: binary('new'),
    });

    expect(changed.files[0]).toMatchObject({ name: 'old.png', folderId: null, byteSize: 30 });
    expect(changed.files[0]?.outputs[0]?.url).toBe(file.outputs[0]?.url);
  });

  it('leaves the library intact when image preparation fails', async () => {
    const f = fileLibraryFixture();
    const preparation = {
      prepare: vi.fn(async () => {
        throw new Error('bad image');
      }),
    };
    const input = {
      siteId: 'site-1',
      expectedVersion: 'v1',
      filename: 'photo.png',
      folderId: null,
      mode: ImageUploadMode.Responsive,
      content: binary('bad'),
    };

    await expect(new UploadMediaFileUseCase(f.service, preparation).execute(input)).rejects.toThrow('bad image');
    expect(f.get().files).toEqual([]);
  });
});
