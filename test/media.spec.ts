import type { IAssetState, IAssetVariant, IProcessedAsset } from '../src/domain/media/asset.js';
import { Asset, AssetProcessingState, AssetVisibility } from '../src/domain/media/asset.js';
import { RESPONSIVE_IMAGE_PROFILE_VERSION, RESPONSIVE_IMAGE_PROFILES } from '../src/domain/media/image-profile.js';

function processingAsset(): IAssetState {
  return {
    assetId: 'image',
    assetVersion: 'image-v1',
    siteId: 'site',
    filename: 'photo.jpg',
    mimeType: 'image/jpeg',
    byteSize: 1000,
    checksum: 'original-hash',
    original: { contentId: 'private-original' },
    visibility: AssetVisibility.Public,
    state: AssetProcessingState.Processing,
    failure: null,
    originalDimensions: null,
    profileVersion: null,
    variants: [],
    profileMappings: [],
    version: 'v1',
    createdAt: new Date('2026-10-24T10:00:00Z'),
    updatedAt: new Date('2026-10-24T10:00:00Z'),
  };
}

function processed(width = 200, height = 100): IProcessedAsset {
  const variants: IAssetVariant[] = [];
  const profileMappings = RESPONSIVE_IMAGE_PROFILES.map((profile) => {
    const actualWidth = Math.max(1, Math.round(Math.min(width, 1440) * profile.targetWidth / 1440));
    const actualHeight = Math.round(height * actualWidth / width);
    const variantId = `image-${actualWidth}`;

    if (!variants.some((variant) => variant.variantId === variantId)) {
      variants.push({
        variantId,
        content: { contentId: variantId },
        mimeType: 'image/webp',
        byteSize: 100,
        checksum: variantId,
        dimensions: { width: actualWidth, height: actualHeight, aspectRatio: actualWidth / actualHeight },
      });
    }

    return { profileId: profile.profileId, variantIds: [variantId] };
  });

  return {
    originalDimensions: { width, height, aspectRatio: width / height },
    profileVersion: RESPONSIVE_IMAGE_PROFILE_VERSION,
    variants,
    profileMappings,
  };
}

describe('media readiness', () => {
  it('covers all profiles proportionally without upscaling', () => {
    const entity = new Asset(processingAsset());

    entity.complete(processed(), new Date('2026-10-24T10:01:00Z'), 'v2');
    const state = entity.toState();

    expect(state.state).toBe(AssetProcessingState.Ready);
    expect(state.variants).toHaveLength(6);
    expect(state.profileMappings).toHaveLength(6);
    expect(state.original.contentId).toBe('private-original');
    expect(state.originalDimensions).toMatchObject({ width: 200, height: 100, aspectRatio: 2 });
  });

  it('rejects readiness without dimensions and complete profile coverage', () => {
    const entity = new Asset(processingAsset());

    expect(() => entity.complete({ ...processed(1600, 800), profileMappings: [] },
      new Date('2026-10-24T10:01:00Z'), 'v2')).toThrow();
    expect(entity.toState().state).toBe(AssetProcessingState.Processing);
    expect(() => entity.complete({ ...processed(), originalDimensions: null },
      new Date('2026-10-24T10:01:00Z'), 'v2')).toThrow();
  });

  it('rejects incorrect dimensions, aspect ratios and upscaling', () => {
    const output = processed();
    const first = output.variants[0];

    if (!first) {
      throw new Error('Fixture must contain an image');
    }

    for (const dimensions of [{ width: 300, height: 150, aspectRatio: 2 },
      { width: 200, height: 100, aspectRatio: 3 }, { width: 200, height: 50, aspectRatio: 4 }]) {
      const entity = new Asset(processingAsset());

      expect(() => entity.complete({ ...output, variants: [{ ...first, dimensions }] },
        new Date('2026-10-24T10:01:00Z'), 'v2')).toThrow();
    }
  });

  it('supports documents without image variants and protects completed versions', () => {
    const entity = new Asset({ ...processingAsset(), mimeType: 'application/pdf' });

    entity.complete({
      file: { contentId: 'document-copy' },
      originalDimensions: null,
      profileVersion: null,
      variants: [],
      profileMappings: [],
    },
    new Date('2026-10-24T10:01:00Z'), 'v2');
    expect(() => entity.fail('retry', new Date('2026-10-24T10:02:00Z'), 'v3')).toThrow();
  });
  it('requires usable file metadata for ready attachments', () => {
    const entity = new Asset({ ...processingAsset(), mimeType: 'application/pdf' });

    expect(() => entity.complete({ originalDimensions: null, profileVersion: null, variants: [], profileMappings: [] },
      new Date('2026-10-24T10:01:00Z'), 'v2')).toThrow();
  });
});
