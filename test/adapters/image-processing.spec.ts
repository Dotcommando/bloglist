import sharp from 'sharp';

import { assetBinary } from '../../src/adapters/outbound/media/sharp/asset-bytes.js';
import { SharpImageProcessingAdapter } from '../../src/adapters/outbound/media/sharp/image-processing.adapter.js';
import { RESPONSIVE_IMAGE_PROFILE_VERSION, RESPONSIVE_IMAGE_PROFILES } from '../../src/domain/media/image-profile.js';

describe('proportional WebP processing', () => {
  const disposers: (() => Promise<void>)[] = [];

  afterEach(async () => {
    for (const dispose of disposers.splice(0)) {
      await dispose();
    }
  });

  it.each([[1920, 600, 1200, 375], [1000, 400, 833, 333]])(
    'uses real %sx%s dimensions and scales relative to the 1440 viewport', async (w, h, expectedW, expectedH) => {
      const bytes = await sharp({ create: { width: w, height: h, channels: 4, background: '#f005' } }).png().toBuffer();
      const output = await new SharpImageProcessingAdapter().process(assetBinary(bytes, 'image/png'),
        RESPONSIVE_IMAGE_PROFILE_VERSION, RESPONSIVE_IMAGE_PROFILES);

      if (output.dispose) {
        disposers.push(output.dispose);
      }

      const mapping = output.profileMappings.find((m) => m.profileId === 'w1200');
      const variant = output.variants.find((v) => v.variantId === mapping?.variantIds[0]);

      expect(variant?.dimensions).toMatchObject({ width: expectedW, height: expectedH });

      if (!variant) {
        throw new Error('Missing derivative');
      }

      const chunks = [];

      for await (const chunk of variant.content.bytes) {
        chunks.push(chunk);
      }
      expect(await sharp(Buffer.concat(chunks)).metadata()).toMatchObject({
        format: 'webp', width: expectedW, height: expectedH, hasAlpha: true,
      });
    });
});
