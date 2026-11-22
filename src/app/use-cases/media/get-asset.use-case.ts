import type { Asset } from '../../../domain/media/asset.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IGetAsset, IGetAssetInput } from '../../../ports/inbound/media/get-asset.port.js';
import type { IAssetRepository } from '../../../ports/outbound/media/asset.repository.js';
import { AssetPermission, type IAssetAccessPort } from '../../../ports/outbound/media/asset-access.port.js';
import type { IAssetStoragePort } from '../../../ports/outbound/media/asset-storage.port.js';

export class GetAssetUseCase implements IGetAsset {
  constructor(private readonly repository: IAssetRepository, private readonly access: IAssetAccessPort,
    private readonly storage: IAssetStoragePort) {}

  async execute(input: IGetAssetInput): Promise<Asset | null> {
    await this.access.requirePermission(input.siteId, input.actorId, AssetPermission.Read);
    const asset = await this.repository.findVersion(input.siteId, input.assetId, input.assetVersion);
    const state = asset?.toState();

    if (
      state
      && (state.siteId !== input.siteId
      || state.assetId !== input.assetId
      || state.assetVersion !== input.assetVersion)
    ) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Foreign asset metadata');
    }
    if (state) {
      const references = [state.original, ...state.variants.map((v) => v.content), ...(state.file ? [state.file] : [])];

      for (const reference of references) {
        await this.storage.assertOwned(input.siteId, input.assetId, input.assetVersion, reference);
      }
    }

    return asset;
  }
}
