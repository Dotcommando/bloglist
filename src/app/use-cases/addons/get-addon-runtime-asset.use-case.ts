import type { IBinaryContent } from '../../../domain/shared/binary-content.js';
import { requireCondition } from '../../../domain/shared/validation.js';
import type { IGetAddonRuntimeAsset } from '../../../ports/inbound/addons/addon-runtime-assets.port.js';
import type { IAddonRuntimeAssets } from '../../../ports/outbound/addons/addon-runtime-assets.port.js';
import type { ISiteAddonAccessPort } from '../../../ports/outbound/addons/site-addon-access.port.js';

export class GetAddonRuntimeAssetUseCase implements IGetAddonRuntimeAsset {
  constructor(private readonly assets: IAddonRuntimeAssets, private readonly access: ISiteAddonAccessPort) {}

  async execute(input: Parameters<IGetAddonRuntimeAsset['execute']>[0]): Promise<IBinaryContent> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    requireCondition(/^[a-z][a-z0-9-]{0,63}$/.test(input.addonKey) && /^[a-f0-9]{64}$/.test(input.digest)
      && input.asset.length <= 512, 'Invalid runtime asset');

    return this.assets.read(input.addonKey, input.digest, input.asset);
  }
}
