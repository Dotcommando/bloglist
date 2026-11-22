import type { IFileOutput } from '../../admin/src/features/files/files.types.js';
import { defaultImageOutput, imageOutputs } from '../../admin/src/features/files/image-outputs.js';

const outputs: IFileOutput[] = [4000, 1440, 320, 1200, 768].map((width) => ({
  key: 'w' + width,
  url: '/assets/images/photo-' + width + '.webp',
  mimeType: 'image/webp',
  dimensions: { width, height: width / 2, aspectRatio: 2 },
}));

it('defaults to a prepared image up to 1200 pixels and keeps the complete ordered set', () => {
  expect(defaultImageOutput(outputs)?.key).toBe('w1200');
  expect(imageOutputs(outputs).map((output) => output.key)).toEqual(['w320', 'w768', 'w1200', 'w1440', 'w4000']);
  expect(defaultImageOutput(outputs.filter((output) => output.dimensions!.width < 1200))?.key).toBe('w768');
  expect(defaultImageOutput(outputs.filter((output) => output.dimensions!.width > 1200))?.key).toBe('w1440');
});

it('supports a single unscaled image and rejects missing or non-image outputs', () => {
  const vector = { key: 'file', url: '/assets/images/logo.svg', mimeType: 'image/svg+xml', dimensions: null };

  expect(defaultImageOutput([vector])).toEqual(vector);
  expect(defaultImageOutput([])).toBeUndefined();
  expect(imageOutputs([{ ...vector, mimeType: 'application/pdf' }])).toEqual([]);
});
