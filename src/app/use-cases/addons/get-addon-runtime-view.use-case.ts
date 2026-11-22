import { requireCondition } from '../../../domain/shared/validation.js';
import type { IAddonRuntimeScope, IGetAddonRuntimeView }
  from '../../../ports/inbound/addons/addon-runtime-assets.port.js';
import type { IAddonRuntimeAssets, IAddonRuntimeView }
  from '../../../ports/outbound/addons/addon-runtime-assets.port.js';
import type { ISiteAddonAccessPort } from '../../../ports/outbound/addons/site-addon-access.port.js';

export class GetAddonRuntimeViewUseCase implements IGetAddonRuntimeView {
  constructor(private readonly assets: IAddonRuntimeAssets, private readonly access: ISiteAddonAccessPort) {}

  async execute(input: IAddonRuntimeScope): Promise<IAddonRuntimeView | null> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    requireCondition(/^[a-z][a-z0-9-]{0,63}$/.test(input.addonKey), 'Invalid add-on identity');

    return this.assets.view(input.addonKey);
  }
}
