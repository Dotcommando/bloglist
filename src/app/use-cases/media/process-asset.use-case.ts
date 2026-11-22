import {
  type Asset,
  AssetProcessingState,
  type IAssetVariant,
  type IProcessedAsset,
} from '../../../domain/media/asset.js';
import { RESPONSIVE_IMAGE_PROFILE_VERSION, RESPONSIVE_IMAGE_PROFILES } from '../../../domain/media/image-profile.js';
import { ImageUploadMode } from '../../../domain/media/image-upload-mode.enum.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IProcessAsset, IProcessAssetInput } from '../../../ports/inbound/media/process-asset.port.js';
import type { IAssetRepository } from '../../../ports/outbound/media/asset.repository.js';
import type { IAssetAccessPort } from '../../../ports/outbound/media/asset-access.port.js';
import { AssetContentRole, type IAssetStoragePort } from '../../../ports/outbound/media/asset-storage.port.js';
import type { IAssetValuesPort } from '../../../ports/outbound/media/asset-values.port.js';
import type {
  IImageProcessingPort, IImageProcessingResult,
} from '../../../ports/outbound/media/image-processing.port.js';

export class ProcessAssetUseCase implements IProcessAsset {
  constructor(private readonly repository: IAssetRepository, private readonly storage: IAssetStoragePort,
    private readonly images: IImageProcessingPort, private readonly access: IAssetAccessPort,
    private readonly values: IAssetValuesPort) {}

  async execute(input: IProcessAssetInput): Promise<Asset> {
    await this.access.requireProcessing(input.siteId);
    const asset = await this.repository.findVersion(input.siteId, input.assetId, input.assetVersion);

    if (!asset) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Asset not found');
    }

    const state = asset.toState();

    if (state.siteId !== input.siteId || state.assetId !== input.assetId || state.assetVersion !== input.assetVersion) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Foreign asset');
    }
    if (state.state === AssetProcessingState.Ready) {
      const references = [state.original, ...state.variants.map((v) => v.content), ...(state.file ? [state.file] : [])];

      for (const reference of references) {
        await this.storage.assertOwned(input.siteId, input.assetId, input.assetVersion, reference);
      }

      return asset;
    }
    if (state.state !== AssetProcessingState.Processing) {
      throw new BusinessError(BusinessErrorCode.InvalidTransition, 'Asset is not processing');
    }
    if (state.version !== input.expectedVersion) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Stale asset');
    }
    asset.claimProcessing(this.values.now(), this.values.nextMetadataVersion());
    await this.repository.commitProcessing(asset, input.expectedVersion);
    const attemptVersion = asset.toState().version;
    let output: IImageProcessingResult | undefined;

    try {
      await this.storage.assertOwned(input.siteId, input.assetId, input.assetVersion, state.original);
      const original = await this.storage.read(input.siteId, state.original);

      if (!original) {
        throw new Error('Original unavailable');
      }

      let processed: IProcessedAsset;

      if (
        state.mode !== ImageUploadMode.Original
        && ['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(state.mimeType)
      ) {
        output = await this.images.process(original, RESPONSIVE_IMAGE_PROFILE_VERSION, RESPONSIVE_IMAGE_PROFILES);
        const variants: IAssetVariant[] = [];

        for (const variant of output.variants) {
          const content = await this.storage.write({
            siteId: input.siteId,
            assetId: input.assetId,
            assetVersion: input.assetVersion,
            role: AssetContentRole.Derivative,
            variantId: variant.variantId,
            visibility: state.visibility,
            content: variant.content,
          });

          await this.storage.assertOwned(input.siteId, input.assetId, input.assetVersion, content);
          variants.push({
            variantId: variant.variantId,
            content,
            mimeType: variant.content.mimeType,
            byteSize: variant.content.byteSize,
            checksum: variant.checksum,
            dimensions: variant.dimensions,
          });
        }
        processed = { ...output, variants };
      } else {
        const file = await this.storage.write({
          siteId: input.siteId,
          assetId: input.assetId,
          assetVersion: input.assetVersion,
          role: AssetContentRole.Derivative,
          variantId: 'file',
          visibility: state.visibility,
          content: original,
        });

        await this.storage.assertOwned(input.siteId, input.assetId, input.assetVersion, file);
        processed = {
          file,
          originalDimensions: state.originalDimensions,
          profileVersion: null,
          variants: [],
          profileMappings: [],
        };
      }
      asset.complete(processed, this.values.now(), this.values.nextMetadataVersion());
      await this.repository.commitProcessing(asset, attemptVersion);

      return asset;
    } catch {
      const observed = await this.repository.findVersion(input.siteId, input.assetId, input.assetVersion);

      if (observed?.toState().state === AssetProcessingState.Ready) {
        return observed;
      }
      if (
        observed?.toState().state === AssetProcessingState.Processing
        && observed.toState().version === attemptVersion
      ) {
        observed.fail('Asset processing failed', this.values.now(), this.values.nextMetadataVersion());

        try {
          await this.repository.commitProcessing(observed, attemptVersion);
        } catch {
          throw new Error('Asset processing outcome could not be confirmed');
        }
      }
      throw new Error('Asset processing failed');
    } finally {
      await output?.dispose?.();
    }
  }
}
