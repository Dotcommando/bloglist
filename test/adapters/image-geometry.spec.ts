import sharp from 'sharp';

import { assetBinary } from '../../src/adapters/outbound/media/sharp/asset-bytes.js';
import { AssetInspectionAdapter } from '../../src/adapters/outbound/media/sharp/asset-inspection.adapter.js';

describe('stored source geometry', () => {
  it('records orientation-aware raster geometry and SVG viewBox geometry without changing bytes', async () => {
    const jpeg = await sharp({ create: { width: 30, height: 10, channels: 3, background: 'red' } })
      .jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const inspect = new AssetInspectionAdapter();

    expect(await inspect.inspect('image.jpg', assetBinary(jpeg, 'image/jpeg')))
      .toMatchObject({ dimensions: { width: 10, height: 30, aspectRatio: 1 / 3 } });
    expect(await inspect.inspect('image.svg', assetBinary(Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0h24v16z"/></svg>'), 'image/svg+xml')))
      .toMatchObject({ dimensions: { width: 24, height: 16, aspectRatio: 1.5 } });
  });
});
