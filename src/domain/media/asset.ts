import type { IContentReference } from '../shared/binary-content.js';
import { BusinessError, BusinessErrorCode } from '../shared/business-error.js';
import { SnapshotEntity } from '../shared/snapshot-entity.js';
import {
  requireCondition, requireInstant, requireInteger, requireNewVersion, requireText,
} from '../shared/validation.js';
import type { ImageProfileId } from './image-profile.js';
import { RESPONSIVE_IMAGE_PROFILE_VERSION, RESPONSIVE_IMAGE_PROFILES, responsiveWidth } from './image-profile.js';
import { ImageUploadMode } from './image-upload-mode.enum.js';

export enum AssetProcessingState {
  Processing = 'Processing',
  Ready = 'Ready',
  Failed = 'Failed',
}

export enum AssetVisibility {
  Private = 'Private',
  Public = 'Public',
}

export interface IImageDimensions {
  readonly width: number;
  readonly height: number;
  readonly aspectRatio: number;
}

export interface IAssetVariant {
  readonly variantId: string;
  readonly content: IContentReference;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly checksum: string;
  readonly dimensions: IImageDimensions;
}

export interface IImageProfileMapping {
  readonly profileId: ImageProfileId;
  readonly variantIds: readonly string[];
}

export interface IProcessedAsset {
  readonly file?: IContentReference;
  readonly originalDimensions: IImageDimensions | null;
  readonly profileVersion: string | null;
  readonly variants: readonly IAssetVariant[];
  readonly profileMappings: readonly IImageProfileMapping[];
}

export interface IAssetState extends IProcessedAsset {
  readonly mode?: ImageUploadMode;
  readonly assetId: string;
  readonly assetVersion: string;
  readonly siteId: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly checksum: string;
  readonly original: IContentReference;
  readonly visibility: AssetVisibility;
  readonly state: AssetProcessingState;
  readonly failure: string | null;
  readonly version: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Asset extends SnapshotEntity<IAssetState> {
  constructor(state: IAssetState) {
    for (const value of [state.assetId, state.assetVersion, state.siteId, state.filename,
      state.mimeType, state.checksum, state.original.contentId, state.version]) {
      requireText(value, 'Asset identity or metadata');
    }
    requireInteger(state.byteSize, 1, 'byteSize');
    requireInstant(state.createdAt, 'createdAt');
    requireInstant(state.updatedAt, 'updatedAt');
    requireCondition(state.updatedAt >= state.createdAt, 'Asset update predates creation');
    requireCondition(Object.values(AssetVisibility).includes(state.visibility), 'Invalid asset visibility');
    requireCondition(state.mode === undefined || Object.values(ImageUploadMode).includes(state.mode),
      'Invalid upload mode');
    requireCondition(Object.values(AssetProcessingState).includes(state.state), 'Invalid processing state');
    requireCondition(state.state !== AssetProcessingState.Failed || Boolean(state.failure?.trim()),
      'Failed processing requires a diagnostic');
    requireCondition(state.state === AssetProcessingState.Failed || state.failure === null,
      'A processing diagnostic requires Failed state');

    if (state.state === AssetProcessingState.Ready) {
      Asset.validateProcessed(state);
    }
    super(state);
  }

  complete(processed: IProcessedAsset, at: Date, nextVersion: string): void {
    const state = this.requireProcessing(nextVersion);
    const next = new Asset({
      ...state,
      originalDimensions: processed.originalDimensions,
      profileVersion: processed.profileVersion,
      variants: processed.variants,
      profileMappings: processed.profileMappings,
      ...(processed.file ? { file: processed.file } : {}),
      state: AssetProcessingState.Ready,
      failure: null,
      updatedAt: at,
      version: nextVersion,
    });

    this.replaceState(next.toState());
  }

  claimProcessing(at: Date, nextVersion: string): void {
    const state = this.requireProcessing(nextVersion);
    const next = new Asset({ ...state, updatedAt: at, version: nextVersion });

    this.replaceState(next.toState());
  }

  fail(diagnostic: string, at: Date, nextVersion: string): void {
    const state = this.requireProcessing(nextVersion);
    const next = new Asset({
      ...state,
      state: AssetProcessingState.Failed,
      failure: diagnostic,
      updatedAt: at,
      version: nextVersion,
    });

    this.replaceState(next.toState());
  }

  private requireProcessing(nextVersion: string): IAssetState {
    const state = this.toState();

    if (state.state !== AssetProcessingState.Processing) {
      throw new BusinessError(BusinessErrorCode.InvalidTransition, 'Asset is not processing');
    }
    requireNewVersion(state.version, nextVersion);

    return state;
  }

  private static validateDimensions(value: IImageDimensions): void {
    requireInteger(value.width, 1, 'image width');
    requireInteger(value.height, 1, 'image height');
    requireCondition(value.aspectRatio === value.width / value.height, 'Incorrect aspect ratio');
  }

  private static validateProcessed(state: IAssetState): void {
    if (state.mode === ImageUploadMode.Original || ['image/svg+xml', 'image/x-icon'].includes(state.mimeType)) {
      requireText(state.file?.contentId ?? '', 'Ready file delivery reference');
      requireCondition(state.variants.length === 0 && state.profileMappings.length === 0
        && state.profileVersion === null, 'Original files cannot have generated variants');

      if (state.originalDimensions !== null) {
        this.validateDimensions(state.originalDimensions);
      }
      requireCondition(!state.mimeType.startsWith('image/') || state.originalDimensions !== null,
        'Original image requires dimensions');

      return;
    }
    if (state.originalDimensions === null) {
      requireText(state.file?.contentId ?? '', 'Ready file delivery reference');
      requireCondition(!state.mimeType.startsWith('image/')
        || ['image/svg+xml', 'image/x-icon'].includes(state.mimeType), 'Ready raster images require actual dimensions');
      requireCondition(state.variants.length === 0 && state.profileMappings.length === 0
        && state.profileVersion === null, 'Documents cannot pretend to have image variants');

      return;
    }
    requireCondition(state.file === undefined, 'Raster assets use processed derivatives');
    this.validateDimensions(state.originalDimensions);
    requireCondition(state.mimeType.startsWith('image/'), 'Image dimensions require an image asset');
    requireCondition(state.profileVersion === RESPONSIVE_IMAGE_PROFILE_VERSION, 'Unknown image profile version');
    const variants = new Map(state.variants.map((variant) => [variant.variantId, variant]));
    const mappings = new Map(state.profileMappings.map((mapping) => [mapping.profileId, mapping]));

    requireCondition(variants.size === state.variants.length, 'Duplicate variant identity');
    requireCondition(mappings.size === state.profileMappings.length
      && mappings.size === RESPONSIVE_IMAGE_PROFILES.length, 'Incomplete or duplicate profile coverage');

    for (const variant of state.variants) {
      this.validateDimensions(variant.dimensions);
      requireText(variant.variantId, 'variantId');
      requireText(variant.content.contentId, 'variant content');
      requireText(variant.checksum, 'variant checksum');
      requireCondition(variant.mimeType.startsWith('image/'), 'Invalid derivative type');
      requireInteger(variant.byteSize, 1, 'variant byte size');
      requireCondition(variant.dimensions.width <= state.originalDimensions.width
        && variant.dimensions.height <= state.originalDimensions.height, 'Image upscaling is forbidden');
    }

    for (const profile of RESPONSIVE_IMAGE_PROFILES) {
      const mapping = mappings.get(profile.profileId);

      requireCondition(Boolean(mapping?.variantIds.length), 'Missing required responsive profile');

      for (const variantId of mapping?.variantIds ?? []) {
        const variant = variants.get(variantId);

        requireCondition(variant !== undefined, 'Profile references a missing variant');
        const expectedWidth = responsiveWidth(state.originalDimensions.width, profile.targetWidth);

        requireCondition(variant?.dimensions.width === expectedWidth,
          'Profile width differs from actual no-upscale target');

        if (variant) {
          const expectedHeight = state.originalDimensions.height
            * variant.dimensions.width / state.originalDimensions.width;

          requireCondition(Math.abs(variant.dimensions.height - expectedHeight) <= 1,
            'Default image variants must preserve aspect ratio');
        }
      }
    }
  }
}
