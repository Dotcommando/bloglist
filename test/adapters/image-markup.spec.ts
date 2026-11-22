import type { ISiteFile } from '../../admin/src/features/files/files.types.js';
import { ImageUploadMode } from '../../admin/src/features/files/files.types.js';
import { imageMarkup } from '../../admin/src/features/files/image-markup.js';

describe('copied image markup', () => {
  const file: ISiteFile = {
    fileId: 'image',
    folderId: null,
    name: 'photo.webp',
    mode: ImageUploadMode.Responsive,
    mimeType: 'image/png',
    byteSize: 20,
    originalDimensions: { width: 1000, height: 400, aspectRatio: 2.5 },
    hasVariants: true,
    outputs: [
      {
        key: 'w320',
        url: '/small.webp',
        mimeType: 'image/webp',
        dimensions: { width: 222, height: 89, aspectRatio: 222 / 89 },
      },
      {
        key: 'w1440',
        url: '/large.webp',
        mimeType: 'image/webp',
        dimensions: { width: 1000, height: 400, aspectRatio: 2.5 },
      },
      {
        key: 'w576',
        url: '/duplicate.webp',
        mimeType: 'image/webp',
        dimensions: { width: 222, height: 89, aspectRatio: 222 / 89 },
      },
    ],
  };

  it('copies img and picture using real geometry, deduplicated widths and explicit layout sizes', () => {
    const image = imageMarkup(file, false, '50vw', 'A "photo"');
    const picture = imageMarkup(file, true, '(min-width: 992px) 50vw, 100vw', '');

    expect(image).toContain('width="1000" height="400"');
    expect(image).toContain('sizes="50vw"');
    expect(image).toContain('alt="A &quot;photo&quot;"');
    expect(image.match(/222w/g)).toHaveLength(1);
    expect(picture).toContain('<source type="image/webp"');
    expect(() => imageMarkup(file, false, '', '')).toThrow('sizes');
  });

  it('does not invent responsive variants for an unchanged source image', () => {
    const markup = imageMarkup({ ...file, hasVariants: false, outputs: [file.outputs[0]!] }, true, '', '');

    expect(markup).toBe('<picture>\n  <img src="/small.webp" width="222" height="89" alt="">\n</picture>');
  });
});
