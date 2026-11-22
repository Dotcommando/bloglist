import { Asset, AssetProcessingState, AssetVisibility } from '../../../domain/media/asset.js';
import type { IAssetUploadReceipt } from '../../../domain/media/asset-upload-receipt.js';
import { ImageUploadMode } from '../../../domain/media/image-upload-mode.enum.js';
import { requireCondition, requireText } from '../../../domain/shared/validation.js';
import type { IUploadAsset, IUploadAssetInput } from '../../../ports/inbound/media/upload-asset.port.js';
import type { IAssetRepository } from '../../../ports/outbound/media/asset.repository.js';
import { AssetPermission, type IAssetAccessPort } from '../../../ports/outbound/media/asset-access.port.js';
import type { IAssetInspectionPort } from '../../../ports/outbound/media/asset-inspection.port.js';
import { AssetContentRole, type IAssetStoragePort } from '../../../ports/outbound/media/asset-storage.port.js';
import type { IAssetValuesPort } from '../../../ports/outbound/media/asset-values.port.js';

export class UploadAssetUseCase implements IUploadAsset {
  constructor(private readonly repository: IAssetRepository, private readonly storage: IAssetStoragePort,
    private readonly inspection: IAssetInspectionPort, private readonly access: IAssetAccessPort,
    private readonly values: IAssetValuesPort) {}

  async execute(input: IUploadAssetInput): Promise<IAssetUploadReceipt> {
    await this.access.requirePermission(input.siteId, input.actorId, AssetPermission.Upload);
    requireText(input.filename, 'filename');
    requireCondition(Object.values(AssetVisibility).includes(input.visibility), 'Invalid visibility');
    requireCondition(input.mode === undefined || Object.values(ImageUploadMode).includes(input.mode),
      'Invalid upload mode');
    const inspected = await this.inspection.inspect(input.filename, input.content);

    try {
      const assetId = this.values.nextId();
      const assetVersion = this.values.nextAssetVersion();
      const at = this.values.now();
      const original = await this.storage.write({
        siteId: input.siteId,
        assetId,
        assetVersion,
        content: inspected.content,
        role: AssetContentRole.Original,
        visibility: AssetVisibility.Private,
      });

      await this.storage.assertOwned(input.siteId, assetId, assetVersion, original);
      const asset = new Asset({
        siteId: input.siteId,
        assetId,
        assetVersion,
        filename: input.filename,
        ...(input.mode ? { mode: input.mode } : {}),
        mimeType: inspected.content.mimeType,
        byteSize: inspected.content.byteSize,
        checksum: inspected.checksum,
        original,
        visibility: input.visibility,
        state: AssetProcessingState.Processing,
        failure: null,
        originalDimensions: inspected.dimensions ?? null,
        profileVersion: null,
        variants: [],
        profileMappings: [],
        version: this.values.nextMetadataVersion(),
        createdAt: at,
        updatedAt: at,
      });

      await this.repository.create(asset);

      return { assetId, assetVersion, state: AssetProcessingState.Processing };
    } finally {
      await inspected.dispose?.();
    }
  }
}
