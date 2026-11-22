import { ImageUploadMode, type ISiteFile } from '../../admin/src/features/files/files.types.js';
import { openGraphImageUrl } from '../../admin/src/features/pages/open-graph-image.js';

const file: ISiteFile = {
  fileId: 'image',
  folderId: null,
  name: 'photo.webp',
  mode: ImageUploadMode.Responsive,
  hasVariants: true,
  mimeType: 'image/webp',
  byteSize: 100,
  originalDimensions: null,
  outputs: [1200, 320].map((width) => ({
    key: 'w' + width,
    url: '/assets/images/photo-' + width + '.webp',
    mimeType: 'image/webp',
    dimensions: { width, height: width / 2, aspectRatio: 2 },
  })),
};

it('chooses the largest public output and resolves against the configured public origin', () => {
  expect(openGraphImageUrl(file, 'https://example.test')).toBe('https://example.test/assets/images/photo-1200.webp');
  expect(() => openGraphImageUrl(file, null)).toThrow();
  expect(openGraphImageUrl({ ...file, outputs: [{ ...file.outputs[0]!, url: 'https://cdn.test/image.webp' }] }, null))
    .toBe('https://cdn.test/image.webp');
});

it('uses an explicitly chosen size and never silently substitutes a missing size', () => {
  expect(openGraphImageUrl(file, 'https://example.test', 'w320'))
    .toBe('https://example.test/assets/images/photo-320.webp');
  expect(() => openGraphImageUrl(file, 'https://example.test', 'missing')).toThrow();
  expect(openGraphImageUrl({
    ...file,
    outputs: [...file.outputs, {
      ...file.outputs[0]!,
      key: 'original',
      url: '/large.webp',
      dimensions: { width: 6000, height: 3000, aspectRatio: 2 },
    }],
  }, 'https://example.test')).toBe('https://example.test/assets/images/photo-1200.webp');
});

it('rejects non-images, missing outputs, credentials and non-public protocols', () => {
  expect(() => openGraphImageUrl({ ...file, mimeType: 'application/pdf' }, 'https://example.test')).toThrow();
  expect(() => openGraphImageUrl({ ...file, outputs: [] }, 'https://example.test')).toThrow();

  for (const url of ['javascript:alert(1)', 'https://user:password@example.test/image.webp', '//other.test/image']) {
    expect(() => openGraphImageUrl({ ...file, outputs: [{ ...file.outputs[0]!, url }] }, 'https://example.test'))
      .toThrow();
  }
});
